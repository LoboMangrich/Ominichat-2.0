import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { conversations, messages, customers, channelHistory } from "../drizzle/schema";
import { eq, and, gte, lte, isNull, sql } from "drizzle-orm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";

// db is injected as a parameter to allow reuse across the app
type DB = MySql2Database<typeof schema>;

// ─── Daily Backup ─────────────────────────────────────────────────────────────

export async function runDailyConversationBackup(db: DB): Promise<{
  success: boolean;
  messagesBackedUp: number;
  storageKey: string | null;
  error?: string;
}> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all messages from yesterday
    const msgs = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        content: messages.content,
        senderType: messages.senderType,
        createdAt: messages.createdAt,
        channel: conversations.channel,
        whatsappNumber: conversations.whatsappNumber,
        customerId: conversations.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
      })
      .from(messages)
      .leftJoin(conversations, eq(messages.conversationId, conversations.id))
      .leftJoin(customers, eq(conversations.customerId, customers.id))
      .where(
        and(
          gte(messages.createdAt, yesterday),
          lte(messages.createdAt, today)
        )
      );

    if (msgs.length === 0) {
      return { success: true, messagesBackedUp: 0, storageKey: null };
    }

    const dateStr = yesterday.toISOString().split("T")[0];
    const backupData = {
      backupDate: dateStr,
      generatedAt: new Date().toISOString(),
      totalMessages: msgs.length,
      messages: msgs,
    };

    const jsonBuffer = Buffer.from(JSON.stringify(backupData, null, 2), "utf-8");
    const storageKey = `backups/conversations/${dateStr}.json`;

    const { key } = await storagePut(storageKey, jsonBuffer, "application/json");

    return { success: true, messagesBackedUp: msgs.length, storageKey: key };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await notifyOwner({
      title: "⚠️ Falha no Backup de Conversas",
      content: `O backup automático de conversas falhou: ${error}. Verifique o sistema imediatamente.`,
    });
    return { success: false, messagesBackedUp: 0, storageKey: null, error };
  }
}

// ─── Archive Conversations by Channel Number ──────────────────────────────────

export async function archiveConversationsByNumber(
  db: DB,
  whatsappNumber: string,
  reason: string = "Número desconectado"
): Promise<{ archivedCount: number }> {
  const now = new Date();

  const result = await db
    .update(conversations)
    .set({
      archivedAt: now,
      archivedReason: reason,
    })
    .where(
      and(
        eq(conversations.whatsappNumber, whatsappNumber),
        isNull(conversations.archivedAt)
      )
    );

  const archivedCount = (result as unknown as { affectedRows: number }).affectedRows ?? 0;
  return { archivedCount };
}

// ─── Channel History Management ───────────────────────────────────────────────

export async function recordChannelConnection(
  db: DB,
  customerId: number,
  channel: "whatsapp" | "email" | "instagram" | "telegram" | "chat",
  identifier: string
): Promise<void> {
  // Check if already exists and active
  const existing = await db
    .select()
    .from(channelHistory)
    .where(
      and(
        eq(channelHistory.customerId, customerId),
        eq(channelHistory.channel, channel),
        eq(channelHistory.identifier, identifier),
        isNull(channelHistory.disconnectedAt)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(channelHistory).values({
      customerId,
      channel,
      identifier,
      connectedAt: new Date(),
    });
  }
}

export async function recordChannelDisconnection(
  db: DB,
  identifier: string,
  reason: string
): Promise<void> {
  await db
    .update(channelHistory)
    .set({
      disconnectedAt: new Date(),
      disconnectReason: reason,
    })
    .where(
      and(
        eq(channelHistory.identifier, identifier),
        isNull(channelHistory.disconnectedAt)
      )
    );
}

export async function getCustomerChannelHistory(db: DB, customerId: number) {
  return db
    .select()
    .from(channelHistory)
    .where(eq(channelHistory.customerId, customerId))
    .orderBy(sql`${channelHistory.connectedAt} DESC`);
}

// ─── WhatsApp Status Check ────────────────────────────────────────────────────

export async function checkWhatsAppStatus(db: DB): Promise<{
  isConnected: boolean;
  lastChecked: Date;
}> {
  // This will be called by the scheduled job
  // It checks the channelSettings table for WhatsApp configuration
  try {
    const result = await db.execute(
      sql`SELECT isActive, webhookUrl FROM channelSettings WHERE channel = 'whatsapp' LIMIT 1`
    );
    const rows = (result as unknown as Array<Array<{ isActive: number; webhookUrl: string | null }>>)[0];
    const setting = rows[0];

    if (!setting || !setting.isActive) {
      return { isConnected: false, lastChecked: new Date() };
    }

    return { isConnected: true, lastChecked: new Date() };
  } catch {
    return { isConnected: false, lastChecked: new Date() };
  }
}
