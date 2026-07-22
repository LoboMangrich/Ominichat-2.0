import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { conversations, messages, customers, channelSettings } from "../drizzle/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import QRCode from "qrcode";

type DB = MySql2Database<typeof schema>;

// ─── QR Code Generation ───────────────────────────────────────────────────────

/**
 * Generates a simulated WhatsApp QR Code for reconnection.
 * In production, this would call the Evolution API / Z-API to get a real QR code.
 * Returns a base64 PNG data URL.
 */
export async function generateWhatsAppQRCode(): Promise<string> {
  // Simulated QR code payload — in production this comes from Evolution API
  const simulatedPayload = `whatsapp://reconnect/${Date.now()}/cs-platform`;
  const dataUrl = await QRCode.toDataURL(simulatedPayload, {
    width: 256,
    margin: 2,
    color: { dark: "#128C7E", light: "#FFFFFF" },
  });
  return dataUrl;
}

/**
 * Simulates a successful WhatsApp connection (sets isActive=true in channelSettings).
 * In production, this is triggered by the Evolution API webhook after QR scan.
 */
export async function simulateWhatsAppConnect(db: DB): Promise<void> {
  const existing = await db
    .select({ id: channelSettings.id })
    .from(channelSettings)
    .where(eq(channelSettings.channel, "whatsapp"))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(channelSettings)
      .set({ isActive: true })
      .where(eq(channelSettings.channel, "whatsapp"));
  } else {
    await db.insert(channelSettings).values({
      channel: "whatsapp",
      isActive: true,
    });
  }
}

/**
 * Simulates a WhatsApp disconnection (sets isActive=false).
 */
export async function simulateWhatsAppDisconnect(db: DB): Promise<void> {
  await db
    .update(channelSettings)
    .set({ isActive: false })
    .where(eq(channelSettings.channel, "whatsapp"));
}

// ─── Channel Health Status ────────────────────────────────────────────────────

const CHANNEL_LIST = ["whatsapp", "email", "instagram", "telegram", "chat"] as const;

export async function getChannelHealthStatus(db: DB) {
  const settings = await db.select().from(channelSettings);
  const settingsMap: Record<string, typeof settings[0]> = {};
  for (const s of settings) settingsMap[s.channel] = s;

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    CHANNEL_LIST.map(async (channel) => {
      const setting = settingsMap[channel];
      const isActive = setting?.isActive ?? false;

      // Last message received on this channel
      const [lastConv] = await db
        .select({ updatedAt: conversations.updatedAt })
        .from(conversations)
        .where(eq(conversations.channel, channel as any))
        .orderBy(desc(conversations.updatedAt))
        .limit(1);

      // Message count in last 24h (via conversations updated in that window)
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.channel, channel as any),
            gte(messages.createdAt, since24h)
          )
        );

      // Message count in last 7 days for uptime calculation
      const [count7dResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.channel, channel as any),
            gte(messages.createdAt, since7d)
          )
        );

      const lastMessageAt = lastConv?.updatedAt ?? null;
      const messageCount24h = Number(countResult?.count ?? 0);
      const messageCount7d = Number(count7dResult?.count ?? 0);

      // Simple uptime heuristic: if active and has messages in last 7d, uptime is high
      let uptimePercent = 0;
      if (isActive) {
        if (messageCount7d > 0) uptimePercent = 95;
        else uptimePercent = 80; // active but no messages yet
      }

      // Alert: channel is active but no message in 24h
      const hasInactivityAlert =
        isActive &&
        lastMessageAt !== null &&
        new Date(lastMessageAt).getTime() < since24h.getTime();

      // Alert: channel is inactive
      const isInactiveAlert = !isActive;

      return {
        channel,
        isActive,
        lastMessageAt,
        messageCount24h,
        messageCount7d,
        uptimePercent,
        hasInactivityAlert,
        isInactiveAlert,
        alertLevel: isInactiveAlert
          ? "red"
          : hasInactivityAlert
          ? "amber"
          : "green",
      };
    })
  );

  return results;
}

// ─── Customer Conversation Export ────────────────────────────────────────────

