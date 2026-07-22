/**
 * channelSender.ts
 * Helpers para envio de mensagens via canais externos (WhatsApp Meta Cloud API, Email SMTP, Telegram).
 * Usado pelo executor de mensagens agendadas e por outros fluxos de envio automático.
 */

import { getDb } from "./db";
import { channelSettings, customers, conversations } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SendResult = {
  success: boolean;
  externalId?: string;
  error?: string;
};

export type SendMessageParams = {
  conversationId: number;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "document" | "audio" | "video";
};

// ─── WhatsApp Meta Cloud API ──────────────────────────────────────────────────

async function sendWhatsAppMessage(
  to: string,
  content: string,
  waPhoneNumberId: string,
  waToken: string,
  mediaUrl?: string,
  mediaType?: string
): Promise<SendResult> {
  try {
    const url = `https://graph.facebook.com/v19.0/${waPhoneNumberId}/messages`;

    let body: Record<string, unknown>;

    if (mediaUrl && mediaType) {
      const typeMap: Record<string, string> = {
        image: "image",
        document: "document",
        audio: "audio",
        video: "video",
      };
      const waType = typeMap[mediaType] ?? "document";
      body = {
        messaging_product: "whatsapp",
        to,
        type: waType,
        [waType]: { link: mediaUrl, caption: content },
      };
    } else {
      body = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: content, preview_url: false },
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as any;

    if (!res.ok) {
      return {
        success: false,
        error: json?.error?.message ?? `HTTP ${res.status}`,
      };
    }

    return {
      success: true,
      externalId: json?.messages?.[0]?.id,
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Erro desconhecido" };
  }
}

// ─── Email SMTP ───────────────────────────────────────────────────────────────

async function sendEmailMessage(
  to: string,
  subject: string,
  content: string,
  settings: {
    emailHost: string;
    emailPort: number;
    emailUser: string;
    emailPassword: string;
    emailFromName: string;
  }
): Promise<SendResult> {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: settings.emailHost,
      port: settings.emailPort,
      // 465 = SSL implícito; 587 = STARTTLS. requireTLS força o upgrade na 587
      // em vez de depender do servidor anunciá-lo (Titan anuncia, mas isto é robusto).
      secure: settings.emailPort === 465,
      requireTLS: settings.emailPort !== 465,
      auth: { user: settings.emailUser, pass: settings.emailPassword },
      // Sem timeout, um host bloqueado deixava o envio pendurado. Falha rápido e claro.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    const info = await transporter.sendMail({
      from: `"${settings.emailFromName}" <${settings.emailUser}>`,
      to,
      subject,
      text: content,
      html: `<p>${content.replace(/\n/g, "<br>")}</p>`,
    });

    return { success: true, externalId: info.messageId };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Erro ao enviar e-mail" };
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegramMessage(
  chatId: string,
  content: string,
  botToken: string
): Promise<SendResult> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: content, parse_mode: "Markdown" }),
    });
    const json = (await res.json()) as any;
    if (!res.ok || !json.ok) {
      return { success: false, error: json?.description ?? `HTTP ${res.status}` };
    }
    return { success: true, externalId: String(json.result?.message_id) };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Erro ao enviar Telegram" };
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Envia uma mensagem pelo canal configurado para a conversa.
 * Busca automaticamente as configurações do canal e o telefone/e-mail do cliente.
 */
