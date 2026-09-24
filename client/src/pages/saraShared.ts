// Tipos, constantes e helpers da tela única de Conversas (/sara): Sara + canal próprio
// numa lista só. Compartilhado entre Sara.tsx e SaraConversationDetail.tsx.

import { phoneDigits, toE164Phone } from "@shared/phone";
import type { SaraConversationStatus } from "@shared/sara";
import type { conversations } from "../../../drizzle/schema";

// ─── Status da Sara ───────────────────────────────────────────────────────────
// Enum de status do GET /conversations segundo a doc nova da Sara: awaiting_response,
// active, error, human_takeover. Um status fora daqui aparece com o valor cru no selo —
// não inventar rótulo para status não documentado.
export const SARA_STATUS_LABELS: Record<string, string> = {
  active: "Com a IA",
  human_takeover: "Atendimento humano",
  awaiting_response: "Aguardando resposta",
  error: "Erro",
} satisfies Record<SaraConversationStatus, string>; // todo status do enum tem rótulo

// ─── Buckets ─────────────────────────────────────────────────────────────────
// Agrupamento de exibição (rótulo à direita de cada item), independente da origem. Um
// status novo entra como chave em SARA_STATUS_BUCKET e, se precisar de rótulo próprio,
// como bucket novo em CONVERSATION_BUCKETS + BUCKET_LABELS — sem reescrever o tipo.
export const CONVERSATION_BUCKETS = ["ai", "human", "waiting", "error", "closed", "unknown"] as const;
export type ConversationBucket = (typeof CONVERSATION_BUCKETS)[number];

export const BUCKET_LABELS: Partial<Record<ConversationBucket, string>> = {
  ai: "Com a IA",
  human: "Atendimento humano",
  waiting: "Aguardando resposta",
  error: "Erro",
  closed: "Encerrada",
  // unknown não tem rótulo: mostra o status cru.
};

export const SARA_STATUS_BUCKET: Record<string, ConversationBucket> = {
  active: "ai",
  human_takeover: "human",
  awaiting_response: "waiting",
  error: "error",
} satisfies Record<SaraConversationStatus, ConversationBucket>;

export function saraBucket(status: string): ConversationBucket {
  return SARA_STATUS_BUCKET[status] ?? "unknown";
}

/**
 * Quem assumiu a conversa da Sara, para "Assumido por …". null quando não há actorId
 * (assumida sem identificação, ou não assumida). Id sem usuário conhecido no
 * Cashmiles → "outro atendente".
 */
export function saraActorLabel(conv: {
  actorId?: string | null;
  actorName?: string | null;
  assignedToMe?: boolean;
}): string | null {
  if (!conv.actorId) return null;
  if (conv.assignedToMe) return "você";
  return conv.actorName ?? "outro atendente";
}

/** Canal próprio: Closed → closed; senão handledByAi decide entre IA e humano. */
export function legacyBucket(status: string | null, handledByAi: boolean | number | null): ConversationBucket {
  if (status === "Closed") return "closed";
  return handledByAi ? "ai" : "human"; // MySQL pode devolver boolean como 0/1
}

// ─── Abas (etiquetas) ────────────────────────────────────────────────────────
// Mesmas chips de Atendimentos.tsx (Todos + etiquetas de tags.list), mas as etiquetas
// padrão de status filtram pelo STATUS REAL — não por conversationTagAssignments, que
// nada popula (era por isso que "Em Aberto"/"Aguardando" viviam vazias). Identificadas
// por slug, nunca por id numérico.
type LegacyConversationStatus = (typeof conversations.status.enumValues)[number];

export const STATUS_TAG_FILTERS = {
  open: { saraStatuses: ["active", "human_takeover"], legacyStatus: "Open" },
  waiting: { saraStatuses: ["awaiting_response"], legacyStatus: "Waiting" },
} as const satisfies Record<string, { saraStatuses: readonly SaraConversationStatus[]; legacyStatus: LegacyConversationStatus }>;

export const GROUP_TAG_SLUG = "group";

export type TabFilter =
  | { kind: "all" }
  | { kind: "status"; saraStatuses: readonly SaraConversationStatus[]; legacyStatus: LegacyConversationStatus }
  | { kind: "groups"; tagId: number }
  // Etiqueta personalizada: só existe no canal próprio (a Sara não tem etiquetas).
  | { kind: "tag"; tagId: number };