export async function exportCustomerConversationsCSV(
  db: DB,
  customerId: number
): Promise<string> {
  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer.length) throw new Error("Cliente não encontrado");

  const convList = await db
    .select()
    .from(conversations)
    .where(eq(conversations.customerId, customerId))
    .orderBy(desc(conversations.createdAt));

  if (!convList.length) return "data,canal,conversa_id,remetente,tipo,conteudo\n";

  const rows: string[] = [
    "data,canal,conversa_id,remetente,tipo,conteudo",
  ];

  for (const conv of convList) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt);

    for (const msg of msgs) {
      const date = new Date(msg.createdAt).toLocaleString("pt-BR");
      const channel = conv.channel;
      const convId = conv.id;
      const sender =
        msg.senderType === "customer"
          ? customer[0].name
          : msg.senderType === "ai"
          ? "IA"
          : msg.senderType === "system"
          ? "Sistema"
          : "Agente";
      const type = msg.senderType;
      // Escape CSV: wrap in quotes, escape internal quotes
      const content = `"${(msg.content ?? "").replace(/"/g, '""')}"`;
      rows.push(`${date},${channel},${convId},${sender},${type},${content}`);
    }
  }

  return rows.join("\n");
}

export async function exportCustomerConversationsPDF(
  db: DB,
  customerId: number
): Promise<Buffer> {
  const customerList = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customerList.length) throw new Error("Cliente não encontrado");
  const customer = customerList[0];

  const convList = await db
    .select()
    .from(conversations)
    .where(eq(conversations.customerId, customerId))
    .orderBy(desc(conversations.createdAt));

  // Build HTML content for PDF
  const convSections: string[] = [];
  for (const conv of convList) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt);

    const msgRows = msgs
      .map((msg) => {
        const time = new Date(msg.createdAt).toLocaleString("pt-BR");
        const sender =
          msg.senderType === "customer"
            ? customer.name
            : msg.senderType === "ai"
            ? "IA"
            : msg.senderType === "system"
            ? "Sistema"
            : "Agente";
        const bgColor =
          msg.senderType === "customer"
            ? "#e8f5e9"
            : msg.senderType === "ai"
            ? "#f3e5f5"
            : msg.senderType === "system"
            ? "#fff9c4"
            : "#e3f2fd";
        return `<tr style="background:${bgColor}">
          <td style="padding:4px 8px;font-size:11px;color:#666;white-space:nowrap">${time}</td>
          <td style="padding:4px 8px;font-size:11px;font-weight:bold;white-space:nowrap">${sender}</td>
          <td style="padding:4px 8px;font-size:12px">${(msg.content ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
        </tr>`;
      })
      .join("");

    const convDate = new Date(conv.createdAt).toLocaleDateString("pt-BR");
    convSections.push(`
      <div style="margin-bottom:24px;border:1px solid #ddd;border-radius:8px;overflow:hidden">
        <div style="background:#128C7E;color:white;padding:8px 12px;font-size:13px;font-weight:bold">
          Conversa #${conv.id} — ${conv.channel.toUpperCase()} — ${convDate}
          <span style="float:right;font-weight:normal;font-size:11px">${conv.status}</span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:4px 8px;font-size:11px;text-align:left;width:150px">Data/Hora</th>
              <th style="padding:4px 8px;font-size:11px;text-align:left;width:100px">Remetente</th>
              <th style="padding:4px 8px;font-size:11px;text-align:left">Mensagem</th>
            </tr>
          </thead>
          <tbody>${msgRows || '<tr><td colspan="3" style="padding:8px;color:#999;text-align:center;font-size:11px">Sem mensagens</td></tr>'}</tbody>
        </table>
      </div>
    `);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Histórico de Conversas — ${customer.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #333; }
    h1 { color: #128C7E; font-size: 20px; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
    .meta span { margin-right: 16px; }
  </style>
</head>
<body>
  <h1>Histórico de Conversas</h1>
  <div class="meta">
    <span><strong>Cliente:</strong> ${customer.name}</span>
    <span><strong>Email:</strong> ${customer.email ?? "—"}</span>
    <span><strong>Programa:</strong> ${customer.program ?? "—"}</span>
    <span><strong>Gerado em:</strong> ${new Date().toLocaleString("pt-BR")}</span>
  </div>
  <p style="font-size:12px;color:#666;margin-bottom:16px">${convList.length} conversa(s) encontrada(s)</p>
  ${convSections.join("") || '<p style="color:#999">Nenhuma conversa encontrada para este cliente.</p>'}
</body>
</html>`;

  // Use puppeteer-like approach via html-to-pdf — we'll use the weasyprint CLI
  const { execSync } = await import("child_process");
  const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const tmpHtml = join(tmpdir(), `export-${customerId}-${Date.now()}.html`);
  const tmpPdf = join(tmpdir(), `export-${customerId}-${Date.now()}.pdf`);

  try {
    writeFileSync(tmpHtml, html, "utf-8");
    execSync(`weasyprint "${tmpHtml}" "${tmpPdf}"`, { timeout: 30000 });
    const pdfBuffer = readFileSync(tmpPdf);
    return pdfBuffer;
  } finally {
    try { unlinkSync(tmpHtml); } catch {}
    try { unlinkSync(tmpPdf); } catch {}
  }
}
