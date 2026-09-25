import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { promptActorLabel } from "./routers/sara";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));

type Role = "Admin" | "Manager" | "Agent";

function createContext(role: Role, id = 7): TrpcContext {
  return {
    user: {
      id,
      openId: "admin@example.com",
      email: "admin@example.com",
      name: "Pessoa Teste",
      loginMethod: "password",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      isActive: true,
      avatarUrl: null,
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** db falso só para resolveActorNames (select().from().where()). */
function fakeDbWithUsers(rows: Array<{ id: number; name: string }>) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(rows) })) })),
  };
}

const SECRET_CONTENT = "Você é a Sara. CONTEUDO-SECRETO-DO-PROMPT";
const SECRET_NOTES = "NOTAS-SECRETAS de mudança";

const promptRow = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  version: 1,
  isActive: true,
  content: SECRET_CONTENT,
  notes: SECRET_NOTES,
  activatedAt: "2026-09-25T10:00:00.000Z",
  createdAt: "2026-09-25T09:00:00.000Z",
  createdByActorId: "7",
  activatedByActorId: null,
  ...over,
});

describe("sara — prompt (só Admin)", () => {
  const originalUrl = ENV.saraSupportApiUrl;
  const originalKey = ENV.saraSupportApiKey;
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpies: Array<ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    ENV.saraSupportApiUrl = "https://sara.example.test";
    ENV.saraSupportApiKey = "test-api-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpies = (["log", "info", "warn", "error", "debug"] as const).map(m =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockResolvedValue(fakeDbWithUsers([{ id: 7, name: "Ana Admin" }]) as never);
  });

  afterEach(() => {
    ENV.saraSupportApiUrl = originalUrl;
    ENV.saraSupportApiKey = originalKey;
    vi.unstubAllGlobals();
    for (const spy of logSpies) spy.mockRestore();
  });

  function allLogs(): string {
    return logSpies
      .flatMap(spy => spy.mock.calls)
      .map(args => args.map(a => (typeof a === "string" ? a : JSON.stringify(a) ?? String(a))).join(" "))
      .join("\n");
  }

  describe.each(["Manager", "Agent"] as const)("%s", role => {
    it("recebe FORBIDDEN em list/create/activate sem chamar a Sara", async () => {
      const caller = appRouter.createCaller(createContext(role));
      await expect(caller.sara.listPrompts()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.sara.createPrompt({ content: "novo prompt", notes: "ajuste de tom" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.sara.activatePrompt({ id: "p1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("listPrompts resolve nomes de quem criou/ativou e ordena da mais nova para a mais antiga", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [
          promptRow({ id: "p1", version: 1, createdByActorId: "7", activatedByActorId: null }),
          promptRow({ id: "p2", version: 2, isActive: false, createdByActorId: "999", activatedByActorId: "7" }),
        ],
      }),
    );
    const result = await appRouter.createCaller(createContext("Admin")).sara.listPrompts();

    expect(result.map(p => p.version)).toEqual([2, 1]);
    expect(result[0]).toMatchObject({ createdByName: "outro usuário", activatedByName: "Ana Admin" });
    expect(result[1]).toMatchObject({ createdByName: "Ana Admin", activatedByName: "—" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sara.example.test/api/v1/support/prompts");
    expect(init.method).toBeUndefined();
  });

  it("promptActorLabel: nome, id desconhecido e null", () => {
    const names = new Map([["7", "Ana Admin"]]);
    expect(promptActorLabel("7", names)).toBe("Ana Admin");
    expect(promptActorLabel("abc", names)).toBe("outro usuário");
    expect(promptActorLabel(null, names)).toBe("—");
  });

  it("createPrompt manda content + notes + x-sara-actor-id", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { id: "p3", version: 3, isActive: false, content: SECRET_CONTENT, notes: SECRET_NOTES, createdAt: "x" }),
    );
    const result = await appRouter
      .createCaller(createContext("Admin", 7))
      .sara.createPrompt({ content: SECRET_CONTENT, notes: SECRET_NOTES });

    expect(result).toEqual({ id: "p3", version: 3, isActive: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sara.example.test/api/v1/support/prompts");
    expect(init.method).toBe("POST");
    expect(init.headers["x-sara-actor-id"]).toBe("7");
    expect(JSON.parse(init.body)).toEqual({ content: SECRET_CONTENT, notes: SECRET_NOTES });
  });

  it.each([
    ["notes vazio", { content: "prompt", notes: "" }],
    ["notes curto demais", { content: "prompt", notes: " abc " }],
    ["content vazio", { content: "   ", notes: "ajuste de tom" }],
    ["content acima do limite", { content: "x".repeat(50_001), notes: "ajuste de tom" }],
  ])("createPrompt recusa %s sem chamar a Sara", async (_label, input) => {
    await expect(appRouter.createCaller(createContext("Admin")).sara.createPrompt(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createPrompt repassa o motivo de um 400 da Sara, sem logar content nem notes", async () => {
    // Pior caso: o corpo do erro ecoa o prompt.
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { code: "invalid", message: "notes is required" }, echo: SECRET_CONTENT + SECRET_NOTES }),
    );
    await expect(
      appRouter.createCaller(createContext("Admin")).sara.createPrompt({ content: SECRET_CONTENT, notes: SECRET_NOTES }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "notes is required" });

    const logs = allLogs();
    expect(logs).toContain("400");
    expect(logs).not.toContain("CONTEUDO-SECRETO");
    expect(logs).not.toContain("NOTAS-SECRETAS");
  });

  it("listPrompts com erro não loga o conteúdo das versões", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { data: [promptRow()] }));
    await expect(appRouter.createCaller(createContext("Admin")).sara.listPrompts()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(allLogs()).not.toContain("CONTEUDO-SECRETO");
  });

  it("activatePrompt manda x-sara-actor-id, sem corpo útil, e devolve a versão ativada", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "p2", version: 2, isActive: true, activatedAt: "y" }));
    const result = await appRouter.createCaller(createContext("Admin", 7)).sara.activatePrompt({ id: "p2" });

    expect(result).toMatchObject({ id: "p2", version: 2, isActive: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sara.example.test/api/v1/support/prompts/p2/activate");
    expect(init.method).toBe("POST");
    expect(init.headers["x-sara-actor-id"]).toBe("7");
  });

  it("activatePrompt trata 404 como versão não encontrada", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { code: "not_found", message: "Prompt not found" } }));
    await expect(
      appRouter.createCaller(createContext("Admin")).sara.activatePrompt({ id: "sumiu" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Versão não encontrada (pode ter sido removida)" });
  });
});
