import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SARA_FORBIDDEN_OTHER_ACTOR, SARA_UNIDENTIFIED_ACTOR_NOTICE } from "@shared/sara";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { saraRouter } from "./sara";

// A Sara está em produção: nada aqui chama a API real — fetch é sempre mock.
// Banco: por padrão sem banco (getDb → null); testes de nome injetam um banco falso.
vi.mock("../db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));

const USER_ID = 7;
const OTHER_ID = 99;

function createContext(role: "Admin" | "Manager" | "Agent" = "Agent", id = USER_ID): TrpcContext {
  return {
    user: {
      id,
      openId: "atendente@example.com",
      email: "atendente@example.com",
      name: "Atendente",
      role,
    } as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
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

function errorResponse(status: number, rawBody: string): Response {
  return { ok: false, status, text: async () => rawBody } as unknown as Response;
}

function conversationDetail(actorId: string | null, status = "human_takeover") {
  return {
    conversation: {
      id: "conv-1", status, outcome: null, phoneNumber: null, userName: null, messageCount: 1,
      lastMessageAt: null, createdAt: "2026-09-24T10:00:00Z", takeoverAdminId: "adm",
      takeoverAt: actorId ? "2026-09-24T10:05:00Z" : null, actorId, channelId: null,
    },
    messages: [],
  };
}

/** Chamadas que alteram a conversa real (POST). A checagem de dono usa só GET. */
function postCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([url]) => String(url));
}

let fetchMock: ReturnType<typeof vi.fn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
const originalUrl = ENV.saraSupportApiUrl;
const originalKey = ENV.saraSupportApiKey;

beforeEach(() => {
  ENV.saraSupportApiUrl = "https://sara.example.test";
  ENV.saraSupportApiKey = "test-api-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getDb).mockResolvedValue(null);
});

afterEach(() => {
  ENV.saraSupportApiUrl = originalUrl;
  ENV.saraSupportApiKey = originalKey;
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
});

async function catchError(promise: Promise<unknown>): Promise<TRPCError> {
  try {
    await promise;
  } catch (error) {
    return error as TRPCError;
  }
  throw new Error("deveria ter lançado erro");
}

describe("sara.sendMessage — só quem assumiu envia (checado no servidor, antes do POST)", () => {
  it("dono (actorId = users.id): envia, com x-sara-actor-id do usuário logado", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(USER_ID))))
      .mockResolvedValueOnce(jsonResponse(200, { message: { id: "m1" } }));

    await saraRouter.createCaller(createContext()).sendMessage({ id: "conv-1", text: "olá" });

    const posts = postCalls(fetchMock);
    expect(posts).toEqual(["https://sara.example.test/api/v1/support/conversations/conv-1/messages"]);
    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-sara-actor-id"]).toBe(String(USER_ID));
  });

  it.each([
    ["outro atendente", createContext("Agent")],
    ["Admin (não é exceção para enviar)", createContext("Admin")],
  ])("%s: FORBIDDEN sem chamar o POST", async (_label, ctx) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(OTHER_ID))));

    const error = await catchError(saraRouter.createCaller(ctx).sendMessage({ id: "conv-1", text: "olá" }));

    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe(SARA_FORBIDDEN_OTHER_ACTOR);
    expect(postCalls(fetchMock)).toEqual([]);
  });

  it("actorId null (assumida sem identificação): FORBIDDEN com o aviso próprio, sem POST", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, conversationDetail(null)));

    const error = await catchError(
      saraRouter.createCaller(createContext("Admin")).sendMessage({ id: "conv-1", text: "olá" }),
    );

    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe(SARA_UNIDENTIFIED_ACTOR_NOTICE);
    expect(postCalls(fetchMock)).toEqual([]);
  });

  it("409 da Sara no POST (sem dono lá): identifica o usuário logado e não vaza o corpo", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(USER_ID))))
      .mockResolvedValueOnce(
        errorResponse(
          409,
          JSON.stringify({
            error: { code: "CONFLICT", message: "Conversation not claimed yet — call /takeover first" },
          }),
        ),
      );

    const error = await catchError(
      saraRouter.createCaller(createContext()).sendMessage({ id: "conv-1", text: "olá" }),
    );

    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-sara-actor-id"]).toBe(String(USER_ID));
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.message).toContain("409");
    expect(error.message).not.toContain("not claimed");
  });

  it("403 da Sara no POST: não vaza o corpo", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(USER_ID))))
      .mockResolvedValueOnce(
        errorResponse(
          403,
          JSON.stringify({ error: { code: "FORBIDDEN", message: "Conversation is owned by a different operator" } }),
        ),
      );

    const error = await catchError(
      saraRouter.createCaller(createContext()).sendMessage({ id: "conv-1", text: "olá" }),
    );

    expect(error.message).toContain("403");
    expect(error.message).not.toContain("different operator");
  });
});

