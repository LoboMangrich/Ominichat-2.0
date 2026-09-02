import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

function createContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "Agent",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      isActive: true,
      avatarUrl: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const ruleA = {
  id: 1,
  name: "Regra A (vai falhar)",
  isActive: true,
  conditionType: "health_score_below",
  conditionValue: "40",
  actionType: "create_supervision_item",
  actionConfig: {},
  agentId: null,
  description: "Regra usada para simular falha de banco",
};

const ruleB = {
  id: 2,
  name: "Regra B (deve continuar funcionando)",
  isActive: true,
  conditionType: "health_score_below",
  conditionValue: "40",
  actionType: "create_supervision_item",
  actionConfig: {},
  agentId: null,
  description: "Regra saudável, processada depois da que falha",
};

describe("triggerRules.evaluate", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(getDb).mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("loga o erro de uma regra que falha, sem interromper a avaliação das demais", async () => {
    // 1ª chamada: busca as regras ativas.
    // 2ª chamada: busca de customers da regra A -> falha (ex.: erro de banco).
    // 3ª chamada: busca de customers da regra B -> sucesso.
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => Promise.resolve([ruleA, ruleB]) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => Promise.reject(new Error("falha simulada de banco")) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => Promise.resolve([{ id: 42 }]) }),
      }));

    const insert = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
    const update = vi.fn(() => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }));

    vi.mocked(getDb).mockResolvedValue({ select, insert, update } as any);
    const caller = appRouter.createCaller(createContext());

    // Não deve lançar: a falha da regra A precisa ser contida.
    const result = await caller.triggerRules.evaluate();

    // A regra B foi processada normalmente (1 cliente afetado -> 1 item de supervisão).
    expect(result).toEqual({ triggered: 1 });

    // O erro da regra A foi registrado, não engolido em silêncio.
    expect(errorSpy).toHaveBeenCalled();
    const loggedText = errorSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(loggedText).toContain(String(ruleA.id));
  });
});
