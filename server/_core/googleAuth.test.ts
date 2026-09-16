import type { User } from "../../drizzle/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetToken = vi.fn();
const mockVerifyIdToken = vi.fn();
const mockGenerateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/mock-auth-url");

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
    generateAuthUrl: mockGenerateAuthUrl,
  })),
  CodeChallengeMethod: { S256: "S256" },
}));

vi.mock("../db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

import * as db from "../db";
import { ENV } from "./env";
import { registerGoogleAuthRoutes } from "./googleAuth";

type RouteMap = Record<string, (req: any, res: any) => any>;

function createFakeApp(): { get: (path: string, handler: any) => void; routes: RouteMap } {
  const routes: RouteMap = {};
  return {
    get: (path: string, handler: any) => {
      routes[path] = handler;
    },
    routes,
  };
}

function fakeRes() {
  const state = {
    cookies: {} as Record<string, string>,
    cleared: [] as string[],
    redirectedTo: undefined as string | undefined,
    statusCode: undefined as number | undefined,
  };
  const res: any = {
    cookie: vi.fn((name: string, value: string) => {
      state.cookies[name] = value;
    }),
    clearCookie: vi.fn((name: string) => {
      state.cleared.push(name);
    }),
    redirect: vi.fn((_code: number, url: string) => {
      state.redirectedTo = url;
    }),
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: vi.fn(),
  };
  return { res, state };
}

// Decodifica o payload de um JWT sem verificar assinatura — suficiente para o
// teste ler o `state` que o próprio endpoint /start gerou e assinou.
function decodeJwtPayload(token: string): { state: string; codeVerifier: string } {
  const [, payloadB64] = token.split(".");
  return JSON.parse(Buffer.from(payloadB64, "base64url").toString());
}

async function startLoginAndGetCookie(routes: RouteMap) {
  const { res, state } = fakeRes();
  const req: any = { protocol: "https", headers: {} };
  await routes["/api/auth/google/start"](req, res);
  const stateCookie = state.cookies["google_oauth_state"];
  const { state: stateValue } = decodeJwtPayload(stateCookie);
  return { stateCookie, stateValue };
}

describe("Google OAuth callback — estado de acesso do primeiro login", () => {
  const originalCookieSecret = ENV.cookieSecret;
  const originalGoogleClientId = ENV.googleClientId;
  const originalGoogleClientSecret = ENV.googleClientSecret;
  const originalGoogleRedirectUri = ENV.googleRedirectUri;
  const originalOwnerEmails = ENV.ownerEmails;

  beforeEach(() => {
    ENV.cookieSecret = "chave-de-teste-so-para-vitest-0123456789";
    ENV.googleClientId = "test-client-id";
    ENV.googleClientSecret = "test-client-secret";
    ENV.googleRedirectUri = "https://app.local/api/auth/google/callback";
    ENV.ownerEmails = ["owner@empresa.com"];

    vi.mocked(db.getUserByOpenId).mockReset();
    vi.mocked(db.upsertUser).mockReset();
    mockGetToken.mockReset().mockResolvedValue({ tokens: { id_token: "fake-id-token" } });
    mockVerifyIdToken.mockReset();
  });

  afterEach(() => {
    ENV.cookieSecret = originalCookieSecret;
    ENV.googleClientId = originalGoogleClientId;
    ENV.googleClientSecret = originalGoogleClientSecret;
    ENV.googleRedirectUri = originalGoogleRedirectUri;
    ENV.ownerEmails = originalOwnerEmails;
  });

  function buildApp() {
    const app = createFakeApp();
    registerGoogleAuthRoutes(app as any);
    return app;
  }

  it("usuário novo fora de OWNER_EMAILS entra pendente e não recebe cookie de sessão", async () => {
    const app = buildApp();
    const { stateCookie, stateValue } = await startLoginAndGetCookie(app.routes);

    vi.mocked(db.getUserByOpenId).mockResolvedValue(undefined);
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-novo", email: "novo@empresa.com", name: "Novo Usuário" }),
    });

    const { res, state } = fakeRes();
    const req: any = {
      protocol: "https",
      query: { code: "auth-code-123", state: stateValue },
      headers: { cookie: `google_oauth_state=${stateCookie}` },
    };

    await app.routes["/api/auth/google/callback"](req, res);

    expect(db.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "google-sub-novo",
        isActive: false,
        approvedAt: null,
        approvedBy: null,
      })
    );
    expect(res.cookie).not.toHaveBeenCalled();
    expect(state.redirectedTo).toBe("/acesso-pendente?status=pendente");
  });

  it("usuário em OWNER_EMAILS entra Admin ativo, com sessão emitida", async () => {
    const app = buildApp();
    const { stateCookie, stateValue } = await startLoginAndGetCookie(app.routes);

    vi.mocked(db.getUserByOpenId).mockResolvedValue(undefined);
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-owner", email: "owner@empresa.com", name: "Dono da Conta" }),
    });

    const { res, state } = fakeRes();
    const req: any = {
      protocol: "https",
      query: { code: "auth-code-456", state: stateValue },
      headers: { cookie: `google_oauth_state=${stateCookie}` },
    };

    await app.routes["/api/auth/google/callback"](req, res);

    expect(db.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "google-sub-owner",
        isActive: true,
        approvedAt: expect.any(Date),
        approvedBy: null,
        role: "Admin",
      })
    );
    expect(res.cookie).toHaveBeenCalledWith("app_session_id", expect.any(String), expect.any(Object));
    expect(state.redirectedTo).toBe("/");
  });

  it("usuário existente desativado (approvedAt preenchido) não tem estado alterado e cai em /acesso-pendente?status=desativado", async () => {
    const app = buildApp();
    const { stateCookie, stateValue } = await startLoginAndGetCookie(app.routes);

    const existingUser: User = {
      id: 7,
      openId: "google-sub-existente",
      name: "Já Aprovado",
      email: "existente@empresa.com",
      loginMethod: "google",
      role: "Agent",
      avatarUrl: null,
      isActive: false, // foi desativado por um Admin — login não deve reverter isso
      approvedAt: new Date("2026-01-01"),
      approvedBy: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    vi.mocked(db.getUserByOpenId).mockResolvedValue(existingUser);
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-existente", email: "existente@empresa.com", name: "Já Aprovado" }),
    });

    const { res, state } = fakeRes();
    const req: any = {
      protocol: "https",
      query: { code: "auth-code-789", state: stateValue },
      headers: { cookie: `google_oauth_state=${stateCookie}` },
    };

    await app.routes["/api/auth/google/callback"](req, res);

    const upsertArg = vi.mocked(db.upsertUser).mock.calls[0][0];
    expect(upsertArg).not.toHaveProperty("isActive");
    expect(upsertArg).not.toHaveProperty("approvedAt");
    expect(upsertArg).not.toHaveProperty("approvedBy");
    expect(upsertArg).not.toHaveProperty("role");

    // isActive: false persistido antes é respeitado — sem sessão, redirect de desativado.
    expect(res.cookie).not.toHaveBeenCalled();
    expect(state.redirectedTo).toBe("/acesso-pendente?status=desativado");
  });

  it("usuário existente ainda pendente (approvedAt null) continua pendente, não vira desativado — regressão", async () => {
    const app = buildApp();
    const { stateCookie, stateValue } = await startLoginAndGetCookie(app.routes);

    // Já existe no banco (criado na primeira tentativa de login), mas nunca
    // foi aprovado — approvedAt null. Segunda tentativa de login não pode
    // classificar isso como "desativado" só porque existingUser é truthy.
    const existingPendingUser: User = {
      id: 8,
      openId: "google-sub-pendente",
      name: "Ainda Pendente",
      email: "pendente@empresa.com",
      loginMethod: "google",
      role: "Agent",
      avatarUrl: null,
      isActive: false,
      approvedAt: null,
      approvedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    vi.mocked(db.getUserByOpenId).mockResolvedValue(existingPendingUser);
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-pendente", email: "pendente@empresa.com", name: "Ainda Pendente" }),
    });

    const { res, state } = fakeRes();
    const req: any = {
      protocol: "https",
      query: { code: "auth-code-999", state: stateValue },
      headers: { cookie: `google_oauth_state=${stateCookie}` },
    };

    await app.routes["/api/auth/google/callback"](req, res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(state.redirectedTo).toBe("/acesso-pendente?status=pendente");
  });

  it("state ausente ou adulterado é rejeitado com 400, sem chamar o Google", async () => {
    const app = buildApp();
    const { stateCookie } = await startLoginAndGetCookie(app.routes);

    const { res, state } = fakeRes();
    const req: any = {
      protocol: "https",
      query: { code: "auth-code-000", state: "state-forjado" },
      headers: { cookie: `google_oauth_state=${stateCookie}` },
    };

    await app.routes["/api/auth/google/callback"](req, res);

    expect(state.statusCode).toBe(400);
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(db.upsertUser).not.toHaveBeenCalled();
  });
});
