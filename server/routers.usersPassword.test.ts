import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { hashPassword } from "./_core/passwordHash";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

import { getDb } from "./db";
import { appRouter } from "./routers";

function adminContext(adminId = 99): TrpcContext {
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

describe("usersRouter.create", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("cria com passwordHash, mustChangePassword: true, e approvedAt/approvedBy do Admin criador", async () => {
    const limitMock = vi.fn().mockResolvedValue([]); // ninguém com esse e-mail ainda
    const whereForSelect = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereForSelect });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    const insertValuesMock = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

    vi.mocked(getDb).mockResolvedValue({ select: selectMock, insert: insertMock } as any);

    const caller = appRouter.createCaller(adminContext(99));
    await caller.users.create({
      name: "Novo Atendente",
      email: "Novo.Atendente@ReinoEducacao.com",
      role: "Agent",
      initialPassword: "senha-temporaria-1",
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "novo.atendente@reinoeducacao.com",
        email: "Novo.Atendente@ReinoEducacao.com",
        loginMethod: "password",
        mustChangePassword: true,
        isActive: true,
        approvedBy: 99,
        approvedAt: expect.any(Date),
      })
    );
    const inserted = insertValuesMock.mock.calls[0][0];
    expect(inserted.passwordHash).not.toBe("senha-temporaria-1");
    expect(inserted.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("rejeita e-mail duplicado com CONFLICT, sem chegar a inserir", async () => {
    const limitMock = vi.fn().mockResolvedValue([{ id: 5 }]); // já existe
    const whereForSelect = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereForSelect });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    const insertMock = vi.fn();

    vi.mocked(getDb).mockResolvedValue({ select: selectMock, insert: insertMock } as any);

    const caller = appRouter.createCaller(adminContext(99));
    await expect(
      caller.users.create({
        name: "Duplicado",
        email: "ja-existe@reinoeducacao.com",
        role: "Agent",
        initialPassword: "senha-temporaria-1",
      })
    ).rejects.toThrow(TRPCError);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejeita senha inicial curta antes de consultar o banco", async () => {
    const caller = appRouter.createCaller(adminContext(99));
    await expect(
      caller.users.create({
        name: "Curta",
        email: "curta@reinoeducacao.com",
        role: "Agent",
        initialPassword: "curta123",
      })
    ).rejects.toThrow();
    expect(getDb).not.toHaveBeenCalled();
  });
});

describe("usersRouter.resetPassword", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("grava novo hash e força mustChangePassword: true", async () => {
    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    vi.mocked(getDb).mockResolvedValue({ update: updateMock } as any);

    const caller = appRouter.createCaller(adminContext(99));
    await caller.users.resetPassword({ userId: 42, newPassword: "nova-senha-temp1" });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true })
    );
    const setArg = setMock.mock.calls[0][0];
    expect(setArg.passwordHash).not.toBe("nova-senha-temp1");
  });
});

describe("auth.changePassword", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("senha atual correta: troca o hash e libera mustChangePassword", async () => {
    const currentHash = await hashPassword("senha-atual-123");
    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    vi.mocked(getDb).mockResolvedValue({ update: updateMock } as any);

    const ctx = adminContext(1);
    ctx.user.passwordHash = currentHash;
    const caller = appRouter.createCaller(ctx);

    await caller.auth.changePassword({ currentPassword: "senha-atual-123", newPassword: "senha-nova-1234" });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: false })
    );
  });

  it("senha atual errada: rejeita e não grava nada", async () => {
    const currentHash = await hashPassword("senha-atual-123");
    const updateMock = vi.fn();
    vi.mocked(getDb).mockResolvedValue({ update: updateMock } as any);

    const ctx = adminContext(1);
    ctx.user.passwordHash = currentHash;
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.changePassword({ currentPassword: "senha-errada", newPassword: "senha-nova-1234" })
    ).rejects.toThrow("Senha atual incorreta");
    expect(updateMock).not.toHaveBeenCalled();
  });
});
