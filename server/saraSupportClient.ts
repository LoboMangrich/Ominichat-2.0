import {
  SARA_MEDIA_FIELD,
  baseMimeType,
  type SaraConversationSort,
  type SaraConversationStatus,
  type SaraMediaKind,
  type SaraOptOutStatus,
} from "@shared/sara";
import { ENV } from "./_core/env";

/**
 * Cliente para a Sara Support API (Epic 71), sistema externo que expõe
 * conversas de um bot de IA no WhatsApp com takeover humano. Autenticação por
 * header x-api-key — não confundir com o usuário/senha que protegem o Swagger
 * dela (não usados em runtime).
 */

export class SaraSupportApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * Corpo do erro já parseado (JSON), ou null. Só para o NOSSO servidor decidir
     * a resposta (ex.: conversation.actorId no 409 do /takeover) — nunca repassar
     * ao navegador.
     */
    public readonly body: unknown = null,
  ) {
    super(message);
    this.name = "SaraSupportApiError";
  }
}

export interface SaraConversationSummary {
  id: string;
  status: string;
  outcome: string | null;
  phoneNumber: string | null;
  userName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  takeoverAdminId: string | null;
  takeoverAt: string | null;
  /**
   * Quem assumiu, como enviado no header x-sara-actor-id — o nosso users.id em
   * string. null quando a conversa foi assumida sem o header (ex.: pelo painel
   * da própria Sara) ou depois de /release.
   */
  actorId: string | null;
  channelId: string | null;
}

export interface SaraMessageAudio {
  audioMessageId: string;
  mimeType: string | null;
  duration: number | null;
}

export interface SaraMessageImage {
  imageMessageId: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  visionSummary: string | null;
}

export interface SaraMessage {
  id: string;
  senderType: "sara" | "user" | "admin" | string;
  text: string;
  messageType: string;
  status: string;
  createdAt: string;
  audio: SaraMessageAudio | null;
  image: SaraMessageImage | null;
}

export interface SaraListConversationsParams {
  status?: SaraConversationStatus;
  phone?: string;
  limit?: number;
  offset?: number;
  sort?: SaraConversationSort;
}

export interface SaraListConversationsResult {
  data: SaraConversationSummary[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface SaraConversationDetail {
  conversation: SaraConversationSummary;
  messages: SaraMessage[];
}

const REQUEST_TIMEOUT_MS = 10_000;
/** Upload de até 16 MB para a Sara: 10s não basta numa conexão comum. */
const MEDIA_REQUEST_TIMEOUT_MS = 60_000;

interface RequestOptions {
  timeoutMs?: number;
  /**
   * Path para os logs no lugar do real, quando o real carrega dado pessoal (ex.: o
   * telefone em /contacts/{phone}/opt-out). Com ele, o corpo do erro também não é
   * logado — pode ecoar o mesmo dado.
   */
  logPath?: string;
}

/**
 * Id do usuário do Cashmiles que executa a ação. Vai no header
 * x-sara-actor-id de toda chamada: a chave de API é única (o takeoverAdminId
 * registrado na Sara é sempre o mesmo), então é esse header que permite à
 * Sara registrar qual atendente nosso assumiu, respondeu ou encerrou.
 */
export type SaraActorId = number;

function assertConfigured(): void {
  if (!ENV.saraSupportApiUrl || !ENV.saraSupportApiKey) {
    throw new Error(
      "SARA_SUPPORT_API_URL/SARA_SUPPORT_API_KEY não configurados. Veja .env.example.",
    );
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function parseJsonOrNull(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  actorId: SaraActorId,
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  return rawRequest<T>(path, { "x-sara-actor-id": String(actorId) }, init, options);
}

/**
 * Faz a chamada HTTP. actorHeaders é o x-sara-actor-id de quem age — vazio SÓ na
 * leitura interna de getSaraConversationSystemReadOnly (ver lá).
 */
async function rawRequest<T>(
  path: string,
  actorHeaders: Record<string, string>,
  init?: RequestInit,
  options: RequestOptions = {},
): Promise<T> {
  assertConfigured();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const logPath = options.logPath ?? path;
  // Multipart: o fetch monta o content-type com o boundary — não sobrescrever.
  const isMultipart = typeof FormData !== "undefined" && init?.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${ENV.saraSupportApiUrl}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        "x-api-key": ENV.saraSupportApiKey,
        ...(isMultipart ? {} : { "content-type": "application/json" }),
        ...actorHeaders,
        ...init?.headers,
      },
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error(`[saraSupportClient] timeout (${timeoutMs}ms) ao chamar ${logPath}`);
      throw new SaraSupportApiError(
        "Sara Support API não respondeu a tempo. Tente novamente.",
        0,
      );
    }
    console.error(`[saraSupportClient] falha de rede ao chamar ${logPath}:`, error);
    throw new SaraSupportApiError(
      "Falha de rede ao chamar a Sara Support API.",
      0,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Corpo bruto só vai pro log do servidor — nunca pro cliente, para não
    // vazar detalhe da API externa (e potencialmente dado de conversa) pelo
    // TRPCError que chega ao navegador.
    console.error(
      options.logPath
        ? `[saraSupportClient] ${response.status} em ${logPath}`
        : `[saraSupportClient] ${response.status} em ${path}: ${body}`,
    );
    throw new SaraSupportApiError(
      `Sara Support API retornou erro (status ${response.status}).`,
      response.status,
      parseJsonOrNull(body),
    );
  }

  return response.json() as Promise<T>;
}

export async function listSaraConversations(
  params: SaraListConversationsParams,
  actorId: SaraActorId,
): Promise<SaraListConversationsResult> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.phone) query.set("phone", params.phone);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.sort) query.set("sort", params.sort);
  const queryString = query.toString();

  return request<SaraListConversationsResult>(
    `/api/v1/support/conversations${queryString ? `?${queryString}` : ""}`,
    actorId,
  );
}

