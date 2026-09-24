// Tipos, constantes e helpers da tela única de Conversas (/sara): Sara + canal próprio
// numa lista só. Compartilhado entre Sara.tsx e SaraConversationDetail.tsx.

import { phoneDigits, toE164Phone } from "@shared/phone";
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
};

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
};

export function saraBucket(status: string): ConversationBucket {
  return SARA_STATUS_BUCKET[status] ?? "unknown";
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
} as const satisfies Record<string, { saraStatuses: readonly string[]; legacyStatus: LegacyConversationStatus }>;

export const GROUP_TAG_SLUG = "group";

export type TabFilter =
  | { kind: "all" }
  | { kind: "status"; saraStatuses: readonly string[]; legacyStatus: LegacyConversationStatus }
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

/** A Sara entra na lista? Não em Grupos nem em etiqueta personalizada. */
export function includesSara(filter: TabFilter): boolean {
  return filter.kind === "all" || filter.kind === "status";
}

/**
 * Status a mandar no filtro da API da Sara. Só filtra no servidor quando a aba tem um
 * status só (Aguardando); "Em Aberto" tem dois — busca sem filtro e separa no client
 * (limitação conhecida: a página pode vir com menos abertas que o limit).
 */
export function saraStatusParam(filter: TabFilter): string | undefined {
  return filter.kind === "status" && filter.saraStatuses.length === 1 ? filter.saraStatuses[0] : undefined;
}

export function saraMatchesFilter(status: string, filter: TabFilter): boolean {
  if (filter.kind === "all") return true;
  if (filter.kind === "status") return filter.saraStatuses.includes(status);
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
  | (UnifiedBase & { source: "sara"; id: string })
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
