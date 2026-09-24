/**
 * saraNotifications.ts
 * Notificações vindas do webhook da Sara, entregues pelo mesmo mecanismo que já existe
 * no app (useNewConversationNotification: polling de 15s + som + Notification do
 * navegador, liga/desliga "Notificações ativas" no rodapé).
 *
 * A notificação é a própria linha de saraWebhookEvents (notifyUserId / notifyAll) —
 * nome e telefone NUNCA são gravados no banco. O texto é montado na leitura, com o
 * rótulo do contato (nome ou telefone) vindo de um GET de leitura na Sara, guardado só
 * EM MEMÓRIA por ~5 min por conversa: com notifyAll, cada atendente leria a mesma
 * conversa — o cache faz virar 1 GET só. Nada disso vai para log.
 */

import { and, asc, desc, eq, gt, gte, inArray, isNotNull, or } from "drizzle-orm";
import { saraWebhookEvents } from "../drizzle/schema";
import { mapWithConcurrency } from "./concurrency";
import { getDb } from "./db";
import { SARA_EVENT_TYPES, SARA_NOTIFYING_EVENT_TYPES } from "./saraWebhook";
import { getSaraConversationSystemReadOnly } from "./saraSupportClient";

/** Só avisa evento recente: quem abre o app depois não recebe notificação velha. */
export const SARA_NOTIFICATION_WINDOW_MS = 10 * 60 * 1000;
export const SARA_NOTIFICATION_LIMIT = 20;
export const SARA_CONTACT_LABEL_TTL_MS = 5 * 60 * 1000;
const LABEL_CONCURRENCY = 5;

// Cache em memória: saraConversationId → rótulo (promise, para que leituras simultâneas
// dividam o mesmo GET). Falha não fica em cache — a próxima leitura tenta de novo.
const labelCache = new Map<string, { expiresAt: number; label: Promise<string | null> }>();

export function clearSaraContactLabelCache(): void {
  labelCache.clear();
}

function contactLabel(saraConversationId: string, now: number): Promise<string | null> {
  const cached = labelCache.get(saraConversationId);
  if (cached && cached.expiresAt > now) return cached.label;

  const label = getSaraConversationSystemReadOnly(saraConversationId).then(
    ({ conversation }) => conversation.userName?.trim() || conversation.phoneNumber || null,
  );
  labelCache.set(saraConversationId, { expiresAt: now + SARA_CONTACT_LABEL_TTL_MS, label });
  label.catch(() => {
    if (labelCache.get(saraConversationId)?.label === label) labelCache.delete(saraConversationId);
  });
  return label;
}

export type SaraNotification = {
  id: number;
  saraConversationId: string;
  title: string;
  body: string;
};

function describe(eventType: string, label: string | null): { title: string; body: string } {
  const who = label ?? "cliente";
  if (eventType === SARA_EVENT_TYPES.escalated) {
    return { title: "Conversa aguardando atendente", body: `${who} — assumida sem atendente identificado.` };
  }
  return { title: `Nova mensagem de ${who}`, body: "Na conversa que você assumiu." };
}

/**
 * Notificações do usuário depois do cursor `afterId`. Sem cursor (primeira leitura da
 * aba), só devolve o cursor atual e nenhuma notificação — o mesmo padrão do hook, que
 * não avisa do que já existia ao abrir a página. O cursor só avança sobre o que foi
 * entregue: um evento ainda não processado continua elegível na próxima leitura.
 */
export async function pendingSaraNotifications(
  userId: number,
  afterId: number | null,
  now: Date = new Date(),
): Promise<{ cursor: number | null; items: SaraNotification[] }> {
  const db = await getDb();
  if (!db) return { cursor: afterId, items: [] };

  if (afterId === null) {
    const [last] = await db
      .select({ id: saraWebhookEvents.id })
      .from(saraWebhookEvents)
      .orderBy(desc(saraWebhookEvents.id))
      .limit(1);
    return { cursor: last?.id ?? 0, items: [] };
  }

  const rows = await db
    .select({
      id: saraWebhookEvents.id,
      eventType: saraWebhookEvents.eventType,
      saraConversationId: saraWebhookEvents.saraConversationId,
    })
    .from(saraWebhookEvents)
    .where(
      and(
        gt(saraWebhookEvents.id, afterId),
        gte(saraWebhookEvents.receivedAt, new Date(now.getTime() - SARA_NOTIFICATION_WINDOW_MS)),
        isNotNull(saraWebhookEvents.processedAt),
        inArray(saraWebhookEvents.eventType, SARA_NOTIFYING_EVENT_TYPES),
        or(eq(saraWebhookEvents.notifyUserId, userId), eq(saraWebhookEvents.notifyAll, true)),
      ),
    )
    .orderBy(asc(saraWebhookEvents.id))
    .limit(SARA_NOTIFICATION_LIMIT);

  const nowMs = now.getTime();
  const items = await mapWithConcurrency(rows, LABEL_CONCURRENCY, async row => {
    const saraConversationId = row.saraConversationId ?? "";
    const label = saraConversationId ? await contactLabel(saraConversationId, nowMs).catch(() => null) : null;
    return { id: row.id, saraConversationId, ...describe(row.eventType, label) };
  });

  return { cursor: rows.length > 0 ? rows[rows.length - 1].id : afterId, items };
}