export async function getSaraConversation(
  id: string,
  actorId: SaraActorId,
): Promise<SaraConversationDetail> {
  return request<SaraConversationDetail>(
    `/api/v1/support/conversations/${encodeURIComponent(id)}`,
    actorId,
  );
}

export async function sendSaraMessage(
  id: string,
  text: string,
  actorId: SaraActorId,
): Promise<{ message: SaraMessage & { whatsappMessageId: string | null } }> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/messages`, actorId, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function takeoverSaraConversation(id: string, actorId: SaraActorId): Promise<{
  conversation: { id: string; status: string; takeoverAdminId: string | null; takeoverAt: string | null };
}> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/takeover`, actorId, {
    method: "POST",
    body: "{}",
  });
}

export async function releaseSaraConversation(id: string, actorId: SaraActorId): Promise<{
  conversation: { id: string; status: string; takeoverAdminId: null; takeoverAt: null };
}> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/release`, actorId, {
    method: "POST",
    body: "{}",
  });
}

export async function closeSaraConversation(id: string, actorId: SaraActorId): Promise<{
  conversation: { id: string; status: string; outcome: string };
}> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/close`, actorId, {
    method: "POST",
    body: "{}",
  });
}

export async function sendSaraTypingIndicator(
  id: string,
  actorId: SaraActorId,
): Promise<{ sent: boolean }> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/typing`, actorId, {
    method: "POST",
    body: "{}",
  });
}

/** Extensão pelo mimetype — não repassamos o nome original do arquivo à Sara. */
function mediaFilename(kind: SaraMediaKind, mimeType: string): string {
  const subtype = baseMimeType(mimeType).split("/")[1]?.replace(/[^a-z0-9.+-]/g, "") || "bin";
  return `${kind}.${subtype === "jpeg" ? "jpg" : subtype}`;
}

/**
 * Envia áudio ou imagem (POST .../audio ou .../image, multipart, campo "file"). O
 * buffer vem da memória (rota /api/sara/conversations/:id/media) e nunca é gravado
 * em disco nem logado. Exige a conversa em human_takeover (senão 409).
 */
export async function sendSaraMedia(
  id: string,
  kind: SaraMediaKind,
  file: { buffer: Buffer; mimeType: string },
  actorId: SaraActorId,
): Promise<{ message: { id: string; senderType: string; messageType: string; status: string; whatsappMessageId: string | null; createdAt: string } }> {
  const form = new FormData();
  form.append(
    SARA_MEDIA_FIELD,
    new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
    mediaFilename(kind, file.mimeType),
  );
  return request(
    `/api/v1/support/conversations/${encodeURIComponent(id)}/${kind}`,
    actorId,
    { method: "POST", body: form },
    { timeoutMs: MEDIA_REQUEST_TIMEOUT_MS },
  );
}

/**
 * Motivo legível de um erro 4XX da Sara ({ error: { code, message } } na doc), cortado
 * em 200 caracteres. Só esse campo pode ir ao navegador — nunca o corpo inteiro.
 */
export function saraErrorReason(body: unknown): string | null {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof message !== "string" || !message.trim()) return null;
  return message.trim().slice(0, 200);
}

/**
 * Opt-out do WhatsApp (GET /contacts/{phone}/opt-out). 404 = contato não existe na
 * base da Sara → "sem registro", não erro. O telefone vai só no path da chamada:
 * nunca em log (logPath genérico).
 */
export async function getSaraOptOut(phone: string, actorId: SaraActorId): Promise<SaraOptOutStatus> {
  try {
    const result = await request<{
      phoneNumber?: string;
      optedOut?: boolean;
      optedOutAt?: string | null;
      optedOutReason?: string | null;
    }>(`/api/v1/support/contacts/${encodeURIComponent(phone)}/opt-out`, actorId, undefined, {
      logPath: "/api/v1/support/contacts/{phone}/opt-out",
    });
    return {
      optedOut: result.optedOut === true,
      optedOutAt: result.optedOutAt ?? null,
      reason: result.optedOutReason ?? null,
      noRecord: false,
    };
  } catch (error) {
    if (error instanceof SaraSupportApiError && error.status === 404) {
      return { optedOut: false, optedOutAt: null, reason: null, noRecord: true };
    }
    throw error;
  }
}

/**
 * URL assinada temporária (expiresIn = 900s na doc) para tocar um áudio ou exibir
 * uma imagem recebida. Buscada sob demanda pela tela. NUNCA logar `url` — é
 * credencial temporária de acesso à mídia do cliente.
 */
export interface SaraMediaUrl {
  url: string;
  expiresIn: number;
  mimeType: string;
}

export async function getSaraAudioUrl(audioMessageId: string, actorId: SaraActorId): Promise<SaraMediaUrl> {
  return request<SaraMediaUrl>(`/api/v1/support/audio/${encodeURIComponent(audioMessageId)}/url`, actorId);
}

export async function getSaraImageUrl(imageMessageId: string, actorId: SaraActorId): Promise<SaraMediaUrl> {
  return request<SaraMediaUrl>(`/api/v1/support/images/${encodeURIComponent(imageMessageId)}/url`, actorId);
}

// ── Prompt da Sara ───────────────────────────────────────────────────────────
// Contrato confirmado pelo TI em 25/09/2026. Ativar muda na hora como a Sara
// responde a TODOS os clientes — não existe ambiente de teste nem prévia.
// logPath em todas: o corpo de um erro pode ecoar o prompt, e prompt/notes
// nunca vão para log.

export interface SaraPromptVersion {
  id: string;
  version: number;
  isActive: boolean;
  content: string;
  notes: string | null;
  activatedAt: string | null;
  createdAt: string;
  /** x-sara-actor-id de quem criou (o nosso users.id em string), ou null. */
  createdByActorId: string | null;
  activatedByActorId: string | null;
}

export async function listSaraPrompts(actorId: SaraActorId): Promise<SaraPromptVersion[]> {
  const result = await request<{ data?: SaraPromptVersion[] }>("/api/v1/support/prompts", actorId, undefined, {
    logPath: "/api/v1/support/prompts",
  });
  return Array.isArray(result?.data) ? result.data : [];
}

/** Cria versão INATIVA (201). content e notes obrigatórios (400 sem eles). */
export async function createSaraPrompt(
  input: { content: string; notes: string },
  actorId: SaraActorId,
): Promise<Pick<SaraPromptVersion, "id" | "version" | "isActive" | "content" | "notes" | "createdAt">> {
  return request(
    "/api/v1/support/prompts",
    actorId,
    { method: "POST", body: JSON.stringify({ content: input.content, notes: input.notes }) },
    { logPath: "/api/v1/support/prompts" },
  );
}

/** Ativa a versão e desativa a anterior. 404 se não existe. */
export async function activateSaraPrompt(
  id: string,
  actorId: SaraActorId,
): Promise<Pick<SaraPromptVersion, "id" | "version" | "isActive" | "activatedAt">> {
  return request(
    `/api/v1/support/prompts/${encodeURIComponent(id)}/activate`,
    actorId,
    { method: "POST", body: "{}" },
    { logPath: "/api/v1/support/prompts/{id}/activate" },
  );
}

/**
 * LEITURA INTERNA, SÓ GET — sem x-sara-actor-id, porque não há atendente agindo: é o
 * processamento em segundo plano do webhook da Sara (server/saraWebhook.ts) e o nome
 * das notificações (sara.pendingNotifications) que precisam do status/actorId/nome da
 * conversa.
 *
 * NUNCA usar para ação (enviar, takeover, release, close, typing, ou qualquer POST):
 * toda ação precisa do x-sara-actor-id de quem executa — use as funções acima. Por
 * isso esta função não aceita init/método: é sempre GET.
 */
export async function getSaraConversationSystemReadOnly(id: string): Promise<SaraConversationDetail> {
  return rawRequest<SaraConversationDetail>(
    `/api/v1/support/conversations/${encodeURIComponent(id)}`,
    {},
    { method: "GET" },
  );
}
