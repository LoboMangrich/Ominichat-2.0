import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Bug real (PR #19): o client mandava status: "Aberto" (rótulo em português) para
// conversations.list, mas o input aceitava z.string().optional() e o valor ia direto para
// eq(conversations.status, input.status as any). Um valor inválido não estourava erro — só
// devolvia zero linhas, silenciosamente. Isso foi o que manteve o bug do PR #19 invisível.
// Corrigido trocando para z.enum(["Open", "Waiting", "Closed"]).optional(): agora um valor fora
// do enum falha alto (erro de validação), em vez de falhar quieto (zero resultados).
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
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

describe("conversations.list — status só aceita o enum real do banco", () => {
  it("aceita Open, Waiting e Closed sem lançar erro de validação", async () => {
    const caller = appRouter.createCaller(createContext());
    for (const status of ["Open", "Waiting", "Closed"] as const) {
      await expect(caller.conversations.list({ status, page: 1, limit: 20 })).resolves.toEqual({
        conversations: [],
        total: 0,
      });
    }
  });

  it("rejeita um valor fora do enum em vez de devolver zero resultados silenciosamente", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.conversations.list({ status: "Aberto" as any, page: 1, limit: 20 })
    ).rejects.toThrow();
  });

  it("continua funcionando sem status (filtro opcional)", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.conversations.list({ page: 1, limit: 20 })).resolves.toEqual({
      conversations: [],
      total: 0,
    });
  });
});
