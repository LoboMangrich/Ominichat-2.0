import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

import { getDb } from "./db";
import { appRouter } from "./routers";

function adminContext(adminId: number): TrpcContext {
  return {
    user: {
      id: adminId,
      openId: "admin@empresa.com",
      email: "admin@empresa.com",
      name: "Admin",
      loginMethod: "password",
      role: "Admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      passwordHash: "hash-irrelevante-neste-teste",
      mustChangePassword: false,
      isActive: true,
      approvedAt: new Date("2026-01-01"),
      approvedBy: null,
      avatarUrl: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function fakeDb() {
  const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });
  return { update: updateMock, setMock };
}

// Sem estado "pendente" (ver CLAUDE.md): toda conta já nasce aprovada, só o
// Admin cria (usersRouter.create). toggleActive não tem mais bookkeeping de
// "primeira aprovação" — é só um toggle ativo/desativado.
describe("usersRouter.toggleActive", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("ativa: grava isActive: true, sem tocar approvedAt/approvedBy", async () => {
    const db = fakeDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(adminContext(99));
    await caller.users.toggleActive({ userId: 42, isActive: true });

    expect(db.setMock).toHaveBeenCalledWith({ isActive: true });
  });

  it("desativa: grava isActive: false", async () => {
    const db = fakeDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(adminContext(99));
    await caller.users.toggleActive({ userId: 42, isActive: false });

    expect(db.setMock).toHaveBeenCalledWith({ isActive: false });
  });
});
