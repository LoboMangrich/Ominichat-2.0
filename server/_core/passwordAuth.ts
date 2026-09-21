/**
 * passwordAuth.ts
 * Login por e-mail/senha, gerenciado pelo próprio Cashmiles — substitui o
 * login com Google Workspace (decisão de produto, ver CLAUDE.md). Só o Admin
 * cria conta (usersRouter.create) e redefine senha (usersRouter.resetPassword);
 * não existe cadastro público nem "esqueci minha senha".
 */

import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { UNUSABLE_PASSWORD_HASH, verifyPassword } from "./passwordHash";
import { sdk } from "./sdk";

const GENERIC_LOGIN_ERROR = "E-mail ou senha inválidos";

const loginBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Chave do rate limit: e-mail normalizado + IP, não só IP. Um escritório
 * inteiro pode sair pelo mesmo IP — limitar só por IP travaria o time todo
 * por causa de uma pessoa errando a senha repetidamente.
 */
export function loginRateLimitKey(req: Request): string {
  // ipKeyGenerator normaliza IPv6 (ex.: colapsa por /64) — concatenar req.ip
  // cru deixaria brecha para contornar o limite variando a representação do
  // mesmo endereço IPv6.
  const ip = ipKeyGenerator(req.ip ?? "sem-ip");
  const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
  const email = typeof rawEmail === "string" ? normalizeEmail(rawEmail) : "sem-email";
  return `${ip}:${email}`;
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginRateLimitKey,
  handler: (_req, res) => {
    res.status(429).json({ error: "Muitas tentativas de login. Tente novamente mais tarde." });
  },
});

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios" });
    return;
  }

  const openId = normalizeEmail(parsed.data.email);
  const user = await db.getUserByOpenId(openId);

  // Verifica a senha mesmo quando o usuário não existe ou está desativado
  // (contra UNUSABLE_PASSWORD_HASH) — nunca pula o hash, senão o tempo de
  // resposta vaza por timing quais e-mails têm conta ativa no sistema.
  // Mensagem genérica também para desativado, de propósito: distinguir
  // "conta desativada" de "senha errada" aqui confirmaria pra quem está
  // tentando logar que aquele e-mail existe no sistema. Quem desativa uma
  // conta é sempre um Admin, que já sabe — o aviso à pessoa é
  // responsabilidade dele, fora desse fluxo (ver CLAUDE.md).
  const canAttemptLogin = Boolean(user?.isActive);
  const hashToCheck = canAttemptLogin && user ? user.passwordHash : UNUSABLE_PASSWORD_HASH;
  const passwordOk = await verifyPassword(hashToCheck, parsed.data.password);

  if (!canAttemptLogin || !passwordOk || !user) {
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }

  const sessionToken = await sdk.createSessionToken(openId, {
    name: user.name || "",
    expiresInMs: SESSION_TTL_MS,
  });

  await db.upsertUser({ openId, lastSignedIn: new Date() });

  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });
  res.json({ success: true, mustChangePassword: user.mustChangePassword });
}

export function registerPasswordAuthRoutes(app: Express) {
  app.post("/api/auth/login", loginRateLimiter, handleLogin);
}
