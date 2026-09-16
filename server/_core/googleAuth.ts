/**
 * googleAuth.ts
 * Login via Google Workspace (OIDC), substituindo o OAuth do Manus.
 * Ver CLAUDE.md > Backlog > 1. Login com Google Workspace.
 */

import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { SignJWT } from "jose";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

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
}