export function tabFilterFor(tag: { id: number; slug: string | null } | null | undefined): TabFilter {
  if (!tag) return { kind: "all" };
  if (tag.slug === GROUP_TAG_SLUG) return { kind: "groups", tagId: tag.id };
  if (tag.slug && tag.slug in STATUS_TAG_FILTERS) {
    return { kind: "status", ...STATUS_TAG_FILTERS[tag.slug as keyof typeof STATUS_TAG_FILTERS] };
  }
  return { kind: "tag", tagId: tag.id };
}

/**
 * De onde vêm as conversas da Sara nesta aba:
 * - "list": sara.listConversations (Todos, Em Aberto, Aguardando);
 * - "tag": sara.listTaggedConversations (etiqueta personalizada — a API da Sara não
 *   filtra por etiqueta, então buscamos cada conversa etiquetada por id);
 * - "none": Grupos (não há Sara).
 */
export function saraSource(filter: TabFilter): "list" | "tag" | "none" {
  if (filter.kind === "all" || filter.kind === "status") return "list";
  if (filter.kind === "tag") return "tag";
  return "none";
}

/**
 * Status a mandar no filtro da API da Sara. Só filtra no servidor quando a aba tem um
 * status só (Aguardando); "Em Aberto" tem dois — busca sem filtro e separa no client
 * (limitação conhecida: a página pode vir com menos abertas que o limit).
 */
export function saraStatusParam(filter: TabFilter): SaraConversationStatus | undefined {
  return filter.kind === "status" && filter.saraStatuses.length === 1 ? filter.saraStatuses[0] : undefined;
}

export function saraMatchesFilter(status: string, filter: TabFilter): boolean {
  if (filter.kind === "all" || filter.kind === "tag") return true; // etiqueta: qualquer status
  if (filter.kind === "status") return (filter.saraStatuses as readonly string[]).includes(status);
  return false;
}

/** Input de tags.listUnified para a aba. Fora de Grupos, sempre excludeGroups: true. */
export function legacyQueryInput(filter: TabFilter, search: string, limit: number) {
  const base = { search: search.trim() || undefined, limit };
  switch (filter.kind) {
    case "all":
      return { ...base, excludeGroups: true };
    case "status":
      return { ...base, excludeGroups: true, status: filter.legacyStatus };
    case "groups":
      return { ...base, tagId: filter.tagId };
    case "tag":
      return { ...base, excludeGroups: true, tagId: filter.tagId };
  }
}

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
  | (UnifiedBase & { source: "sara"; id: string; /** "Assumido por …" — ver saraActorLabel. */ actorLabel: string | null })
  | (UnifiedBase & { source: "legacy"; id: number; channel: string | null })
  // Grupo do WhatsApp (whatsappGroups.id) — só na aba Grupos.
  | (UnifiedBase & { source: "group"; id: number });