export async function sendMessageByConversation(params: SendMessageParams): Promise<SendResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "DB indisponível" };

  // Load conversation + customer
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.conversationId))
    .limit(1);

  if (!conv) return { success: false, error: "Conversa não encontrada" };

  const channel = conv.channel as string;

  // Load customer contact info
  let customerPhone: string | null = null;
  let customerEmail: string | null = null;
  let customerTelegramId: string | null = null;

  if (conv.customerId) {
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, conv.customerId))
      .limit(1);
    customerPhone = cust?.phone ?? null;
    customerEmail = cust?.email ?? null;
    customerTelegramId = (cust as any)?.telegramId ?? null;
  }

  // Load channel settings
  const [settings] = await db
    .select()
    .from(channelSettings)
    .where(eq(channelSettings.channel, channel as any))
    .limit(1);

  if (!settings?.isActive) {
    return { success: false, error: `Canal ${channel} não está ativo nas configurações` };
  }

  // Dispatch by channel
  if (channel === "whatsapp") {
    if (!customerPhone) return { success: false, error: "Cliente sem telefone cadastrado" };
    // Normalize phone: remove non-digits
    const phone = customerPhone.replace(/\D/g, "");
    // Evolution API provider
    if (settings.waProvider === "evolution") {
      if (!settings.evolutionApiUrl || !settings.evolutionApiKey || !settings.evolutionInstanceName) {
        return { success: false, error: "Evolution API não configurada (URL, API Key ou Instance Name ausente)" };
      }
      return sendEvolutionMessage(phone, params.content, settings.evolutionApiUrl, settings.evolutionApiKey, settings.evolutionInstanceName);
    }
    // Z-API provider
    if (settings.waProvider === "zapi") {
      if (!settings.zapiInstanceId || !settings.zapiToken) {
        return { success: false, error: "Z-API não configurado (Instance ID ou Token ausente)" };
      }
      return sendZapiMessage(phone, params.content, settings.zapiInstanceId, settings.zapiToken, settings.zapiClientToken ?? undefined);
    }
    // Meta Cloud API (default)
    if (!settings.waPhoneNumberId || !settings.waToken) {
      return { success: false, error: "WhatsApp não configurado (Phone Number ID ou Token ausente)" };
    }
    return sendWhatsAppMessage(
      phone,
      params.content,
      settings.waPhoneNumberId,
      settings.waToken,
      params.mediaUrl,
      params.mediaType
    );
  }

  if (channel === "email") {
    if (!customerEmail) return { success: false, error: "Cliente sem e-mail cadastrado" };
    if (!settings.emailHost || !settings.emailUser || !settings.emailPassword) {
      return { success: false, error: "E-mail não configurado (SMTP ausente)" };
    }
    return sendEmailMessage(customerEmail, conv.subject ?? "Mensagem agendada", params.content, {
      emailHost: settings.emailHost,
      emailPort: settings.emailPort ?? 465, // Titan: 465/SSL é o padrão mais confiável
      emailUser: settings.emailUser,
      emailPassword: settings.emailPassword!,
      emailFromName: settings.emailFromName ?? "Suporte",
    });
  }

  if (channel === "telegram") {
    if (!customerTelegramId) return { success: false, error: "Cliente sem Telegram ID cadastrado" };
    if (!settings.tgBotToken) {
      return { success: false, error: "Telegram não configurado (Bot Token ausente)" };
    }
    return sendTelegramMessage(customerTelegramId, params.content, settings.tgBotToken);
  }

  return { success: false, error: `Canal ${channel} sem integração de envio implementada` };
}

// ─── Evolution API WhatsApp ──────────────────────────────────────────────────
export async function sendEvolutionMessage(
  to: string,
  content: string,
  apiUrl: string,
  apiKey: string,
  instanceName: string
): Promise<SendResult> {
  try {
    // Evolution API v2 endpoint for sending text messages
    const url = `${apiUrl.replace(/\/$/, "")}/message/sendText/${instanceName}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number: to,
        text: content,
      }),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      return { success: false, error: json?.message ?? json?.error ?? `HTTP ${res.status}` };
    }
    return { success: true, externalId: json?.key?.id ?? json?.messageId };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Erro desconhecido" };
  }
}

// ─── Z-API WhatsApp ───────────────────────────────────────────────────────────
export async function sendZapiMessage(
  to: string,
  content: string,
  instanceId: string,
  token: string,
  clientToken?: string
): Promise<SendResult> {
  try {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientToken) headers["Client-Token"] = clientToken;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: to, message: content }),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      return { success: false, error: json?.value ?? json?.message ?? `HTTP ${res.status}` };
    }
    return { success: true, externalId: json?.zaapId ?? json?.messageId };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Erro desconhecido" };
  }
}

// ─── WhatsApp Template (HSM) Sender ──────────────────────────────────────────
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: Array<{ type: string; parameters: Array<{ type: string; text?: string }> }>,
  waPhoneNumberId: string,
  waToken: string
): Promise<SendResult> {
  try {
    const url = `https://graph.facebook.com/v19.0/${waPhoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      return { success: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { success: true, externalId: json?.messages?.[0]?.id };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Erro desconhecido" };
  }
}

// ─── Fetch Meta Templates ─────────────────────────────────────────────────────
export async function fetchMetaTemplates(
  waToken: string,
  businessAccountId: string
): Promise<{ name: string; status: string; language: string; components: unknown[] }[]> {
  try {
    const url = `https://graph.facebook.com/v19.0/${businessAccountId}/message_templates?limit=100&fields=name,status,language,components`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${waToken}` },
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    return json?.data ?? [];
  } catch {
    return [];
  }
}

// ─── Create Meta Template ─────────────────────────────────────────────────────
export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string }>;
}

export async function createMetaTemplate(
  waToken: string,
  businessAccountId: string,
  params: {
    name: string;
    category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
    language: string;
    components: MetaTemplateComponent[];
  }
): Promise<{ id: string; status: string }> {
  const url = `https://graph.facebook.com/v19.0/${businessAccountId}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${waToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return { id: json.id, status: json.status ?? "PENDING" };
}

// ─── Delete Meta Template ─────────────────────────────────────────────────────
export async function deleteMetaTemplate(
  waToken: string,
  businessAccountId: string,
  templateName: string
): Promise<boolean> {
  const url = `https://graph.facebook.com/v19.0/${businessAccountId}/message_templates?name=${encodeURIComponent(templateName)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${waToken}` },
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json?.success === true;
}
