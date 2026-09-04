import {
  int,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["Admin", "Manager", "Agent"]).default("Agent").notNull(),
  avatarUrl: text("avatarUrl"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  ghlContactId: varchar("ghlContactId", { length: 128 }),
  // Digital Manager Guru fields
  guruContactId: varchar("guruContactId", { length: 191 }),
  guruTransactionId: varchar("guruTransactionId", { length: 191 }),
  guruProductId: varchar("guruProductId", { length: 191 }),
  guruProductName: varchar("guruProductName", { length: 255 }),
  guruPurchaseValue: float("guruPurchaseValue"),
  guruPurchaseStatus: varchar("guruPurchaseStatus", { length: 64 }),
  guruSyncedAt: timestamp("guruSyncedAt"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  program: varchar("program", { length: 128 }),
  status: mysqlEnum("status", ["Active", "At Risk", "Churned", "New"]).default("New").notNull(),
  tags: json("tags").$type<string[]>(),
  assignedAgentId: int("assignedAgentId"),
  ghlSyncedAt: timestamp("ghlSyncedAt"),
  lastInteractionAt: timestamp("lastInteractionAt"),
  notes: text("notes"),
  company: varchar("company", { length: 255 }),
  address: text("address"),
  customFields: json("customFields").$type<Record<string, string>>(),
  npsScore: float("npsScore"),
  csatScore: float("csatScore"),
  lifetimeValue: float("lifetimeValue").default(0),
  mrr: float("mrr").default(0),
  renewalDate: timestamp("renewalDate"),
  healthScore: float("healthScore"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_customers_phone").on(table.phone),
  index("idx_customers_email").on(table.email),
  index("idx_customers_status").on(table.status),
]);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// ─── Conversations ────────────────────────────────────────────────────────────
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId"),
  assignedAgentId: int("assignedAgentId"),
  channel: mysqlEnum("channel", ["whatsapp", "email", "instagram", "telegram", "chat"]).default("whatsapp").notNull(),
  handledByAi: boolean("handledByAi").default(false).notNull(),
  aiAgentId: int("aiAgentId"),
  // SLA / timing
  firstResponseTimeSeconds: int("firstResponseTimeSeconds"),
  handleTimeSeconds: int("handleTimeSeconds"),
  slaBreached: boolean("slaBreached").default(false),
  status: mysqlEnum("status", ["Open", "Waiting", "Closed"]).default("Open").notNull(),
  subject: varchar("subject", { length: 255 }),
  tags: json("tags").$type<string[]>(),
  // AI Analysis fields
  qualityScore: float("qualityScore"),
  sentimentScore: float("sentimentScore"),
  upsellOpportunity: float("upsellOpportunity"),
  referralReadiness: float("referralReadiness"),
  // Quality breakdown dimensions (AI-scored)
  empathyScore: float("empathyScore"),
  clarityScore: float("clarityScore"),
  resolutionScore: float("resolutionScore"),
  complianceScore: float("complianceScore"),
  aiSummary: text("aiSummary"),
  aiRecommendations: text("aiRecommendations"),
  aiAnalyzedAt: timestamp("aiAnalyzedAt"),
  // Handoff
  handoffMode: mysqlEnum("handoffMode", ["ai", "human"]).default("ai").notNull(),
  assignedUserId: int("assignedUserId"),
  handoffAt: timestamp("handoffAt"),
  handoffNote: text("handoffNote"),
  // Archive / channel tracking
  whatsappNumber: varchar("whatsappNumber", { length: 30 }),
  archivedAt: timestamp("archivedAt"),
  archivedReason: varchar("archivedReason", { length: 255 }),
  // Timing
  firstResponseAt: timestamp("firstResponseAt"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_conversations_status_updated").on(table.status, table.updatedAt),
  index("idx_conversations_customer").on(table.customerId),
]);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId"),
  senderType: mysqlEnum("senderType", ["agent", "customer", "system", "ai"]).notNull(),
  content: text("content").notNull(),
  mediaUrl: text("mediaUrl"),
  mediaType: varchar("mediaType", { length: 64 }),
  isInternal: boolean("isInternal").default(false).notNull(), // internal notes
  whatsappMessageId: varchar("whatsappMessageId", { length: 128 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_messages_conversation_created").on(table.conversationId, table.createdAt),
]);

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── Conversation Labels ──────────────────────────────────────────────────────
export const conversationLabels = mysqlTable("conversationLabels", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  label: varchar("label", { length: 64 }).notNull(),
  color: varchar("color", { length: 32 }).default("#6366f1"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Surveys ──────────────────────────────────────────────────────────────────
export const surveys = mysqlTable("surveys", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  conversationId: int("conversationId"),
  type: mysqlEnum("type", ["NPS", "CSAT"]).notNull(),
  score: int("score"),
  feedback: text("feedback"),
  classification: mysqlEnum("classification", ["Promoter", "Passive", "Detractor"]),
  status: mysqlEnum("status", ["Pending", "Sent", "Completed", "Expired"]).default("Pending").notNull(),
  sentAt: timestamp("sentAt"),
  completedAt: timestamp("completedAt"),
  followUpSent: boolean("followUpSent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Survey = typeof surveys.$inferSelect;
export type InsertSurvey = typeof surveys.$inferInsert;

// ─── Referrals ────────────────────────────────────────────────────────────────
export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  referrerId: int("referrerId").notNull(), // customer who referred
  type: mysqlEnum("type", ["Referral", "Upsell"]).default("Referral").notNull(),
  referredName: varchar("referredName", { length: 255 }),
  referredEmail: varchar("referredEmail", { length: 320 }),
  referredPhone: varchar("referredPhone", { length: 64 }),
  program: varchar("program", { length: 128 }),
  status: mysqlEnum("status", ["Pending", "Contacted", "Converted", "Lost"]).default("Pending").notNull(),
  agentId: int("agentId"),
  ghlLeadId: varchar("ghlLeadId", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

// ─── Agent Metrics (daily snapshots) ─────────────────────────────────────────
export const agentMetrics = mysqlTable("agentMetrics", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  // KPIs
  firstResponseTimeAvg: float("firstResponseTimeAvg"), // seconds
  avgResolutionTime: float("avgResolutionTime"), // seconds
  csatScore: float("csatScore"), // 0-5
  qualityScore: float("qualityScore"), // 0-100
  conversationsCount: int("conversationsCount").default(0),
  conversationsClosed: int("conversationsClosed").default(0),
  referralsGenerated: int("referralsGenerated").default(0),
  upsellsGenerated: int("upsellsGenerated").default(0),
  npsAvg: float("npsAvg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentMetric = typeof agentMetrics.$inferSelect;
export type InsertAgentMetric = typeof agentMetrics.$inferInsert;

// ─── GHL Integration Settings ─────────────────────────────────────────────────
export const ghlSettings = mysqlTable("ghlSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  locationId: varchar("locationId", { length: 128 }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  isConnected: boolean("isConnected").default(false).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  webhookSecret: varchar("webhookSecret", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GhlSettings = typeof ghlSettings.$inferSelect;

// ─── Upsell Opportunities ─────────────────────────────────────────────────────
export const upsellOpportunities = mysqlTable("upsellOpportunities", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  conversationId: int("conversationId"),
  agentId: int("agentId"),
  program: varchar("program", { length: 128 }),
  status: mysqlEnum("status", ["Identified", "Presented", "Accepted", "Declined"]).default("Identified").notNull(),
  score: float("score"), // AI confidence 0-100
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UpsellOpportunity = typeof upsellOpportunities.$inferSelect;

// ─── Digital Manager Guru Settings ───────────────────────────────────────────
export const guruSettings = mysqlTable("guruSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  apiToken: varchar("apiToken", { length: 128 }),
  webhookSecret: varchar("webhookSecret", { length: 128 }),
  isActive: boolean("isActive").default(false).notNull(),
  lastEventAt: timestamp("lastEventAt"),
  totalCustomersImported: int("totalCustomersImported").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GuruSettings = typeof guruSettings.$inferSelect;

// ─── Digital Manager Guru Webhook Events Log ──────────────────────────────────
export const guruWebhookEvents = mysqlTable("guruWebhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: varchar("transactionId", { length: 191 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactName: varchar("contactName", { length: 255 }),
  productName: varchar("productName", { length: 255 }),
  status: varchar("status", { length: 64 }),
  value: float("value"),
  rawPayload: json("rawPayload"),
  processedAt: timestamp("processedAt"),
  customerId: int("customerId"), // linked customer if created/updated
  action: varchar("action", { length: 64 }), // 'created', 'updated', 'ignored'
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GuruWebhookEvent = typeof guruWebhookEvents.$inferSelect;

// ─── AI Agents ────────────────────────────────────────────────────────────────
export const aiAgents = mysqlTable("aiAgents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  channel: mysqlEnum("channel", ["whatsapp", "email", "instagram", "telegram", "all"]).default("all").notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  systemPrompt: text("systemPrompt"),
  escalationThreshold: int("escalationThreshold").default(70), // confidence % below which to escalate
  greetingMessage: text("greetingMessage"),
  escalationMessage: text("escalationMessage"),
  maxAutoReplies: int("maxAutoReplies").default(5), // max consecutive AI replies before escalation
  avatarUrl: text("avatarUrl"), // URL da foto/avatar do agente de IA
  programFilter: varchar("programFilter", { length: 255 }), // filtro por produto/programa (ex: "Premium", "all")
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiAgent = typeof aiAgents.$inferSelect;
export type InsertAiAgent = typeof aiAgents.$inferInsert;

// ─── Knowledge Base ───────────────────────────────────────────────────────────
export const knowledgeBase = mysqlTable("knowledgeBase", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeBaseEntry = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeBaseEntry = typeof knowledgeBase.$inferInsert;

// ─── Channel Settings ─────────────────────────────────────────────────────────
export const channelSettings = mysqlTable("channelSettings", {
  id: int("id").autoincrement().primaryKey(),
  channel: mysqlEnum("channel", ["whatsapp", "email", "instagram", "telegram"]).notNull().unique(),
  isActive: boolean("isActive").default(false).notNull(),
  // WhatsApp (Meta Cloud API)
  waPhoneNumberId: varchar("waPhoneNumberId", { length: 128 }),
  waToken: text("waToken"),
  waVerifyToken: varchar("waVerifyToken", { length: 128 }),
  waBusinessAccountId: varchar("waBusinessAccountId", { length: 128 }),
  // WhatsApp (Z-API / Evolution API)
  waProvider: mysqlEnum("waProvider", ["meta", "zapi", "evolution"]).default("meta"),
  zapiInstanceId: varchar("zapiInstanceId", { length: 128 }),
  zapiToken: text("zapiToken"),
  zapiClientToken: text("zapiClientToken"),
  zapiWebhookToken: varchar("zapiWebhookToken", { length: 128 }),
  // Evolution API
  evolutionApiUrl: varchar("evolutionApiUrl", { length: 512 }),
  evolutionApiKey: text("evolutionApiKey"),
  evolutionInstanceName: varchar("evolutionInstanceName", { length: 128 }),
  // Email — SMTP (envio)
  emailHost: varchar("emailHost", { length: 255 }),
  emailPort: int("emailPort"),
  emailUser: varchar("emailUser", { length: 320 }),
  emailPassword: text("emailPassword"),
  emailFromName: varchar("emailFromName", { length: 128 }),
  // Email — IMAP (recebimento). Para Titan: imap.titan.email:993. Usuário/senha
  // são os mesmos da conta SMTP, então reaproveitamos emailUser/emailPassword.
  emailImapHost: varchar("emailImapHost", { length: 255 }),
  emailImapPort: int("emailImapPort"),
  // Instagram
  igPageId: varchar("igPageId", { length: 128 }),
  igAccessToken: text("igAccessToken"),
  // Telegram
  tgBotToken: text("tgBotToken"),
  tgWebhookSecret: varchar("tgWebhookSecret", { length: 128 }),
  // SLA config
  slaFirstResponseMinutes: int("slaFirstResponseMinutes").default(60),
  slaResolutionHours: int("slaResolutionHours").default(24),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChannelSetting = typeof channelSettings.$inferSelect;
export type InsertChannelSetting = typeof channelSettings.$inferInsert;

// ─── AI Agent Activity Logs ───────────────────────────────────────────────────
export const aiAgentLogs = mysqlTable("aiAgentLogs", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  conversationId: int("conversationId"),
  event: mysqlEnum("event", ["auto_reply", "escalated", "greeted", "resolved"]).notNull(),
  channel: varchar("channel", { length: 32 }),
  customerName: varchar("customerName", { length: 255 }),
  responseTimeMs: int("responseTimeMs"),
  qualityScore: int("qualityScore"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AiAgentLog = typeof aiAgentLogs.$inferSelect;
export type InsertAiAgentLog = typeof aiAgentLogs.$inferInsert;

// ─── Scheduled Messages ───────────────────────────────────────────────────────
export const scheduledMessages = mysqlTable("scheduledMessages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  customerId: int("customerId"),
  content: text("content").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "cancelled", "failed"]).default("pending").notNull(),
  createdBy: int("createdBy").notNull(),
  sentAt: timestamp("sentAt"),
  lastError: text("lastError"),
  retryCount: int("retryCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = typeof scheduledMessages.$inferInsert;

// ─── Quick Replies ────────────────────────────────────────────────────────────
export const quickReplies = mysqlTable("quickReplies", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 128 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 32 }),
  isGlobal: boolean("isGlobal").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QuickReply = typeof quickReplies.$inferSelect;
export type InsertQuickReply = typeof quickReplies.$inferInsert;

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId"),
  conversationId: int("conversationId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["todo", "in_progress", "done", "cancelled"]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  assignedTo: int("assignedTo"),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  createdBy: int("createdBy").notNull(),
  // ClickUp-equivalent fields
  team: mysqlEnum("team", ["IPL", "MCM", "RCC", "Geral"]).default("Geral"),
  category: mysqlEnum("category", ["cliente", "contrato", "onboarding", "reuniao", "passagem", "midia", "contratacao", "outro"]).default("outro"),
  googleCalendarEventId: varchar("googleCalendarEventId", { length: 255 }),
  meetingLink: varchar("meetingLink", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Task Attachments (Prints de Contrato/Reunião/Grupos) ─────────────────────
export const taskAttachments = mysqlTable("taskAttachments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: text("fileKey").notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 128 }),
  attachmentType: mysqlEnum("attachmentType", ["contrato", "reuniao", "grupo", "outro"]).default("outro"),
  uploadedByUserId: int("uploadedByUserId"),
  uploadedByName: varchar("uploadedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type InsertTaskAttachment = typeof taskAttachments.$inferInsert;

// ─── Client ROI / Retorno (Lucro, Meta, Progresso) ───────────────────────────
export const clientROI = mysqlTable("clientROI", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  description: varchar("description", { length: 255 }).notNull(), // ex: "Venda de passagem - Rota SP-RJ"
  saleValue: float("saleValue").default(0), // valor da venda/investimento
  profitValue: float("profitValue").default(0), // lucro/retorno gerado
  category: mysqlEnum("category", ["passagem", "midia", "contrato", "upsell", "outro"]).default("outro"),
  saleDate: timestamp("saleDate").defaultNow().notNull(),
  notes: text("notes"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientROI = typeof clientROI.$inferSelect;
export type InsertClientROI = typeof clientROI.$inferInsert;

// ─── Client Goals (Metas por Cliente) ────────────────────────────────────────
export const clientGoals = mysqlTable("clientGoals", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(), // ex: "Meta anual de retorno"
  targetValue: float("targetValue").notNull(), // valor alvo
  currentValue: float("currentValue").default(0), // progresso atual
  unit: varchar("unit", { length: 64 }).default("R$"), // R$, %, viagens, etc.
  deadline: timestamp("deadline"),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientGoal = typeof clientGoals.$inferSelect;
export type InsertClientGoal = typeof clientGoals.$inferInsert;

// ─── Form Templates (Formulários que criam tarefas) ───────────────────────────
export const formTemplates = mysqlTable("formTemplates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  fields: json("fields").$type<Array<{
    id: string;
    label: string;
    type: "text" | "textarea" | "date" | "select" | "number" | "phone" | "email";
    required: boolean;
    options?: string[];
    placeholder?: string;
  }>>().notNull(),
  // When submitted, create a task with these defaults
  taskTitle: varchar("taskTitle", { length: 255 }), // can use {{field_id}} placeholders
  taskCategory: mysqlEnum("taskCategory", ["cliente", "contrato", "onboarding", "reuniao", "passagem", "midia", "contratacao", "outro"]).default("outro"),
  taskTeam: mysqlEnum("taskTeam", ["IPL", "MCM", "RCC", "Geral"]).default("Geral"),
  taskPriority: mysqlEnum("taskPriority", ["low", "medium", "high", "urgent"]).default("medium"),
  assignToUserId: int("assignToUserId"),
  isActive: boolean("isActive").default(true).notNull(),
  publicSlug: varchar("publicSlug", { length: 128 }).unique(), // for public form URL
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FormTemplate = typeof formTemplates.$inferSelect;
export type InsertFormTemplate = typeof formTemplates.$inferInsert;

// ─── Form Submissions (Respostas de Formulários) ──────────────────────────────
export const formSubmissions = mysqlTable("formSubmissions", {
  id: int("id").autoincrement().primaryKey(),
  formId: int("formId").notNull(),
  submitterName: varchar("submitterName", { length: 255 }),
  submitterEmail: varchar("submitterEmail", { length: 320 }),
  data: json("data").$type<Record<string, string>>().notNull(), // field_id -> value
  createdTaskId: int("createdTaskId"), // task created from this submission
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
});
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type InsertFormSubmission = typeof formSubmissions.$inferInsert;

// ─── Internal Messages (Team Chat) ───────────────────────────────────────────
export const internalMessages = mysqlTable("internalMessages", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull(),
  receiverId: int("receiverId"),
  roomId: varchar("roomId", { length: 64 }), // for group chats
  content: text("content").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InternalMessage = typeof internalMessages.$inferSelect;
export type InsertInternalMessage = typeof internalMessages.$inferInsert;

// ─── Broadcasts (Mass Messages) ──────────────────────────────────────────────
export const broadcasts = mysqlTable("broadcasts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  channel: mysqlEnum("channel", ["whatsapp", "email", "instagram", "telegram"]).default("whatsapp").notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "failed"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  totalRecipients: int("totalRecipients").default(0),
  sentCount: int("sentCount").default(0),
  failedCount: int("failedCount").default(0),
  filterProgram: varchar("filterProgram", { length: 128 }),
  filterStatus: varchar("filterStatus", { length: 64 }),
  filterTag: varchar("filterTag", { length: 64 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Broadcast = typeof broadcasts.$inferSelect;
export type InsertBroadcast = typeof broadcasts.$inferInsert;

// ─── Alerts (Chargeback, Reclame Aqui, etc.) ─────────────────────────────────
export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["chargeback", "reclame_aqui", "refund", "dispute", "system"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  customerId: int("customerId"),
  customerName: varchar("customerName", { length: 255 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  externalId: varchar("externalId", { length: 128 }),
  amount: float("amount"),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "dismissed"]).default("open").notNull(),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  rawPayload: json("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

// ─── SLA Settings (per channel) ──────────────────────────────────────────────
export const slaSettings = mysqlTable("slaSettings", {
  id: int("id").autoincrement().primaryKey(),
  channel: mysqlEnum("channel", ["whatsapp", "email", "instagram", "telegram", "all"]).notNull().unique(),
  windowMinutes: int("windowMinutes").default(60).notNull(),
  warningMinutes: int("warningMinutes").default(45).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SlaSettings = typeof slaSettings.$inferSelect;
export type InsertSlaSettings = typeof slaSettings.$inferInsert;

// ─── Weekly Reports ───────────────────────────────────────────────────────────
export const weeklyReports = mysqlTable("weeklyReports", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: timestamp("weekStart").notNull(),
  weekEnd: timestamp("weekEnd").notNull(),
  totalConversations: int("totalConversations").default(0).notNull(),
  closedConversations: int("closedConversations").default(0).notNull(),
  avgResponseMinutes: float("avgResponseMinutes"),
  slaCompliancePct: float("slaCompliancePct"),
  avgCsat: float("avgCsat"),
  newCustomers: int("newCustomers").default(0).notNull(),
  totalAlerts: int("totalAlerts").default(0).notNull(),
  resolvedAlerts: int("resolvedAlerts").default(0).notNull(),
  topAgents: json("topAgents").$type<Array<{ agentId: number; name: string; closed: number; avgResponseMinutes: number }>>(),
  channelBreakdown: json("channelBreakdown").$type<Record<string, number>>(),
  emailSentAt: timestamp("emailSentAt"),
  generatedBy: varchar("generatedBy", { length: 64 }).default("system").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WeeklyReport = typeof weeklyReports.$inferSelect;
export type InsertWeeklyReport = typeof weeklyReports.$inferInsert;

// ─── Satisfaction Settings ────────────────────────────────────────────────────
export const satisfactionSettings = mysqlTable("satisfactionSettings", {
  id: int("id").autoincrement().primaryKey(),
  isActive: boolean("isActive").default(false).notNull(),
  message: text("message").default("Como você avalia nosso atendimento? Responda: 👍 Ótimo, 😐 Regular ou 👎 Ruim").notNull(),
  delayMinutes: int("delayMinutes").default(0).notNull(),
  channels: json("channels").$type<string[]>().default(["whatsapp", "telegram"]),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SatisfactionSettings = typeof satisfactionSettings.$inferSelect;
export type InsertSatisfactionSettings = typeof satisfactionSettings.$inferInsert;

// ─── Satisfaction Ratings ─────────────────────────────────────────────────────
export const satisfactionRatings = mysqlTable("satisfactionRatings", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  customerId: int("customerId"),
  rating: mysqlEnum("rating", ["great", "ok", "bad"]).notNull(),
  ratingLabel: varchar("ratingLabel", { length: 16 }).notNull(), // "👍 Ótimo", etc.
  channel: varchar("channel", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SatisfactionRating = typeof satisfactionRatings.$inferSelect;
export type InsertSatisfactionRating = typeof satisfactionRatings.$inferInsert;

// ─── WhatsApp Groups Monitoring ───────────────────────────────────────────────
export const whatsappGroups = mysqlTable("whatsappGroups", {
  id: int("id").autoincrement().primaryKey(),
  groupId: varchar("groupId", { length: 128 }).notNull().unique(), // ID do grupo na Meta/Z-API
  groupName: varchar("groupName", { length: 256 }).notNull(),
  description: text("description"),
  participantCount: int("participantCount").default(0),
  isMonitored: boolean("isMonitored").default(true).notNull(),
  lastCustomerMessageAt: timestamp("lastCustomerMessageAt"),
  lastAgentMessageAt: timestamp("lastAgentMessageAt"),
  alertSilenceHours: int("alertSilenceHours").default(48), // horas sem resposta para alertar
  linkedCustomerId: int("linkedCustomerId"), // cliente associado ao grupo
  groupType: mysqlEnum("groupType", ["vip", "community", "support"]).default("community"), // vip=pequeno/individual, community=grande/broadcast
  aiAutoReply: boolean("aiAutoReply").default(false).notNull(), // IA responde automaticamente (só para grupos VIP)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappGroup = typeof whatsappGroups.$inferSelect;
export type InsertWhatsappGroup = typeof whatsappGroups.$inferInsert;

export const groupMessages = mysqlTable("groupMessages", {
  id: int("id").autoincrement().primaryKey(),
  groupId: varchar("groupId", { length: 128 }).notNull(), // ref to whatsappGroups.groupId
  externalMessageId: varchar("externalMessageId", { length: 128 }),
  senderId: varchar("senderId", { length: 128 }).notNull(),
  senderName: varchar("senderName", { length: 256 }),
  senderType: mysqlEnum("senderType", ["customer", "agent", "unknown"]).default("unknown").notNull(),
  content: text("content").notNull(),
  messageType: varchar("messageType", { length: 32 }).default("text"), // text, image, audio, etc.
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]),
  hasUnansweredRequest: boolean("hasUnansweredRequest").default(false),
  analyzed: boolean("analyzed").default(false).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GroupMessage = typeof groupMessages.$inferSelect;
export type InsertGroupMessage = typeof groupMessages.$inferInsert;

export const groupAlerts = mysqlTable("groupAlerts", {
  id: int("id").autoincrement().primaryKey(),
  groupId: varchar("groupId", { length: 128 }).notNull(),
  groupName: varchar("groupName", { length: 256 }),
  type: mysqlEnum("type", ["silence", "unanswered_request", "negative_sentiment", "high_activity"]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  message: text("message").notNull(),
  aiSummary: text("aiSummary"), // resumo gerado pela IA
  isResolved: boolean("isResolved").default(false).notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GroupAlert = typeof groupAlerts.$inferSelect;
export type InsertGroupAlert = typeof groupAlerts.$inferInsert;

// ─── AI Supervision Queue ─────────────────────────────────────────────────────
export const aiSupervisionQueue = mysqlTable("aiSupervisionQueue", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId"),
  customerId: int("customerId"),
  conversationId: int("conversationId"),
  actionType: mysqlEnum("actionType", [
    "welcome_message",
    "proactive_outreach",
    "nps_survey",
    "renewal_reminder",
    "churn_risk_alert",
    "upsell_suggestion",
    "auto_reply",
    "escalation"
  ]).notNull(),
  actionDescription: text("actionDescription").notNull(),
  messageContent: text("messageContent"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "executed", "failed"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewNote: text("reviewNote"),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AiSupervisionItem = typeof aiSupervisionQueue.$inferSelect;
export type InsertAiSupervisionItem = typeof aiSupervisionQueue.$inferInsert;

// ─── Playbooks ────────────────────────────────────────────────────────────────
export const playbooks = mysqlTable("playbooks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  program: varchar("program", { length: 128 }), // null = applies to all programs
  agentId: int("agentId"), // which AI agent runs this playbook
  isActive: boolean("isActive").default(true).notNull(),
  triggerEvent: mysqlEnum("triggerEvent", [
    "customer_created",
    "nps_submitted",
    "health_score_drop",
    "renewal_approaching",
    "no_interaction",
    "manual"
  ]).default("customer_created").notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Playbook = typeof playbooks.$inferSelect;
export type InsertPlaybook = typeof playbooks.$inferInsert;

// ─── Playbook Steps ───────────────────────────────────────────────────────────
export const playbookSteps = mysqlTable("playbookSteps", {
  id: int("id").autoincrement().primaryKey(),
  playbookId: int("playbookId").notNull(),
  stepOrder: int("stepOrder").notNull(), // 1, 2, 3...
  delayDays: int("delayDays").default(0).notNull(), // days after trigger
  stepType: mysqlEnum("stepType", [
    "send_message",
    "send_nps",
    "send_csat",
    "create_task",
    "update_health_score",
    "escalate_to_human",
    "add_tag"
  ]).default("send_message").notNull(),
  messageTemplate: text("messageTemplate"), // message with {{name}}, {{program}} variables
  taskTitle: text("taskTitle"),
  taskDescription: text("taskDescription"),
  healthScoreDelta: int("healthScoreDelta"), // +10 or -10
  tagToAdd: varchar("tagToAdd", { length: 128 }),
  condition: json("condition").$type<{ field: string; operator: string; value: string } | null>(), // optional condition
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PlaybookStep = typeof playbookSteps.$inferSelect;
export type InsertPlaybookStep = typeof playbookSteps.$inferInsert;

// ─── Customer Journey ─────────────────────────────────────────────────────────
export const customerJourney = mysqlTable("customerJourney", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  playbookId: int("playbookId").notNull(),
  currentStepId: int("currentStepId"),
  status: mysqlEnum("status", ["active", "completed", "paused", "cancelled"]).default("active").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  nextActionAt: timestamp("nextActionAt"), // when to execute next step
  stepsCompleted: int("stepsCompleted").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_customer_journey_customer_status").on(table.customerId, table.status),
]);
export type CustomerJourney = typeof customerJourney.$inferSelect;
export type InsertCustomerJourney = typeof customerJourney.$inferInsert;

// ─── Journey Step Executions ──────────────────────────────────────────────────
export const journeyStepExecutions = mysqlTable("journeyStepExecutions", {
  id: int("id").autoincrement().primaryKey(),
  journeyId: int("journeyId").notNull(),
  stepId: int("stepId").notNull(),
  customerId: int("customerId").notNull(),
  status: mysqlEnum("status", ["pending", "executed", "skipped", "failed"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  executedAt: timestamp("executedAt"),
  result: text("result"), // what happened
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type JourneyStepExecution = typeof journeyStepExecutions.$inferSelect;
export type InsertJourneyStepExecution = typeof journeyStepExecutions.$inferInsert;

// ─── Trigger Rules ────────────────────────────────────────────────────────────
export const triggerRules = mysqlTable("triggerRules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  // Condition
  conditionType: mysqlEnum("conditionType", [
    "no_interaction_days",
    "health_score_below",
    "health_score_above",
    "nps_score_below",
    "nps_score_above",
    "renewal_days_remaining",
    "tag_added",
    "status_changed"
  ]).notNull(),
  conditionValue: varchar("conditionValue", { length: 128 }).notNull(), // e.g. "5" for days, "50" for score
  // Action
  actionType: mysqlEnum("actionType", [
    "send_ai_message",
    "create_supervision_item",
    "update_status",
    "assign_playbook",
    "create_task",
    "send_nps"
  ]).notNull(),
  actionConfig: json("actionConfig").$type<Record<string, string>>(), // message template, agent, etc.
  agentId: int("agentId"), // which AI agent executes
  program: varchar("program", { length: 128 }), // null = all programs
  lastEvaluatedAt: timestamp("lastEvaluatedAt"),
  triggerCount: int("triggerCount").default(0).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TriggerRule = typeof triggerRules.$inferSelect;
export type InsertTriggerRule = typeof triggerRules.$inferInsert;

// ─── Health Score Logs ────────────────────────────────────────────────────────
export const healthScoreLogs = mysqlTable("healthScoreLogs", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  score: float("score").notNull(),
  // Breakdown of each factor (0-100 each, weighted)
  breakdown: json("breakdown").$type<{
    inactivity: number;       // 30% weight — days without interaction
    nps: number;              // 25% weight — NPS score
    openTickets: number;      // 20% weight — open support tickets
    renewalProximity: number; // 15% weight — days until renewal
    programProgress: number;  // 10% weight — onboarding/program completion
    inactivityDays: number;   // raw days for display
    npsRaw: number | null;    // raw NPS value for display
    openTicketsCount: number; // raw count for display
    renewalDaysLeft: number | null; // raw days for display
  }>(),
  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
});

export type HealthScoreLog = typeof healthScoreLogs.$inferSelect;
export type InsertHealthScoreLog = typeof healthScoreLogs.$inferInsert;

// ─── Trigger Logs ─────────────────────────────────────────────────────────────
export const triggerLogs = mysqlTable("triggerLogs", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull(),
  ruleName: varchar("ruleName", { length: 255 }).notNull(),
  customerId: int("customerId").notNull(),
  customerName: varchar("customerName", { length: 255 }),
  agentId: int("agentId"),
  agentName: varchar("agentName", { length: 255 }),
  conditionType: varchar("conditionType", { length: 64 }).notNull(),
  conditionValue: varchar("conditionValue", { length: 128 }).notNull(),
  conditionSnapshot: json("conditionSnapshot").$type<Record<string, unknown>>(), // actual values at trigger time
  actionType: varchar("actionType", { length: 64 }).notNull(),
  actionResult: mysqlEnum("actionResult", ["success", "skipped", "error"]).default("success").notNull(),
  actionDetail: text("actionDetail"), // what was created/sent
  isSimulation: boolean("isSimulation").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TriggerLog = typeof triggerLogs.$inferSelect;
export type InsertTriggerLog = typeof triggerLogs.$inferInsert;

// ─── Communication Intelligence ──────────────────────────────────────────────
export const communicationInsights = mysqlTable("communicationInsights", {
  id: int("id").autoincrement().primaryKey(),
  periodDays: int("periodDays").notNull().default(30),
  totalMessages: int("totalMessages").notNull().default(0),
  totalConversations: int("totalConversations").notNull().default(0),
  sentimentPositive: int("sentimentPositive").notNull().default(0), // percentage 0-100
  sentimentNeutral: int("sentimentNeutral").notNull().default(0),
  sentimentNegative: int("sentimentNegative").notNull().default(0),
  topics: json("topics").$type<Array<{ topic: string; count: number; trend: "up" | "down" | "stable"; category: string }>>(),
  suggestions: json("suggestions").$type<Array<{ text: string; category: "produto" | "processo" | "comunicação" | "suporte"; priority: "alta" | "média" | "baixa" }>>(),
  rawSummary: text("rawSummary"), // full AI-generated summary
  analyzedAt: timestamp("analyzedAt").defaultNow().notNull(),
});
export type CommunicationInsight = typeof communicationInsights.$inferSelect;
export type InsertCommunicationInsight = typeof communicationInsights.$inferInsert;

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  message: text("message").notNull(),
  agentId: int("agentId"),
  // Filters (stored as JSON)
  filterMinHealthScore: int("filterMinHealthScore"),
  filterMaxHealthScore: int("filterMaxHealthScore"),
  filterProgram: varchar("filterProgram", { length: 255 }),
  filterStatus: varchar("filterStatus", { length: 50 }),
  filterLifecycleStage: varchar("filterLifecycleStage", { length: 100 }),
  // Execution
  status: mysqlEnum("status", ["draft", "scheduled", "running", "completed", "cancelled"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  totalTargeted: int("totalTargeted").default(0),
  totalSent: int("totalSent").default(0),
  totalReplied: int("totalReplied").default(0),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ─── Channel History ──────────────────────────────────────────────────────────
export const channelHistory = mysqlTable("channelHistory", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  channel: mysqlEnum("channel", ["whatsapp", "email", "instagram", "telegram", "chat"]).notNull(),
  identifier: varchar("identifier", { length: 100 }).notNull(), // phone number, email, etc.
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  disconnectedAt: timestamp("disconnectedAt"),
  disconnectReason: varchar("disconnectReason", { length: 255 }),
  conversationCount: int("conversationCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChannelHistory = typeof channelHistory.$inferSelect;
export type InsertChannelHistory = typeof channelHistory.$inferInsert;

// ─── Customer Journey Tasks ───────────────────────────────────────────────────
export const customerJourneyTasks = mysqlTable("customerJourneyTasks", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  phase: mysqlEnum("phase", ["onboarding", "monthly", "renewal", "manual"]).default("manual").notNull(),
  dayOffset: int("dayOffset"), // day in the 12-month journey (0 = entry day)
  dueDate: timestamp("dueDate"),
  status: mysqlEnum("status", ["pending", "done", "skipped"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "normal"]).default("normal").notNull(),
  completedAt: timestamp("completedAt"),
  completedByUserId: int("completedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerJourneyTask = typeof customerJourneyTasks.$inferSelect;
export type InsertCustomerJourneyTask = typeof customerJourneyTasks.$inferInsert;

// ─── Customer Notes ───────────────────────────────────────────────────────────
export const customerNotes = mysqlTable("customerNotes", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  content: text("content").notNull(),
  type: mysqlEnum("type", ["note", "call", "meeting", "email", "whatsapp"]).default("note").notNull(),
  createdByUserId: int("createdByUserId"),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerNote = typeof customerNotes.$inferSelect;
export type InsertCustomerNote = typeof customerNotes.$inferInsert;

// ─── Conversation Tags ────────────────────────────────────────────────────────
export const conversationTags = mysqlTable("conversationTags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 32 }).default("#6366f1").notNull(),
  icon: varchar("icon", { length: 32 }).default("tag").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  isSystem: boolean("isSystem").default(false).notNull(), // system tags can't be deleted
  createdByUserId: int("createdByUserId"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ConversationTag = typeof conversationTags.$inferSelect;
export type InsertConversationTag = typeof conversationTags.$inferInsert;

export const conversationTagAssignments = mysqlTable("conversationTagAssignments", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  tagId: int("tagId").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
});
export type ConversationTagAssignment = typeof conversationTagAssignments.$inferSelect;

// ─── Knowledge Captures (Base de Conhecimento Viva) ──────────────────────────
// Every time the AI handles a client question, it is captured here.
// Questions with the same normalizedQuestion are deduplicated and frequency++.
export const knowledgeCaptures = mysqlTable("knowledgeCaptures", {
  id: int("id").autoincrement().primaryKey(),
  question: text("question").notNull(),
  normalizedQuestion: varchar("normalizedQuestion", { length: 512 }).notNull(),
  category: mysqlEnum("category", [
    "acesso_plataforma",
    "conteudo_modulo",
    "financeiro_reembolso",
    "certificado",
    "comunidade",
    "suporte_tecnico",
    "resultado_produto",
    "outros",
  ]).default("outros").notNull(),
  frequency: int("frequency").default(1).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  status: mysqlEnum("status", ["pending", "approved", "dismissed"]).default("pending").notNull(),
  resolution: text("resolution"),
  sourceConversationIds: json("sourceConversationIds").$type<number[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeCapture = typeof knowledgeCaptures.$inferSelect;
export type InsertKnowledgeCapture = typeof knowledgeCaptures.$inferInsert;

// ─── Knowledge FAQ ────────────────────────────────────────────────────────────
// Approved questions become FAQ entries that can be pushed to agent knowledge bases.
export const knowledgeFAQ = mysqlTable("knowledgeFAQ", {
  id: int("id").autoincrement().primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: mysqlEnum("category", [
    "acesso_plataforma",
    "conteudo_modulo",
    "financeiro_reembolso",
    "certificado",
    "comunidade",
    "suporte_tecnico",
    "resultado_produto",
    "outros",
  ]).default("outros").notNull(),
  agentIds: json("agentIds").$type<number[]>().default([]),
  captureId: int("captureId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeFAQ = typeof knowledgeFAQ.$inferSelect;
export type InsertKnowledgeFAQ = typeof knowledgeFAQ.$inferInsert;

// ─── Cadence Rules (Régua de Sucesso Automatizada) ────────────────────────────
export const cadenceRules = mysqlTable("cadenceRules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Trigger: when to fire (relative to customer entry date or last interaction)
  triggerType: mysqlEnum("triggerType", ["days_since_entry", "days_since_contact", "days_before_renewal", "health_score_below", "new_customer"]).notNull(),
  triggerValue: int("triggerValue").notNull().default(0), // e.g. 3 for "3 days after entry"
  // Action
  actionType: mysqlEnum("actionType", ["send_whatsapp", "send_group_message", "create_task", "update_health_score", "notify_agent"]).notNull(),
  messageTemplate: text("messageTemplate"), // LLM prompt template with {{name}}, {{program}}, etc.
  taskTitle: varchar("taskTitle", { length: 255 }),
  healthScoreDelta: int("healthScoreDelta"), // e.g. +5 or -10
  // Targeting
  targetProgram: varchar("targetProgram", { length: 128 }), // null = all programs
  targetStatus: mysqlEnum("targetStatus", ["Active", "At Risk", "New", "all"]).default("all"),
  // Control
  isActive: boolean("isActive").default(true).notNull(),
  executionFrequency: mysqlEnum("executionFrequency", ["once", "daily", "weekly", "monthly"]).default("once").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CadenceRule = typeof cadenceRules.$inferSelect;
export type InsertCadenceRule = typeof cadenceRules.$inferInsert;

// ─── Cadence Executions (Log de Execuções) ────────────────────────────────────
export const cadenceExecutions = mysqlTable("cadenceExecutions", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull(),
  customerId: int("customerId").notNull(),
  status: mysqlEnum("status", ["sent", "failed", "skipped", "pending"]).default("pending").notNull(),
  generatedMessage: text("generatedMessage"), // actual message generated by LLM
  errorMessage: text("errorMessage"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
  // Context snapshot at time of execution
  customerName: varchar("customerName", { length: 255 }),
  customerProgram: varchar("customerProgram", { length: 128 }),
  healthScoreAtExecution: int("healthScoreAtExecution"),
});

export type CadenceExecution = typeof cadenceExecutions.$inferSelect;
export type InsertCadenceExecution = typeof cadenceExecutions.$inferInsert;

// ─── Meeting Transcripts ────────────────────────────────────────────────────
export const meetingTranscripts = mysqlTable("meeting_transcripts", {
  id:               int("id").autoincrement().primaryKey(),
  customerId:       int("customer_id").notNull(),
  title:            varchar("title", { length: 255 }).notNull(),
  content:          text("content").notNull(),
  fileUrl:          text("file_url"),
  fileKey:          text("file_key"),
  summary:          text("summary"),
  keyPoints:        text("key_points"),
  actionItems:      text("action_items"),
  healthScoreDelta: int("health_score_delta").default(0),
  analyzedAt:       timestamp("analyzed_at"),
  createdBy:        int("created_by"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

// ─── Customer Milestones (Vitórias, Desafios, Marcos) ────────────────────────
export const customerMilestones = mysqlTable("customerMilestones", {
  id:            int("id").autoincrement().primaryKey(),
  customerId:    int("customerId").notNull(),
  type:          mysqlEnum("type", ["victory", "challenge", "milestone", "complaint"]).default("milestone").notNull(),
  title:         varchar("title", { length: 255 }).notNull(),
  description:   text("description"),
  date:          timestamp("date").defaultNow().notNull(),
  createdByUserId: int("createdByUserId"),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt:     timestamp("createdAt").defaultNow().notNull(),
});
export type CustomerMilestone = typeof customerMilestones.$inferSelect;
export type InsertCustomerMilestone = typeof customerMilestones.$inferInsert;
