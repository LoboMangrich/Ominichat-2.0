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
  channelId: string | null;
}

export interface SaraMessage {
  id: string;
  senderType: "sara" | "user" | "admin" | string;
  text: string;
  messageType: string;
  status: string;
  createdAt: string;
}

export interface SaraListConversationsParams {
  status?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}

export interface SaraListConversationsResult {
  data: SaraConversationSummary[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface SaraConversationDetail {
  conversation: SaraConversationSummary;
  messages: SaraMessage[];
}

function assertConfigured(): void {
  if (!ENV.saraSupportApiUrl || !ENV.saraSupportApiKey) {
    throw new Error(
      "SARA_SUPPORT_API_URL/SARA_SUPPORT_API_KEY não configurados. Veja .env.example.",
    );
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  assertConfigured();

  let response: Response;
  try {
    response = await fetch(`${ENV.saraSupportApiUrl}${path}`, {
      ...init,
      headers: {
        "x-api-key": ENV.saraSupportApiKey,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  } catch (error) {
    throw new SaraSupportApiError(
      `Falha de rede ao chamar a Sara Support API: ${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SaraSupportApiError(
      `Sara Support API retornou ${response.status}${body ? `: ${body}` : ""}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export async function listSaraConversations(
  params: SaraListConversationsParams,
): Promise<SaraListConversationsResult> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.phone) query.set("phone", params.phone);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const queryString = query.toString();

  return request<SaraListConversationsResult>(
    `/api/v1/support/conversations${queryString ? `?${queryString}` : ""}`,
  );
}

export async function getSaraConversation(id: string): Promise<SaraConversationDetail> {
  return request<SaraConversationDetail>(`/api/v1/support/conversations/${encodeURIComponent(id)}`);
}

export async function sendSaraMessage(
  id: string,
  text: string,
): Promise<{ message: SaraMessage & { whatsappMessageId: string | null } }> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function takeoverSaraConversation(id: string): Promise<{
  conversation: { id: string; status: string; takeoverAdminId: string | null; takeoverAt: string | null };
}> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/takeover`, {
    method: "POST",
    body: "{}",
  });
}

export async function releaseSaraConversation(id: string): Promise<{
  conversation: { id: string; status: string; takeoverAdminId: null; takeoverAt: null };
}> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/release`, {
    method: "POST",
    body: "{}",
  });
}

export async function closeSaraConversation(id: string): Promise<{
  conversation: { id: string; status: string; outcome: string };
}> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/close`, {
    method: "POST",
    body: "{}",
  });
}

export async function sendSaraTypingIndicator(id: string): Promise<{ sent: boolean }> {
  return request(`/api/v1/support/conversations/${encodeURIComponent(id)}/typing`, {
    method: "POST",
    body: "{}",
  });
}
