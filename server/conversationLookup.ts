import { eq } from "drizzle-orm";
import { conversations } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type ConversationChannel =
  (typeof conversations.channel.enumValues)[number];
export type ConversationCandidate = Pick<
  typeof conversations.$inferSelect,
  "id" | "channel" | "status" | "updatedAt"
>;

// Regra de reaproveitamento de conversa para mensagem recebida por webhook: só conversa não
// finalizada, do mesmo canal, a mais recente. Antes cada receptor fazia um select sem filtro de
// status nem ordenação — pegava uma conversa qualquer do cliente (na prática a mais antiga) e, se
// ela estivesse Closed, criava outra a cada mensagem. Sem o filtro de canal, uma mensagem de
// WhatsApp podia cair numa conversa de e-mail, e a resposta do atendente saía pelo canal errado.
// Fica em função pura para ser testada por comportamento, e para a regra de reabrir (janela de
// tempo) mudar um lugar só.
export function pickReusableConversation(
  candidates: ConversationCandidate[],
  channel: ConversationChannel
): ConversationCandidate | null {
  const reusable = candidates
    .filter(c => c.channel === channel && c.status !== "Closed")
    .sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id
    );
  return reusable[0] ?? null;
}

// Devolve o id da conversa aberta do cliente naquele canal, criando uma nova (Open) se não houver.
// Não é atômico: duas mensagens simultâneas de um cliente sem conversa aberta ainda podem criar
// duas conversas — pendência registrada no CLAUDE.md.
export async function findOrCreateOpenConversation(
  db: Db,
  customerId: number,
  channel: ConversationChannel
): Promise<number> {
  const candidates = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      status: conversations.status,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.customerId, customerId));

  const reusable = pickReusableConversation(candidates, channel);
  if (reusable) return reusable.id;

  const [created] = await db
    .insert(conversations)
    .values({ customerId, channel, status: "Open" })
    .$returningId();
  return created.id;
}
