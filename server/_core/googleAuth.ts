/**
 * googleAuth.ts
 * Login via Google Workspace (OIDC), substituindo o OAuth do Manus.
 * Ver CLAUDE.md > Backlog > 1. Login com Google Workspace.
 */

import { createHash, randomBytes } from "node:crypto";
import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { SignJWT, jwtVerify } from "jose";
import type { InsertUser, User } from "../../drizzle/schema";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { safeCompare } from "./routeGuards";
import { sdk } from "./sdk";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_STATE_COOKIE_PATH = "/api/auth/google";
export const ACCESS_PENDING_PATH = "/acesso-pendente";
const GOOGLE_OAUTH_STATE_TYP = "google_oauth_state";
const STATE_COOKIE_TTL_MS = 10 * 60 * 1000;

export type GoogleOAuthStatePayload = {
  state: string;
  codeVerifier: string;
};

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function createOAuth2Client(): OAuth2Client {
  return new OAuth2Client({
    clientId: ENV.googleClientId,
    clientSecret: ENV.googleClientSecret,
    redirectUri: ENV.googleRedirectUri,
  });
}

function isGoogleLoginConfigured(): boolean {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret && ENV.googleRedirectUri);
}

async function signStateCookie(payload: GoogleOAuthStatePayload): Promise<string> {
  const secretKey = new TextEncoder().encode(ENV.cookieSecret);
  const expirationSeconds = Math.floor((Date.now() + STATE_COOKIE_TTL_MS) / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: GOOGLE_OAUTH_STATE_TYP })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

