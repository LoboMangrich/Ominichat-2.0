/**
 * saraWebhook.ts
 * Receptor do webhook de saída da Sara (Epic 72): POST /api/webhooks/sara.
 *
 * Fluxo: assinatura (x-sara-signature) → formato (Zod) → grava em saraWebhookEvents
 * (o UNIQUE de eventId deduplica reenvios, inclusive simultâneos) → responde 200 →
 * processa depois. A Sara tem timeout de 10s e faz retry: nada pesado antes do 200.
 *
 * LGPD: nunca logar telefone, nome, conteúdo nem o payload — só eventId, eventType e
 * ids internos. processingError é um código curto, sem dado pessoal.
 *
 * Limitação: conversation.escalated NÃO quer dizer que a IA pediu ajuda — quer dizer
 * que alguém assumiu, ou que a conversa nasceu precisando de humano (ver CLAUDE.md).
 */

import { and, eq, gte, isNull } from "drizzle-orm";
import type { Express, Response } from "express";
import { z } from "zod";
import { saraWebhookEvents, users } from "../drizzle/schema";
import { verifySaraSignature, type RawBodyRequest } from "./_core/webhookAuth";
import { getDb } from "./db";
import { getSaraConversationSystemReadOnly } from "./saraSupportClient";

export const SARA_WEBHOOK_PATH = "/api/webhooks/sara";

export const SARA_EVENT_TYPES = {
  escalated: "conversation.escalated",
  messageReceived: "conversation.message_received",
  closed: "conversation.closed",
} as const;

/** Eventos que viram notificação — os únicos que sara.pendingNotifications entrega. */
export const SARA_NOTIFYING_EVENT_TYPES = [SARA_EVENT_TYPES.escalated, SARA_EVENT_TYPES.messageReceived];

/** Janela do reprocessamento na inicialização (evento perdido entre o 200 e o processamento). */
export const SARA_REPROCESS_WINDOW_MS = 60 * 60 * 1000;

// eventType é string livre: a Sara pode criar eventos novos, e evento desconhecido é
// aceito (200) e só registrado. data é passthrough — só conversationId é exigido.
const saraWebhookPayload = z.object({
  eventId: z.string().min(1).max(128),
  eventType: z.string().min(1).max(64),
  timestamp: z.union([z.string(), z.number()]),
  data: z
    .object({
      conversationId: z.union([z.string().min(1).max(64), z.number()]).transform(String),
    })
    .passthrough(),
});

function isDuplicateKeyError(error: unknown): boolean {
  // mysql2 marca ER_DUP_ENTRY (1062); o drizzle 0.44 embrulha o erro em DrizzleQueryError.cause.
  for (let e: unknown = error, depth = 0; e && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    const { code, errno } = e as { code?: unknown; errno?: unknown };
    if (code === "ER_DUP_ENTRY" || errno === 1062) return true;
  }
  return false;
}

export async function handleSaraWebhook(req: RawBodyRequest, res: Response): Promise<void> {
  // 401 sem detalhe no corpo — inclusive quando o secret não está configurado (fail-closed).
  if (!verifySaraSignature(req)) {
    res.status(401).end();
    return;
  }

  const parsed = saraWebhookPayload.safeParse(req.body);
  if (!parsed.success) {
    console.warn("[SaraWebhook] payload fora do formato esperado — recusado (400).");
    res.status(400).end();
    return;
  }
  const { eventId, eventType, data } = parsed.data;

  const db = await getDb();
  if (!db) {
    // Sem banco não há como deduplicar: 503 faz a Sara reenviar depois.
    console.error(`[SaraWebhook] banco indisponível — evento ${eventId} recusado (503).`);
    res.status(503).end();
    return;
  }

  let rowId: number;
  try {
    const [inserted] = await db
      .insert(saraWebhookEvents)
      .values({ eventId, eventType, saraConversationId: data.conversationId })
      .$returningId();
    rowId = inserted.id;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      console.log(`[SaraWebhook] ${eventType} ${eventId} repetido — ignorado.`);
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    console.error(`[SaraWebhook] falha ao gravar o evento ${eventId}.`);
    res.status(500).end();
    return;
  }

  res.status(200).json({ ok: true });
  console.log(`[SaraWebhook] ${eventType} ${eventId} recebido (#${rowId}).`);

  // Processamento depois da resposta. Se o servidor cair antes, o evento fica com
  // processedAt e processingError nulos e é retomado por reprocessPendingSaraWebhookEvents.
  setImmediate(() => {
    processSaraWebhookEvent(rowId).catch(() => {
      console.error(`[SaraWebhook] falha inesperada ao processar #${rowId}.`);
    });
  });
}

