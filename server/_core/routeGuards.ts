/**
 * routeGuards.ts
 * "Porteiros" (middlewares) de autenticação para as rotas HTTP fora do tRPC.
 *
 * Contexto: registerWebhooks(app) é montado antes do tRPC, então a proteção
 * padrão do tRPC NÃO se aplica às rotas de webhooks.ts. Sem estes porteiros,
 * /api/export/*, /api/upload* e /api/scheduled/* ficam abertos para qualquer
 * requisição anônima da internet.
 */

import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

// Anexa o usuário autenticado ao request para os handlers usarem.
export type AuthedRequest = Request & { user?: User };

/**
 * Exige uma sessão válida (cookie de login). Use em rotas que leem/gravam dados
 * do cliente — ex.: exportar conversas, subir anexos.
 */
export async function requireSession(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    // sdk.authenticateRequest já rejeita usuário com isActive: false.
    const user = await sdk.authenticateRequest(req);
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Não autenticado" });
  }
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual lança se os tamanhos diferem — compare o tamanho antes.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Exige o segredo de cron (header x-cron-secret) OU uma sessão de Admin.
 *
 * Use nas rotas /api/scheduled/*, que disparam envios em massa, recalculam a
 * base e chamam IA — hoje qualquer um na internet pode acioná-las em loop.
 *
 * Fail-closed: se CRON_SECRET não estiver definido, o segredo é rejeitado e só
 * resta o caminho de sessão Admin. Um deploy sem o segredo não deixa a rota aberta.
 */
export async function requireCronAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const provided = req.headers["x-cron-secret"];
  const expected = ENV.cronSecret;

  if (typeof provided === "string" && expected && safeCompare(provided, expected)) {
    next();
    return;
  }

  // Fallback: permite disparo manual por um Admin logado (ex.: botão no painel).
  // sdk.authenticateRequest já rejeita usuário com isActive: false.
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role === "Admin") {
      req.user = user;
      next();
      return;
    }
  } catch {
    // sem sessão — cai no 401 abaixo
  }

  if (!expected) {
    console.error(
      "[Cron] CRON_SECRET não configurado. As tarefas agendadas vão falhar até que a variável seja definida e o scheduler envie o header x-cron-secret."
    );
  }
  res.status(401).json({ error: "Não autorizado" });
}

/**
 * Exige o segredo do encaminhador de e-mail em /api/webhooks/email-ticket, aceito
 * por duas vias — qualquer uma que bata libera:
 *   1. Header x-email-ticket-secret (preferencial — mesmo padrão de x-cron-secret)
 *   2. Token no path, /api/webhooks/email-ticket/:token — só para encaminhadores
 *      que não suportam header customizado. URLs vazam em log de acesso/proxy/APM
 *      com mais facilidade que headers, por isso não é a via preferencial.
 *
 * Fail-closed: sem EMAIL_TICKET_SECRET configurado, a rota nega sempre — nunca abre.
 *
 * Achado de segurança: a Story 1.1 (webhook-signature-validation) cobriu WhatsApp,
 * Instagram e Telegram e deixou /api/webhooks/email-ticket explicitamente fora do
 * escopo, sem justificativa registrada — o endpoint ficou sem nenhum guard,
 * aceitando POST anônimo que cria cliente e conversa. Corrigido aqui.
 */
export async function requireEmailTicketSecret(req: Request, res: Response, next: NextFunction) {
  const expected = ENV.emailTicketSecret;

  if (!expected) {
    console.error(
      "[EmailTicket] EMAIL_TICKET_SECRET não configurado — recusando webhook de e-mail (fail-closed)."
    );
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const headerSecret = req.headers["x-email-ticket-secret"];
  if (typeof headerSecret === "string" && safeCompare(headerSecret, expected)) {
    next();
    return;
  }

  const pathToken = req.params.token;
  if (typeof pathToken === "string" && safeCompare(pathToken, expected)) {
    next();
    return;
  }

  res.status(401).json({ error: "Não autorizado" });
}
