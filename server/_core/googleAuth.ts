/**
 * googleAuth.ts
 * Login via Google Workspace (OIDC), substituindo o OAuth do Manus.
 * Ver CLAUDE.md > Backlog > 1. Login com Google Workspace.
 */

import { createHash, randomBytes } from "node:crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { safeCompare } from "./routeGuards";
import { sdk } from "./sdk";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_STATE_COOKIE_PATH = "/api/auth/google";
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

      // TODO(login Google — Fatia 4): usuário novo deve entrar pendente
      // (isActive: false), sem sessão, até aprovação de um Admin. Ainda não
      // implementado — todo login novo entra ativo, mesmo comportamento do
      // fluxo do Manus hoje.
      await db.upsertUser({
        openId: googleSub,
        name: googleName,
        email: googleEmail,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(googleSub, {
        name: googleName || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[GoogleAuth] Callback falhou", error);
      res.status(500).json({ error: "Falha no login com Google" });
    }
  });
}
