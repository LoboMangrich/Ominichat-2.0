import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { COOKIE_NAME, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { sdk } from "./sdk";

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

import * as db from "../db";

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "google-sub-123",
    name: "Usuário de Teste",
    email: "teste@example.com",
    loginMethod: "google",
    role: "Agent",
    avatarUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

async function buildAuthedReq(openId: string): Promise<CreateExpressContextOptions["req"]> {
  const token = await sdk.createSessionToken(openId, { name: "Usuário de Teste" });
  return {
    protocol: "https",
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  } as unknown as CreateExpressContextOptions["req"];
}

function fakeRes(): CreateExpressContextOptions["res"] {
  return { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as CreateExpressContextOptions["res"];
}

describe("autenticação — isActive verificado no caminho tRPC principal", () => {
  const originalCookieSecret = ENV.cookieSecret;

  beforeEach(() => {
    ENV.cookieSecret = "chave-de-teste-so-para-vitest-0123456789";
    vi.mocked(db.getUserByOpenId).mockReset();
    vi.mocked(db.upsertUser).mockReset();
  });

  afterEach(() => {
    ENV.cookieSecret = originalCookieSecret;
  });

  it("usuário ativo passa normalmente e acessa uma protectedProcedure", async () => {
    vi.mocked(db.getUserByOpenId).mockResolvedValue(fakeUser({ isActive: true }));

    const req = await buildAuthedReq("google-sub-123");
    const ctx = await createContext({ req, res: fakeRes() } as CreateExpressContextOptions);

    expect(ctx.user).not.toBeNull();
    expect(ctx.user?.isActive).toBe(true);
    // Efeito colateral existente (atualização de lastSignedIn) continua ocorrendo.
    expect(db.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ openId: "google-sub-123" })
    );

    const caller = appRouter.createCaller(ctx);
    await expect(caller.ghl.getSettings()).resolves.toBeNull();
  });

  it("usuário com isActive: false é barrado tanto em protectedProcedure quanto em adminProcedure", async () => {
    vi.mocked(db.getUserByOpenId).mockResolvedValue(
      fakeUser({ isActive: false, role: "Admin" })
    );

    const req = await buildAuthedReq("google-sub-123");
    const ctx = await createContext({ req, res: fakeRes() } as CreateExpressContextOptions);

    // createContext (server/_core/context.ts) engole o erro de authenticateRequest
    // e devolve ctx.user = null — é assim que a rejeição chega às procedures.
    expect(ctx.user).toBeNull();
    // Nenhuma atualização de lastSignedIn deve ocorrer para um usuário barrado.
    expect(db.upsertUser).not.toHaveBeenCalled();

    const caller = appRouter.createCaller(ctx);

    await expect(caller.ghl.getSettings()).rejects.toThrow(UNAUTHED_ERR_MSG);
    // adminProcedure herda a proteção automaticamente: ela não repete a checagem
    // de isActive, apenas nega quando ctx.user é null (mesma causa raiz).
    await expect(caller.users.list()).rejects.toThrow(NOT_ADMIN_ERR_MSG);
  });

  it("usuário do cookie não existe mais no banco é barrado (sessão válida, registro sumiu)", async () => {
    vi.mocked(db.getUserByOpenId).mockResolvedValue(undefined);

    const req = await buildAuthedReq("sub-que-nao-existe-mais");
    const ctx = await createContext({ req, res: fakeRes() } as CreateExpressContextOptions);

    expect(ctx.user).toBeNull();

    const caller = appRouter.createCaller(ctx);
    await expect(caller.ghl.getSettings()).rejects.toThrow(UNAUTHED_ERR_MSG);
  });
});
