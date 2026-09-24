// Tipos, constantes e helpers da tela única de Conversas (/sara): Sara + canal próprio
// numa lista só. Compartilhado entre Sara.tsx e SaraConversationDetail.tsx.

import { phoneDigits, toE164Phone } from "@shared/phone";

// ─── Status da Sara ───────────────────────────────────────────────────────────
// Únicos status da Sara confirmados no código. Um status fora daqui aparece com o
// valor cru no selo — não inventar rótulo nem aba para status não verificado.
export const SARA_STATUS_LABELS: Record<string, string> = {
  active: "Com a IA",
  human_takeover: "Atendimento humano",
};

// ─── Buckets ─────────────────────────────────────────────────────────────────
// Agrupamento de exibição, independente da origem. Preparado para crescer: um status
// novo da Sara (a doc nova traz awaiting_response e error) entra como chave em
// SARA_STATUS_BUCKET — e, se precisar de aba ou selo próprio, como um bucket novo em
// CONVERSATION_BUCKETS + BUCKET_LABELS. Nada disso exige reescrever o tipo.
export const CONVERSATION_BUCKETS = ["ai", "human", "closed", "unknown"] as const;
export type ConversationBucket = (typeof CONVERSATION_BUCKETS)[number];

export const BUCKET_LABELS: Partial<Record<ConversationBucket, string>> = {
  ai: "Com a IA",
  human: "Atendimento humano",
  closed: "Encerrada",
  // unknown não tem rótulo: mostra o status cru.
};

export const SARA_STATUS_BUCKET: Record<string, ConversationBucket> = {
  active: "ai",
  human_takeover: "human",
};

export function saraBucket(status: string): ConversationBucket {
  return SARA_STATUS_BUCKET[status] ?? "unknown";
}

/**
 * Status da Sara a mandar no filtro da API para um bucket. Só filtra no servidor
 * quando exatamente um status leva àquele bucket; com mais de um, a tela busca sem
 * filtro e separa no client.
 */
export function saraStatusForBucket(bucket: ConversationBucket | undefined): string | undefined {
  if (!bucket) return undefined;
  const statuses = Object.keys(SARA_STATUS_BUCKET).filter(s => SARA_STATUS_BUCKET[s] === bucket);
  return statuses.length === 1 ? statuses[0] : undefined;
}

/** Canal próprio: Closed → closed; senão handledByAi decide entre IA e humano. */
export function legacyBucket(status: string | null, handledByAi: boolean | number | null): ConversationBucket {
  if (status === "Closed") return "closed";
  return handledByAi ? "ai" : "human"; // MySQL pode devolver boolean como 0/1
}

// ─── Abas ────────────────────────────────────────────────────────────────────
// closed e unknown só aparecem em "Todos".
export const SARA_TABS = [
  { key: "all", label: "Todos", bucket: undefined },
  { key: "ai", label: "Com a IA", bucket: "ai" },
  { key: "human", label: "Atendimento humano", bucket: "human" },
] as const satisfies ReadonlyArray<{ key: string; label: string; bucket: ConversationBucket | undefined }>;

export type SaraTabKey = (typeof SARA_TABS)[number]["key"];

// ─── Item unificado ──────────────────────────────────────────────────────────
type UnifiedBase = {
  /** Chave do React: prefixada pela origem — ids da Sara são string, do legado number. */
  key: string;
  name: string | null;
  phone: string | null;
  /** Epoch ms da última atividade; null ordena por último. */
  lastActivityAt: number | null;
  bucket: ConversationBucket;
  /** Status como veio da origem, para o selo quando o bucket é unknown. */
  rawStatus: string;
};

export type UnifiedConversation =
  | (UnifiedBase & { source: "sara"; id: string })
  | (UnifiedBase & { source: "legacy"; id: number; channel: string | null });

export type SaraListItem = {
  id: string;
  status: string;
  userName: string | null;
  phoneNumber: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

export type LegacyListItem = {
  id: number;
  type: string;
  name: string | null;
  phone: string | null;
  lastMessageAt: string | Date | null;
  status: string | null;
  handledByAi: boolean | number | null;
  channel: string | null;
};

function toEpoch(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function fromSara(conv: SaraListItem): UnifiedConversation {
  return {
    source: "sara",
    key: `sara:${conv.id}`,
    id: conv.id,
    name: conv.userName,
    phone: conv.phoneNumber,
    lastActivityAt: toEpoch(conv.lastMessageAt ?? conv.createdAt),
    bucket: saraBucket(conv.status),
    rawStatus: conv.status,
  };
}

export function fromLegacy(item: LegacyListItem): UnifiedConversation {
  return {
    source: "legacy",
    key: `legacy:${item.id}`,
    id: item.id,
    name: item.name,
    phone: item.phone,
    lastActivityAt: toEpoch(item.lastMessageAt),
    bucket: legacyBucket(item.status, item.handledByAi),
    rawStatus: item.status ?? "",
    channel: item.channel,
  };
}

/** Junta as duas fontes (grupos ficam de fora) e ordena por última atividade, desc. */
export function mergeConversations(
  saraItems: SaraListItem[],
  legacyItems: LegacyListItem[],
): UnifiedConversation[] {
  return [
    ...saraItems.map(fromSara),
    ...legacyItems.filter(i => i.type === "conversation").map(fromLegacy),
  ].sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
}

// ─── Selos ───────────────────────────────────────────────────────────────────
// Mesmos rótulos de ConversationDetail.tsx; canal fora daqui aparece cru.
const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
  telegram: "Telegram",
};

export function originLabel(item: UnifiedConversation): string {
  if (item.source === "sara") return "Sara";
  if (!item.channel) return "Canal próprio";
  return CHANNEL_LABELS[item.channel] ?? item.channel;
}

export function statusLabel(item: UnifiedConversation): string {
  return BUCKET_LABELS[item.bucket] ?? item.rawStatus;
}

export function displayName(item: UnifiedConversation): string {
  return item.name ?? item.phone ?? (item.source === "legacy" ? `Atendimento #${item.id}` : "Desconhecido");
}

export function conversationHref(item: Pick<UnifiedConversation, "source" | "id">): string {
  return item.source === "sara"
    ? `/sara/${encodeURIComponent(item.id)}`
    : `/sara/legado/${item.id}`;
}

// ─── Busca ───────────────────────────────────────────────────────────────────
/**
 * O filtro phone da Sara é E.164: só vai para a API quando o termo é um telefone
 * completo. Nome ou número parcial filtram no client as conversas da Sara já
 * carregadas. O canal próprio sempre recebe o termo (busca por nome/telefone).
 */
export function saraSearch(term: string): { phone: string | undefined; localFilter: string | null } {
  const trimmed = term.trim();
  if (!trimmed) return { phone: undefined, localFilter: null };
  const e164 = toE164Phone(trimmed);
  return e164 ? { phone: e164, localFilter: null } : { phone: undefined, localFilter: trimmed };
}

/** Filtro local: nome sem diferenciar maiúsculas; telefone só por dígitos. */
export function matchesLocalSearch(conv: SaraListItem, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  if (conv.userName?.toLowerCase().includes(needle)) return true;
  const digits = phoneDigits(needle);
  return digits.length > 0 && !!conv.phoneNumber && phoneDigits(conv.phoneNumber).includes(digits);
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
export function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}