describe.each(["release", "close"] as const)(
  "sara.%s — dono, Admin ou qualquer um quando actorId é null (checado antes do POST)",
  procedure => {
    const path = `https://sara.example.test/api/v1/support/conversations/conv-1/${procedure}`;
    const ok = procedure === "release"
      ? { conversation: { id: "conv-1", status: "active", takeoverAdminId: null, takeoverAt: null, actorId: null } }
      : { conversation: { id: "conv-1", status: "active", outcome: "admin_closed" } };

    it.each([
      ["dono", createContext("Agent"), String(USER_ID)],
      ["Admin em conversa de outro", createContext("Admin"), String(OTHER_ID)],
      ["qualquer atendente com actorId null", createContext("Agent"), null],
    ])("%s: permitido — chama o POST", async (_label, ctx, actorId) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, conversationDetail(actorId)))
        .mockResolvedValueOnce(jsonResponse(200, ok));

      await saraRouter.createCaller(ctx)[procedure]({ id: "conv-1" });

      expect(postCalls(fetchMock)).toEqual([path]);
    });

    it("outro atendente (não Admin): FORBIDDEN sem chamar o POST", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(OTHER_ID))));

      const error = await catchError(saraRouter.createCaller(createContext("Agent"))[procedure]({ id: "conv-1" }));

      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toBe(SARA_FORBIDDEN_OTHER_ACTOR);
      expect(postCalls(fetchMock)).toEqual([]);
    });
  },
);

describe("sara.getConversation / listConversations — actorName e permissões calculadas no servidor", () => {
  function fakeDbWithUsers(rows: Array<{ id: number; name: string | null }>) {
    const chain = {
      from: () => chain,
      where: () => Promise.resolve(rows),
    };
    vi.mocked(getDb).mockResolvedValue({ select: () => chain } as never);
  }

  it("resolve o actorId para o nome do usuário do Cashmiles e marca as permissões", async () => {
    fakeDbWithUsers([{ id: OTHER_ID, name: "Beatriz" }]);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(OTHER_ID))));

    const { conversation } = await saraRouter.createCaller(createContext("Agent")).getConversation({ id: "conv-1" });

    expect(conversation).toMatchObject({
      actorId: String(OTHER_ID),
      actorName: "Beatriz",
      assignedToMe: false,
      canSend: false,
      canReleaseOrClose: false,
    });
  });

  it("dono: assignedToMe, pode enviar e devolver/encerrar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(USER_ID))));

    const { conversation } = await saraRouter.createCaller(createContext("Agent")).getConversation({ id: "conv-1" });

    expect(conversation).toMatchObject({ assignedToMe: true, canSend: true, canReleaseOrClose: true });
  });

  it("id desconhecido ou não numérico → actorName null (tela mostra \"outro atendente\")", async () => {
    fakeDbWithUsers([]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [conversationDetail("12345").conversation, conversationDetail("painel-sara").conversation],
        pagination: { total: 2, limit: 20, offset: 0, hasMore: false },
      }),
    );

    const { data } = await saraRouter.createCaller(createContext()).listConversations({});

    expect(data.map(c => c.actorName)).toEqual([null, null]);
  });

  it("actorId null: ninguém envia, qualquer um devolve/encerra", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, conversationDetail(null)));

    const { conversation } = await saraRouter.createCaller(createContext("Agent")).getConversation({ id: "conv-1" });

    expect(conversation).toMatchObject({ actorName: null, canSend: false, canReleaseOrClose: true });
  });
});

