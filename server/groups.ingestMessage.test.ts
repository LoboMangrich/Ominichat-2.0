import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

// Mock LLM (transitively imported by routers.ts)
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock notifications (transitively imported by routers.ts)
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

function createContext(role: "Admin" | "Manager" | "Agent" | null): TrpcContext {
  return {
    user: role
      ? {
          id: 1,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
          isActive: true,
          avatarUrl: null,
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const validPayload = {
  groupId: "grp-1",
  groupName: "Grupo Teste",
  senderId: "5511999999999",
  senderName: "Fulano",
  senderType: "customer" as const,
  content: "Olá, preciso de ajuda",
  messageType: "text",
};

// Fake fluent Drizzle db: só o suficiente para exercitar o caminho feliz de
// ingestMessage (upsert de grupo + insert de mensagem).
function createFakeDb() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]), // nenhum grupo existente -> caminho de insert
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };
}

describe("groups.ingestMessage", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("rejeita chamada sem sessão mesmo com payload válido", async () => {
    // Nenhuma chamada ao banco deve ocorrer: a rejeição precisa acontecer
    // antes de tocar em getDb().
    vi.mocked(getDb).mockResolvedValue(createFakeDb() as any);
    const caller = appRouter.createCaller(createContext(null));

    let caught: unknown;
    try {
      await caller.groups.ingestMessage(validPayload);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe("UNAUTHORIZED");
  });

  it("aceita payload válido de usuário autenticado e grava grupo + mensagem", async () => {
    const fakeDb = createFakeDb();
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);
    const caller = appRouter.createCaller(createContext("Agent"));

    const result = await caller.groups.ingestMessage(validPayload);

    expect(result).toEqual({ success: true });
    expect(fakeDb.insert).toHaveBeenCalledTimes(2); // upsert do grupo (insert) + insert da mensagem
  });

  it("rejeita payload malformado (tipo errado em campo obrigatório)", async () => {
    vi.mocked(getDb).mockResolvedValue(createFakeDb() as any);
    const caller = appRouter.createCaller(createContext("Agent"));

    await expect(
      caller.groups.ingestMessage({ ...validPayload, groupId: 123 as unknown as string })
    ).rejects.toThrow();
  });

  it("rejeita payload com campo obrigatório faltando", async () => {
    vi.mocked(getDb).mockResolvedValue(createFakeDb() as any);
    const caller = appRouter.createCaller(createContext("Agent"));

    const { content: _omit, ...withoutContent } = validPayload;
    await expect(caller.groups.ingestMessage(withoutContent as any)).rejects.toThrow();
  });
});
