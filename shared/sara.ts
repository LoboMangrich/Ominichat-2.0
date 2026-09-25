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

// ─── Envio de mídia (POST .../audio e .../image) ─────────────────────────────
// Contrato confirmado pelo time de TI em 25/09/2026 (a doc só dizia "multipart"):
// a Sara lê o PRIMEIRO arquivo do multipart (campo "file"); formato ou tamanho
// inválido → 400 com o motivo. Validado no navegador (feedback rápido) E no servidor
// (garantia), com as mesmas constantes.

export const SARA_MEDIA_KINDS = ["audio", "image"] as const;
export type SaraMediaKind = (typeof SARA_MEDIA_KINDS)[number];

/** 16 MB — limite da Sara (e da Meta para áudio). Teto do upload na nossa rota. */
export const SARA_MEDIA_MAX_BYTES = 16 * 1024 * 1024;
/** Áudio com menos que isso a Sara recusa. */
export const SARA_AUDIO_MIN_BYTES = 100;
/**
 * Imagem: só o que a Meta entrega como IMAGEM no WhatsApp — JPEG e PNG até 5 MB. A
 * Sara aceita WebP e até 16 MB, mas no teste real (25/09) uma foto WebP foi aceita
 * pela Sara ("sent") e nunca chegou ao cliente: a Meta só aceita WebP como figurinha.
 * WebP ou > 5 MB é convertido para JPEG no navegador antes da prévia.
 */
export const SARA_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export const SARA_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Nome do campo multipart que mandamos para a Sara (e que a nossa rota recebe). */
export const SARA_MEDIA_FIELD = "file";

export const SARA_MEDIA_CONFLICT_MESSAGE = "Assuma a conversa para enviar";
export const SARA_MEDIA_GENERIC_ERROR = "Não foi possível enviar o arquivo. Tente novamente.";

/** Mimetype sem parâmetros e em minúsculas: "audio/webm;codecs=opus" → "audio/webm". */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

/** null = ok; string = motivo da recusa (mensagem para o atendente). */
export function validateSaraMedia(kind: SaraMediaKind, mimeType: string, size: number): string | null {
  const mime = baseMimeType(mimeType);
  if (size > SARA_MEDIA_MAX_BYTES) return "Arquivo maior que 16 MB.";
  if (kind === "audio") {
    if (!mime.startsWith("audio/")) return "Formato de áudio não aceito.";
    if (size < SARA_AUDIO_MIN_BYTES) return "Áudio curto demais.";
    return null;
  }
  if (!(SARA_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
    return "Formato de imagem não aceito. Use JPEG ou PNG.";
  }
  if (size > SARA_IMAGE_MAX_BYTES) return "Imagem maior que 5 MB.";
  if (size === 0) return "Arquivo vazio.";
  return null;
}

// ─── Opt-out (GET /contacts/{phone}/opt-out) ─────────────────────────────────

export interface SaraOptOutStatus {
  optedOut: boolean;
  optedOutAt: string | null;
  reason: string | null;
  /** 404 da Sara: contato não existe na base → sem registro de opt-out. */
  noRecord: boolean;
}

export function saraOptOutMessage(optedOutAt: string | null): string {
  const when = optedOutAt ? new Date(optedOutAt) : null;
  const date = when && !Number.isNaN(when.getTime()) ? ` em ${when.toLocaleDateString("pt-BR")}` : "";
  return `Este contato pediu para não receber mensagens pelo WhatsApp${date}.`;
}

// ─── Janela de 24h do WhatsApp ───────────────────────────────────────────────
// Regra da Meta: mensagem livre (texto, foto, áudio) só até 24h depois da ÚLTIMA
// MENSAGEM DO CLIENTE (senderType "user"). Depois disso, só template. Sem nenhuma
// mensagem do cliente, a janela está fechada. Calculado a partir das mensagens do
// GET da conversa — no servidor (antes de enviar) e na tela (faixa e composer).

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Abaixo disso, a tela avisa quanto falta. */
export const WHATSAPP_WINDOW_WARNING_MS = 2 * 60 * 60 * 1000;
export const SARA_WINDOW_CLOSED_MESSAGE =
  "Passaram 24h desde a última mensagem do cliente. Envie um template ou aguarde ele responder.";

export interface SaraWindowState {
  open: boolean;
  /** Quando fecha (ms epoch); null sem mensagem do cliente. */
  closesAt: number | null;
  /** Quanto falta (0 se fechada). */
  remainingMs: number;
}

export function saraWindowState(
  messages: ReadonlyArray<{ senderType: string; createdAt: string }>,
  now: number,
): SaraWindowState {
  let lastUserAt: number | null = null;
  for (const m of messages) {
    if (m.senderType !== "user") continue;
    const at = Date.parse(m.createdAt);
    if (!Number.isNaN(at) && (lastUserAt === null || at > lastUserAt)) lastUserAt = at;
  }
  if (lastUserAt === null) return { open: false, closesAt: null, remainingMs: 0 };
  const closesAt = lastUserAt + WHATSAPP_WINDOW_MS;
  const remainingMs = Math.max(0, closesAt - now);
  return { open: remainingMs > 0, closesAt, remainingMs };
}

/** "1h20", "2h", "45min" — arredonda para cima (não promete mais tempo do que há). */
export function formatWindowRemaining(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min}min`;
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, "0")}`;
}
