/**
 * Constantes da Sara Support API compartilhadas entre client e server.
 * Fonte da verdade: docs/sara-support-openapi.json.
 */

/** Enum de `status` do `GET /api/v1/support/conversations`. */
export const SARA_CONVERSATION_STATUSES = ["awaiting_response", "active", "error", "human_takeover"] as const;
export type SaraConversationStatus = (typeof SARA_CONVERSATION_STATUSES)[number];

/** Enum de `sort` do `GET /api/v1/support/conversations` (default da API: lastMessageAt). */
export const SARA_CONVERSATION_SORTS = ["lastMessageAt", "takeoverAt"] as const;
export type SaraConversationSort = (typeof SARA_CONVERSATION_SORTS)[number];

// ─── Quem assumiu (actorId) ──────────────────────────────────────────────────
// actorId é o que enviamos no header x-sara-actor-id: o nosso users.id em string.
// A Sara só registra (auditoria) — a regra de quem pode agir é nossa, checada no
// servidor (server/routers/sara.ts) antes de chamar a Sara.

/** Enviar mensagem: SÓ quem assumiu. Sem exceção de Admin; actorId null bloqueia. */
export function saraCanSend(actorId: string | null, userId: number): boolean {
  return actorId !== null && actorId === String(userId);
}

/**
 * Devolver para a IA / Encerrar: quem assumiu, Admin, ou qualquer atendente quando
 * actorId é null (assumida sem identificação — pode ter sido pelo painel da Sara).
 */
export function saraCanReleaseOrClose(actorId: string | null, userId: number, role: string): boolean {
  return actorId === null || actorId === String(userId) || role === "Admin";
}

export const SARA_FORBIDDEN_OTHER_ACTOR = "Conversa assumida por outro atendente";
export const SARA_UNIDENTIFIED_ACTOR_NOTICE =
  "Assumida sem identificação de atendente. Se ninguém da equipe está nela, devolva para a IA e assuma de novo.";