describe("sara.listConversations — status e sort são enums da doc", () => {
  it("rejeita status fora do enum sem chamar a Sara", async () => {
    const caller = saraRouter.createCaller(createContext());
    await expect(caller.listConversations({ status: "closed" as never })).rejects.toThrow();
    await expect(caller.listConversations({ sort: "createdAt" as never })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sara.takeover — 409 vira CONFLICT \"Já assumida por <nome>\"", () => {
  function conflict409(actorId: string | null): Response {
    return errorResponse(
      409,
      JSON.stringify({
        error: { code: "CONFLICT", message: "Conversation already in human takeover" },
        conversation: { id: "conv-1", status: "human_takeover", actorId },
      }),
    );
  }

  it("usa conversation.actorId do corpo do 409 e resolve o nome", async () => {
    const chain = { from: () => chain, where: () => Promise.resolve([{ id: OTHER_ID, name: "Beatriz" }]) };
    vi.mocked(getDb).mockResolvedValue({ select: () => chain } as never);
    fetchMock.mockResolvedValueOnce(conflict409(String(OTHER_ID)));

    const error = await catchError(saraRouter.createCaller(createContext()).takeover({ id: "conv-1" }));

    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Já assumida por Beatriz");
  });

  it("actorId desconhecido ou null → \"outro atendente\"; o próprio usuário → \"você\"", async () => {
    fetchMock.mockResolvedValueOnce(conflict409("12345"));
    expect((await catchError(saraRouter.createCaller(createContext()).takeover({ id: "conv-1" }))).message).toBe(
      "Já assumida por outro atendente",
    );

    fetchMock.mockResolvedValueOnce(conflict409(null));
    expect((await catchError(saraRouter.createCaller(createContext()).takeover({ id: "conv-1" }))).message).toBe(
      "Já assumida por outro atendente",
    );

    fetchMock.mockResolvedValueOnce(conflict409(String(USER_ID)));
    expect((await catchError(saraRouter.createCaller(createContext()).takeover({ id: "conv-1" }))).message).toBe(
      "Já assumida por você",
    );
  });

  it("não vaza a mensagem crua da Sara", async () => {
    fetchMock.mockResolvedValueOnce(conflict409(String(OTHER_ID)));
    const error = await catchError(saraRouter.createCaller(createContext()).takeover({ id: "conv-1" }));
    expect(error.message).not.toContain("already in human takeover");
  });

  it("409 sem conversation no corpo (ex.: \"not claimed\" no envio) → CONFLICT genérico", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, conversationDetail(String(USER_ID))))
      .mockResolvedValueOnce(
        errorResponse(409, JSON.stringify({ error: { code: "CONFLICT", message: "Conversation not claimed yet" } })),
      );

    const error = await catchError(
      saraRouter.createCaller(createContext()).sendMessage({ id: "conv-1", text: "olá" }),
    );

    expect(error.code).toBe("CONFLICT");
    expect(error.message).toContain("409");
  });

  it("outros erros continuam: 404 → NOT_FOUND, 500 → INTERNAL_SERVER_ERROR", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(404, "{}"));
    expect((await catchError(saraRouter.createCaller(createContext()).takeover({ id: "x" }))).code).toBe("NOT_FOUND");
    fetchMock.mockResolvedValueOnce(errorResponse(500, "{}"));
    expect((await catchError(saraRouter.createCaller(createContext()).takeover({ id: "x" }))).code).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });
});