async function verifyStateCookie(
  cookieValue: string | undefined
): Promise<GoogleOAuthStatePayload | null> {
  if (!cookieValue) return null;

  try {
    const secretKey = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(cookieValue, secretKey, { algorithms: ["HS256"] });
    const { state, codeVerifier } = payload as Record<string, unknown>;

    if (typeof state !== "string" || typeof codeVerifier !== "string") {
      return null;
    }

    return { state, codeVerifier };
  } catch {
    // Assinatura inválida, expirado, ou payload corrompido — tudo cai aqui.
    return null;
  }
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

type PendingUserAccess = Pick<InsertUser, "isActive" | "approvedAt" | "approvedBy"> &
  Partial<Pick<InsertUser, "role">>;

/**
 * true quando o usuário nunca foi aprovado: ou ainda não existe (login
 * novo), ou já existe mas segue com approvedAt null (pendente, mesmo já
 * tendo tentado logar antes). Usuário ativo ou desativado por um Admin
 * (approvedAt preenchido) nunca é "pendente" — nunca reavaliado aqui.
 */
function isPendingUser(user: User | undefined): boolean {
  if (!user) return true;
  return !user.isActive && user.approvedAt === null;
}

/**
 * Decide o estado de acesso de um usuário PENDENTE (novo ou já existente
 * sem aprovação) a cada login.
 *
 * OWNER_EMAILS é bootstrap, não controle de acesso contínuo — ver comentário
 * completo em env.ts (ownerEmails). Mas como é reavaliado em todo login
 * enquanto o usuário seguir pendente (não só no INSERT), um e-mail
 * adicionado a OWNER_EMAILS depois do primeiro login também promove a Admin
 * na próxima tentativa — evita o lockout de "e-mail do primeiro Admin ainda
 * não configurado quando ele logou pela primeira vez, e agora ninguém pode
 * aprová-lo". Um usuário já ativo ou já desativado por um Admin nunca passa
 * por aqui de novo (ver isPendingUser) — remover o e-mail da lista depois
 * não desfaz o que já foi persistido para eles.
 */
export function resolveNewUserAccess(email: string | null): PendingUserAccess {
  const isOwnerBootstrap = email !== null && ENV.ownerEmails.includes(email.toLowerCase());

  if (isOwnerBootstrap) {
    return { isActive: true, approvedAt: new Date(), approvedBy: null, role: "Admin" };
  }

  return { isActive: false, approvedAt: null, approvedBy: null };
}

/**
 * Monta o payload de db.upsertUser para o login Google. isActive/approvedAt/
 * approvedBy/role só entram no payload enquanto o usuário estiver pendente
 * (ver isPendingUser) — uma vez aprovado ou desativado por um Admin, login
 * nunca mais toca nesses campos sozinho.
 */
export function buildUserUpsertInput(params: {
  sub: string;
  name: string | null;
  email: string | null;
  existingUser: User | undefined;
}): InsertUser {
  const base: InsertUser = {
    openId: params.sub,
    name: params.name,
    email: params.email,
    loginMethod: "google",
    lastSignedIn: new Date(),
  };

  if (!isPendingUser(params.existingUser)) {
    return base;
  }

  return { ...base, ...resolveNewUserAccess(params.email) };
}

export function registerGoogleAuthRoutes(app: Express) {
  app.get("/api/auth/google/start", async (req: Request, res: Response) => {
    if (!isGoogleLoginConfigured()) {
      res.status(503).json({ error: "Login com Google não está configurado neste ambiente" });
      return;
    }

    const state = base64UrlEncode(randomBytes(32));
    const codeVerifier = base64UrlEncode(randomBytes(32));
    const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());

    const stateCookie = await signStateCookie({ state, codeVerifier });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(GOOGLE_OAUTH_STATE_COOKIE, stateCookie, {
      ...cookieOptions,
      sameSite: "lax",
      path: GOOGLE_OAUTH_STATE_COOKIE_PATH,
      maxAge: STATE_COOKIE_TTL_MS,
    });

    const client = createOAuth2Client();
    const authUrl = client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });

    res.redirect(302, authUrl);
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const clearStateCookie = () => {
      res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: GOOGLE_OAUTH_STATE_COOKIE_PATH });
    };

    if (!isGoogleLoginConfigured()) {
      res.status(503).json({ error: "Login com Google não está configurado neste ambiente" });
      return;
    }

    const code = getQueryParam(req, "code");
    const stateFromQuery = getQueryParam(req, "state");

    if (!code || !stateFromQuery) {
      clearStateCookie();
      res.status(400).json({ error: "Parâmetros code e state são obrigatórios" });
      return;
    }

    // O cookie de state é de uso único: removido aqui, antes de qualquer
    // chamada ao Google, independente do resultado da validação abaixo.
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const statePayload = await verifyStateCookie(cookies[GOOGLE_OAUTH_STATE_COOKIE]);
    clearStateCookie();

    if (!statePayload || !safeCompare(statePayload.state, stateFromQuery)) {
      res.status(400).json({ error: "state inválido, ausente ou expirado" });
      return;
    }

    try {
      const client = createOAuth2Client();
      const { tokens } = await client.getToken({
        code,
        codeVerifier: statePayload.codeVerifier,
      });

      if (!tokens.id_token) {
        res.status(400).json({ error: "Google não retornou id_token" });
        return;
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: ENV.googleClientId,
      });
      const idTokenPayload = ticket.getPayload();

      if (!idTokenPayload?.sub) {
        res.status(400).json({ error: "id_token do Google sem sub" });
        return;
      }

      const googleSub = idTokenPayload.sub;
      const googleEmail = idTokenPayload.email ?? null;
      const googleName = idTokenPayload.name ?? null;

      const existingUser = await db.getUserByOpenId(googleSub);
      const upsertInput = buildUserUpsertInput({
        sub: googleSub,
        name: googleName,
        email: googleEmail,
        existingUser,
      });
      await db.upsertUser(upsertInput);

      // upsertInput só inclui isActive/approvedAt quando o usuário estava
      // pendente (isPendingUser) — inclusive quando isso promoveu um
      // existingUser pendente a Admin agora mesmo. Nesse caso o valor
      // recém-decidido é o estado real após o upsert, não o de
      // existingUser (que é a foto de ANTES do upsert rodar). Só cai no
      // fallback de existingUser quando o payload não tocou nesses campos
      // (usuário já ativo ou já desativado por um Admin).
      const isActive =
        upsertInput.isActive !== undefined ? Boolean(upsertInput.isActive) : Boolean(existingUser?.isActive);
      const approvedAt =
        upsertInput.approvedAt !== undefined ? upsertInput.approvedAt : (existingUser?.approvedAt ?? null);

      if (!isActive) {
        // Mesma regra dos três estados da tela de Usuários (approvedAt null
        // = nunca aprovado = pendente, não desativado) — independente de já
        // existir no banco: um usuário pendente pode tentar logar mais de
        // uma vez antes de ser aprovado.
        const status = approvedAt ? "desativado" : "pendente";
        res.redirect(302, `${ACCESS_PENDING_PATH}?status=${status}`);
        return;
      }

      const sessionToken = await sdk.createSessionToken(googleSub, {
        name: googleName || "",
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[GoogleAuth] Callback falhou", error);
      res.status(500).json({ error: "Falha no login com Google" });
    }
  });
}
