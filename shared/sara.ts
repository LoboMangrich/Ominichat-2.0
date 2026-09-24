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