type Effect = { notifyUserId: number | null; notifyAll: boolean };
const NO_EFFECT: Effect = { notifyUserId: null, notifyAll: false };

/** users.id ativo correspondente ao actorId da Sara (o nosso users.id em string), ou null. */
async function activeUserFromActorId(actorId: string | null): Promise<number | null> {
  if (actorId === null || !/^\d+$/.test(actorId)) return null;
  const db = await getDb();
  if (!db) return null;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, Number(actorId)), eq(users.isActive, true)))
    .limit(1);
  return user?.id ?? null;
}

async function effectOf(eventType: string, saraConversationId: string | null): Promise<Effect> {
  if (!saraConversationId) return NO_EFFECT;

  switch (eventType) {
    case SARA_EVENT_TYPES.messageReceived: {
      // O payload não traz status nem actorId: GET só de leitura para saber quem assumiu.
      const { conversation } = await getSaraConversationSystemReadOnly(saraConversationId);
      if (conversation.status !== "human_takeover") return NO_EFFECT;
      const userId = await activeUserFromActorId(conversation.actorId);
      return userId ? { notifyUserId: userId, notifyAll: false } : NO_EFFECT;
    }
    case SARA_EVENT_TYPES.escalated: {
      // actorId nulo (assumida pelo painel da Sara, ou nasceu precisando de humano) →
      // todos os atendentes. actorId preenchido → ninguém: foi um de nós que assumiu
      // (ou alguém já identificado), não há ninguém a chamar.
      const { conversation } = await getSaraConversationSystemReadOnly(saraConversationId);
      return conversation.actorId === null ? { notifyUserId: null, notifyAll: true } : NO_EFFECT;
    }
    case SARA_EVENT_TYPES.closed:
      // Só registrar: a lista da tela única já se atualiza sozinha (polling).
      return NO_EFFECT;
    default:
      // Evento desconhecido: registrado, sem efeito.
      return NO_EFFECT;
  }
}

function errorCode(error: unknown): string {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") return `sara_get_failed:${status}`;
  return "processing_failed";
}

/**
 * Processa um evento gravado. Idempotente: só age sobre linha com processedAt nulo, e o
 * update final também exige processedAt nulo — processar duas vezes (ex.: reprocessamento
 * na inicialização) não gera nada novo. A notificação é a própria linha (entregue uma vez
 * por id em sara.pendingNotifications), então não duplica.
 */
export async function processSaraWebhookEvent(rowId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [event] = await db.select().from(saraWebhookEvents).where(eq(saraWebhookEvents.id, rowId)).limit(1);
  if (!event || event.processedAt) return;

  const pending = and(eq(saraWebhookEvents.id, rowId), isNull(saraWebhookEvents.processedAt));
  try {
    const effect = await effectOf(event.eventType, event.saraConversationId);
    await db
      .update(saraWebhookEvents)
      .set({ processedAt: new Date(), processingError: null, ...effect })
      .where(pending);
    console.log(`[SaraWebhook] #${rowId} (${event.eventType} ${event.eventId}) processado.`);
  } catch (error) {
    const code = errorCode(error);
    await db.update(saraWebhookEvents).set({ processingError: code }).where(pending);
    console.error(`[SaraWebhook] #${rowId} (${event.eventType} ${event.eventId}) falhou: ${code}.`);
  }
}

/**
 * Na inicialização: retoma eventos que ficaram sem processar (servidor caiu entre o 200 e
 * o processamento — a Sara não reenvia, já recebeu 200). Só da última 1h, e só os que não
 * falharam (processingError nulo). Seguro rodar mais de uma vez (ver processSaraWebhookEvent).
 */
export async function reprocessPendingSaraWebhookEvents(now: Date = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const pending = await db
    .select({ id: saraWebhookEvents.id })
    .from(saraWebhookEvents)
    .where(
      and(
        isNull(saraWebhookEvents.processedAt),
        isNull(saraWebhookEvents.processingError),
        gte(saraWebhookEvents.receivedAt, new Date(now.getTime() - SARA_REPROCESS_WINDOW_MS)),
      ),
    );
  for (const { id } of pending) {
    await processSaraWebhookEvent(id);
  }
  if (pending.length > 0) console.log(`[SaraWebhook] ${pending.length} evento(s) pendente(s) reprocessado(s).`);
  return pending.length;
}

export function registerSaraWebhook(app: Express): void {
  app.post(SARA_WEBHOOK_PATH, (req, res) => {
    handleSaraWebhook(req as RawBodyRequest, res).catch(() => {
      console.error("[SaraWebhook] erro inesperado no receptor.");
      if (!res.headersSent) res.status(500).end();
    });
  });
}
