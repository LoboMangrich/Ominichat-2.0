/**
 * webhookAuth.ts
 * Verificação de assinatura por provedor para os webhooks HTTP fora do tRPC.
 *
 * Contexto: os endpoints POST em webhooks.ts não validavam nenhuma assinatura —
 * apenas hub.verify_token, que cobre só o handshake GET da Meta. Este módulo
 * cobre os POSTs, onde as mensagens realmente chegam.
 *
 * Fail-closed: se o segredo do provedor não estiver configurado, a verificação
 * retorna false sempre — nunca aceita por omissão.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { ENV } from "./env";

export type RawBodyRequest = Request & { rawBody?: Buffer };

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual lança se os tamanhos diferem — compare o tamanho antes.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Valida o header x-hub-signature-256 enviado pela Meta (WhatsApp e Instagram)
 * contra o HMAC-SHA256 do corpo bruto da requisição, usando o App Secret.
 * Requer que o raw body tenha sido capturado (ver captureRawBody em _core/index.ts).
 */
export function verifyMetaSignature(req: RawBodyRequest): boolean {
  const secret = ENV.metaAppSecret;
  if (!secret) {
    console.error("[webhookAuth] META_APP_SECRET não configurado — rejeitando webhook da Meta.");
    return false;
  }

  const signatureHeader = req.headers["x-hub-signature-256"];
  const rawBody = req.rawBody;
  if (typeof signatureHeader !== "string" || !rawBody) return false;

  const expectedSignature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeCompare(signatureHeader, expectedSignature);
}

/**
 * Valida o header x-telegram-bot-api-secret-token contra o secret token
 * configurado via setWebhook no Telegram (parâmetro secret_token).
 */
export function verifyTelegramSecret(req: RawBodyRequest): boolean {
  const secret = ENV.telegramWebhookSecret;
  if (!secret) {
    console.error("[webhookAuth] TELEGRAM_WEBHOOK_SECRET não configurado — rejeitando webhook do Telegram.");
    return false;
  }

  const providedToken = req.headers["x-telegram-bot-api-secret-token"];
  if (typeof providedToken !== "string") return false;

  return safeCompare(providedToken, secret);
}

/**
 * Valida o header x-sara-signature do webhook de saída da Sara (Epic 72):
 * HMAC-SHA256 em hex puro (sem prefixo "sha256=") sobre os bytes brutos do body,
 * com SUPPORT_OUTBOUND_WEBHOOK_SECRET. Requer o raw body (captureRawBody em
 * _core/index.ts) — assinatura recalculada sobre JSON re-serializado não confere.
 */
export function verifySaraSignature(req: RawBodyRequest): boolean {
  const secret = ENV.supportOutboundWebhookSecret;
  if (!secret) {
    console.error("[webhookAuth] SUPPORT_OUTBOUND_WEBHOOK_SECRET não configurado — rejeitando webhook da Sara.");
    return false;
  }

  const signatureHeader = req.headers["x-sara-signature"];
  const rawBody = req.rawBody;
  if (typeof signatureHeader !== "string" || !rawBody) return false;

  const expectedSignature = createHmac("sha256", secret).update(rawBody).digest("hex");
  // Hex é case-insensitive; normaliza antes de comparar (tamanho checado em safeCompare).
  return safeCompare(signatureHeader.trim().toLowerCase(), expectedSignature);
}
