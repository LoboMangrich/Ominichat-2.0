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
      openId: "admin-sub",
      email: "admin@empresa.com",
      name: "Admin",
      loginMethod: "google",
      role: "Admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      isActive: true,
      approvedAt: new Date("2026-01-01"),
      approvedBy: null,
      avatarUrl: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// Monta um db falso o suficiente para os dois caminhos usados por
// toggleActive: select(...).from(users).where(...).limit(1) e
// update(users).set(...).where(...).
function fakeDb(existingApprovedAt: Date | null) {
  const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });
  const limitMock = vi.fn().mockResolvedValue([{ approvedAt: existingApprovedAt }]);
  const whereForSelect = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereForSelect });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return { select: selectMock, update: updateMock, setMock, updateMock };
}

describe("usersRouter.toggleActive — carimbo de aprovação", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("aprovar um usuário pendente (approvedAt null) grava approvedAt e approvedBy", async () => {
    const db = fakeDb(null);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const ctx = adminContext(99);
    const caller = appRouter.createCaller(ctx);
    await caller.users.toggleActive({ userId: 42, isActive: true });

    expect(db.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        approvedAt: expect.any(Date),
        approvedBy: 99,
      })
    );
  });

  it("reativar um usuário já aprovado antes não sobrescreve approvedAt/approvedBy originais", async () => {
    const originalApprovedAt = new Date("2026-02-10");
    const db = fakeDb(originalApprovedAt);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const ctx = adminContext(99);
    const caller = appRouter.createCaller(ctx);
    await caller.users.toggleActive({ userId: 42, isActive: true });

    const setArg = db.setMock.mock.calls[0][0];
    expect(setArg).toEqual({ isActive: true });
    expect(setArg).not.toHaveProperty("approvedAt");
    expect(setArg).not.toHaveProperty("approvedBy");
  });

  it("desativar não consulta nem grava approvedAt/approvedBy", async () => {
    const db = fakeDb(null);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const ctx = adminContext(99);
    const caller = appRouter.createCaller(ctx);
    await caller.users.toggleActive({ userId: 42, isActive: false });

    expect(db.select).not.toHaveBeenCalled();
    expect(db.setMock).toHaveBeenCalledWith({ isActive: false });
  });
});