export type SaraListItem = {
  id: string;
  status: string;
  userName: string | null;
  phoneNumber: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  // Enriquecidos pelo nosso router (sara.listConversations) — ausentes em dado cru.
  actorId?: string | null;
  actorName?: string | null;
  assignedToMe?: boolean;
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
  groupId?: number | null;
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
    actorLabel: saraActorLabel(conv),
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

/** Grupo: listUnified devolve id = whatsappGroups.id + 100000 e groupId = whatsappGroups.id. */
export function fromGroup(item: LegacyListItem): UnifiedConversation | null {
  if (item.groupId == null) return null;
  return {
    source: "group",
    key: `group:${item.groupId}`,
    id: item.groupId,
    name: item.name,
    phone: null,
    lastActivityAt: toEpoch(item.lastMessageAt),
    bucket: "unknown",
    rawStatus: "",
  };
}

/** Junta as fontes e ordena por última atividade, desc. Grupos só com includeGroups. */
export function mergeConversations(
  saraItems: SaraListItem[],
  legacyItems: LegacyListItem[],
  { includeGroups = false }: { includeGroups?: boolean } = {},
): UnifiedConversation[] {
  const groups = includeGroups
    ? legacyItems
        .filter(i => i.type === "group")
        .map(fromGroup)
        .filter((g): g is UnifiedConversation => g !== null)
    : [];
  return [
    ...saraItems.map(fromSara),
    ...legacyItems.filter(i => i.type === "conversation").map(fromLegacy),
    ...groups,
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
  if (item.source === "group") return "Grupo";
  if (!item.channel) return "Canal próprio";
  return CHANNEL_LABELS[item.channel] ?? item.channel;
}

/** Rótulo à direita do item. Grupo não tem status de atendimento. */
export function statusLabel(item: UnifiedConversation): string {
  if (item.source === "group") return "";
  if (item.source === "sara" && item.bucket === "human" && item.actorLabel) return `Assumido por ${item.actorLabel}`;
  return BUCKET_LABELS[item.bucket] ?? item.rawStatus;
}

export function displayName(item: UnifiedConversation): string {
  if (item.source === "group") return item.name ?? "Grupo";
  return item.name ?? item.phone ?? (item.source === "legacy" ? `Atendimento #${item.id}` : "Desconhecido");
}

export function conversationHref(item: Pick<UnifiedConversation, "source" | "id">): string {
  if (item.source === "sara") return `/sara/${encodeURIComponent(item.id)}`;
  if (item.source === "group") return `/sara/grupo/${item.id}`;
  return `/sara/legado/${item.id}`;
}

// ─── Links diretos (?conversationId= / ?customerId=) ─────────────────────────
// /atendimentos redireciona para /sara preservando a query; Customers.tsx e Home.tsx
// apontam direto para /sara com o mesmo parâmetro.
export type DeepLink = { kind: "conversation"; id: number } | { kind: "customer"; id: number } | null;

function positiveIntParam(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseDeepLink(search: string): DeepLink {
  const params = new URLSearchParams(search);
  const conversationId = positiveIntParam(params.get("conversationId"));
  if (conversationId) return { kind: "conversation", id: conversationId };
  const customerId = positiveIntParam(params.get("customerId"));
  if (customerId) return { kind: "customer", id: customerId };
  return null;
}

/**
 * Conversa mais recente do cliente: a última do canal próprio
 * (customers.getLastInteractions) contra as da Sara achadas pelo telefone
 * (e164Candidates, com e sem o 9). Empate fica com o canal próprio.
 */
export function latestConversationHref(
  legacy: { id: number; updatedAt: string | Date | null } | undefined,
  saraLists: SaraListItem[][],
): string | null {
  let best: { href: string; at: number } | null = legacy
    ? { href: conversationHref({ source: "legacy", id: legacy.id }), at: toEpoch(legacy.updatedAt) ?? 0 }
    : null;
  for (const conv of saraLists.flat()) {
    const at = fromSara(conv).lastActivityAt ?? 0;
    if (!best || at > best.at) best = { href: conversationHref({ source: "sara", id: conv.id }), at };
  }
  return best?.href ?? null;
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

// ─── "Digitando..." ──────────────────────────────────────────────────────────
/** No máximo 1 sara.sendTyping a cada 5s enquanto o dono digita (é chamada real ao cliente). */
export const SARA_TYPING_INTERVAL_MS = 5000;

export function shouldSendTyping(lastSentAt: number | null, now: number, intervalMs = SARA_TYPING_INTERVAL_MS): boolean {
  return lastSentAt === null || now - lastSentAt >= intervalMs;
}

// ─── Respostas rápidas ───────────────────────────────────────────────────────
export type QuickReply = { id: number; title: string; content: string; shortcut: string | null };

/** Mesmo filtro do "/" de ConversationDetail.tsx: atalho (começa com), título ou conteúdo (contém). */
export function filterQuickReplies(list: QuickReply[], query: string): QuickReply[] {
  if (!query) return list;
  return list.filter(
    qr =>
      String(qr.shortcut ?? "").toLowerCase().startsWith(query) ||
      String(qr.title ?? "").toLowerCase().includes(query) ||
      String(qr.content ?? "").toLowerCase().includes(query),
  );
}

// ─── Linha do tempo: mensagens da Sara + notas internas do Cashmiles ─────────
export type TimelineEntry<M, N> =
  | { kind: "message"; key: string; at: number; item: M }
  | { kind: "note"; key: string; at: number; item: N };

/**
 * Intercala mensagens e notas pelo horário (asc). Empate: mensagem antes da nota.
 * Ordem estável — a ordem original de cada lista se mantém.
 */
export function mergeTimeline<
  M extends { id: string; createdAt: string },
  N extends { id: number; createdAt: string | Date },
>(messages: M[], notes: N[]): Array<TimelineEntry<M, N>> {
  const entries: Array<TimelineEntry<M, N> & { order: number }> = [
    ...messages.map((item, i) => ({
      kind: "message" as const,
      key: `msg:${item.id}`,
      at: toEpoch(item.createdAt) ?? 0,
      item,
      order: i,
    })),
    ...notes.map((item, i) => ({
      kind: "note" as const,
      key: `note:${item.id}`,
      at: toEpoch(item.createdAt) ?? 0,
      item,
      order: messages.length + i,
    })),
  ];
  return entries
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map(({ order: _order, ...entry }) => entry as TimelineEntry<M, N>);
}