describe("sara.audioUrl / sara.imageUrl — mídia sob demanda", () => {
  it("devolvem a URL assinada da Sara (só leitura, sem POST)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { url: "https://s.test/a?sig=1", expiresIn: 900, mimeType: "audio/ogg" }))
      .mockResolvedValueOnce(jsonResponse(200, { url: "https://s.test/i?sig=2", expiresIn: 900, mimeType: "image/jpeg" }));

    const caller = saraRouter.createCaller(createContext());
    await expect(caller.audioUrl({ audioMessageId: "a1" })).resolves.toMatchObject({ expiresIn: 900 });
    await expect(caller.imageUrl({ imageMessageId: "i1" })).resolves.toMatchObject({ mimeType: "image/jpeg" });
    expect(postCalls(fetchMock)).toEqual([]);
  });

  it("mídia inexistente → NOT_FOUND", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(404, "{}"));
    const error = await catchError(saraRouter.createCaller(createContext()).audioUrl({ audioMessageId: "x" }));
    expect(error.code).toBe("NOT_FOUND");
  });

  it("rejeita id vazio sem chamar a Sara", async () => {
    await expect(saraRouter.createCaller(createContext()).imageUrl({ imageMessageId: "" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sara.registerCustomer — cadastra o cliente com o telefone vindo da Sara", () => {
  const SARA_PHONE = "+5548984053595";

  function detailWithPhone(phoneNumber: string | null) {
    const d = conversationDetail(null, "active");
    return { ...d, conversation: { ...d.conversation, phoneNumber, userName: "Maria" } };
  }

  /** Banco falso: select devolve `existing`; insert registra os valores. */
  function fakeDb(existing: Array<Record<string, unknown>>) {
    const inserted: Array<Record<string, unknown>> = [];
    const selectChain = {
      from: () => selectChain,
      where: () => selectChain,
      orderBy: () => selectChain,
      limit: () => Promise.resolve(existing),
    };
    const db = {
      select: () => selectChain,
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return { $returningId: () => Promise.resolve([{ id: 321 }]) };
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);
    return inserted;
  }

  it("telefone vem do GET da conversa (só dígitos com DDI), nunca do client", async () => {
    const inserted = fakeDb([]);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, detailWithPhone(SARA_PHONE)));

    const result = await saraRouter.createCaller(createContext()).registerCustomer({
      conversationId: "conv-1",
      name: "Maria",
      email: "",
      // Campo extra do client é descartado pelo schema — o telefone não entra por aqui.
      phone: "11999999999",
    } as never);

    expect(result).toEqual({ id: 321 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ name: "Maria", phone: "5548984053595", email: null, status: "New" });
    expect(postCalls(fetchMock)).toEqual([]); // só GET na Sara
  });

  it("duplicado → CONFLICT \"Já existe cliente com este telefone\", sem inserir", async () => {
    const inserted = fakeDb([{ id: 5, name: "Maria", phone: "5548984053595" }]);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, detailWithPhone(SARA_PHONE)));

    const error = await catchError(
      saraRouter.createCaller(createContext()).registerCustomer({ conversationId: "conv-1", name: "Maria" }),
    );

    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Já existe cliente com este telefone");
    expect(inserted).toEqual([]);
  });

  it("sem banco → erro claro, sem inserir", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, detailWithPhone(SARA_PHONE)));

    const error = await catchError(
      saraRouter.createCaller(createContext()).registerCustomer({ conversationId: "conv-1", name: "Maria" }),
    );

    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.message).toMatch(/Banco de dados indisponível/);
  });

  it("conversa sem telefone → BAD_REQUEST", async () => {
    fakeDb([]);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, detailWithPhone(null)));

    const error = await catchError(
      saraRouter.createCaller(createContext()).registerCustomer({ conversationId: "conv-1", name: "Maria" }),
    );

    expect(error.code).toBe("BAD_REQUEST");
  });

  it("valida e-mail, nome e status", async () => {
    const caller = saraRouter.createCaller(createContext());
    await expect(caller.registerCustomer({ conversationId: "c", name: "", email: "" })).rejects.toThrow();
    await expect(caller.registerCustomer({ conversationId: "c", name: "M", email: "nao-e-email" })).rejects.toThrow();
    await expect(caller.registerCustomer({ conversationId: "c", name: "M", status: "Ativo" as never })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
