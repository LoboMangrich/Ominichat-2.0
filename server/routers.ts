import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import {
  customers, conversations, messages, surveys, referrals,
  agentMetrics, ghlSettings, upsellOpportunities, conversationLabels, users,
  guruSettings, guruWebhookEvents,
  aiAgents, knowledgeBase, channelSettings, aiAgentLogs,
  scheduledMessages, quickReplies, tasks, internalMessages, broadcasts, alerts,
  slaSettings, weeklyReports, satisfactionSettings, satisfactionRatings,
  whatsappGroups, groupMessages, groupAlerts,
  aiSupervisionQueue,
  playbooks, playbookSteps, customerJourney, journeyStepExecutions, triggerRules,
  healthScoreLogs, triggerLogs, communicationInsights, campaigns, channelHistory,
  customerJourneyTasks, customerNotes,
  conversationTags, conversationTagAssignments,
  knowledgeCaptures, knowledgeFAQ,
  cadenceRules, cadenceExecutions,
  meetingTranscripts,
  customerMilestones,
  taskAttachments,
  clientROI,
  clientGoals,
  formTemplates,
  formSubmissions,
} from "../drizzle/schema";
import { recalculateAndSave, recalculateAllHealthScores } from "./healthScoreEngine";
import { analyzeConversations, saveAnalysis } from "./communicationIntelligence";
import { archiveConversationsByNumber, getCustomerChannelHistory } from "./conversationBackup";
import { generateWhatsAppQRCode, simulateWhatsAppConnect, simulateWhatsAppDisconnect, getChannelHealthStatus } from "./channelHealth";
import { eq, and, desc, asc, like, or, sql, gte, lte, lt, count } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { sendMessageByConversation, fetchMetaTemplates, sendWhatsAppTemplate, createMetaTemplate, deleteMetaTemplate } from "./channelSender";
import { saraRouter } from "./routers/sara";

// ─── Customers Router ─────────────────────────────────────────────────────────
const customersRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      program: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { customers: [], total: 0 };
      const offset = (input.page - 1) * input.limit;
      let query = db.select().from(customers);
      const conditions = [];
      if (input.search) {
        conditions.push(or(
          like(customers.name, `%${input.search}%`),
          like(customers.email, `%${input.search}%`),
          like(customers.phone, `%${input.search}%`)
        ));
      }
      if (input.status) conditions.push(eq(customers.status, input.status as any));
      if (input.program) conditions.push(eq(customers.program, input.program));
      const results = await db.select().from(customers)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(customers.updatedAt))
        .limit(input.limit)
        .offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(customers)
        .where(conditions.length ? and(...conditions) : undefined);
      return { customers: results, total };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1);
      const customer = result[0] ?? null;
      if (!customer) return null;
      // Fetch purchase history from Guru webhook events
      const purchases = await db
        .select({
          id: guruWebhookEvents.id,
          productName: guruWebhookEvents.productName,
          value: guruWebhookEvents.value,
          status: guruWebhookEvents.status,
          createdAt: guruWebhookEvents.createdAt,
        })
        .from(guruWebhookEvents)
        .where(eq(guruWebhookEvents.customerId, customer.id))
        .orderBy(desc(guruWebhookEvents.createdAt));
      return { ...customer, purchases };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      program: z.string().optional(),
      status: z.enum(["Active", "At Risk", "Churned", "New"]).default("New"),
      company: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(customers).values(input);
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      program: z.string().optional(),
      status: z.enum(["Active", "At Risk", "Churned", "New"]).optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      mrr: z.number().optional(),
      renewalDate: z.string().optional(), // ISO date string
      healthScore: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, renewalDate, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (renewalDate) data.renewalDate = new Date(renewalDate);
      await db.update(customers).set(data).where(eq(customers.id, id));
      return { success: true };
    }),
  computeHealthScore: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
      if (!customer) throw new Error("Customer not found");
      // Fetch last 30 days of conversations
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentConvs = await db.select().from(conversations)
        .where(and(eq(conversations.customerId, input.customerId), gte(conversations.createdAt, thirtyDaysAgo)));
      // Score components (each 0-100)
      // 1. NPS (0-100 → 0-30 pts)
      const npsComponent = customer.npsScore != null ? (customer.npsScore / 10) * 30 : 15;
      // 2. Recency: days since last interaction (0 = 30pts, 30+ days = 0pts)
      const daysSinceContact = customer.lastInteractionAt
        ? Math.min(30, Math.floor((Date.now() - new Date(customer.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24)))
        : 30;
      const recencyComponent = ((30 - daysSinceContact) / 30) * 30;
      // 3. Conversation quality (avg quality score, 0-100 → 0-25 pts)
      const qualityConvs = recentConvs.filter(c => c.qualityScore != null);
      const avgQuality = qualityConvs.length > 0
        ? qualityConvs.reduce((sum, c) => sum + (c.qualityScore ?? 0), 0) / qualityConvs.length
        : 50;
      const qualityComponent = (avgQuality / 100) * 25;
      // 4. Status penalty
      const statusComponent = customer.status === "Active" ? 15 :
        customer.status === "New" ? 12 :
        customer.status === "At Risk" ? 5 : 0;
      const score = Math.round(npsComponent + recencyComponent + qualityComponent + statusComponent);
      await db.update(customers).set({ healthScore: score }).where(eq(customers.id, input.customerId));
      return { score };
    }),
  computeAllHealthScores: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const allCustomers = await db.select().from(customers);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const customer of allCustomers) {
      const recentConvs = await db.select().from(conversations)
        .where(and(eq(conversations.customerId, customer.id), gte(conversations.createdAt, thirtyDaysAgo)));
      const npsComponent = customer.npsScore != null ? (customer.npsScore / 10) * 30 : 15;
      const daysSinceContact = customer.lastInteractionAt
        ? Math.min(30, Math.floor((Date.now() - new Date(customer.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24)))
        : 30;
      const recencyComponent = ((30 - daysSinceContact) / 30) * 30;
      const qualityConvs = recentConvs.filter(c => c.qualityScore != null);
      const avgQuality = qualityConvs.length > 0
        ? qualityConvs.reduce((sum, c) => sum + (c.qualityScore ?? 0), 0) / qualityConvs.length
        : 50;
      const qualityComponent = (avgQuality / 100) * 25;
      const statusComponent = customer.status === "Active" ? 15 :
        customer.status === "New" ? 12 :
        customer.status === "At Risk" ? 5 : 0;
      const score = Math.round(npsComponent + recencyComponent + qualityComponent + statusComponent);
      await db.update(customers).set({ healthScore: score }).where(eq(customers.id, customer.id));
    }
    return { updated: allCustomers.length };
  }),

  getPrograms: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const results = await db.selectDistinct({ program: customers.program }).from(customers)
      .where(sql`${customers.program} IS NOT NULL`);
    return results.map(r => r.program).filter(Boolean);
  }),

  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, active: 0, atRisk: 0, churned: 0, new: 0 };
    const [total] = await db.select({ count: count() }).from(customers);
    const [active] = await db.select({ count: count() }).from(customers).where(eq(customers.status, "Active"));
    const [atRisk] = await db.select({ count: count() }).from(customers).where(eq(customers.status, "At Risk"));
    const [churned] = await db.select({ count: count() }).from(customers).where(eq(customers.status, "Churned"));
    const [newC] = await db.select({ count: count() }).from(customers).where(eq(customers.status, "New"));
    return {
      total: total.count, active: active.count, atRisk: atRisk.count,
      churned: churned.count, new: newC.count
    };
  }),

  getChannelHistory: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return getCustomerChannelHistory(db as any, input.customerId);
    }),

  getLastInteractions: protectedProcedure
    .input(z.object({ customerId: z.number(), limit: z.number().default(5) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get last conversations ordered by most recent activity
      const convs = await db
        .select({
          id: conversations.id,
          channel: conversations.channel,
          status: conversations.status,
          closedAt: conversations.closedAt,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          subject: conversations.subject,
          handledByAi: conversations.handledByAi,
          sentimentScore: conversations.sentimentScore,
        })
        .from(conversations)
        .where(eq(conversations.customerId, input.customerId))
        .orderBy(desc(conversations.updatedAt))
        .limit(input.limit);
      return convs;
    }),
});

// ─── Conversations Router ─────────────────────────────────────────────────────
const conversationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      channel: z.string().optional(),
      agentId: z.number().optional(),
      customerId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { conversations: [], total: 0 };
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.status) conditions.push(eq(conversations.status, input.status as any));
      if (input.channel) conditions.push(eq(conversations.channel, input.channel as any));
      if (input.agentId) conditions.push(eq(conversations.assignedAgentId, input.agentId));
      if (input.customerId) conditions.push(eq(conversations.customerId, input.customerId));
      const results = await db.select().from(conversations)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(conversations.updatedAt))
        .limit(input.limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(conversations)
        .where(conditions.length ? and(...conditions) : undefined);

      // Enrich with customer name, assigned agent name, and labels
      const enriched = await Promise.all(results.map(async (conv) => {
        const [customer] = conv.customerId
          ? await db.select({ id: customers.id, name: customers.name, email: customers.email }).from(customers).where(eq(customers.id, conv.customerId)).limit(1)
          : [];
        const [assignedAgent] = conv.assignedAgentId
          ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, conv.assignedAgentId)).limit(1)
          : [];
        const labels = await db.select().from(conversationLabels).where(eq(conversationLabels.conversationId, conv.id));
        // Last message preview
        const [lastMsg] = await db.select({ content: messages.content, senderType: messages.senderType, createdAt: messages.createdAt })
          .from(messages).where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt)).limit(1);
        return { ...conv, customer: customer ?? null, assignedAgent: assignedAgent ?? null, labels, messages: lastMsg ? [lastMsg] : [] };
      }));

      return { conversations: enriched, total };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.id)).limit(1);
      if (!conv) return null;
      const [customer] = conv.customerId ? await db.select().from(customers).where(eq(customers.id, conv.customerId)).limit(1) : [];
      const msgs = await db.select().from(messages).where(eq(messages.conversationId, input.id)).orderBy(messages.createdAt);
      const labels = await db.select().from(conversationLabels).where(eq(conversationLabels.conversationId, input.id));
      return { ...conv, customer, messages: msgs, labels };
    }),

  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      channel: z.enum(["whatsapp", "email", "chat"]).default("whatsapp"),
      subject: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(conversations).values({
        ...input,
        assignedAgentId: ctx.user.id,
        status: "Open",
      });
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["Open", "Waiting", "Closed"]),
    }))
     .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const updateData: any = { status: input.status };
      if (input.status === "Closed") {
        updateData.closedAt = new Date();
        // Auto-trigger AI analysis when conversation is closed
        try {
          const msgs = await db.select().from(messages)
            .where(and(eq(messages.conversationId, input.id), eq(messages.isInternal, false)))
            .orderBy(messages.createdAt);
          if (msgs.length > 0) {
            const transcript = msgs.map(m => `[${m.senderType.toUpperCase()}]: ${m.content}`).join("\n");
            const response = await invokeLLM({
              messages: [
                { role: "system", content: "You are a customer success conversation analyst. Return JSON with: qualityScore (0-100), sentimentScore (-1 to 1), upsellOpportunity (0-100), referralReadiness (0-100), summary (string), recommendations (string), keyTopics (string[])." },
                { role: "user", content: `Analyze this conversation:\n\n${transcript}` },
              ],
              response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: { type: "object", properties: { qualityScore: { type: "number" }, sentimentScore: { type: "number" }, upsellOpportunity: { type: "number" }, referralReadiness: { type: "number" }, summary: { type: "string" }, recommendations: { type: "string" }, keyTopics: { type: "array", items: { type: "string" } } }, required: ["qualityScore","sentimentScore","upsellOpportunity","referralReadiness","summary","recommendations","keyTopics"], additionalProperties: false } } },
            });
            const rawContent = response.choices[0]?.message?.content;
            const content = typeof rawContent === "string" ? rawContent : null;
            if (content) {
              const analysis = JSON.parse(content);
              await db.update(conversations).set({
                qualityScore: analysis.qualityScore,
                sentimentScore: analysis.sentimentScore,
                upsellOpportunity: analysis.upsellOpportunity,
                referralReadiness: analysis.referralReadiness,
                aiSummary: analysis.summary,
                aiRecommendations: analysis.recommendations,
                aiAnalyzedAt: new Date(),
              }).where(eq(conversations.id, input.id));
              if (analysis.qualityScore < 70) {
                await notifyOwner({ title: "⚠️ Low Quality Conversation", content: `Conversation #${input.id} scored ${analysis.qualityScore}/100. Recommendations: ${analysis.recommendations}` });
              }
              // Auto-update health score based on sentiment
              try {
                const [conv] = await db.select({ customerId: conversations.customerId }).from(conversations).where(eq(conversations.id, input.id)).limit(1);
                if (conv?.customerId) {
                  const [cust] = await db.select({ healthScore: customers.healthScore }).from(customers).where(eq(customers.id, conv.customerId)).limit(1);
                  if (cust) {
                    // sentiment: -1 to 1 → delta: -10 to +10
                    const delta = Math.round(analysis.sentimentScore * 10);
                    const newScore = Math.max(0, Math.min(100, (cust.healthScore ?? 50) + delta));
                    if (delta !== 0) {
                      await db.update(customers).set({ healthScore: newScore, updatedAt: new Date() }).where(eq(customers.id, conv.customerId));
                    }
                  }
                }
              } catch (hsErr) {
                console.error("[HealthScore Auto-update] Failed:", hsErr);
              }
            }
          }
        } catch (e) {
          console.error("[AI Auto-analysis] Failed:", e);
        }
      }
      await db.update(conversations).set(updateData).where(eq(conversations.id, input.id));
      // Auto-send satisfaction survey when conversation is closed
      if (input.status === "Closed") {
        try {
          const [satSettings] = await db.select().from(satisfactionSettings).limit(1);
          if (satSettings?.isActive) {
            const allowedChannels: string[] = (satSettings.channels as string[]) ?? ["whatsapp", "telegram"];
            const [closedConv] = await db.select({ channel: conversations.channel }).from(conversations).where(eq(conversations.id, input.id)).limit(1);
            if (closedConv && allowedChannels.includes(closedConv.channel)) {
              const sendSatisfaction = async () => {
                await sendMessageByConversation({ conversationId: input.id, content: satSettings.message });
                // Record as system message
                await (await getDb())?.insert(messages).values({
                  conversationId: input.id,
                  content: `[Pesquisa de satisfação enviada automaticamente]`,
                  senderType: 'system',
                });
              };
              if ((satSettings.delayMinutes ?? 0) > 0) {
                setTimeout(() => sendSatisfaction().catch(console.error), satSettings.delayMinutes * 60 * 1000);
              } else {
                await sendSatisfaction();
              }
            }
          }
        } catch (e) {
          console.error("[Satisfaction Auto-send] Failed:", e);
        }
      }
      return { success: true };
    }),
  addLabel: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      label: z.string(),
      color: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(conversationLabels).values({ ...input, createdBy: ctx.user.id });
      return { success: true };
    }),

  forward: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      agentId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // Find the target agent name
      const [targetAgent] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.agentId)).limit(1);
      const targetName = targetAgent?.name ?? `Agente #${input.agentId}`;
      const fromName = ctx.user.name ?? 'Agente';

      // Update assigned agent
      await db.update(conversations)
        .set({ assignedAgentId: input.agentId, handledByAi: false })
        .where(eq(conversations.id, input.conversationId));

      // Insert system note
      await db.insert(messages).values({
        conversationId: input.conversationId,
        senderType: "system",
        content: `🔄 ${fromName} transferiu o atendimento para ${targetName}${input.reason ? ` — ${input.reason}` : '.'}`,
        senderId: null,
      });

      return { success: true, targetName };
    }),
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { open: 0, waiting: 0, closed: 0 };
    const [open] = await db.select({ count: count() }).from(conversations).where(eq(conversations.status, "Open"));
    const [waiting] = await db.select({ count: count() }).from(conversations).where(eq(conversations.status, "Waiting"));
    const [closed] = await db.select({ count: count() }).from(conversations).where(eq(conversations.status, "Closed"));
    return { open: open.count, waiting: waiting.count, closed: closed.count };
  }),
  // Handoff: human takes over from AI
  takeOver: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(conversations).set({
        handoffMode: "human",
        assignedUserId: ctx.user.id,
        handoffAt: new Date(),
        handoffNote: input.note ?? null,
        handledByAi: false,
      }).where(eq(conversations.id, input.conversationId));
      // Insert system message
      await db.insert(messages).values({
        conversationId: input.conversationId,
        senderType: "system",
        content: `👤 ${ctx.user.name ?? "Agente"} assumiu o atendimento. IA pausada.`,
        senderId: null,
      });
      return { success: true };
    }),

  // Handoff: return conversation to AI
  returnToAI: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(conversations).set({
        handoffMode: "ai",
        assignedUserId: null,
        handledByAi: true,
      }).where(eq(conversations.id, input.conversationId));
      await db.insert(messages).values({
        conversationId: input.conversationId,
        senderType: "system",
        content: `🤖 Atendimento devolvido para a IA.`,
        senderId: null,
      });
      return { success: true };
    }),

  archiveByChannel: protectedProcedure
    .input(z.object({
      whatsappNumber: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const result = await archiveConversationsByNumber(db as any, input.whatsappNumber, input.reason ?? "Número desconectado");
      return result;
    }),

  // Delete conversations that have no real messages (only AI/system messages or none at all)
  bulkDeleteEmpty: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    // Find conversations with no customer messages
    const allConvs = await db.select({ id: conversations.id }).from(conversations);
    const toDelete: number[] = [];
    for (const conv of allConvs) {
      const [customerMsg] = await db.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.conversationId, conv.id), eq(messages.senderType, "customer")))
        .limit(1);
      if (!customerMsg) toDelete.push(conv.id);
    }
    if (toDelete.length === 0) return { deleted: 0 };
    // Delete messages first (FK), then conversations
    for (const id of toDelete) {
      await db.delete(messages).where(eq(messages.conversationId, id));
    }
    for (const id of toDelete) {
      await db.delete(conversations).where(eq(conversations.id, id));
    }
    return { deleted: toDelete.length };
  }),

  transcribeAudio: protectedProcedure
    .input(z.object({ audioUrl: z.string() }))
    .mutation(async ({ input }) => {
      const { transcribeAudio } = await import("./_core/voiceTranscription");
      const result = await transcribeAudio({ audioUrl: input.audioUrl });
      if ('error' in result) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
      return { text: result.text, language: result.language };
    }),
});
// ─── Messages Router ──────────────────────────────────────────────────────────
const messagesRouter = router({
  // Paginated messages for lazy loading in long conversations
  list: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      limit: z.number().default(50),
      beforeId: z.number().optional(), // cursor for older messages
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { messages: [], hasMore: false };
      const conditions: any[] = [eq(messages.conversationId, input.conversationId)];
      if (input.beforeId) conditions.push(sql`${messages.id} < ${input.beforeId}`);
      const msgs = await db.select().from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);
      const hasMore = msgs.length > input.limit;
      return { messages: msgs.slice(0, input.limit).reverse(), hasMore };
    }),
  send: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      content: z.string().min(1),
      isInternal: z.boolean().default(false),
      mediaUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Set firstResponseAt if this is the first agent message
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
      if (conv && !conv.firstResponseAt) {
        await db.update(conversations).set({ firstResponseAt: new Date() }).where(eq(conversations.id, input.conversationId));
      }

      // Notas internas só persistem. Mensagens de verdade (inclusive e-mail) só são
      // gravadas se o canal confirmar o envio — senão o agente veria "enviado" numa
      // resposta que o cliente nunca recebeu.
      let externalId: string | undefined;
      if (!input.isInternal) {
        const sendResult = await sendMessageByConversation({
          conversationId: input.conversationId,
          content: input.content,
          mediaUrl: input.mediaUrl,
        });
        if (!sendResult.success) {
          console.warn(`[messages.send] Falha no envio da conv ${input.conversationId}: ${sendResult.error} — mensagem NÃO gravada`);
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `Não foi possível enviar a mensagem: ${sendResult.error ?? "canal indisponível"}`,
          });
        }
        externalId = sendResult.externalId;
      }

      await db.insert(messages).values({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        senderType: "agent",
        content: input.content,
        isInternal: input.isInternal,
        mediaUrl: input.mediaUrl,
        whatsappMessageId: externalId ?? null,
      });
      // Update conversation updatedAt
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
      return { success: true };
    }),

  simulateIncoming: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      content: z.string(),
      customerName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(messages).values({
        conversationId: input.conversationId,
        senderType: "customer",
        content: input.content,
      });
      await db.update(conversations).set({ status: "Open", updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
      // Check if conversation is handled by AI and trigger auto-reply
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
      if (conv?.handledByAi) {
        // Trigger AI auto-reply inline (same logic as webhooks)
        try {
          // Fetch customer name for personalisation
          let customerFirstName = "";
          if (conv.customerId) {
            const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, conv.customerId)).limit(1);
            if (cust?.name) customerFirstName = cust.name.split(" ")[0];
          }
          let agentId = conv.aiAgentId;
          if (!agentId) {
            const agents = await db.select().from(aiAgents).where(eq(aiAgents.isActive, true)).limit(1);
            if (agents.length) agentId = agents[0].id;
          }
          if (agentId) {
            const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, agentId)).limit(1);
            if (agent?.isActive) {
              const kb = await db.select().from(knowledgeBase)
                .where(and(eq(knowledgeBase.agentId, agentId), eq(knowledgeBase.isActive, true))).limit(20);
              const kbContext = kb.map(e => `Q: ${e.title}\nA: ${e.content}`).join("\n\n");
              const history = await db.select().from(messages)
                .where(and(eq(messages.conversationId, input.conversationId), eq(messages.isInternal, false)))
                .orderBy(desc(messages.createdAt)).limit(10);
              const historyText = history.reverse().map(m =>
                `${m.senderType === "customer" ? "Cliente" : "Agente"}: ${m.content}`
              ).join("\n");
              const basePrompt = agent.systemPrompt ||
                `Você é um assistente de suporte ao cliente profissional e empático. Responda de forma clara, objetiva e cordial.`;
              // Inject customer name so the AI never outputs a literal placeholder
              const customerCtx = customerFirstName
                ? `\n\nNome do cliente nesta conversa: ${customerFirstName}. Use o nome real ao se dirigir ao cliente — NUNCA escreva "[Nome do Cliente]" ou qualquer placeholder.`
                : `\n\nUse o nome do cliente caso ele apareça no histórico — NUNCA escreva "[Nome do Cliente]" ou qualquer placeholder.`;
              const systemPrompt = basePrompt + customerCtx;
              const response = await invokeLLM({
                messages: [
                  { role: "system", content: `${systemPrompt}\n\nBase de conhecimento:\n${kbContext || "Nenhuma entrada disponível."}\n\nHistórico recente:\n${historyText}` },
                  { role: "user", content: input.content },
                ],
              });
              const aiReply = (response.choices[0]?.message?.content as string) ?? "Desculpe, não consegui processar sua mensagem.";
              await db.insert(messages).values({ conversationId: input.conversationId, senderType: "ai", content: aiReply, senderId: null });
              await db.update(conversations).set({ handledByAi: true, aiAgentId: agentId }).where(eq(conversations.id, input.conversationId));
            }
          }
        } catch (aiErr) {
          console.error("[SimulateIncoming] AI auto-reply error:", aiErr);
        }
      }
      return { success: true };
    }),
});

// ─── AI Analysis Router ───────────────────────────────────────────────────────
const aiRouter = router({
  analyzeConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const msgs = await db.select().from(messages)
        .where(and(eq(messages.conversationId, input.conversationId), eq(messages.isInternal, false)))
        .orderBy(messages.createdAt);
      if (!msgs.length) throw new Error("No messages to analyze");
      const transcript = msgs.map(m => `[${m.senderType.toUpperCase()}]: ${m.content}`).join("\n");
      // Get conversation for AHT calculation
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a customer success conversation analyst. Analyze the conversation and return a JSON object with these exact fields:
- qualityScore: number 0-100 (overall agent communication quality)
- empathyScore: number 0-100 (agent empathy and emotional intelligence)
- clarityScore: number 0-100 (clarity and conciseness of agent responses)
- resolutionScore: number 0-100 (how well the agent resolved the customer issue)
- complianceScore: number 0-100 (adherence to best practices and professional tone)
- sentimentScore: number -1 to 1 (customer sentiment, -1=very negative, 1=very positive)
- upsellOpportunity: number 0-100 (likelihood of successful upsell)
- referralReadiness: number 0-100 (likelihood customer would refer others)
- summary: string (2-3 sentence summary)
- recommendations: string (actionable coaching recommendations for the agent)
- keyTopics: array of strings (main topics discussed)`,
          },
          { role: "user", content: `Analyze this customer service conversation:\n\n${transcript}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "conversation_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                qualityScore: { type: "number" },
                empathyScore: { type: "number" },
                clarityScore: { type: "number" },
                resolutionScore: { type: "number" },
                complianceScore: { type: "number" },
                sentimentScore: { type: "number" },
                upsellOpportunity: { type: "number" },
                referralReadiness: { type: "number" },
                summary: { type: "string" },
                recommendations: { type: "string" },
                keyTopics: { type: "array", items: { type: "string" } },
              },
              required: ["qualityScore", "empathyScore", "clarityScore", "resolutionScore", "complianceScore", "sentimentScore", "upsellOpportunity", "referralReadiness", "summary", "recommendations", "keyTopics"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : null;
      if (!content) throw new Error("No AI response");
      const analysis = JSON.parse(content);
      // Calculate AHT (Average Handle Time) from conversation lifecycle timestamps
      let handleTimeSeconds: number | undefined;
      if (conv?.createdAt && conv?.closedAt) {
        handleTimeSeconds = Math.round((new Date(conv.closedAt).getTime() - new Date(conv.createdAt).getTime()) / 1000);
      }
      await db.update(conversations).set({
        qualityScore: analysis.qualityScore,
        empathyScore: analysis.empathyScore,
        clarityScore: analysis.clarityScore,
        resolutionScore: analysis.resolutionScore,
        complianceScore: analysis.complianceScore,
        sentimentScore: analysis.sentimentScore,
        upsellOpportunity: analysis.upsellOpportunity,
        referralReadiness: analysis.referralReadiness,
        aiSummary: analysis.summary,
        aiRecommendations: analysis.recommendations,
        aiAnalyzedAt: new Date(),
        ...(handleTimeSeconds != null ? { handleTimeSeconds } : {}),
      }).where(eq(conversations.id, input.conversationId));
      // Alert manager if quality score is low
      if (analysis.qualityScore < 70) {
        await notifyOwner({
          title: "⚠️ Low Quality Conversation Detected",
          content: `Conversation #${input.conversationId} scored ${analysis.qualityScore}/100. Empathy: ${analysis.empathyScore}, Clarity: ${analysis.clarityScore}, Resolution: ${analysis.resolutionScore}. Recommendations: ${analysis.recommendations}`,
        });
      }
      return analysis;
    }),

  getRecentAnalyses: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(conversations)
        .where(sql`${conversations.aiAnalyzedAt} IS NOT NULL`)
        .orderBy(desc(conversations.aiAnalyzedAt))
        .limit(input.limit);
    }),
});

// ─── Surveys Router ───────────────────────────────────────────────────────────
const surveysRouter = router({
  list: protectedProcedure
    .input(z.object({
      type: z.enum(["NPS", "CSAT"]).optional(),
      classification: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { surveys: [], total: 0 };
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.type) conditions.push(eq(surveys.type, input.type));
      if (input.classification) conditions.push(eq(surveys.classification, input.classification as any));
      const results = await db.select().from(surveys)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(surveys.createdAt))
        .limit(input.limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(surveys)
        .where(conditions.length ? and(...conditions) : undefined);
      return { surveys: results, total };
    }),

  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      conversationId: z.number().optional(),
      type: z.enum(["NPS", "CSAT"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(surveys).values({ ...input, status: "Sent", sentAt: new Date() });
      return { success: true };
    }),

  submitResponse: protectedProcedure
    .input(z.object({
      id: z.number(),
      score: z.number().min(0).max(10),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      let classification: "Promoter" | "Passive" | "Detractor";
      if (input.score >= 9) classification = "Promoter";
      else if (input.score >= 7) classification = "Passive";
      else classification = "Detractor";
      await db.update(surveys).set({
        score: input.score,
        feedback: input.feedback,
        classification,
        status: "Completed",
        completedAt: new Date(),
      }).where(eq(surveys.id, input.id));
      return { classification };
    }),

  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { promoters: 0, passives: 0, detractors: 0, avgNps: 0, avgCsat: 0 };
    const [promoters] = await db.select({ count: count() }).from(surveys).where(eq(surveys.classification, "Promoter"));
    const [passives] = await db.select({ count: count() }).from(surveys).where(eq(surveys.classification, "Passive"));
    const [detractors] = await db.select({ count: count() }).from(surveys).where(eq(surveys.classification, "Detractor"));
    const npsData = await db.select({ score: surveys.score }).from(surveys)
      .where(and(eq(surveys.type, "NPS"), sql`${surveys.score} IS NOT NULL`));
    const csatData = await db.select({ score: surveys.score }).from(surveys)
      .where(and(eq(surveys.type, "CSAT"), sql`${surveys.score} IS NOT NULL`));
    const avgNps = npsData.length ? npsData.reduce((a, b) => a + (b.score ?? 0), 0) / npsData.length : 0;
    const avgCsat = csatData.length ? csatData.reduce((a, b) => a + (b.score ?? 0), 0) / csatData.length : 0;
    return {
      promoters: promoters.count, passives: passives.count, detractors: detractors.count,
      avgNps: Math.round(avgNps * 10) / 10, avgCsat: Math.round(avgCsat * 10) / 10,
    };
  }),
});

// ─── Referrals Router ─────────────────────────────────────────────────────────
const referralsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), type: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { referrals: [], total: 0 };
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(referrals.status, input.status as any));
      if (input.type) conditions.push(eq(referrals.type, input.type as any));
      const results = await db.select().from(referrals)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(referrals.createdAt))
        .limit(input.limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(referrals)
        .where(conditions.length ? and(...conditions) : undefined);
      return { referrals: results, total };
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number().optional(),
      referrerId: z.number().optional(),
      type: z.enum(["Referral", "Upsell"]).default("Referral"),
      referredName: z.string().optional(),
      referredEmail: z.string().optional(),
      referredPhone: z.string().optional(),
      program: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const referrerId = input.referrerId ?? input.customerId;
      if (!referrerId) throw new Error("referrerId or customerId required");
      const { customerId, ...rest } = input;
      await db.insert(referrals).values({ ...rest, referrerId, agentId: ctx.user.id });
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["Pending", "Contacted", "Converted", "Lost"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(referrals).set({ status: input.status }).where(eq(referrals.id, input.id));
      return { success: true };
    }),

  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, converted: 0, pending: 0 };
    const [total] = await db.select({ count: count() }).from(referrals);
    const [converted] = await db.select({ count: count() }).from(referrals).where(eq(referrals.status, "Converted"));
    const [pending] = await db.select({ count: count() }).from(referrals).where(eq(referrals.status, "Pending"));
    return { total: total.count, converted: converted.count, pending: pending.count };
  }),
});

// ─── Productivity Router ──────────────────────────────────────────────────────
const productivityRouter = router({
  getAgentMetrics: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const targetId = input.agentId ?? ctx.user.id;
      const conditions = [eq(agentMetrics.agentId, targetId)];
      if (input.startDate) conditions.push(gte(agentMetrics.date, input.startDate));
      if (input.endDate) conditions.push(lte(agentMetrics.date, input.endDate));
      return db.select().from(agentMetrics)
        .where(and(...conditions))
        .orderBy(desc(agentMetrics.date))
        .limit(30);
    }),

  getTeamOverview: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    // Get all agents
    const agents = await db.select().from(users).where(eq(users.role, "Agent"));
    const result = [];
    for (const agent of agents) {
      const metrics = await db.select().from(agentMetrics)
        .where(and(
          eq(agentMetrics.agentId, agent.id),
          gte(agentMetrics.date, sevenDaysAgo),
          lte(agentMetrics.date, today!)
        ));
      const avgQuality = metrics.length ? metrics.reduce((a, m) => a + (m.qualityScore ?? 0), 0) / metrics.length : null;
      const avgCsat = metrics.length ? metrics.reduce((a, m) => a + (m.csatScore ?? 0), 0) / metrics.length : null;
      const totalConvs = metrics.reduce((a, m) => a + (m.conversationsCount ?? 0), 0);
      const avgFrt = metrics.length ? metrics.reduce((a, m) => a + (m.firstResponseTimeAvg ?? 0), 0) / metrics.length : null;
      result.push({
        agent,
        qualityScore: avgQuality ? Math.round(avgQuality) : null,
        csatScore: avgCsat ? Math.round(avgCsat * 10) / 10 : null,
        conversationsCount: totalConvs,
        firstResponseTime: avgFrt ? Math.round(avgFrt) : null,
      });
    }
    return result;
  }),

  getAgentSummary: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const targetId = input.agentId ?? ctx.user.id;
      const conditions: any[] = [eq(agentMetrics.agentId, targetId)];
      if (input.startDate) conditions.push(gte(agentMetrics.date, input.startDate));
      if (input.endDate) conditions.push(lte(agentMetrics.date, input.endDate));
      const rows = await db.select().from(agentMetrics).where(and(...conditions));
      if (!rows.length) return { avgFirstResponseTime: null, avgResolutionTime: null, avgCsat: null, avgQuality: null, totalConversations: 0, totalClosed: 0 };
      const avg = (key: keyof typeof rows[0]) => { const vals = rows.map(r => r[key] as number | null).filter(v => v != null) as number[]; return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; };
      return {
        avgFirstResponseTime: avg('firstResponseTimeAvg'),
        avgResolutionTime: avg('avgResolutionTime'),
        avgCsat: avg('csatScore'),
        avgQuality: avg('qualityScore'),
        totalConversations: rows.reduce((a, r) => a + (r.conversationsCount ?? 0), 0),
        totalClosed: rows.reduce((a, r) => a + (r.conversationsClosed ?? 0), 0),
      };
    }),
  upsertDailyMetrics: protectedProcedure
    .input(z.object({
      date: z.string(),
      firstResponseTimeAvg: z.number().optional(),
      avgResolutionTime: z.number().optional(),
      csatScore: z.number().optional(),
      qualityScore: z.number().optional(),
      conversationsCount: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const existing = await db.select().from(agentMetrics)
        .where(and(eq(agentMetrics.agentId, ctx.user.id), eq(agentMetrics.date, input.date)))
        .limit(1);
      if (existing.length) {
        await db.update(agentMetrics).set(input).where(eq(agentMetrics.id, existing[0].id));
      } else {
        await db.insert(agentMetrics).values({ ...input, agentId: ctx.user.id });
      }
      return { success: true };
    }),

  // Advanced metrics: backlog, FCR, SLA, leaderboard
  getAdvancedMetrics: protectedProcedure
    .input(z.object({ days: z.number().default(7) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { backlog: { over24h: 0, over48h: 0, over72h: 0 }, fcr: 0, slaCompliance: 0, leaderboard: [] };
      const now = new Date();
      const cutoff24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const cutoff48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const cutoff72 = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      // Backlog: open conversations older than thresholds
      const openConvs = await db.select().from(conversations).where(eq(conversations.status, 'Open'));
      const backlog = {
        over24h: openConvs.filter(c => new Date(c.createdAt) < cutoff24).length,
        over48h: openConvs.filter(c => new Date(c.createdAt) < cutoff48).length,
        over72h: openConvs.filter(c => new Date(c.createdAt) < cutoff72).length,
      };
      // FCR: conversations closed without reopening (status changed to Closed once)
      const closedConvs = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.status, 'Closed'));
      const fcr = closedConvs.length > 0 ? Math.round((closedConvs.length / Math.max(closedConvs.length + openConvs.length, 1)) * 100) : 0;
      // SLA compliance: % conversations with first response < 1h (3600s)
      const allMetrics = await db.select().from(agentMetrics);
      const withFrt = allMetrics.filter(m => m.firstResponseTimeAvg != null);
      const slaOk = withFrt.filter(m => (m.firstResponseTimeAvg ?? 9999) <= 3600).length;
      const slaCompliance = withFrt.length > 0 ? Math.round((slaOk / withFrt.length) * 100) : 100;
      // Leaderboard: agents ranked by quality score
      const agents = await db.select().from(users).where(eq(users.role, 'Agent'));
      const leaderboard = [];
      for (const agent of agents) {
        const metrics = await db.select().from(agentMetrics).where(eq(agentMetrics.agentId, agent.id)).orderBy(desc(agentMetrics.date)).limit(input.days);
        if (!metrics.length) continue;
        const avgQ = metrics.reduce((a, m) => a + (m.qualityScore ?? 0), 0) / metrics.length;
        const avgCsat = metrics.reduce((a, m) => a + (m.csatScore ?? 0), 0) / metrics.length;
        const totalConvs = metrics.reduce((a, m) => a + (m.conversationsCount ?? 0), 0);
        leaderboard.push({ agentId: agent.id, name: agent.name ?? 'Agent', qualityScore: Math.round(avgQ), csatScore: Math.round(avgCsat * 10) / 10, conversations: totalConvs });
      }
      leaderboard.sort((a, b) => b.qualityScore - a.qualityScore);
      return { backlog, fcr, slaCompliance, leaderboard };
    }),

  getAiVsHumanStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { aiHandled: 0, humanHandled: 0, aiEscalated: 0, aiResolutionRate: 0 };
    const allConvs = await db.select({ id: conversations.id, handledByAi: conversations.handledByAi, status: conversations.status }).from(conversations);
    const aiHandled = allConvs.filter(c => c.handledByAi).length;
    const humanHandled = allConvs.filter(c => !c.handledByAi).length;
    const aiClosed = allConvs.filter(c => c.handledByAi && c.status === 'Closed').length;
    const aiResolutionRate = aiHandled > 0 ? Math.round((aiClosed / aiHandled) * 100) : 0;
    return { aiHandled, humanHandled, aiEscalated: 0, aiResolutionRate };
  }),

  exportKpiCsv: protectedProcedure
    .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { csv: '' };
      const agents = await db.select().from(users).where(eq(users.role, 'Agent'));
      const rows: string[] = ['Agent,Date,Conversations,Closed,First Response Time (s),Avg Resolution Time (s),CSAT Score,Quality Score'];
      for (const agent of agents) {
        const conditions: any[] = [eq(agentMetrics.agentId, agent.id)];
        if (input.startDate) conditions.push(gte(agentMetrics.date, input.startDate));
        if (input.endDate) conditions.push(lte(agentMetrics.date, input.endDate));
        const metrics = await db.select().from(agentMetrics).where(and(...conditions)).orderBy(agentMetrics.date);
        for (const m of metrics) {
          rows.push(`"${agent.name ?? 'Agent'}",${m.date},${m.conversationsCount ?? 0},${m.conversationsClosed ?? 0},${m.firstResponseTimeAvg ?? ''},${m.avgResolutionTime ?? ''},${m.csatScore ?? ''},${m.qualityScore ?? ''}`);
        }
      }
      return { csv: rows.join('\n') };
    }),
});
// ─── Users Router ──────────────────────────────────────────────────────────────
const usersRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: users.id, name: users.name, email: users.email,
      role: users.role, isActive: users.isActive, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn,
    }).from(users).orderBy(users.name);
  }),

  updateRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["Admin", "Manager", "Agent"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true };
    }),

  toggleActive: adminProcedure
    .input(z.object({ userId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(users).set({ isActive: input.isActive }).where(eq(users.id, input.userId));
      return { success: true };
    }),
});

// ─── GHL Integration Router ───────────────────────────────────────────────────
const ghlRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [settings] = await db.select().from(ghlSettings).where(eq(ghlSettings.userId, ctx.user.id)).limit(1);
    return settings ?? null;
  }),

  saveSettings: protectedProcedure
    .input(z.object({
      locationId: z.string().optional(),
      accessToken: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const existing = await db.select().from(ghlSettings).where(eq(ghlSettings.userId, ctx.user.id)).limit(1);
      if (existing.length) {
        await db.update(ghlSettings).set({ ...input, isConnected: true }).where(eq(ghlSettings.userId, ctx.user.id));
      } else {
        await db.insert(ghlSettings).values({ ...input, userId: ctx.user.id, isConnected: true });
      }
      return { success: true };
    }),

  syncContact: protectedProcedure
    .input(z.object({
      ghlContactId: z.string(),
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      program: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const existing = await db.select().from(customers).where(eq(customers.ghlContactId, input.ghlContactId)).limit(1);
      if (existing.length) {
        await db.update(customers).set({ ...input, ghlSyncedAt: new Date() }).where(eq(customers.ghlContactId, input.ghlContactId));
      } else {
        await db.insert(customers).values({ ...input, status: "New", ghlSyncedAt: new Date() });
      }
      return { success: true };
    }),
});

// ─── Upsell Router ────────────────────────────────────────────────────────────
const upsellRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), type: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { referrals: [], total: 0 };
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(referrals.status, input.status as any));
      if (input.type) conditions.push(eq(referrals.type, input.type as any));
      const results = await db.select().from(referrals)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(referrals.createdAt))
        .limit(input.limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(referrals)
        .where(conditions.length ? and(...conditions) : undefined);
      return { referrals: results, total };
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number().optional(),
      referrerId: z.number().optional(),
      type: z.enum(["Referral", "Upsell"]).default("Referral"),
      referredName: z.string().optional(),
      referredEmail: z.string().optional(),
      referredPhone: z.string().optional(),
      program: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const referrerId = input.referrerId ?? input.customerId;
      if (!referrerId) throw new Error("referrerId or customerId required");
      const { customerId, ...rest } = input;
      await db.insert(referrals).values({ ...rest, referrerId, agentId: ctx.user.id });
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["Identified", "Presented", "Accepted", "Declined"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(upsellOpportunities).set({ status: input.status }).where(eq(upsellOpportunities.id, input.id));
      return { success: true };
    }),
});

// ─── Digital Manager Guru Router ────────────────────────────────────────────
const guruRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(guruSettings)
      .where(eq(guruSettings.userId, ctx.user.id))
      .limit(1);
    return result[0] || null;
  }),

  saveSettings: adminProcedure
    .input(z.object({
      apiToken: z.string().optional(),
      webhookSecret: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const existing = await db.select().from(guruSettings)
        .where(eq(guruSettings.userId, ctx.user.id)).limit(1);
      if (existing.length) {
        await db.update(guruSettings).set({
          apiToken: input.apiToken ?? existing[0].apiToken,
          webhookSecret: input.webhookSecret ?? existing[0].webhookSecret,
          isActive: input.isActive ?? existing[0].isActive,
        }).where(eq(guruSettings.userId, ctx.user.id));
      } else {
        await db.insert(guruSettings).values({
          userId: ctx.user.id,
          apiToken: input.apiToken,
          webhookSecret: input.webhookSecret,
          isActive: input.isActive ?? false,
        });
      }
      return { success: true };
    }),

  getWebhookEvents: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(guruWebhookEvents)
        .orderBy(desc(guruWebhookEvents.createdAt))
        .limit(input.limit);
    }),

  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, approved: 0, canceled: 0, lastEventAt: null };
    const [total] = await db.select({ count: count() }).from(guruWebhookEvents);
    const [approved] = await db.select({ count: count() }).from(guruWebhookEvents)
      .where(eq(guruWebhookEvents.action, "created"));
    const [canceled] = await db.select({ count: count() }).from(guruWebhookEvents)
      .where(eq(guruWebhookEvents.action, "churned"));
    const [lastEvent] = await db.select({ createdAt: guruWebhookEvents.createdAt })
      .from(guruWebhookEvents).orderBy(desc(guruWebhookEvents.createdAt)).limit(1);
    return {
      total: total?.count || 0,
      approved: approved?.count || 0,
      canceled: canceled?.count || 0,
      lastEventAt: lastEvent?.createdAt || null,
    };
  }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
// ─── AI Agents Router ───────────────────────────────────────────────────────
const aiAgentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(aiAgents).orderBy(desc(aiAgents.createdAt));
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, input.id)).limit(1);
    return agent ?? null;
  }),
  create: adminProcedure.input(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    channel: z.enum(["whatsapp", "email", "instagram", "telegram", "all"]).default("all"),
    systemPrompt: z.string().optional(),
    greetingMessage: z.string().optional(),
    escalationMessage: z.string().optional(),
    escalationThreshold: z.number().min(0).max(100).default(70),
    maxAutoReplies: z.number().min(1).max(50).default(5),
    avatarUrl: z.string().optional(),
    programFilter: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.insert(aiAgents).values({ ...input, createdBy: ctx.user.id });
    return { success: true };
  }),
  update: adminProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    channel: z.enum(["whatsapp", "email", "instagram", "telegram", "all"]).optional(),
    isActive: z.boolean().optional(),
    systemPrompt: z.string().optional(),
    greetingMessage: z.string().optional(),
    escalationMessage: z.string().optional(),
    escalationThreshold: z.number().min(0).max(100).optional(),
    maxAutoReplies: z.number().min(1).max(50).optional(),
    avatarUrl: z.string().optional(),
    programFilter: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const { id, ...data } = input;
    await db.update(aiAgents).set(data).where(eq(aiAgents.id, id));
    return { success: true };
  }),
  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.delete(aiAgents).where(eq(aiAgents.id, input.id));
    return { success: true };
  }),
  // Knowledge Base
  listKB: protectedProcedure.input(z.object({ agentId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(knowledgeBase)
      .where(eq(knowledgeBase.agentId, input.agentId))
      .orderBy(desc(knowledgeBase.createdAt));
  }),
  addKB: adminProcedure.input(z.object({
    agentId: z.number(),
    title: z.string().min(1),
    content: z.string().min(1),
    category: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.insert(knowledgeBase).values({ ...input, createdBy: ctx.user.id });
    return { success: true };
  }),
  updateKB: adminProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    content: z.string().optional(),
    category: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const { id, ...data } = input;
    await db.update(knowledgeBase).set(data).where(eq(knowledgeBase.id, id));
    return { success: true };
  }),
  deleteKB: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, input.id));
    return { success: true };
  }),
  // AI auto-reply for a conversation
  autoReply: protectedProcedure.input(z.object({
    conversationId: z.number(),
    agentId: z.number(),
    customerMessage: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    // Get agent
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, input.agentId)).limit(1);
    if (!agent) throw new Error("Agent not found");
    // Get knowledge base
    const kb = await db.select().from(knowledgeBase)
      .where(and(eq(knowledgeBase.agentId, input.agentId), eq(knowledgeBase.isActive, true)))
      .limit(20);
    const kbContext = kb.map(e => `Q: ${e.title}\nA: ${e.content}`).join("\n\n");
    // Get recent conversation history
    const history = await db.select().from(messages)
      .where(and(eq(messages.conversationId, input.conversationId), eq(messages.isInternal, false)))
      .orderBy(desc(messages.createdAt)).limit(10);
    const historyText = history.reverse().map(m => `${m.senderType === 'customer' ? 'Cliente' : 'Agente'}: ${m.content}`).join("\n");
    // Fetch customer name for personalisation
    const [convForName] = await db.select({ customerId: conversations.customerId }).from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
    let customerFirstName = "";
    if (convForName?.customerId) {
      const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, convForName.customerId)).limit(1);
      if (cust?.name) customerFirstName = cust.name.split(" ")[0];
    }
    const basePrompt = agent.systemPrompt ||
      `Você é um assistente de suporte ao cliente profissional e empático. Responda de forma clara, objetiva e cordial. Se não souber a resposta, escale para um agente humano.`;
    const customerCtx = customerFirstName
      ? `\n\nNome do cliente nesta conversa: ${customerFirstName}. Use o nome real ao se dirigir ao cliente — NUNCA escreva "[Nome do Cliente]" ou qualquer placeholder.`
      : `\n\nUse o nome do cliente caso ele apareça no histórico — NUNCA escreva "[Nome do Cliente]" ou qualquer placeholder.`;
    const systemPrompt = basePrompt + customerCtx;
    const response = await invokeLLM({
      messages: [
        { role: "system", content: `${systemPrompt}\n\nBase de conhecimento:\n${kbContext || 'Nenhuma entrada disponível.'}\n\nHistórico recente:\n${historyText}` },
        { role: "user", content: input.customerMessage },
      ],
    });
    const aiReply = (response.choices[0]?.message?.content as string) ?? "Desculpe, não consegui processar sua mensagem.";
    // Save AI message
    await db.insert(messages).values({
      conversationId: input.conversationId,
      senderType: "ai",
      content: aiReply,
      senderId: null,
    });
    // Mark conversation as handled by AI
    await db.update(conversations).set({ handledByAi: true, aiAgentId: input.agentId }).where(eq(conversations.id, input.conversationId));

    // ─ Knowledge Capture: classify the customer message asynchronously ─
    // Fire-and-forget: don't block the reply
    (async () => {
      try {
        const classifyResponse = await invokeLLM({
          messages: [
            { role: "system", content: `Você é um classificador de perguntas de suporte ao cliente. Analise a mensagem do cliente e determine:
1. Se é uma PERGUNTA ou DÚNIDA (não uma saudacão, agradecimento, reclamação vaga ou mensagem social)
2. A versão normalizada da pergunta (sem nome próprio, sem dados pessoais, genérica)
3. A categoria mais adequada

Responda APENAS com JSON válido no formato:
{"isQuestion": boolean, "normalizedQuestion": "string", "category": "acesso_plataforma|conteudo_modulo|financeiro_reembolso|certificado|comunidade|suporte_tecnico|resultado_produto|outros"}` },
            { role: "user", content: input.customerMessage },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "question_classification",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  isQuestion: { type: "boolean" },
                  normalizedQuestion: { type: "string" },
                  category: { type: "string" },
                },
                required: ["isQuestion", "normalizedQuestion", "category"],
                additionalProperties: false,
              },
            },
          },
        });
        const classification = JSON.parse(classifyResponse.choices[0]?.message?.content as string);
        if (classification.isQuestion && classification.normalizedQuestion?.length > 5) {
          const dbInner = await getDb();
          if (!dbInner) return;
          const [existing] = await dbInner.select().from(knowledgeCaptures)
            .where(eq(knowledgeCaptures.normalizedQuestion, classification.normalizedQuestion)).limit(1);
          if (existing) {
            const ids = (existing.sourceConversationIds as number[] ?? []);
            if (!ids.includes(input.conversationId)) ids.push(input.conversationId);
            await dbInner.update(knowledgeCaptures).set({
              frequency: existing.frequency + 1,
              lastSeenAt: new Date(),
              sourceConversationIds: ids,
            }).where(eq(knowledgeCaptures.id, existing.id));
          } else {
            await dbInner.insert(knowledgeCaptures).values({
              question: input.customerMessage.slice(0, 500),
              normalizedQuestion: classification.normalizedQuestion.slice(0, 512),
              category: classification.category as any,
              frequency: 1,
              lastSeenAt: new Date(),
              status: 'pending',
              sourceConversationIds: [input.conversationId],
            });
          }
        }
      } catch (kErr) {
        console.error('[KnowledgeCapture] Error:', kErr);
      }
    })();

    return { reply: aiReply, agentName: agent.name };
  }),
  // Escalate to human (human takes control from AI)
  escalate: protectedProcedure.input(z.object({
    conversationId: z.number(),
    reason: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.update(conversations).set({ handledByAi: false, assignedAgentId: ctx.user.id }).where(eq(conversations.id, input.conversationId));
    await db.insert(messages).values({
      conversationId: input.conversationId,
      senderType: "system",
      content: `👤 Agente ${ctx.user.name ?? 'da equipe'} assumiu o controle da conversa${input.reason ? ` — ${input.reason}` : '.'}`,
      senderId: null,
    });
    return { success: true };
  }),

  // Return to AI (human hands back control to AI agent)
  returnToAi: protectedProcedure.input(z.object({
    conversationId: z.number(),
    agentId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    // Find the AI agent assigned to this conversation, or use the provided agentId
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
    const aiAgentId = input.agentId ?? conv?.aiAgentId ?? null;
    await db.update(conversations).set({ handledByAi: true, aiAgentId, assignedAgentId: null }).where(eq(conversations.id, input.conversationId));
    await db.insert(messages).values({
      conversationId: input.conversationId,
      senderType: "system",
      content: `🤖 ${ctx.user.name ?? 'Agente'} devolveu a conversa para a IA. Atendimento automático retomado.`,
      senderId: null,
    });
    // Send greeting message if agent has one configured
    if (aiAgentId) {
      const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, aiAgentId)).limit(1);
      if (agent?.greetingMessage) {
        // Get customer name and program for personalization
        const [customerFull] = conv?.customerId
          ? await db.select({ name: customers.name, program: customers.program }).from(customers).where(eq(customers.id, conv.customerId)).limit(1)
          : [null];
        const greeting = agent.greetingMessage
          .replace(/\{\{nome\}\}/gi, customerFull?.name ?? 'cliente')
          .replace(/\{\{name\}\}/gi, customerFull?.name ?? 'cliente')
          .replace(/\{\{produto\}\}/gi, customerFull?.program ?? '')
          .replace(/\{\{product\}\}/gi, customerFull?.program ?? '');
        await db.insert(messages).values({ conversationId: input.conversationId, senderType: "ai", content: greeting, senderId: null });
        try { await sendMessageByConversation({ conversationId: input.conversationId, content: greeting }); } catch (_) {}
      }
    }
    return { success: true };
  }),
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalAgents: 0, activeAgents: 0, aiHandledConversations: 0, escalations: 0 };
    const [totalRes] = await db.select({ count: count() }).from(aiAgents);
    const [activeRes] = await db.select({ count: count() }).from(aiAgents).where(eq(aiAgents.isActive, true));
    const [aiHandledRes] = await db.select({ count: count() }).from(conversations).where(eq(conversations.handledByAi, true));
    const [escalationsRes] = await db.select({ count: count() }).from(aiAgentLogs).where(eq(aiAgentLogs.event, 'escalated'));
    return {
      totalAgents: totalRes?.count ?? 0,
      activeAgents: activeRes?.count ?? 0,
      aiHandledConversations: aiHandledRes?.count ?? 0,
      escalations: escalationsRes?.count ?? 0,
    };
  }),
  // Get per-agent activity log
  getActivityLog: protectedProcedure.input(z.object({
    agentId: z.number(),
    limit: z.number().min(1).max(100).default(50),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { logs: [], stats: { autoReplies: 0, escalations: 0, resolved: 0, avgResponseMs: 0, avgQualityScore: 0 } };
    const logs = await db.select().from(aiAgentLogs)
      .where(eq(aiAgentLogs.agentId, input.agentId))
      .orderBy(desc(aiAgentLogs.createdAt))
      .limit(input.limit);
    // Aggregate stats
    const autoReplies = logs.filter(l => l.event === 'auto_reply').length;
    const escalations = logs.filter(l => l.event === 'escalated').length;
    const resolved = logs.filter(l => l.event === 'resolved').length;
    const withResponseTime = logs.filter(l => l.responseTimeMs != null);
    const avgResponseMs = withResponseTime.length > 0
      ? Math.round(withResponseTime.reduce((a, l) => a + (l.responseTimeMs ?? 0), 0) / withResponseTime.length)
      : 0;
    const withQuality = logs.filter(l => l.qualityScore != null);
    const avgQualityScore = withQuality.length > 0
      ? Math.round(withQuality.reduce((a, l) => a + (l.qualityScore ?? 0), 0) / withQuality.length)
      : 0;
    return { logs, stats: { autoReplies, escalations, resolved, avgResponseMs, avgQualityScore } };
  }),
  // Log an AI agent event (called internally)
  logActivity: protectedProcedure.input(z.object({
    agentId: z.number(),
    conversationId: z.number().optional(),
    event: z.enum(['auto_reply', 'escalated', 'greeted', 'resolved']),
    channel: z.string().optional(),
    customerName: z.string().optional(),
    responseTimeMs: z.number().optional(),
    qualityScore: z.number().optional(),
    note: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.insert(aiAgentLogs).values(input);
    return { success: true };
  }),

  seedDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const existing = await db.select().from(aiAgents).limit(1);
    if (existing.length > 0) return { skipped: true, message: 'Agentes já existem' };
    const defaultAgents = [
      {
        name: 'Sofia',
        description: 'Agente de Onboarding — Recebe novos clientes, guia os primeiros 30 dias e garante ativação do produto',
        channel: 'whatsapp' as const,
        systemPrompt: `Você é Sofia, a assistente de Customer Success especializada em onboarding. Seu objetivo é garantir que o cliente ative e comece a usar o produto nos primeiros 30 dias. Seja calorosa, empática e proativa. Sempre personalize pelo nome do cliente. Quando identificar dúvidas técnicas, resolva-as ou escale para o time. Comemore as conquistas do cliente.`,
        greetingMessage: 'Olá, {{nome}}! 👋 Sou a Sofia, sua assistente de sucesso. Estou aqui para garantir que você aproveite ao máximo o programa. Como posso te ajudar hoje?',
        escalationMessage: 'Vou conectar você com um especialista humano agora. Um momento!',
        escalationThreshold: 70,
        maxAutoReplies: 10,
        isActive: true,
        createdBy: ctx.user.id,
      },
      {
        name: 'Luna',
        description: 'Agente de Engajamento — Monitora engajamento, envia conteúdo relevante e faz check-ins proativos',
        channel: 'whatsapp' as const,
        systemPrompt: `Você é Luna, a assistente de engajamento e relacionamento. Seu objetivo é manter o cliente engajado e motivado ao longo de toda a jornada. Envie conteúdos relevantes, comemore marcos de progresso e faça check-ins periódicos. Seja inspiradora e motivacional. Identifique sinais de desengajamento e aja proativamente.`,
        greetingMessage: 'Oi, {{nome}}! 🌟 Sou a Luna. Estou aqui para te ajudar a extrair o máximo do programa. Vamos juntos?',
        escalationMessage: 'Deixa eu conectar você com alguém do nosso time para te ajudar melhor!',
        escalationThreshold: 65,
        maxAutoReplies: 8,
        isActive: true,
        createdBy: ctx.user.id,
      },
      {
        name: 'Sentinel',
        description: 'Agente de Risco — Detecta sinais de churn e age antes do problema escalar',
        channel: 'whatsapp' as const,
        systemPrompt: `Você é Sentinel, o agente especializado em prevenção de churn. Seu objetivo é identificar e resolver problemas antes que o cliente desista. Quando ativado, significa que o cliente está em risco. Seja empático, ouça as frustrações, ofereça soluções concretas e escale para humano quando necessário. Nunca minimize os problemas do cliente.`,
        greetingMessage: 'Olá, {{nome}}. Percebi que você pode estar passando por alguma dificuldade. Estou aqui para ajudar. O que está acontecendo?',
        escalationMessage: 'Vou chamar um especialista agora para resolver isso com você pessoalmente.',
        escalationThreshold: 50,
        maxAutoReplies: 5,
        isActive: true,
        createdBy: ctx.user.id,
      },
      {
        name: 'Max',
        description: 'Agente de Expansão — Identifica clientes prontos para upsell e indicações',
        channel: 'whatsapp' as const,
        systemPrompt: `Você é Max, o agente de expansão e crescimento. Seu objetivo é identificar clientes satisfeitos e apresentar oportunidades de upsell, upgrade ou indicação. Só aja quando o cliente demonstrar satisfação (NPS 9-10 ou marcos de sucesso). Seja consultivo, não vendedor. Apresente o valor antes do preço.`,
        greetingMessage: 'Oi, {{nome}}! 🚀 Sou o Max. Vi que você está tendo ótimos resultados! Posso te mostrar como acelerar ainda mais?',
        escalationMessage: 'Vou te conectar com nosso time comercial para uma conversa personalizada!',
        escalationThreshold: 80,
        maxAutoReplies: 6,
        isActive: true,
        createdBy: ctx.user.id,
      },
      {
        name: 'Renata',
        description: 'Agente de Renovação — Inicia o processo de renovação 60 dias antes e remove objeções',
        channel: 'whatsapp' as const,
        systemPrompt: `Você é Renata, a agente especializada em renovação. Seu objetivo é garantir que o cliente renove antes do vencimento. Comece a conversa 60 dias antes, celebre os resultados alcançados, apresente o valor do próximo ciclo e remova objeções. Seja estratégica: foque em resultados, não em preço. Escale para humano quando houver objeção de preço ou insatisfação grave.`,
        greetingMessage: 'Olá, {{nome}}! 🎯 Sou a Renata. Sua assinatura está se aproximando do fim. Vamos conversar sobre os resultados incríveis que você alcançou?',
        escalationMessage: 'Vou conectar você com nosso time para uma proposta personalizada de renovação!',
        escalationThreshold: 60,
        maxAutoReplies: 8,
        isActive: true,
        createdBy: ctx.user.id,
      },
    ];
    await db.insert(aiAgents).values(defaultAgents);
    return { success: true, count: defaultAgents.length };
  }),
});
// ─── Channel Settings Routerr ─────────────────────────────────────────────────
const channelSettingsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(channelSettings);
  }),
  get: protectedProcedure.input(z.object({
    channel: z.enum(["whatsapp", "email", "instagram", "telegram"]),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, input.channel)).limit(1);
    return setting ?? null;
  }),
  save: adminProcedure.input(z.object({
    channel: z.enum(["whatsapp", "email", "instagram", "telegram"]),
    isActive: z.boolean().optional(),
    waPhoneNumberId: z.string().optional(),
    waToken: z.string().optional(),
    waVerifyToken: z.string().optional(),
    waBusinessAccountId: z.string().optional(),
    waProvider: z.enum(["meta", "zapi", "evolution"]).optional(), // "evolution" faltava e quebrava o save do Evolution
    emailHost: z.string().optional(),
    emailPort: z.number().int().min(1).max(65535).optional(),
    emailUser: z.string().email("E-mail do remetente inválido").optional(), // valida formato do e-mail
    emailPassword: z.string().optional(),
    emailFromName: z.string().optional(),
    emailImapHost: z.string().optional(),
    emailImapPort: z.number().int().min(1).max(65535).optional(),
    igPageId: z.string().optional(),
    igAccessToken: z.string().optional(),
    tgBotToken: z.string().optional(),
    tgWebhookSecret: z.string().optional(),
    slaFirstResponseMinutes: z.number().optional(),
    slaResolutionHours: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const { channel, ...data } = input;
    const existing = await db.select().from(channelSettings).where(eq(channelSettings.channel, channel)).limit(1);

    // Ao ATIVAR o e-mail, exige que host/usuário/senha existam (no payload ou já salvos).
    // Antes o canal ficava "ativo" mesmo sem SMTP configurado.
    if (channel === "email" && data.isActive) {
      const effHost = data.emailHost ?? existing[0]?.emailHost;
      const effUser = data.emailUser ?? existing[0]?.emailUser;
      const effPassword = data.emailPassword ?? existing[0]?.emailPassword;
      const missing: string[] = [];
      if (!effHost) missing.push("Host SMTP");
      if (!effUser) missing.push("Usuário/e-mail");
      if (!effPassword) missing.push("Senha");
      if (missing.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Preencha antes de ativar: ${missing.join(", ")}.` });
      }
    }

    if (existing.length > 0) {
      await db.update(channelSettings).set(data).where(eq(channelSettings.channel, channel));
    } else {
      await db.insert(channelSettings).values({ channel, ...data });
    }
    return { success: true };
  }),
  getStatus: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { whatsapp: false, email: false, instagram: false, telegram: false };
    const settings = await db.select().from(channelSettings);
    const statusMap: Record<string, boolean> = {};
    for (const s of settings) { statusMap[s.channel] = s.isActive; }
    return {
      whatsapp: statusMap['whatsapp'] ?? false,
      email: statusMap['email'] ?? false,
      instagram: statusMap['instagram'] ?? false,
      telegram: statusMap['telegram'] ?? false,
    };
  }),
  // Returns whether WhatsApp is fully configured and ready to send messages
  getWhatsAppReadiness: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { ready: false, reason: "DB indisponível" };
    const [s] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
    if (!s) return { ready: false, reason: "Canal WhatsApp não configurado" };
    if (!s.isActive) return { ready: false, reason: "Canal WhatsApp inativo" };
    if (s.waProvider === 'zapi') {
      if (!s.zapiInstanceId || !s.zapiToken) return { ready: false, reason: "Z-API: Instance ID ou Token ausente" };
    } else {
      if (!s.waPhoneNumberId || !s.waToken) return { ready: false, reason: "Meta API: Phone Number ID ou Token ausente" };
    }
    return { ready: true, reason: null };
  }),
  listTemplates: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
    if (!setting?.waToken || !setting?.waBusinessAccountId) return [];
    return fetchMetaTemplates(setting.waToken, setting.waBusinessAccountId);
  }),
  sendTemplate: protectedProcedure.input(z.object({
    to: z.string(),
    templateName: z.string(),
    languageCode: z.string().default('pt_BR'),
    variables: z.array(z.string()).default([]),
    conversationId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
    if (!setting?.waToken || !setting?.waPhoneNumberId) throw new Error('WhatsApp não configurado');
    const components = input.variables.length > 0 ? [{
      type: 'body',
      parameters: input.variables.map(v => ({ type: 'text', text: v })),
    }] : [];
    const result = await sendWhatsAppTemplate(
      input.to,
      input.templateName,
      input.languageCode,
      components,
      setting.waPhoneNumberId,
      setting.waToken
    );
    if (!result.success) throw new Error(result.error ?? 'Falha ao enviar template');
    if (input.conversationId) {
      await db.insert(messages).values({
        conversationId: input.conversationId,
        content: `[Template: ${input.templateName}] ${input.variables.join(', ')}`,
        senderType: 'agent',
        senderId: ctx.user.id,
      });
    }
    return { success: true, externalId: result.externalId };
  }),
  createTemplate: adminProcedure.input(z.object({
    name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/, 'Apenas letras minúsculas, números e underscore'),
    category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
    language: z.string().default('pt_BR'),
    bodyText: z.string().min(1).max(1024),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    buttons: z.array(z.object({
      type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
      text: z.string(),
      url: z.string().optional(),
      phone_number: z.string().optional(),
    })).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
    if (!setting?.waToken || !setting?.waBusinessAccountId) throw new Error('WhatsApp não configurado');
    const components: any[] = [];
    if (input.headerText) components.push({ type: 'HEADER', format: 'TEXT', text: input.headerText });
    components.push({ type: 'BODY', text: input.bodyText });
    if (input.footerText) components.push({ type: 'FOOTER', text: input.footerText });
    if (input.buttons && input.buttons.length > 0) components.push({ type: 'BUTTONS', buttons: input.buttons });
    const result = await createMetaTemplate(setting.waToken, setting.waBusinessAccountId, {
      name: input.name,
      category: input.category,
      language: input.language,
      components,
    });
    return result;
  }),
  deleteTemplate: adminProcedure.input(z.object({
    name: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
    if (!setting?.waToken || !setting?.waBusinessAccountId) throw new Error('WhatsApp não configurado');
    const ok = await deleteMetaTemplate(setting.waToken, setting.waBusinessAccountId, input.name);
    return { success: ok };
  }),
  testConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
    if (!setting?.waToken || !setting?.waPhoneNumberId) throw new Error('Credenciais não configuradas');
    const res = await fetch(`https://graph.facebook.com/v19.0/${setting.waPhoneNumberId}`, {
      headers: { Authorization: `Bearer ${setting.waToken}` },
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    return { success: true, displayPhoneNumber: json?.display_phone_number, verifiedName: json?.verified_name };
  }),

  // Valida as credenciais de e-mail SALVAS abrindo conexão real com a Titan:
  // SMTP via transporter.verify() e, se houver IMAP configurado, um connect/logout.
  // É isto que faltava — antes não havia como testar o e-mail.
  testEmailConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [s] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'email')).limit(1);
    if (!s?.emailHost || !s?.emailUser || !s?.emailPassword) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Configure Host SMTP, Usuário e Senha antes de testar.' });
    }
    const port = s.emailPort ?? 465;

    // 1) SMTP (envio)
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: s.emailHost,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: s.emailUser, pass: s.emailPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
      await transporter.verify();
    } catch (err: any) {
      throw new TRPCError({ code: 'BAD_GATEWAY', message: `SMTP falhou: ${err?.message ?? 'não foi possível conectar'}` });
    }

    // 2) IMAP (recebimento) — só testa se um host de IMAP estiver configurado
    let imap: 'ok' | 'skipped' | string = 'skipped';
    if (s.emailImapHost) {
      try {
        const { ImapFlow } = await import('imapflow');
        const client = new ImapFlow({
          host: s.emailImapHost,
          port: s.emailImapPort ?? 993,
          secure: true,
          auth: { user: s.emailUser, pass: s.emailPassword },
          logger: false,
        });
        await client.connect();
        await client.logout();
        imap = 'ok';
      } catch (err: any) {
        imap = err?.message ?? 'falha ao conectar no IMAP';
      }
    }

    return { success: true as const, smtp: 'ok' as const, imap };
  }),

  // QR Code reconnection endpoints
  getWhatsAppQRCode: protectedProcedure.query(async () => {
    const qrDataUrl = await generateWhatsAppQRCode();
    return { qrDataUrl };
  }),

  simulateConnect: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await simulateWhatsAppConnect(db as any);
    return { success: true };
  }),

  simulateDisconnect: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await simulateWhatsAppDisconnect(db as any);
    return { success: true };
  }),

  // Channel health dashboard
  getHealthStatus: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return getChannelHealthStatus(db as any);
  }),

  // ─── Evolution API QR Code ───────────────────────────────────────────────────
  evolutionGetQrCode: protectedProcedure
    .input(z.object({ instanceName: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
      if (!setting?.evolutionApiUrl || !setting?.evolutionApiKey) {
        throw new Error('Evolution API não configurada. Configure a URL e a API Key primeiro.');
      }
      const { evolutionApiUrl, evolutionApiKey } = setting;
      // First ensure the instance exists
      try {
        const createRes = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
          body: JSON.stringify({ instanceName: input.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
        });
        // 409 = already exists, that's fine
        if (!createRes.ok && createRes.status !== 409) {
          const err = await createRes.json().catch(() => ({})) as any;
          // Ignore "already exists" errors from different Evolution versions
          if (!err?.message?.toLowerCase().includes('already')) {
            console.warn('[Evolution QR] create instance warning:', err?.message);
          }
        }
      } catch (e) {
        // Ignore create errors — instance may already exist
      }
      // Fetch QR Code
      const qrRes = await fetch(`${evolutionApiUrl}/instance/connect/${input.instanceName}`, {
        headers: { 'apikey': evolutionApiKey },
      });
      if (!qrRes.ok) {
        const err = await qrRes.json().catch(() => ({})) as any;
        throw new Error(err?.message ?? `Erro ao buscar QR Code (HTTP ${qrRes.status})`);
      }
      const qrJson = await qrRes.json() as any;
      // Evolution API v2 returns { base64: "data:image/png;base64,..." } or { code: "...", base64: "..." }
      const base64 = qrJson?.base64 ?? qrJson?.qrcode?.base64 ?? null;
      const code = qrJson?.code ?? qrJson?.qrcode?.code ?? null;
      return { base64, code };
    }),

  evolutionGetStatus: protectedProcedure
    .input(z.object({ instanceName: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
      if (!setting?.evolutionApiUrl || !setting?.evolutionApiKey) {
        return { state: 'not_configured' as const };
      }
      try {
        const res = await fetch(`${setting.evolutionApiUrl}/instance/connectionState/${input.instanceName}`, {
          headers: { 'apikey': setting.evolutionApiKey },
        });
        if (!res.ok) return { state: 'disconnected' as const };
        const json = await res.json() as any;
        // state can be: open, connecting, close
        const state = json?.instance?.state ?? json?.state ?? 'disconnected';
        return { state: state === 'open' ? 'connected' as const : state === 'connecting' ? 'connecting' as const : 'disconnected' as const };
      } catch {
        return { state: 'disconnected' as const };
      }
    }),

  evolutionDisconnect: adminProcedure
    .input(z.object({ instanceName: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [setting] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'whatsapp')).limit(1);
      if (!setting?.evolutionApiUrl || !setting?.evolutionApiKey) throw new Error('Evolution API não configurada');
      await fetch(`${setting.evolutionApiUrl}/instance/logout/${input.instanceName}`, {
        method: 'DELETE',
        headers: { 'apikey': setting.evolutionApiKey },
      });
      return { success: true };
    }),
});
// ─── Scheduled Messages Routerr ──────────────────────────────────────────────
const scheduledMessagesRouter = router({
  list: protectedProcedure
    .input(z.object({ conversationId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(scheduledMessages)
        .where(input.conversationId ? eq(scheduledMessages.conversationId, input.conversationId) : sql`1=1`)
        .orderBy(desc(scheduledMessages.scheduledAt));
      return rows;
    }),
  create: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      customerId: z.number().optional(),
      content: z.string().min(1),
      scheduledAt: z.date(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [result] = await db.insert(scheduledMessages).values({
        conversationId: input.conversationId,
        customerId: input.customerId,
        content: input.content,
        scheduledAt: input.scheduledAt,
        createdBy: ctx.user.id,
        status: 'pending',
      });
      return { id: (result as any).insertId };
    }),
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.update(scheduledMessages).set({ status: 'cancelled' }).where(eq(scheduledMessages.id, input.id));
      return { success: true };
    }),
  retry: protectedProcedure
    .input(z.object({ id: z.number(), scheduledAt: z.date().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      // Reset to pending, clear lastError, keep retryCount as-is
      await db.update(scheduledMessages).set({
        status: 'pending',
        lastError: null,
        scheduledAt: input.scheduledAt ?? new Date(Date.now() + 5 * 60 * 1000), // default: 5min from now
      }).where(eq(scheduledMessages.id, input.id));
      return { success: true };
    }),
});

// ─── Quick Replies Router ─────────────────────────────────────────────────────
const quickRepliesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(quickReplies).orderBy(quickReplies.title);
  }),
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(128),
      content: z.string().min(1),
      shortcut: z.string().max(32).optional(),
      isGlobal: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [result] = await db.insert(quickReplies).values({ ...input, createdBy: ctx.user.id });
      return { id: (result as any).insertId };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(128).optional(),
      content: z.string().min(1).optional(),
      shortcut: z.string().max(32).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const { id, ...data } = input;
      await db.update(quickReplies).set(data).where(eq(quickReplies.id, id));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(quickReplies).where(eq(quickReplies.id, input.id));
      return { success: true };
    }),
});

// ─── Tasks Router ─────────────────────────────────────────────────────────────
const tasksRouter = router({
  list: protectedProcedure
    .input(z.object({
      customerId: z.number().optional(),
      conversationId: z.number().optional(),
      assignedTo: z.number().optional(),
      status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
      team: z.enum(['IPL', 'MCM', 'RCC', 'Geral']).optional(),
      category: z.enum(['cliente', 'contrato', 'onboarding', 'reuniao', 'passagem', 'midia', 'contratacao', 'outro']).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.customerId) conditions.push(eq(tasks.customerId, input.customerId));
      if (input.conversationId) conditions.push(eq(tasks.conversationId, input.conversationId));
      if (input.assignedTo) conditions.push(eq(tasks.assignedTo, input.assignedTo));
      if (input.status) conditions.push(eq(tasks.status, input.status));
      if (input.team) conditions.push(eq(tasks.team, input.team));
      if (input.category) conditions.push(eq(tasks.category, input.category));
      const rows = await db.select({
        id: tasks.id,
        customerId: tasks.customerId,
        conversationId: tasks.conversationId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        assignedTo: tasks.assignedTo,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdBy: tasks.createdBy,
        team: tasks.team,
        category: tasks.category,
        meetingLink: tasks.meetingLink,
        googleCalendarEventId: tasks.googleCalendarEventId,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        customerName: customers.name,
        assignedUserName: users.name,
      }).from(tasks)
        .leftJoin(customers, eq(tasks.customerId, customers.id))
        .leftJoin(users, eq(tasks.assignedTo, users.id))
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
        .orderBy(desc(tasks.createdAt));
      return rows;
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number().optional(),
      conversationId: z.number().optional(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      assignedTo: z.number().optional(),
      dueDate: z.date().optional(),
      team: z.enum(['IPL', 'MCM', 'RCC', 'Geral']).optional(),
      category: z.enum(['cliente', 'contrato', 'onboarding', 'reuniao', 'passagem', 'midia', 'contratacao', 'outro']).optional(),
      meetingLink: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [result] = await db.insert(tasks).values({ ...input, createdBy: ctx.user.id, status: 'todo' });
      return { id: (result as any).insertId };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      assignedTo: z.number().nullable().optional(),
      dueDate: z.date().nullable().optional(),
      team: z.enum(['IPL', 'MCM', 'RCC', 'Geral']).optional(),
      category: z.enum(['cliente', 'contrato', 'onboarding', 'reuniao', 'passagem', 'midia', 'contratacao', 'outro']).optional(),
      meetingLink: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const { id, ...data } = input;
      const completedAt = data.status === 'done' ? new Date() : data.status ? null : undefined;
      const updateData: any = { ...data };
      if (completedAt !== undefined) updateData.completedAt = completedAt;
      await db.update(tasks).set(updateData).where(eq(tasks.id, id));
      return { success: true };
    }),
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const completedAt = input.status === 'done' ? new Date() : null;
      await db.update(tasks).set({ status: input.status, completedAt }).where(eq(tasks.id, input.id));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(tasks).where(eq(tasks.id, input.id));
      return { success: true };
    }),
  getPendingCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return 0;
    const [row] = await db.select({ count: count() }).from(tasks)
      .where(and(eq(tasks.assignedTo, ctx.user.id), eq(tasks.status, 'todo')));
    return row?.count ?? 0;
  }),
  getTeamStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      team: tasks.team,
      status: tasks.status,
      count: count(),
    }).from(tasks)
      .groupBy(tasks.team, tasks.status);
    return rows;
  }),
});

// ─── Task Attachments Router ──────────────────────────────────────────────────
const taskAttachmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(taskAttachments)
        .where(eq(taskAttachments.taskId, input.taskId))
        .orderBy(desc(taskAttachments.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      fileName: z.string(),
      fileUrl: z.string(),
      fileKey: z.string(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      attachmentType: z.enum(['contrato', 'reuniao', 'grupo', 'outro']).default('outro'),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [result] = await db.insert(taskAttachments).values({
        ...input,
        uploadedByUserId: ctx.user.id,
        uploadedByName: ctx.user.name ?? undefined,
      });
      return { id: (result as any).insertId };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(taskAttachments).where(eq(taskAttachments.id, input.id));
      return { success: true };
    }),
});

// ─── Client ROI Router ────────────────────────────────────────────────────────
const clientROIRouter = router({
  list: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(clientROI)
        .where(eq(clientROI.customerId, input.customerId))
        .orderBy(desc(clientROI.saleDate));
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      description: z.string().min(1).max(255),
      saleValue: z.number().default(0),
      profitValue: z.number().default(0),
      category: z.enum(['passagem', 'midia', 'contrato', 'upsell', 'outro']).default('outro'),
      saleDate: z.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [result] = await db.insert(clientROI).values({ ...input, createdByUserId: ctx.user.id });
      return { id: (result as any).insertId };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().min(1).max(255).optional(),
      saleValue: z.number().optional(),
      profitValue: z.number().optional(),
      category: z.enum(['passagem', 'midia', 'contrato', 'upsell', 'outro']).optional(),
      saleDate: z.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const { id, ...data } = input;
      await db.update(clientROI).set(data).where(eq(clientROI.id, id));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(clientROI).where(eq(clientROI.id, input.id));
      return { success: true };
    }),
  getSummary: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalSale: 0, totalProfit: 0, roiPercent: 0, entries: 0 };
      const rows = await db.select().from(clientROI).where(eq(clientROI.customerId, input.customerId));
      const totalSale = rows.reduce((s, r) => s + (r.saleValue ?? 0), 0);
      const totalProfit = rows.reduce((s, r) => s + (r.profitValue ?? 0), 0);
      const roiPercent = totalSale > 0 ? Math.round((totalProfit / totalSale) * 100) : 0;
      return { totalSale, totalProfit, roiPercent, entries: rows.length };
    }),
});

// ─── Client Goals Router ──────────────────────────────────────────────────────
const clientGoalsRouter = router({
  list: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(clientGoals)
        .where(eq(clientGoals.customerId, input.customerId))
        .orderBy(desc(clientGoals.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      title: z.string().min(1).max(255),
      targetValue: z.number(),
      currentValue: z.number().default(0),
      unit: z.string().default('R$'),
      deadline: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [result] = await db.insert(clientGoals).values({ ...input, createdByUserId: ctx.user.id });
      return { id: (result as any).insertId };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      targetValue: z.number().optional(),
      currentValue: z.number().optional(),
      unit: z.string().optional(),
      deadline: z.date().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const { id, ...data } = input;
      await db.update(clientGoals).set(data).where(eq(clientGoals.id, id));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(clientGoals).where(eq(clientGoals.id, input.id));
      return { success: true };
    }),
});

// ─── Forms Router (Form Builder → Cria Tarefas) ───────────────────────────────
const formsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(formTemplates).orderBy(desc(formTemplates.createdAt));
  }),
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [form] = await db.select().from(formTemplates)
        .where(and(eq(formTemplates.publicSlug, input.slug), eq(formTemplates.isActive, true)));
      return form ?? null;
    }),
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      fields: z.array(z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum(['text', 'textarea', 'date', 'select', 'number', 'phone', 'email']),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
        placeholder: z.string().optional(),
      })),
      taskTitle: z.string().optional(),
      taskCategory: z.enum(['cliente', 'contrato', 'onboarding', 'reuniao', 'passagem', 'midia', 'contratacao', 'outro']).optional(),
      taskTeam: z.enum(['IPL', 'MCM', 'RCC', 'Geral']).optional(),
      taskPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      assignToUserId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      // Generate a unique slug
      const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 40)}-${Date.now().toString(36)}`;
      const [result] = await db.insert(formTemplates).values({
        ...input,
        publicSlug: slug,
        createdByUserId: ctx.user.id,
      });
      return { id: (result as any).insertId, slug };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      fields: z.array(z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum(['text', 'textarea', 'date', 'select', 'number', 'phone', 'email']),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
        placeholder: z.string().optional(),
      })).optional(),
      taskTitle: z.string().optional(),
      taskCategory: z.enum(['cliente', 'contrato', 'onboarding', 'reuniao', 'passagem', 'midia', 'contratacao', 'outro']).optional(),
      taskTeam: z.enum(['IPL', 'MCM', 'RCC', 'Geral']).optional(),
      taskPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      assignToUserId: z.number().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const { id, ...data } = input;
      await db.update(formTemplates).set(data).where(eq(formTemplates.id, id));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(formTemplates).where(eq(formTemplates.id, input.id));
      return { success: true };
    }),
  submit: publicProcedure
    .input(z.object({
      formId: z.number(),
      submitterName: z.string().optional(),
      submitterEmail: z.string().optional(),
      data: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      // Get form template
      const [form] = await db.select().from(formTemplates).where(eq(formTemplates.id, input.formId));
      if (!form) throw new TRPCError({ code: 'NOT_FOUND', message: 'Formulário não encontrado' });
      // Create task from submission
      let taskId: number | null = null;
      if (form.taskTitle) {
        // Replace placeholders in task title
        let title = form.taskTitle;
        for (const [key, val] of Object.entries(input.data)) {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          title = title.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), val);
        }
        // Add submitter name if available
        if (input.submitterName) title = title.replace('{{submitter}}', input.submitterName);
        const description = Object.entries(input.data)
          .map(([k, v]) => {
            const field = form.fields?.find((f: any) => f.id === k);
            return `**${field?.label ?? k}:** ${v}`;
          }).join('\n');
        const [taskResult] = await db.insert(tasks).values({
          title,
          description: `Formulário: ${form.title}\n\n${description}`,
          status: 'todo',
          priority: form.taskPriority ?? 'medium',
          team: form.taskTeam ?? 'Geral',
          category: form.taskCategory ?? 'outro',
          assignedTo: form.assignToUserId ?? undefined,
          createdBy: form.createdByUserId ?? 1,
        });
        taskId = (taskResult as any).insertId;
      }
      // Save submission
      const [subResult] = await db.insert(formSubmissions).values({
        formId: input.formId,
        submitterName: input.submitterName,
        submitterEmail: input.submitterEmail,
        data: input.data as any,
        createdTaskId: taskId ?? undefined,
      });
      return { id: (subResult as any).insertId, taskId };
    }),
  listSubmissions: protectedProcedure
    .input(z.object({ formId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(formSubmissions)
        .where(eq(formSubmissions.formId, input.formId))
        .orderBy(desc(formSubmissions.submittedAt))
        .limit(100);
    }),
});

// ─── Internal Messages Router (Team Chat) ────────────────────────────────────
const teamChatRouter = router({
  getConversation: protectedProcedure
    .input(z.object({ withUserId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(internalMessages)
        .where(
          or(
            and(eq(internalMessages.senderId, ctx.user.id), eq(internalMessages.receiverId, input.withUserId)),
            and(eq(internalMessages.senderId, input.withUserId), eq(internalMessages.receiverId, ctx.user.id))
          )
        )
        .orderBy(internalMessages.createdAt)
        .limit(100);
      return rows;
    }),
  send: protectedProcedure
    .input(z.object({
      receiverId: z.number(),
      content: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const [result] = await db.insert(internalMessages).values({
        senderId: ctx.user.id,
        receiverId: input.receiverId,
        content: input.content,
        isRead: false,
      });
      return { id: (result as any).insertId };
    }),
  markRead: protectedProcedure
    .input(z.object({ fromUserId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.update(internalMessages)
        .set({ isRead: true })
        .where(and(eq(internalMessages.senderId, input.fromUserId), eq(internalMessages.receiverId, ctx.user.id)));
      return { success: true };
    }),
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return 0;
    const [row] = await db.select({ count: count() }).from(internalMessages)
      .where(and(eq(internalMessages.receiverId, ctx.user.id), eq(internalMessages.isRead, false)));
    return row?.count ?? 0;
  }),
  getTeamMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const allUsers = await db.select({
      id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl
    }).from(users).where(eq(users.isActive, true));
    return allUsers.filter(u => u.id !== ctx.user.id);
  }),
});

// ─── Broadcasts Router ────────────────────────────────────────────────────────
const broadcastsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(50);
  }),
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      content: z.string().min(1),
      channel: z.enum(['whatsapp', 'email', 'instagram', 'telegram']).default('whatsapp'),
      scheduledAt: z.date().optional(),
      filterProgram: z.string().optional(),
      filterStatus: z.string().optional(),
      filterTag: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      // Count recipients
      const customerDb = await getDb();
      let totalRecipients = 0;
      if (customerDb) {
        const conditions = [];
        if (input.filterProgram) conditions.push(like(customers.program, `%${input.filterProgram}%`));
        if (input.filterStatus) conditions.push(eq(customers.status as any, input.filterStatus));
        const [row] = await customerDb.select({ count: count() }).from(customers)
          .where(conditions.length > 0 ? and(...conditions) : sql`1=1`);
        totalRecipients = row?.count ?? 0;
      }
      const [result] = await db.insert(broadcasts).values({
        ...input,
        totalRecipients,
        status: input.scheduledAt ? 'scheduled' : 'draft',
        createdBy: ctx.user.id,
      });
      return { id: (result as any).insertId, totalRecipients };
    }),
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'failed']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.update(broadcasts).set({ status: input.status }).where(eq(broadcasts.id, input.id));
      return { success: true };
    }),
});

// ─── Alerts Router ────────────────────────────────────────────────────────────
const alertsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['open', 'in_progress', 'resolved', 'dismissed']).optional(),
      type: z.enum(['chargeback', 'reclame_aqui', 'refund', 'dispute', 'system']).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(alerts.status, input.status));
      if (input.type) conditions.push(eq(alerts.type, input.type));
      return db.select().from(alerts)
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
        .orderBy(desc(alerts.createdAt)).limit(100);
    }),
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['open', 'in_progress', 'resolved', 'dismissed']),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const resolvedAt = input.status === 'resolved' ? new Date() : null;
      await db.update(alerts).set({
        status: input.status,
        resolvedBy: input.status === 'resolved' ? ctx.user.id : null,
        resolvedAt,
      }).where(eq(alerts.id, input.id));
      return { success: true };
    }),
  getOpenCount: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return 0;
    const [row] = await db.select({ count: count() }).from(alerts).where(eq(alerts.status, 'open'));
    return row?.count ?? 0;
  }),
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, open: 0, chargebacks: 0, reclameAqui: 0 };
    const [total] = await db.select({ count: count() }).from(alerts);
    const [open] = await db.select({ count: count() }).from(alerts).where(eq(alerts.status, 'open'));
    const [chargebacks] = await db.select({ count: count() }).from(alerts).where(eq(alerts.type, 'chargeback'));
    const [reclameAqui] = await db.select({ count: count() }).from(alerts).where(eq(alerts.type, 'reclame_aqui'));
    return {
      total: total?.count ?? 0,
      open: open?.count ?? 0,
      chargebacks: chargebacks?.count ?? 0,
      reclameAqui: reclameAqui?.count ?? 0,
    };
  }),
});

// ─── SLA Realtime Router ────────────────────────────────────────────────────
const slaRouter = router({
  getSettings: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(slaSettings).orderBy(slaSettings.channel);
  }),

  updateSettings: adminProcedure
    .input(z.object({
      channel: z.enum(['whatsapp', 'email', 'instagram', 'telegram', 'all']),
      windowMinutes: z.number().min(1).max(1440),
      warningMinutes: z.number().min(1).max(1440),
      isActive: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.update(slaSettings)
        .set({ windowMinutes: input.windowMinutes, warningMinutes: input.warningMinutes, isActive: input.isActive, updatedBy: ctx.user.id })
        .where(eq(slaSettings.channel, input.channel));
      return { success: true };
    }),

  realtime: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { withinSla: 0, breached: 0, warning: 0, criticalConvs: [], slaWindowMinutes: 60, warningWindowMinutes: 45, total: 0 };

    // Load SLA settings from DB (use 'all' as fallback)
    const allSettings = await db.select().from(slaSettings).where(eq(slaSettings.isActive, true));
    const settingsMap = Object.fromEntries(allSettings.map(s => [s.channel, s]));
    const defaultSla = settingsMap['all'] ?? { windowMinutes: 60, warningMinutes: 45 };
    const now = Date.now();

    // Get all open conversations with customer info
    const openConvs = await db.select({
      id: conversations.id,
      subject: conversations.subject,
      channel: conversations.channel,
      createdAt: conversations.createdAt,
      firstResponseAt: conversations.firstResponseAt,
      assignedAgentId: conversations.assignedAgentId,
      customerId: conversations.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(conversations)
    .leftJoin(customers, eq(conversations.customerId, customers.id))
    .where(eq(conversations.status, 'Open'));

    const criticalConvs: any[] = [];
    let withinSla = 0;
    let breached = 0;
    let warning = 0;

    for (const conv of openConvs) {
      const ageMs = now - new Date(conv.createdAt).getTime();
      const hasResponse = !!conv.firstResponseAt;
      // Use channel-specific SLA or fallback to 'all'
      const channelSla = settingsMap[conv.channel] ?? defaultSla;
      const slaWindowMs = channelSla.windowMinutes * 60 * 1000;
      const warningWindowMs = channelSla.warningMinutes * 60 * 1000;

      if (!hasResponse) {
        // No first response yet — check SLA
        if (ageMs > slaWindowMs) {
          breached++;
          criticalConvs.push({
            id: conv.id,
            subject: conv.subject,
            channel: conv.channel,
            ageMinutes: Math.floor(ageMs / 60000),
            status: 'breached',
            customerId: conv.customerId,
            customerName: conv.customerName,
            customerPhone: conv.customerPhone,
            slaWindowMinutes: channelSla.windowMinutes,
          });
        } else if (ageMs > warningWindowMs) {
          warning++;
          criticalConvs.push({
            id: conv.id,
            subject: conv.subject,
            channel: conv.channel,
            ageMinutes: Math.floor(ageMs / 60000),
            status: 'warning',
            customerId: conv.customerId,
            customerName: conv.customerName,
            customerPhone: conv.customerPhone,
            slaWindowMinutes: channelSla.windowMinutes,
          });
        } else {
          withinSla++;
        }
      } else {
        withinSla++;
      }
    }

    // Sort: breached first, then warning, then by age desc
    criticalConvs.sort((a, b) => {
      if (a.status === 'breached' && b.status !== 'breached') return -1;
      if (b.status === 'breached' && a.status !== 'breached') return 1;
      return b.ageMinutes - a.ageMinutes;
    });

    return {
      withinSla,
      breached,
      warning,
      total: openConvs.length,
      slaWindowMinutes: defaultSla.windowMinutes,
      warningWindowMinutes: defaultSla.warningMinutes,
      criticalConvs: criticalConvs.slice(0, 20), // top 20 critical
    };
  }),
});

// ─── Reports Router ─────────────────────────────────────────────────────────
const reportsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(weeklyReports).orderBy(desc(weeklyReports.weekStart)).limit(52);
  }),

  generate: adminProcedure
    .input(z.object({
      weekOffset: z.number().default(0), // 0 = current week, -1 = last week
      sendEmail: z.boolean().default(false),
      emailTo: z.string().email().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + (input.weekOffset * 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Gather metrics for the week
      const [allConvs, closedConvs, newCusts, allAlerts, resolvedAlerts, allUsers] = await Promise.all([
        db.select({ id: conversations.id, channel: conversations.channel, createdAt: conversations.createdAt, firstResponseAt: conversations.firstResponseAt, assignedAgentId: conversations.assignedAgentId })
          .from(conversations)
          .where(and(gte(conversations.createdAt, weekStart), lte(conversations.createdAt, weekEnd))),
        db.select({ id: conversations.id }).from(conversations)
          .where(and(gte(conversations.createdAt, weekStart), lte(conversations.createdAt, weekEnd), eq(conversations.status, 'Closed'))),
        db.select({ id: customers.id }).from(customers)
          .where(and(gte(customers.createdAt, weekStart), lte(customers.createdAt, weekEnd))),
        db.select({ id: alerts.id }).from(alerts)
          .where(and(gte(alerts.createdAt, weekStart), lte(alerts.createdAt, weekEnd))),
        db.select({ id: alerts.id }).from(alerts)
          .where(and(gte(alerts.createdAt, weekStart), lte(alerts.createdAt, weekEnd), eq(alerts.status, 'resolved'))),
        db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
      ]);

      // Calculate avg response time
      const responded = allConvs.filter(c => c.firstResponseAt);
      const avgResponseMinutes = responded.length > 0
        ? responded.reduce((sum, c) => sum + (new Date(c.firstResponseAt!).getTime() - new Date(c.createdAt).getTime()) / 60000, 0) / responded.length
        : null;

      // SLA compliance
      const slaWindow = 60 * 60 * 1000;
      const withinSla = allConvs.filter(c => c.firstResponseAt
        ? (new Date(c.firstResponseAt).getTime() - new Date(c.createdAt).getTime()) <= slaWindow
        : false
      ).length;
      const slaCompliancePct = allConvs.length > 0 ? (withinSla / allConvs.length) * 100 : null;

      // Channel breakdown
      const channelBreakdown: Record<string, number> = {};
      for (const c of allConvs) {
        channelBreakdown[c.channel] = (channelBreakdown[c.channel] ?? 0) + 1;
      }

      // Top agents by closed conversations
      const agentClosed: Record<number, { name: string; closed: number; totalResponseMs: number; responseCount: number }> = {};
      for (const c of allConvs) {
        if (!c.assignedAgentId) continue;
        if (!agentClosed[c.assignedAgentId]) {
          const agent = allUsers.find(u => u.id === c.assignedAgentId);
          agentClosed[c.assignedAgentId] = { name: agent?.name ?? `Agente #${c.assignedAgentId}`, closed: 0, totalResponseMs: 0, responseCount: 0 };
        }
        if (c.firstResponseAt) {
          agentClosed[c.assignedAgentId].totalResponseMs += new Date(c.firstResponseAt).getTime() - new Date(c.createdAt).getTime();
          agentClosed[c.assignedAgentId].responseCount++;
        }
      }
      for (const c of closedConvs) {
        const conv = allConvs.find(x => x.id === c.id);
        if (conv?.assignedAgentId && agentClosed[conv.assignedAgentId]) {
          agentClosed[conv.assignedAgentId].closed++;
        }
      }
      const topAgents = Object.entries(agentClosed)
        .map(([agentId, d]) => ({ agentId: Number(agentId), name: d.name, closed: d.closed, avgResponseMinutes: d.responseCount > 0 ? Math.round(d.totalResponseMs / d.responseCount / 60000) : 0 }))
        .sort((a, b) => b.closed - a.closed)
        .slice(0, 5);

      // Save report
      const [inserted] = await db.insert(weeklyReports).values({
        weekStart,
        weekEnd,
        totalConversations: allConvs.length,
        closedConversations: closedConvs.length,
        avgResponseMinutes: avgResponseMinutes ? Math.round(avgResponseMinutes) : null,
        slaCompliancePct: slaCompliancePct ? Math.round(slaCompliancePct * 10) / 10 : null,
        newCustomers: newCusts.length,
        totalAlerts: allAlerts.length,
        resolvedAlerts: resolvedAlerts.length,
        topAgents,
        channelBreakdown,
        generatedBy: ctx.user.name ?? ctx.user.email ?? 'admin',
      });

      // Optional: send email report
      if (input.sendEmail && input.emailTo) {
        try {
          const [emailSettings] = await db.select().from(channelSettings).where(eq(channelSettings.channel, 'email')).limit(1);
          if (emailSettings?.isActive && emailSettings.emailHost && emailSettings.emailUser && emailSettings.emailPassword) {
            const nodemailer = await import('nodemailer');
            const transporter = nodemailer.default.createTransport({
              host: emailSettings.emailHost,
              port: emailSettings.emailPort ?? 587,
              secure: (emailSettings.emailPort ?? 587) === 465,
              auth: { user: emailSettings.emailUser, pass: emailSettings.emailPassword },
            });
            const weekLabel = `${weekStart.toLocaleDateString('pt-BR')} – ${weekEnd.toLocaleDateString('pt-BR')}`;
            const htmlBody = `
              <h2>Relatório Semanal de CS – ${weekLabel}</h2>
              <table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
                <tr><th>Métrica</th><th>Valor</th></tr>
                <tr><td>Total de Atendimentos</td><td>${allConvs.length}</td></tr>
                <tr><td>Encerrados</td><td>${closedConvs.length}</td></tr>
                <tr><td>Novos Clientes</td><td>${newCusts.length}</td></tr>
                <tr><td>Tempo Médio de Resposta</td><td>${avgResponseMinutes ? Math.round(avgResponseMinutes) + ' min' : 'N/A'}</td></tr>
                <tr><td>Conformidade SLA</td><td>${slaCompliancePct ? Math.round(slaCompliancePct) + '%' : 'N/A'}</td></tr>
                <tr><td>Alertas</td><td>${allAlerts.length} (${resolvedAlerts.length} resolvidos)</td></tr>
              </table>
              <p style="color:#888;font-size:12px">Gerado automaticamente pelo Sistema CS</p>
            `;
            await transporter.sendMail({
              from: `"${emailSettings.emailFromName ?? 'Sistema CS'}" <${emailSettings.emailUser}>`,
              to: input.emailTo,
              subject: `Relatório Semanal CS – ${weekLabel}`,
              html: htmlBody,
            });
            // Mark as sent
            if (inserted?.insertId) {
              await db.update(weeklyReports).set({ emailSentAt: new Date() }).where(eq(weeklyReports.id, Number(inserted.insertId)));
            }
          }
        } catch (e) {
          console.error('[Report Email] Failed:', e);
        }
      }
      return { success: true, weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() };
    }),
});
// ─── Satisfaction Routerr ──────────────────────────────────────────────────────
const satisfactionRouter = router({
  getSettings: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(satisfactionSettings).limit(1);
    return rows[0] ?? null;
  }),

  updateSettings: adminProcedure
    .input(z.object({
      isActive: z.boolean(),
      message: z.string().min(1).max(1000),
      delayMinutes: z.number().min(0).max(60),
      channels: z.array(z.string()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const existing = await db.select({ id: satisfactionSettings.id }).from(satisfactionSettings).limit(1);
      if (existing.length > 0) {
        await db.update(satisfactionSettings)
          .set({ isActive: input.isActive, message: input.message, delayMinutes: input.delayMinutes, channels: input.channels, updatedBy: ctx.user.id })
          .where(eq(satisfactionSettings.id, existing[0].id));
      } else {
        await db.insert(satisfactionSettings).values({ isActive: input.isActive, message: input.message, delayMinutes: input.delayMinutes, channels: input.channels, updatedBy: ctx.user.id });
      }
      return { success: true };
    }),

  submitRating: publicProcedure
    .input(z.object({
      conversationId: z.number(),
      rating: z.enum(['great', 'ok', 'bad']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const conv = await db.select({ customerId: conversations.customerId, channel: conversations.channel }).from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
      const ratingLabel = input.rating === 'great' ? '👍 Ótimo' : input.rating === 'ok' ? '😐 Regular' : '👎 Ruim';
      await db.insert(satisfactionRatings).values({
        conversationId: input.conversationId,
        customerId: conv[0]?.customerId ?? null,
        rating: input.rating,
        ratingLabel,
        channel: conv[0]?.channel ?? null,
      });
      // Insert as a system message in the conversation
      await db.insert(messages).values({
        conversationId: input.conversationId,
        content: `Avaliação recebida: ${ratingLabel}`,
        senderType: 'system',
      });
      return { success: true };
    }),

  getRatings: protectedProcedure
    .input(z.object({ conversationId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      if (input.conversationId) {
        return db.select().from(satisfactionRatings).where(eq(satisfactionRatings.conversationId, input.conversationId)).orderBy(desc(satisfactionRatings.createdAt));
      }
       return db.select().from(satisfactionRatings).orderBy(desc(satisfactionRatings.createdAt)).limit(100);
    }),
  getWeeklyStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, great: 0, ok: 0, bad: 0, greatPct: 0, okPct: 0, badPct: 0 };
    const since = new Date();
    since.setDate(since.getDate() - 7);
    since.setHours(0, 0, 0, 0);
    const rows = await db.select({ rating: satisfactionRatings.rating })
      .from(satisfactionRatings)
      .where(gte(satisfactionRatings.createdAt, since));
    const total = rows.length;
    const great = rows.filter(r => r.rating === 'great').length;
    const ok = rows.filter(r => r.rating === 'ok').length;
    const bad = rows.filter(r => r.rating === 'bad').length;
    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
    return { total, great, ok, bad, greatPct: pct(great), okPct: pct(ok), badPct: pct(bad) };
  }),
});
// ─── Groups Router ────────────────────────────────────────────────────────────
const groupsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const groups = await db.select().from(whatsappGroups).orderBy(desc(whatsappGroups.updatedAt));
    // Para cada grupo, buscar contagem de alertas não resolvidos
    const result = await Promise.all(groups.map(async (g) => {
      const [alertCount] = await db.select({ count: count() }).from(groupAlerts)
        .where(and(eq(groupAlerts.groupId, g.groupId), eq(groupAlerts.isResolved, false)));
      const [lastMsg] = await db.select().from(groupMessages)
        .where(eq(groupMessages.groupId, g.groupId))
        .orderBy(desc(groupMessages.timestamp)).limit(1);
      return { ...g, openAlerts: alertCount.count, lastMessage: lastMsg || null };
    }));
    return result;
  }),

  get: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const [group] = await db.select().from(whatsappGroups).where(eq(whatsappGroups.groupId, input.groupId));
    if (!group) throw new Error('Grupo não encontrado');
    const messages = await db.select().from(groupMessages)
      .where(eq(groupMessages.groupId, input.groupId))
      .orderBy(desc(groupMessages.timestamp)).limit(50);
    const alerts = await db.select().from(groupAlerts)
      .where(eq(groupAlerts.groupId, input.groupId))
      .orderBy(desc(groupAlerts.createdAt)).limit(20);
    return { group, messages, alerts };
  }),

  create: adminProcedure.input(z.object({
    groupId: z.string(),
    groupName: z.string(),
    description: z.string().optional(),
    participantCount: z.number().optional(),
    alertSilenceHours: z.number().default(48),
    linkedCustomerId: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    await db.insert(whatsappGroups).values({
      groupId: input.groupId,
      groupName: input.groupName,
      description: input.description,
      participantCount: input.participantCount || 0,
      alertSilenceHours: input.alertSilenceHours,
      linkedCustomerId: input.linkedCustomerId,
      isMonitored: true,
    });
    return { success: true };
  }),

  update: adminProcedure.input(z.object({
    groupId: z.string(),
    groupName: z.string().optional(),
    description: z.string().optional(),
    isMonitored: z.boolean().optional(),
    alertSilenceHours: z.number().optional(),
    linkedCustomerId: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const { groupId, ...data } = input;
    await db.update(whatsappGroups).set(data).where(eq(whatsappGroups.groupId, groupId));
    return { success: true };
  }),

  resolveAlert: protectedProcedure.input(z.object({ alertId: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    await db.update(groupAlerts).set({
      isResolved: true,
      resolvedAt: new Date(),
      resolvedBy: ctx.user.id,
    }).where(eq(groupAlerts.id, input.alertId));
    return { success: true };
  }),

  analyze: adminProcedure.input(z.object({ groupId: z.string() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const [group] = await db.select().from(whatsappGroups).where(eq(whatsappGroups.groupId, input.groupId));
    if (!group) throw new Error('Grupo não encontrado');

    // Buscar mensagens não analisadas (últimas 100)
    const msgs = await db.select().from(groupMessages)
      .where(and(eq(groupMessages.groupId, input.groupId), eq(groupMessages.analyzed, false)))
      .orderBy(desc(groupMessages.timestamp)).limit(100);

    if (msgs.length === 0) return { analyzed: 0, alerts: [] };

    const now = new Date();
    const newAlerts: typeof groupAlerts.$inferInsert[] = [];

    // 1. Detectar silêncio prolongado (empresa não responde)
    const silenceHours = group.alertSilenceHours || 48;
    const lastAgentMsg = group.lastAgentMessageAt;
    const lastCustomerMsg = group.lastCustomerMessageAt;
    if (lastCustomerMsg && (!lastAgentMsg || lastCustomerMsg > lastAgentMsg)) {
      const hoursSince = (now.getTime() - lastCustomerMsg.getTime()) / (1000 * 60 * 60);
      if (hoursSince >= silenceHours) {
        newAlerts.push({
          groupId: input.groupId,
          groupName: group.groupName,
          type: 'silence',
          severity: hoursSince >= silenceHours * 2 ? 'critical' : 'high',
          message: `Grupo "${group.groupName}" sem resposta da equipe há ${Math.round(hoursSince)} horas.`,
        });
      }
    }

    // 2. Analisar mensagens com IA para detectar pedidos não respondidos e sentimento
    const msgText = msgs.slice(0, 20).map(m => `[${m.senderType}] ${m.senderName || m.senderId}: ${m.content}`).join('\n');
    try {
      const aiResponse = await invokeLLM({
        messages: [
          { role: 'system', content: 'Você é um analisador de conversas de grupos de WhatsApp de clientes de programas digitais. Analise as mensagens e retorne JSON com: { hasPendingRequest: boolean, pendingRequestSummary: string, overallSentiment: "positive"|"neutral"|"negative", summary: string, urgencyLevel: "low"|"medium"|"high" }' },
          { role: 'user', content: `Analise estas mensagens do grupo "${group.groupName}":\n\n${msgText}` },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'group_analysis', strict: true, schema: { type: 'object', properties: { hasPendingRequest: { type: 'boolean' }, pendingRequestSummary: { type: 'string' }, overallSentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] }, summary: { type: 'string' }, urgencyLevel: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['hasPendingRequest', 'pendingRequestSummary', 'overallSentiment', 'summary', 'urgencyLevel'], additionalProperties: false } } },
      });
      const analysis = JSON.parse(aiResponse.choices[0].message.content as string);

      if (analysis.hasPendingRequest) {
        newAlerts.push({
          groupId: input.groupId,
          groupName: group.groupName,
          type: 'unanswered_request',
          severity: analysis.urgencyLevel === 'high' ? 'high' : 'medium',
          message: `Pedido não respondido no grupo "${group.groupName}": ${analysis.pendingRequestSummary}`,
          aiSummary: analysis.summary,
        });
      }
      if (analysis.overallSentiment === 'negative') {
        newAlerts.push({
          groupId: input.groupId,
          groupName: group.groupName,
          type: 'negative_sentiment',
          severity: 'medium',
          message: `Sentimento negativo detectado no grupo "${group.groupName}".`,
          aiSummary: analysis.summary,
        });
      }
    } catch (e) {
      // IA falhou, continua sem análise de sentimento
    }

    // Inserir alertas
    for (const alert of newAlerts) {
      await db.insert(groupAlerts).values(alert);
    }

    // Marcar mensagens como analisadas
    for (const msg of msgs) {
      await db.update(groupMessages).set({ analyzed: true }).where(eq(groupMessages.id, msg.id));
    }

    // Notificar gestor se houver alertas críticos
    const criticalAlerts = newAlerts.filter(a => a.severity === 'critical' || a.severity === 'high');
    if (criticalAlerts.length > 0) {
      await notifyOwner({
        title: `⚠️ Alerta de Grupo: ${group.groupName}`,
        content: criticalAlerts.map(a => a.message).join('\n'),
      });
    }

    return { analyzed: msgs.length, alerts: newAlerts };
  }),

  getAlerts: protectedProcedure.input(z.object({
    onlyOpen: z.boolean().default(true),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const conditions = input.onlyOpen ? [eq(groupAlerts.isResolved, false)] : [];
    return db.select().from(groupAlerts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(groupAlerts.createdAt)).limit(50);
  }),

  // Endpoint para receber mensagem de grupo via webhook
  ingestMessage: publicProcedure.input(z.object({
    groupId: z.string(),
    groupName: z.string(),
    senderId: z.string(),
    senderName: z.string().optional(),
    senderType: z.enum(['customer', 'agent', 'unknown']).default('unknown'),
    content: z.string(),
    messageType: z.string().default('text'),
    externalMessageId: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    // Upsert do grupo
    const [existingGroup] = await db.select().from(whatsappGroups).where(eq(whatsappGroups.groupId, input.groupId));
    if (!existingGroup) {
      await db.insert(whatsappGroups).values({
        groupId: input.groupId,
        groupName: input.groupName,
        isMonitored: true,
      });
    } else {
      const updateData: Record<string, unknown> = { groupName: input.groupName };
      if (input.senderType === 'customer') updateData.lastCustomerMessageAt = new Date();
      if (input.senderType === 'agent') updateData.lastAgentMessageAt = new Date();
      await db.update(whatsappGroups).set(updateData).where(eq(whatsappGroups.groupId, input.groupId));
    }
    // Inserir mensagem
    await db.insert(groupMessages).values({
      groupId: input.groupId,
      senderId: input.senderId,
      senderName: input.senderName,
      senderType: input.senderType,
      content: input.content,
      messageType: input.messageType,
      externalMessageId: input.externalMessageId,
    });
    return { success: true };
  }),
  // Analisa todos os grupos monitorados (chamado pelo scheduled task a cada 1h)
  analyzeAllGroups: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const monitoredGroups = await db.select().from(whatsappGroups).where(eq(whatsappGroups.isMonitored, true));
    let totalAnalyzed = 0;
    let totalAlerts = 0;
    for (const group of monitoredGroups) {
      try {
        const msgs = await db.select().from(groupMessages)
          .where(and(eq(groupMessages.groupId, group.groupId), eq(groupMessages.analyzed, false)))
          .orderBy(desc(groupMessages.timestamp)).limit(100);
        if (msgs.length === 0) continue;
        const now = new Date();
        const newAlerts: typeof groupAlerts.$inferInsert[] = [];
        // Detectar silêncio prolongado
        const silenceHours = group.alertSilenceHours || 48;
        const lastCustomerMsg = group.lastCustomerMessageAt;
        const lastAgentMsg = group.lastAgentMessageAt;
        if (lastCustomerMsg && (!lastAgentMsg || lastCustomerMsg > lastAgentMsg)) {
          const hoursSince = (now.getTime() - lastCustomerMsg.getTime()) / (1000 * 60 * 60);
          if (hoursSince >= silenceHours) {
            newAlerts.push({
              groupId: group.groupId,
              groupName: group.groupName,
              type: 'silence',
              severity: hoursSince >= silenceHours * 2 ? 'critical' : 'high',
              message: `Grupo "${group.groupName}" sem resposta da equipe há ${Math.round(hoursSince)} horas.`,
            });
          }
        }
        // Análise com IA
        const msgText = msgs.slice(0, 20).map(m => `[${m.senderType}] ${m.senderName || m.senderId}: ${m.content}`).join('\n');
        try {
          const aiResponse = await invokeLLM({
            messages: [
              { role: 'system', content: 'Analise mensagens de grupo WhatsApp e retorne JSON: { hasPendingRequest: boolean, pendingRequestSummary: string, overallSentiment: "positive"|"neutral"|"negative", summary: string, urgencyLevel: "low"|"medium"|"high" }' },
              { role: 'user', content: `Grupo "${group.groupName}":\n\n${msgText}` },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'group_analysis', strict: true, schema: { type: 'object', properties: { hasPendingRequest: { type: 'boolean' }, pendingRequestSummary: { type: 'string' }, overallSentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] }, summary: { type: 'string' }, urgencyLevel: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['hasPendingRequest', 'pendingRequestSummary', 'overallSentiment', 'summary', 'urgencyLevel'], additionalProperties: false } } },
          });
          const analysis = JSON.parse(aiResponse.choices[0].message.content as string);
          if (analysis.hasPendingRequest) {
            newAlerts.push({ groupId: group.groupId, groupName: group.groupName, type: 'unanswered_request', severity: analysis.urgencyLevel === 'high' ? 'high' : 'medium', message: `Pedido não respondido no grupo "${group.groupName}": ${analysis.pendingRequestSummary}`, aiSummary: analysis.summary });
          }
          if (analysis.overallSentiment === 'negative') {
            newAlerts.push({ groupId: group.groupId, groupName: group.groupName, type: 'negative_sentiment', severity: 'medium', message: `Sentimento negativo detectado no grupo "${group.groupName}".`, aiSummary: analysis.summary });
          }
        } catch { /* IA falhou, continua */ }
        for (const alert of newAlerts) await db.insert(groupAlerts).values(alert);
        for (const msg of msgs) await db.update(groupMessages).set({ analyzed: true }).where(eq(groupMessages.id, msg.id));
        const criticalAlerts = newAlerts.filter(a => a.severity === 'critical' || a.severity === 'high');
        if (criticalAlerts.length > 0) {
          await notifyOwner({ title: `⚠️ Alerta de Grupo: ${group.groupName}`, content: criticalAlerts.map(a => a.message).join('\n') });
        }
        totalAnalyzed += msgs.length;
        totalAlerts += newAlerts.length;
      } catch { /* grupo falhou, continua */ }
    }
    return { groupsProcessed: monitoredGroups.length, messagesAnalyzed: totalAnalyzed, alertsGenerated: totalAlerts };
  }),
  // Gera sugestão de resposta para um alerta de grupo
  suggestReply: protectedProcedure.input(z.object({
    groupId: z.string(),
    alertMessage: z.string(),
    aiSummary: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const [group] = await db.select().from(whatsappGroups).where(eq(whatsappGroups.groupId, input.groupId));
    if (!group) throw new Error('Grupo não encontrado');
    // Buscar últimas mensagens do grupo para contexto
    const recentMsgs = await db.select().from(groupMessages)
      .where(eq(groupMessages.groupId, input.groupId))
      .orderBy(desc(groupMessages.timestamp)).limit(20);
    const msgContext = recentMsgs.reverse().map(m => `[${m.senderType}] ${m.senderName || m.senderId}: ${m.content}`).join('\n');
    // Buscar cliente vinculado para personalizar a resposta
    let customerContext = '';
    if (group.linkedCustomerId) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, group.linkedCustomerId));
      if (customer) customerContext = `Cliente: ${customer.name}, Programa: ${customer.program || 'N/A'}, Health Score: ${customer.healthScore || 'N/A'}`;
    }
    const aiResponse = await invokeLLM({
      messages: [
        { role: 'system', content: `Você é um especialista em Customer Success do Cashmiles. Gere uma resposta profissional, empática e orientada a resultado para o grupo de WhatsApp "${group.groupName}". A resposta deve ser direta, humana e resolver o problema identificado. Use linguagem informal mas profissional. Máximo 3 parágrafos.${customerContext ? '\n\n' + customerContext : ''}` },
        { role: 'user', content: `Alerta: ${input.alertMessage}\n${input.aiSummary ? 'Resumo IA: ' + input.aiSummary + '\n' : ''}\nÚltimas mensagens do grupo:\n${msgContext}\n\nGere uma sugestão de resposta para enviar no grupo.` },
      ],
    });
    const suggestion = (aiResponse.choices[0]?.message?.content as string) ?? 'Não foi possível gerar sugestão.';
    return { suggestion };
  }),
  // Atualiza tipo e configurações do grupo (VIP, Comunidade, etc.)
  updateGroupSettings: protectedProcedure.input(z.object({
    groupId: z.string(),
    groupType: z.enum(['vip', 'community', 'support']).optional(),
    aiAutoReply: z.boolean().optional(),
    linkedCustomerId: z.number().nullable().optional(),
    alertSilenceHours: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const { groupId, ...data } = input;
    const updateData: Record<string, unknown> = {};
    if (data.groupType !== undefined) updateData.groupType = data.groupType;
    if (data.aiAutoReply !== undefined) updateData.aiAutoReply = data.aiAutoReply;
    if (data.linkedCustomerId !== undefined) updateData.linkedCustomerId = data.linkedCustomerId;
    if (data.alertSilenceHours !== undefined) updateData.alertSilenceHours = data.alertSilenceHours;
    await db.update(whatsappGroups).set(updateData).where(eq(whatsappGroups.groupId, groupId));
    return { success: true };
  }),
});
// ─── Program Dashboard Router ───────────────────────────────────────────────
// ─── Playbooks Router ────────────────────────────────────────────────────────
const playbooksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const rows = await db.select().from(playbooks).orderBy(desc(playbooks.createdAt));
    return rows;
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const [pb] = await db.select().from(playbooks).where(eq(playbooks.id, input.id));
    if (!pb) throw new Error('Playbook not found');
    const steps = await db.select().from(playbookSteps).where(eq(playbookSteps.playbookId, input.id)).orderBy(playbookSteps.stepOrder);
    return { ...pb, steps };
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    program: z.string().optional(),
    agentId: z.number().optional(),
    triggerEvent: z.enum(['customer_created','nps_submitted','health_score_drop','renewal_approaching','no_interaction','manual']),
    isActive: z.boolean().default(true),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const [result] = await db.insert(playbooks).values({ ...input, createdBy: ctx.user.id });
    return { id: (result as any).insertId };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    program: z.string().optional(),
    agentId: z.number().optional(),
    triggerEvent: z.enum(['customer_created','nps_submitted','health_score_drop','renewal_approaching','no_interaction','manual']).optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { id, ...data } = input;
    await db.update(playbooks).set(data).where(eq(playbooks.id, id));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.delete(playbookSteps).where(eq(playbookSteps.playbookId, input.id));
    await db.delete(playbooks).where(eq(playbooks.id, input.id));
    return { success: true };
  }),
  addStep: protectedProcedure.input(z.object({
    playbookId: z.number(),
    stepOrder: z.number(),
    delayDays: z.number().default(0),
    stepType: z.enum(['send_message','send_nps','send_csat','create_task','update_health_score','escalate_to_human','add_tag']),
    messageTemplate: z.string().optional(),
    taskTitle: z.string().optional(),
    taskDescription: z.string().optional(),
    healthScoreDelta: z.number().optional(),
    tagToAdd: z.string().optional(),
    isActive: z.boolean().default(true),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const [result] = await db.insert(playbookSteps).values(input);
    return { id: (result as any).insertId };
  }),
  updateStep: protectedProcedure.input(z.object({
    id: z.number(),
    stepOrder: z.number().optional(),
    delayDays: z.number().optional(),
    stepType: z.enum(['send_message','send_nps','send_csat','create_task','update_health_score','escalate_to_human','add_tag']).optional(),
    messageTemplate: z.string().optional(),
    taskTitle: z.string().optional(),
    taskDescription: z.string().optional(),
    healthScoreDelta: z.number().optional(),
    tagToAdd: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { id, ...data } = input;
    await db.update(playbookSteps).set(data).where(eq(playbookSteps.id, id));
    return { success: true };
  }),
  deleteStep: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.delete(playbookSteps).where(eq(playbookSteps.id, input.id));
    return { success: true };
  }),
});

// ─── Trigger Rules Router ─────────────────────────────────────────────────────
const triggerRulesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    return db.select().from(triggerRules).orderBy(desc(triggerRules.createdAt));
  }),
  listByAgent: protectedProcedure.input(z.object({ agentId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    return db.select().from(triggerRules)
      .where(eq(triggerRules.agentId, input.agentId))
      .orderBy(desc(triggerRules.createdAt));
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    conditionType: z.enum(['no_interaction_days','health_score_below','health_score_above','nps_score_below','nps_score_above','renewal_days_remaining','tag_added','status_changed']),
     conditionValue: z.string(),
     actionType: z.enum(['send_ai_message','create_supervision_item','update_status','assign_playbook','create_task','send_nps']),
     actionConfig: z.record(z.string(), z.string()).optional(),
     agentId: z.number().optional(),
     program: z.string().optional(),
    isActive: z.boolean().default(true),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const [result] = await db.insert(triggerRules).values({
      name: input.name,
      description: input.description,
      conditionType: input.conditionType,
      conditionValue: input.conditionValue,
      actionType: input.actionType,
      actionConfig: input.actionConfig as any,
      agentId: input.agentId,
      program: input.program,
      isActive: input.isActive,
      createdBy: ctx.user.id,
    });
    return { id: (result as any).insertId };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    description: z.string().optional(),
    conditionType: z.enum(['no_interaction_days','health_score_below','health_score_above','nps_score_below','nps_score_above','renewal_days_remaining','tag_added','status_changed']).optional(),
     conditionValue: z.string().optional(),
     actionType: z.enum(['send_ai_message','create_supervision_item','update_status','assign_playbook','create_task','send_nps']).optional(),
     actionConfig: z.record(z.string(), z.string()).optional(),
     agentId: z.number().optional(),
     program: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { id, ...data } = input;
    await db.update(triggerRules).set(data as any).where(eq(triggerRules.id, id));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.delete(triggerRules).where(eq(triggerRules.id, input.id));
    return { success: true };
  }),
  evaluate: protectedProcedure.mutation(async () => {
    // Evaluate all active trigger rules and create supervision items
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const rules = await db.select().from(triggerRules).where(eq(triggerRules.isActive, true));
    let triggered = 0;
    const now = new Date();
    for (const rule of rules) {
      try {
        let affectedCustomers: any[] = [];
        if (rule.conditionType === 'no_interaction_days') {
          const days = parseInt(rule.conditionValue);
          const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          const allCustomers = await db.select().from(customers).where(eq(customers.status, 'Active'));
          for (const c of allCustomers) {
            const lastMsg = await db.select().from(messages)
              .where(eq(messages.conversationId, sql`(SELECT id FROM conversations WHERE customerId = ${c.id} ORDER BY createdAt DESC LIMIT 1)`)).orderBy(desc(messages.createdAt)).limit(1);
            if (!lastMsg.length || lastMsg[0].createdAt < cutoff) affectedCustomers.push(c);
          }
        } else if (rule.conditionType === 'health_score_below') {
          const threshold = parseInt(rule.conditionValue);
          affectedCustomers = await db.select().from(customers)
            .where(and(sql`healthScore < ${threshold}`, eq(customers.status, 'Active')));
        } else if (rule.conditionType === 'renewal_days_remaining') {
          const days = parseInt(rule.conditionValue);
          const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
          affectedCustomers = await db.select().from(customers)
            .where(and(sql`renewalDate <= ${future}`, sql`renewalDate >= ${now}`, eq(customers.status, 'Active')));
        }
        for (const customer of affectedCustomers.slice(0, 50)) {
          if (rule.actionType === 'create_supervision_item') {
            await db.insert(aiSupervisionQueue).values({
              customerId: customer.id,
              agentId: rule.agentId ?? null,
              actionType: 'proactive_outreach',
              actionDescription: `Gatilho: ${rule.name} — ${rule.description ?? ''}`,
              messageContent: rule.actionConfig?.messageTemplate ?? null,
              status: 'pending',
            });
            triggered++;
          }
        }
        await db.update(triggerRules).set({ lastEvaluatedAt: now, triggerCount: sql`triggerCount + ${affectedCustomers.length}` }).where(eq(triggerRules.id, rule.id));
      } catch (_) {}
    }
    return { triggered };
  }),
});

// ─── Journey Router ───────────────────────────────────────────────────────────
const journeyRouter = router({
  listByCustomer: protectedProcedure.input(z.object({ customerId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    return db.select().from(customerJourney).where(eq(customerJourney.customerId, input.customerId)).orderBy(desc(customerJourney.createdAt));
  }),
  start: protectedProcedure.input(z.object({
    customerId: z.number(),
    playbookId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    // Check if already active
    const existing = await db.select().from(customerJourney)
      .where(and(eq(customerJourney.customerId, input.customerId), eq(customerJourney.playbookId, input.playbookId), eq(customerJourney.status, 'active')));
    if (existing.length) return { id: existing[0].id, alreadyActive: true };
    // Get first step
    const [firstStep] = await db.select().from(playbookSteps)
      .where(and(eq(playbookSteps.playbookId, input.playbookId), eq(playbookSteps.isActive, true)))
      .orderBy(playbookSteps.stepOrder).limit(1);
    const nextActionAt = firstStep ? new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000) : null;
    const [result] = await db.insert(customerJourney).values({
      customerId: input.customerId,
      playbookId: input.playbookId,
      currentStepId: firstStep?.id ?? null,
      nextActionAt,
      status: 'active',
    });
    return { id: (result as any).insertId, alreadyActive: false };
  }),
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const total = await db.select({ count: count() }).from(customerJourney);
    const active = await db.select({ count: count() }).from(customerJourney).where(eq(customerJourney.status, 'active'));
    const completed = await db.select({ count: count() }).from(customerJourney).where(eq(customerJourney.status, 'completed'));
    return { total: total[0].count, active: active[0].count, completed: completed[0].count };
  }),
});

const programDashboardRouter = router({
  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    if (!db) throw new Error('Database unavailable');
    // Buscar todos os clientes com programa
    const allCustomers = await db.select({
      id: customers.id,
      program: customers.program,
      status: customers.status,
      healthScore: customers.healthScore,
      renewalDate: customers.renewalDate,
      createdAt: customers.createdAt,
    }).from(customers);

    // Agrupar por programa
    const programMap = new Map<string, {
      program: string;
      total: number;
      active: number;
      atRisk: number;
      churned: number;
      newClients: number;
      avgHealthScore: number;
      renewingIn7: number;
      renewingIn30: number;
      renewingIn60: number;
      healthScores: number[];
    }>();

    const now = new Date();
    const d7 = new Date(now.getTime() + 7 * 86400000);
    const d30 = new Date(now.getTime() + 30 * 86400000);
    const d60 = new Date(now.getTime() + 60 * 86400000);

    for (const c of allCustomers) {
      const prog = c.program || 'Sem Programa';
      if (!programMap.has(prog)) {
        programMap.set(prog, { program: prog, total: 0, active: 0, atRisk: 0, churned: 0, newClients: 0, avgHealthScore: 0, renewingIn7: 0, renewingIn30: 0, renewingIn60: 0, healthScores: [] });
      }
      const entry = programMap.get(prog)!;
      entry.total++;
      if (c.status === 'Active') entry.active++;
      if (c.status === 'At Risk') entry.atRisk++;
      if (c.status === 'Churned') entry.churned++;
      if (c.status === 'New') entry.newClients++;
      if (c.healthScore !== null && c.healthScore !== undefined) entry.healthScores.push(c.healthScore);
      if (c.renewalDate) {
        const rd = new Date(c.renewalDate);
        if (rd >= now && rd <= d7) entry.renewingIn7++;
        if (rd >= now && rd <= d30) entry.renewingIn30++;
        if (rd >= now && rd <= d60) entry.renewingIn60++;
      }
    }

    const result = Array.from(programMap.values()).map(p => ({
      ...p,
      avgHealthScore: p.healthScores.length > 0 ? Math.round(p.healthScores.reduce((a, b) => a + b, 0) / p.healthScores.length) : null,
      healthScores: undefined,
    }));

    return result.sort((a, b) => b.total - a.total);
  }),

  recentEntries: protectedProcedure
    .input(z.object({ program: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      if (!db) throw new Error('Database unavailable');
      const conditions = [];
      if (input.program && input.program !== 'all') {
        conditions.push(eq(customers.program, input.program));
      }
      const result = await db.select().from(customers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(customers.createdAt))
        .limit(input.limit);
      return result;
    }),
});

// ─── Renewal Calendar Router ─────────────────────────────────────────────────
const renewalCalendarRouter = router({
  list: protectedProcedure
    .input(z.object({ days: z.number().default(90) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      if (!db) throw new Error('Database unavailable');
      const now = new Date();
      const future = new Date(now.getTime() + input.days * 86400000);
      const result = await db.select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        program: customers.program,
        status: customers.status,
        healthScore: customers.healthScore,
        renewalDate: customers.renewalDate,
        npsScore: customers.npsScore,
        mrr: customers.mrr,
        lifetimeValue: customers.lifetimeValue,
        lastInteractionAt: customers.lastInteractionAt,
      }).from(customers)
        .where(and(
          sql`${customers.renewalDate} >= NOW()`,
          sql`${customers.renewalDate} <= ${future.toISOString().slice(0, 19).replace('T', ' ')}`
        ))
        .orderBy(customers.renewalDate);

      // Calcular urgência e recomendação de ação para cada cliente
      return result.map(c => {
        const daysUntilRenewal = c.renewalDate
          ? Math.ceil((new Date(c.renewalDate).getTime() - now.getTime()) / 86400000)
          : null;
        const health = c.healthScore ?? 50;
        let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
        let aiRecommendation = '';

        if (daysUntilRenewal !== null && daysUntilRenewal <= 7) {
          urgency = health < 60 ? 'critical' : 'high';
          aiRecommendation = health < 60
            ? 'Contato urgente — cliente em risco de não renovar. Oferecer desconto ou bônus.'
            : 'Enviar mensagem de renovação com destaque dos resultados obtidos.';
        } else if (daysUntilRenewal !== null && daysUntilRenewal <= 30) {
          urgency = health < 70 ? 'high' : 'medium';
          aiRecommendation = health < 70
            ? 'Agendar call de sucesso para entender objeções antes da renovação.'
            : 'Enviar case de sucesso personalizado e lembrete de renovação.';
        } else {
          urgency = 'low';
          aiRecommendation = 'Manter engajamento com conteúdo de valor. Verificar NPS.';
        }

        return { ...c, daysUntilRenewal, urgency, aiRecommendation };
      });
    }),

  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    if (!db) throw new Error('Database unavailable');
    const now = new Date();
    const d7 = new Date(now.getTime() + 7 * 86400000);
    const d30 = new Date(now.getTime() + 30 * 86400000);
    const d60 = new Date(now.getTime() + 60 * 86400000);
    const d90 = new Date(now.getTime() + 90 * 86400000);

    const toISO = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

    const [r7] = await db.select({ count: count() }).from(customers)
      .where(and(sql`${customers.renewalDate} >= NOW()`, sql`${customers.renewalDate} <= ${toISO(d7)}`));
    const [r30] = await db.select({ count: count() }).from(customers)
      .where(and(sql`${customers.renewalDate} >= NOW()`, sql`${customers.renewalDate} <= ${toISO(d30)}`));
    const [r60] = await db.select({ count: count() }).from(customers)
      .where(and(sql`${customers.renewalDate} >= NOW()`, sql`${customers.renewalDate} <= ${toISO(d60)}`));
    const [r90] = await db.select({ count: count() }).from(customers)
      .where(and(sql`${customers.renewalDate} >= NOW()`, sql`${customers.renewalDate} <= ${toISO(d90)}`));

    return { in7Days: r7.count, in30Days: r30.count, in60Days: r60.count, in90Days: r90.count };
  }),
});

// ─── AI Supervision Router ───────────────────────────────────────────────────
const aiSupervisionRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'approved', 'rejected', 'executed', 'failed', 'all']).default('all'),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      if (!db) throw new Error('Database unavailable');
      const conditions = input.status !== 'all' ? [eq(aiSupervisionQueue.status, input.status)] : [];
      const items = await db.select().from(aiSupervisionQueue)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(aiSupervisionQueue.createdAt))
        .limit(input.limit);
      // Enriquecer com dados do cliente
      const enriched = await Promise.all(items.map(async (item) => {
        let customer = null;
        if (item.customerId) {
          const [c] = await db.select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone })
            .from(customers).where(eq(customers.id, item.customerId));
          customer = c || null;
        }
        return { ...item, customer };
      }));
      return enriched;
    }),

  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    if (!db) throw new Error('Database unavailable');
    const [pending] = await db.select({ count: count() }).from(aiSupervisionQueue).where(eq(aiSupervisionQueue.status, 'pending'));
    const [approved] = await db.select({ count: count() }).from(aiSupervisionQueue).where(eq(aiSupervisionQueue.status, 'approved'));
    const [rejected] = await db.select({ count: count() }).from(aiSupervisionQueue).where(eq(aiSupervisionQueue.status, 'rejected'));
    const [executed] = await db.select({ count: count() }).from(aiSupervisionQueue).where(eq(aiSupervisionQueue.status, 'executed'));
    return { pending: pending.count, approved: approved.count, rejected: rejected.count, executed: executed.count };
  }),

  review: protectedProcedure
    .input(z.object({
      id: z.number(),
      action: z.enum(['approve', 'reject']),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      if (!db) throw new Error('Database unavailable');
      await db.update(aiSupervisionQueue)
        .set({
          status: input.action === 'approve' ? 'approved' : 'rejected',
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          reviewNote: input.note || null,
        })
        .where(eq(aiSupervisionQueue.id, input.id));
      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      customerId: z.number().optional(),
      conversationId: z.number().optional(),
      actionType: z.enum(['welcome_message','proactive_outreach','nps_survey','renewal_reminder','churn_risk_alert','upsell_suggestion','auto_reply','escalation']),
      actionDescription: z.string(),
      messageContent: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      if (!db) throw new Error('Database unavailable');
      const [result] = await db.insert(aiSupervisionQueue).values({
        agentId: input.agentId,
        customerId: input.customerId,
        conversationId: input.conversationId,
        actionType: input.actionType,
        actionDescription: input.actionDescription,
        messageContent: input.messageContent,
        status: 'pending',
      });
      return { success: true, id: (result as any).insertId };
    }),
});

// ─── Health Score Router ────────────────────────────────────────────────────
const healthScoreRouter = router({
  // Recalculate health score for a single customer
  recalculate: protectedProcedure.input(z.object({
    customerId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const result = await recalculateAndSave(db as any, input.customerId);
    return result;
  }),

  // Recalculate ALL customers (admin only)
  recalculateAll: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const result = await recalculateAllHealthScores(db as any);
    return result;
  }),

  // Get health score history for a customer
  getHistory: protectedProcedure.input(z.object({
    customerId: z.number(),
    limit: z.number().default(30),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(healthScoreLogs)
      .where(eq(healthScoreLogs.customerId, input.customerId))
      .orderBy(desc(healthScoreLogs.calculatedAt))
      .limit(input.limit);
    return rows;
  }),

  // Simulate what score a customer would get (without saving)
  preview: protectedProcedure.input(z.object({
    customerId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { calculateHealthScore } = await import('./healthScoreEngine');
    return calculateHealthScore(db as any, input.customerId);
  }),
});

// ─── Trigger Logs Router ─────────────────────────────────────────────────────
const triggerLogsRouter = router({
  // Get logs with filters
  list: protectedProcedure.input(z.object({
    agentId: z.number().optional(),
    customerId: z.number().optional(),
    ruleId: z.number().optional(),
    isSimulation: z.boolean().optional(),
    limit: z.number().default(50),
    offset: z.number().default(0),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions = [];
    if (input.agentId !== undefined) conditions.push(eq(triggerLogs.agentId, input.agentId));
    if (input.customerId !== undefined) conditions.push(eq(triggerLogs.customerId, input.customerId));
    if (input.ruleId !== undefined) conditions.push(eq(triggerLogs.ruleId, input.ruleId));
    if (input.isSimulation !== undefined) conditions.push(eq(triggerLogs.isSimulation, input.isSimulation));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(triggerLogs)
      .where(where)
      .orderBy(desc(triggerLogs.createdAt))
      .limit(input.limit)
      .offset(input.offset);
    const [{ total }] = await db
      .select({ total: count() })
      .from(triggerLogs)
      .where(where);
    return { rows, total: Number(total) };
  }),

  // Simulate a trigger rule against a customer
  simulate: protectedProcedure.input(z.object({
    customerId: z.number(),
    ruleId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Get the rule
    const [rule] = await db.select().from(triggerRules).where(eq(triggerRules.id, input.ruleId)).limit(1);
    if (!rule) throw new Error('Rule not found');

    // Get the customer
    const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
    if (!customer) throw new Error('Customer not found');

    // Get agent name
    let agentName: string | null = null;
    if (rule.agentId) {
      const [agent] = await db.select({ name: aiAgents.name }).from(aiAgents).where(eq(aiAgents.id, rule.agentId)).limit(1);
      agentName = agent?.name ?? null;
    }

    // Evaluate condition
    const now = new Date();
    let conditionMet = false;
    let conditionSnapshot: Record<string, unknown> = {};
    let reason = '';

    if (rule.conditionType === 'no_interaction_days') {
      const threshold = parseInt(rule.conditionValue, 10);
      const lastInteraction = customer.lastInteractionAt ? new Date(customer.lastInteractionAt) : null;
      const days = lastInteraction
        ? Math.floor((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      conditionMet = days >= threshold;
      conditionSnapshot = { lastInteractionDays: days, threshold, lastInteractionAt: customer.lastInteractionAt };
      reason = conditionMet ? `Cliente sem interação há ${days} dias (limite: ${threshold})` : `Cliente interagiu há ${days} dias (limite: ${threshold})`;
    } else if (rule.conditionType === 'health_score_below') {
      const threshold = parseInt(rule.conditionValue, 10);
      conditionMet = customer.healthScore !== null && customer.healthScore < threshold;
      conditionSnapshot = { healthScore: customer.healthScore, threshold };
      reason = conditionMet ? `Health Score ${customer.healthScore} abaixo de ${threshold}` : `Health Score ${customer.healthScore ?? 'não calculado'} (limite: ${threshold})`;
    } else if (rule.conditionType === 'health_score_above') {
      const threshold = parseInt(rule.conditionValue, 10);
      conditionMet = customer.healthScore !== null && customer.healthScore > threshold;
      conditionSnapshot = { healthScore: customer.healthScore, threshold };
      reason = conditionMet ? `Health Score ${customer.healthScore} acima de ${threshold}` : `Health Score ${customer.healthScore ?? 'não calculado'} (limite: ${threshold})`;
    } else if (rule.conditionType === 'nps_score_below') {
      const threshold = parseInt(rule.conditionValue, 10);
      conditionMet = customer.npsScore !== null && customer.npsScore < threshold;
      conditionSnapshot = { npsScore: customer.npsScore, threshold };
      reason = conditionMet ? `NPS ${customer.npsScore} abaixo de ${threshold}` : `NPS ${customer.npsScore ?? 'não registrado'} (limite: ${threshold})`;
    } else if (rule.conditionType === 'nps_score_above') {
      const threshold = parseInt(rule.conditionValue, 10);
      conditionMet = customer.npsScore !== null && customer.npsScore > threshold;
      conditionSnapshot = { npsScore: customer.npsScore, threshold };
      reason = conditionMet ? `NPS ${customer.npsScore} acima de ${threshold}` : `NPS ${customer.npsScore ?? 'não registrado'} (limite: ${threshold})`;
    } else if (rule.conditionType === 'renewal_days_remaining') {
      const days = parseInt(rule.conditionValue, 10);
      const renewalDays = customer.renewalDate
        ? Math.floor((new Date(customer.renewalDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      conditionMet = renewalDays !== null && renewalDays <= days && renewalDays >= 0;
      conditionSnapshot = { renewalDaysLeft: renewalDays, threshold: days, renewalDate: customer.renewalDate };
      reason = conditionMet ? `Renovação em ${renewalDays} dias (limite: ${days})` : `Renovação em ${renewalDays ?? 'não configurada'} dias (limite: ${days})`;
    }

    // Determine what action would be taken
    let actionPreview = '';
    if (rule.actionType === 'create_supervision_item') {
      actionPreview = `Criar item de supervisão: "${rule.name}" para ${customer.name}`;
    } else if (rule.actionType === 'send_ai_message') {
      const template = rule.actionConfig?.messageTemplate ?? '(sem template)';
      const msg = template
        .replace(/\{\{nome\}\}/gi, customer.name || 'cliente')
        .replace(/\{\{programa\}\}/gi, customer.program || 'programa');
      actionPreview = `Enviar mensagem via ${agentName ?? 'IA'}: "${msg.substring(0, 150)}${msg.length > 150 ? '...' : ''}"`;
    } else if (rule.actionType === 'create_task') {
      actionPreview = `Criar tarefa para o time sobre ${customer.name}`;
    } else if (rule.actionType === 'send_nps') {
      actionPreview = `Enviar pesquisa NPS para ${customer.name}`;
    } else {
      actionPreview = `Executar ação: ${rule.actionType}`;
    }

    // Log the simulation
    await db.insert(triggerLogs).values({
      ruleId: rule.id,
      ruleName: rule.name,
      customerId: customer.id,
      customerName: customer.name,
      agentId: rule.agentId ?? null,
      agentName,
      conditionType: rule.conditionType,
      conditionValue: rule.conditionValue,
      conditionSnapshot,
      actionType: rule.actionType,
      actionResult: conditionMet ? 'success' : 'skipped',
      actionDetail: conditionMet ? actionPreview : `Condição não atendida: ${reason}`,
      isSimulation: true,
    });

    return {
      conditionMet,
      reason,
      actionPreview: conditionMet ? actionPreview : null,
      rule: { id: rule.id, name: rule.name, conditionType: rule.conditionType, actionType: rule.actionType },
      customer: { id: customer.id, name: customer.name, healthScore: customer.healthScore, npsScore: customer.npsScore, lastInteractionAt: customer.lastInteractionAt },
      agentName,
    };
  }),
});

// ─── Communication Intelligence Router ─────────────────────────────────────
const intelligenceRouter = router({
  // Run a new analysis and save it
  analyze: protectedProcedure.input(z.object({
    periodDays: z.number().min(7).max(365).default(30),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const result = await analyzeConversations(db as any, input.periodDays);
    await saveAnalysis(db as any, result, input.periodDays);
    return result;
  }),

  // Get the latest saved analysis
  getLatest: protectedProcedure.input(z.object({
    periodDays: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const conditions = input.periodDays ? [eq(communicationInsights.periodDays, input.periodDays)] : [];
    const [latest] = await db
      .select()
      .from(communicationInsights)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(communicationInsights.analyzedAt))
      .limit(1);
    return latest || null;
  }),

  // Get history of analyses for trend charts
  getHistory: protectedProcedure.input(z.object({
    limit: z.number().default(12),
    periodDays: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const conditions = input.periodDays ? [eq(communicationInsights.periodDays, input.periodDays)] : [];
    return db
      .select()
      .from(communicationInsights)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(communicationInsights.analyzedAt))
      .limit(input.limit);
  }),
});

// ─── Campaigns Router ────────────────────────────────────────────────────────
const campaignsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  }),

  previewAudience: protectedProcedure
    .input(z.object({
      filterMinHealthScore: z.number().optional(),
      filterMaxHealthScore: z.number().optional(),
      filterProgram: z.string().optional(),
      filterStatus: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { count: 0, customers: [] };
      const conditions: any[] = [];
      if (input.filterMinHealthScore !== undefined) conditions.push(gte(customers.healthScore, input.filterMinHealthScore));
      if (input.filterMaxHealthScore !== undefined) conditions.push(lte(customers.healthScore, input.filterMaxHealthScore));
      if (input.filterProgram) conditions.push(eq(customers.program, input.filterProgram));
      if (input.filterStatus) conditions.push(eq(customers.status, input.filterStatus as any));
      const result = await db.select({
        id: customers.id,
        name: customers.name,
        healthScore: customers.healthScore,
        program: customers.program,
        status: customers.status,
      }).from(customers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(200);
      return { count: result.length, customers: result };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      message: z.string().min(1),
      agentId: z.number().optional(),
      filterMinHealthScore: z.number().optional(),
      filterMaxHealthScore: z.number().optional(),
      filterProgram: z.string().optional(),
      filterStatus: z.string().optional(),
      scheduledAt: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const conditions: any[] = [];
      if (input.filterMinHealthScore !== undefined) conditions.push(gte(customers.healthScore, input.filterMinHealthScore));
      if (input.filterMaxHealthScore !== undefined) conditions.push(lte(customers.healthScore, input.filterMaxHealthScore));
      if (input.filterProgram) conditions.push(eq(customers.program, input.filterProgram));
      if (input.filterStatus) conditions.push(eq(customers.status, input.filterStatus as any));
      const [{ count: total }] = await db.select({ count: count() }).from(customers)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      const [inserted] = await db.insert(campaigns).values({
        name: input.name,
        message: input.message,
        agentId: input.agentId ?? null,
        filterMinHealthScore: input.filterMinHealthScore ?? null,
        filterMaxHealthScore: input.filterMaxHealthScore ?? null,
        filterProgram: input.filterProgram ?? null,
        filterStatus: input.filterStatus ?? null,
        totalTargeted: total,
        scheduledAt: input.scheduledAt ?? null,
        status: input.scheduledAt ? "scheduled" : "draft",
        createdBy: ctx.user.id,
      });
      return { id: (inserted as any).insertId };
    }),

  send: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, input.id)).limit(1);
      if (!campaign) throw new Error("Campanha não encontrada");
      const conditions: any[] = [];
      if (campaign.filterMinHealthScore !== null) conditions.push(gte(customers.healthScore, campaign.filterMinHealthScore!));
      if (campaign.filterMaxHealthScore !== null) conditions.push(lte(customers.healthScore, campaign.filterMaxHealthScore!));
      if (campaign.filterProgram) conditions.push(eq(customers.program, campaign.filterProgram));
      if (campaign.filterStatus) conditions.push(eq(customers.status, campaign.filterStatus as any));
      const audience = await db.select().from(customers)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      await db.update(campaigns).set({ status: "running", sentAt: new Date(), totalTargeted: audience.length }).where(eq(campaigns.id, input.id));
      let sent = 0;
      for (const customer of audience) {
        try {
          // Find or create a conversation for this customer
          const existingConvs = await db.select({ id: conversations.id })
            .from(conversations)
            .where(and(eq(conversations.customerId, customer.id), eq(conversations.status, 'Open')))
            .limit(1);
          let convId: number;
          if (existingConvs.length > 0) {
            convId = existingConvs[0].id;
          } else {
            const [newConv] = await db.insert(conversations).values({
              customerId: customer.id,
              channel: 'whatsapp',
              status: 'Open',
              handledByAi: true,
              assignedAgentId: campaign.agentId ?? null,
            });
            convId = (newConv as any).insertId;
          }
          await db.insert(scheduledMessages).values({
            conversationId: convId,
            customerId: customer.id,
            content: campaign.message,
            scheduledAt: new Date(),
            status: 'pending',
            createdBy: campaign.createdBy ?? 0,
          });
          sent++;
        } catch (_) { /* skip errors */ }
      }
      await db.update(campaigns).set({ status: "completed", totalSent: sent }).where(eq(campaigns.id, input.id));
      return { sent, total: audience.length };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(campaigns).where(eq(campaigns.id, input.id));
      return { success: true };
    }),
});

// ─── Journey Tasks Router ────────────────────────────────────────────────────
const journeyTasksRouter = router({
  listByCustomer: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(customerJourneyTasks)
        .where(eq(customerJourneyTasks.customerId, input.customerId))
        .orderBy(customerJourneyTasks.dueDate);
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.number(), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.update(customerJourneyTasks)
        .set({ status: 'done', completedAt: new Date(), completedByUserId: ctx.user.id })
        .where(eq(customerJourneyTasks.id, input.id));
      return { success: true };
    }),

  skip: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.update(customerJourneyTasks)
        .set({ status: 'skipped' })
        .where(eq(customerJourneyTasks.id, input.id));
      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      dueDate: z.string().optional(),
      priority: z.enum(['critical', 'high', 'normal']).default('normal'),
      phase: z.enum(['onboarding', 'monthly', 'renewal', 'manual']).default('manual'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.insert(customerJourneyTasks).values({
        customerId: input.customerId,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        priority: input.priority,
        phase: input.phase,
        status: 'pending',
      });
      return { success: true };
    }),

  initProtocol: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      entryDate: z.string().optional(), // ISO date, defaults to now
      isHighTicket: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const entry = input.entryDate ? new Date(input.entryDate) : new Date();
      const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

      // Delete existing pending tasks for this customer
      await db.delete(customerJourneyTasks)
        .where(and(
          eq(customerJourneyTasks.customerId, input.customerId),
          eq(customerJourneyTasks.status, 'pending'),
        ));

      const tasks12m = [
        // Onboarding — primeiros 7 dias (crítico)
        { dayOffset: 0, title: 'Boas-vindas e apresentação do guardião', phase: 'onboarding' as const, priority: 'critical' as const },
        { dayOffset: 1, title: 'Confirmar recebimento de acesso e primeiras dúvidas', phase: 'onboarding' as const, priority: 'critical' as const },
        { dayOffset: 3, title: 'Check-in: como está sendo a experiência?', phase: 'onboarding' as const, priority: 'critical' as const },
        { dayOffset: 7, title: 'Revisão da primeira semana com o cliente', phase: 'onboarding' as const, priority: 'critical' as const },
        // Check-ins mensais
        { dayOffset: 30, title: 'Check-in mensal — Mês 1', phase: 'monthly' as const, priority: 'high' as const },
        { dayOffset: 60, title: 'Check-in mensal — Mês 2', phase: 'monthly' as const, priority: 'high' as const },
        { dayOffset: 90, title: 'Check-in mensal — Mês 3', phase: 'monthly' as const, priority: 'high' as const },
        { dayOffset: 120, title: 'Check-in mensal — Mês 4', phase: 'monthly' as const, priority: 'normal' as const },
        { dayOffset: 150, title: 'Check-in mensal — Mês 5', phase: 'monthly' as const, priority: 'normal' as const },
        { dayOffset: 180, title: 'Check-in semestral — Mês 6 (revisão completa)', phase: 'monthly' as const, priority: 'high' as const },
        { dayOffset: 210, title: 'Check-in mensal — Mês 7', phase: 'monthly' as const, priority: 'normal' as const },
        { dayOffset: 240, title: 'Check-in mensal — Mês 8', phase: 'monthly' as const, priority: 'normal' as const },
        { dayOffset: 270, title: 'Check-in mensal — Mês 9', phase: 'monthly' as const, priority: 'normal' as const },
        // Renovação
        { dayOffset: 300, title: 'Iniciar conversa de renovação (60 dias antes)', phase: 'renewal' as const, priority: 'high' as const },
        { dayOffset: 330, title: 'Apresentar proposta de renovação (30 dias antes)', phase: 'renewal' as const, priority: 'critical' as const },
        { dayOffset: 355, title: 'Fechar renovação — prazo iminente (7 dias)', phase: 'renewal' as const, priority: 'critical' as const },
      ];

      for (const t of tasks12m) {
        await db.insert(customerJourneyTasks).values({
          customerId: input.customerId,
          title: t.title,
          phase: t.phase,
          priority: t.priority,
          dayOffset: t.dayOffset,
          dueDate: addDays(entry, t.dayOffset),
          status: 'pending',
        });
      }
      return { success: true, tasksCreated: tasks12m.length };
    }),
  getOverdue: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      const rows = await db
        .select({
          id: customerJourneyTasks.id,
          title: customerJourneyTasks.title,
          dueDate: customerJourneyTasks.dueDate,
          priority: customerJourneyTasks.priority,
          phase: customerJourneyTasks.phase,
          customerId: customerJourneyTasks.customerId,
          customerName: customers.name,
          customerProgram: customers.program,
        })
        .from(customerJourneyTasks)
        .innerJoin(customers, eq(customerJourneyTasks.customerId, customers.id))
        .where(
          and(
            eq(customerJourneyTasks.status, 'pending'),
            lt(customerJourneyTasks.dueDate, now),
          )
        )
        .orderBy(asc(customerJourneyTasks.dueDate))
        .limit(100);
      return rows;
    }),

  // Check for overdue tasks and send notifications to the owner
  checkAndNotifyOverdue: protectedProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) return { notified: 0 };
      const now = new Date();
      // Find overdue pending tasks (dueDate < now)
      const overdueTasks = await db
        .select({
          id: customerJourneyTasks.id,
          title: customerJourneyTasks.title,
          dueDate: customerJourneyTasks.dueDate,
          customerId: customerJourneyTasks.customerId,
          customerName: customers.name,
          priority: customerJourneyTasks.priority,
          phase: customerJourneyTasks.phase,
        })
        .from(customerJourneyTasks)
        .innerJoin(customers, eq(customerJourneyTasks.customerId, customers.id))
        .where(
          and(
            eq(customerJourneyTasks.status, 'pending'),
            lt(customerJourneyTasks.dueDate, now),
          )
        )
        .orderBy(asc(customerJourneyTasks.dueDate))
        .limit(20);

      if (overdueTasks.length === 0) return { notified: 0 };

      const taskList = overdueTasks
        .map(t => `• [${t.customerName}] ${t.title} (venceu ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : 'sem data'})`)
        .join('\n');

      await notifyOwner({
        title: `⚠️ ${overdueTasks.length} tarefa(s) de jornada vencida(s)`,
        content: `As seguintes tarefas estão vencidas e não foram concluídas:\n\n${taskList}\n\nAcesse o Sistema CS para revisar e atualizar o status.`,
      });

      return { notified: overdueTasks.length };
    }),
});
// ─── Customer Notes Router ─────────────────────────────────────────────────────
const customerNotesRouter = router({
  listByCustomer: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(customerNotes)
        .where(eq(customerNotes.customerId, input.customerId))
        .orderBy(desc(customerNotes.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      content: z.string().min(1),
      type: z.enum(['note', 'call', 'meeting', 'email', 'whatsapp']).default('note'),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.insert(customerNotes).values({
        customerId: input.customerId,
        content: input.content,
         type: input.type,
        createdByUserId: ctx.user.id,
        createdByName: ctx.user.name ?? 'Agente',
      });
      return { success: true };
    }),
});
// ─── Customer Milestones Router ───────────────────────────────────────────────
const customerMilestonesRouter = router({
  listByCustomer: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(customerMilestones)
        .where(eq(customerMilestones.customerId, input.customerId))
        .orderBy(desc(customerMilestones.date));
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      type: z.enum(['victory', 'challenge', 'milestone', 'complaint']).default('milestone'),
      title: z.string().min(1),
      description: z.string().optional(),
      date: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.insert(customerMilestones).values({
        customerId: input.customerId,
        type: input.type,
        title: input.title,
        description: input.description,
        date: input.date ? new Date(input.date) : new Date(),
        createdByUserId: ctx.user.id,
        createdByName: ctx.user.name ?? 'Agente',
      });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(customerMilestones).where(eq(customerMilestones.id, input.id));
      return { success: true };
    }),
});
// ─── Command Panel Router ─────────────────────────────────────────────────────
const commandPanelRouter = router({
  getActions: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { criticalActions: [], warnings: [], renewals: [], newClients: [] };
    const now = new Date();
    const d7 = new Date(now.getTime() + 7 * 86400000);
    const d60 = new Date(now.getTime() + 60 * 86400000);
    const d7ago = new Date(now.getTime() - 7 * 86400000);
    const d15ago = new Date(now.getTime() - 15 * 86400000);

    // All active/at-risk/new customers
    const allCustomers = await db.select().from(customers)
      .where(sql`status != 'Churned'`)
      .orderBy(customers.healthScore);

    const criticalActions: any[] = [];
    const warnings: any[] = [];
    const renewals: any[] = [];
    const newClients: any[] = [];

    for (const c of allCustomers) {
      const daysSinceEntry = Math.floor((now.getTime() - new Date(c.createdAt).getTime()) / 86400000);
      const daysSinceContact = c.lastInteractionAt
        ? Math.floor((now.getTime() - new Date(c.lastInteractionAt).getTime()) / 86400000)
        : daysSinceEntry;
      const score = c.healthScore ?? 50;

      // New client in first 7 days — critical
      if (daysSinceEntry <= 7) {
        const urgency = daysSinceContact >= 1 ? 'critical' : 'high';
        newClients.push({
          id: c.id, name: c.name, program: c.program, healthScore: score,
          daysSinceEntry, daysSinceContact,
          urgency,
          reason: daysSinceContact >= 1 ? `Novo cliente há ${daysSinceEntry}d — sem contato há ${daysSinceContact}d` : `Novo cliente há ${daysSinceEntry}d — período crítico`,
          aiSuggestion: daysSinceEntry === 0 ? 'Enviar boas-vindas e apresentar o guardião' : daysSinceEntry <= 3 ? 'Fazer check-in: como está sendo a experiência?' : 'Revisar a primeira semana com o cliente',
        });
        continue;
      }

      // At risk or low health score
      if (c.status === 'At Risk' || score < 40) {
        criticalActions.push({
          id: c.id, name: c.name, program: c.program, healthScore: score,
          daysSinceContact, status: c.status,
          urgency: 'critical',
          reason: score < 40 ? `Health Score crítico: ${score}` : `Cliente em risco — sem contato há ${daysSinceContact}d`,
          aiSuggestion: score < 40 ? 'Ligar e entender o motivo da insatisfação. Oferecer suporte personalizado.' : 'Entrar em contato imediatamente e entender a situação.',
        });
        continue;
      }

      // Renewal in next 60 days
      if (c.renewalDate) {
        const rd = new Date(c.renewalDate);
        if (rd >= now && rd <= d60) {
          const daysToRenewal = Math.floor((rd.getTime() - now.getTime()) / 86400000);
          renewals.push({
            id: c.id, name: c.name, program: c.program, healthScore: score,
            daysToRenewal, renewalDate: c.renewalDate,
            urgency: daysToRenewal <= 7 ? 'critical' : daysToRenewal <= 30 ? 'high' : 'normal',
            reason: `Renovação em ${daysToRenewal} dias`,
            aiSuggestion: daysToRenewal <= 7 ? 'Fechar renovação agora — prazo iminente.' : daysToRenewal <= 30 ? 'Apresentar proposta de renovação.' : 'Iniciar conversa de renovação.',
          });
          continue;
        }
      }

      // No contact in 15+ days
      if (daysSinceContact >= 15) {
        warnings.push({
          id: c.id, name: c.name, program: c.program, healthScore: score,
          daysSinceContact,
          urgency: 'high',
          reason: `Sem contato há ${daysSinceContact} dias`,
          aiSuggestion: 'Fazer check-in mensal e verificar se o cliente precisa de suporte.',
        });
      }
    }

    return {
      criticalActions: criticalActions.sort((a, b) => a.healthScore - b.healthScore),
      warnings: warnings.sort((a, b) => b.daysSinceContact - a.daysSinceContact),
      renewals: renewals.sort((a, b) => a.daysToRenewal - b.daysToRenewal),
      newClients: newClients.sort((a, b) => b.daysSinceEntry - a.daysSinceEntry),
    };
  }),

  // ─ Unified Priority Queue ─
  // Merges all action buckets into a single list sorted by urgency score.
  // Score formula (0–100):
  //   base from bucket type + modifiers for health, days without contact, renewal proximity
  getPriorityQueue: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { items: [] };
    const now = new Date();
    const d60 = new Date(now.getTime() + 60 * 86400000);

    const allCustomers = await db.select().from(customers).where(sql`status != 'Churned'`);

    const items: {
      id: number; name: string; program: string | null;
      healthScore: number; urgencyScore: number;
      badges: string[]; reason: string; aiSuggestion: string;
      daysSinceContact: number; daysToRenewal?: number;
      action: 'chat' | 'view' | 'renewal';
    }[] = [];

    for (const c of allCustomers) {
      const daysSinceEntry = Math.floor((now.getTime() - new Date(c.createdAt).getTime()) / 86400000);
      const daysSinceContact = c.lastInteractionAt
        ? Math.floor((now.getTime() - new Date(c.lastInteractionAt).getTime()) / 86400000)
        : daysSinceEntry;
      const score = c.healthScore ?? 50;
      const badges: string[] = [];
      let urgencyScore = 0;
      let reason = '';
      let aiSuggestion = '';
      let action: 'chat' | 'view' | 'renewal' = 'view';

      // New client (first 7 days) — base 80
      if (daysSinceEntry <= 7) {
        urgencyScore = 80 + (7 - daysSinceEntry) * 2 + Math.min(daysSinceContact * 3, 15);
        badges.push('Novo Cliente');
        reason = `Novo há ${daysSinceEntry}d — sem contato há ${daysSinceContact}d`;
        aiSuggestion = daysSinceEntry <= 3 ? 'Enviar boas-vindas e apresentar o guardião' : 'Revisar a primeira semana com o cliente';
        action = 'chat';
      }
      // Critical: at-risk or health < 40 — base 90
      else if (c.status === 'At Risk' || score < 40) {
        urgencyScore = 90 + (40 - Math.max(score, 0)) / 2 + Math.min(daysSinceContact * 2, 10);
        badges.push('Em Risco');
        if (score < 40) badges.push(`Score ${score}`);
        reason = score < 40 ? `Health Score crítico: ${score}` : `Cliente em risco — sem contato há ${daysSinceContact}d`;
        aiSuggestion = 'Ligar e entender o motivo da insatisfação. Oferecer suporte personalizado.';
        action = 'chat';
      }
      // Renewal in next 60 days — base 60-75
      else if (c.renewalDate) {
        const rd = new Date(c.renewalDate);
        if (rd >= now && rd <= d60) {
          const daysToRenewal = Math.floor((rd.getTime() - now.getTime()) / 86400000);
          urgencyScore = 75 - daysToRenewal / 2 + (score < 60 ? 10 : 0);
          badges.push('Renovação');
          if (daysToRenewal <= 7) badges.push('Urgente');
          reason = `Renovação em ${daysToRenewal} dias`;
          aiSuggestion = daysToRenewal <= 7 ? 'Fechar renovação agora — prazo iminente.' : 'Apresentar proposta de renovação.';
          action = 'renewal';
          items.push({ id: c.id, name: c.name, program: c.program ?? null, healthScore: score, urgencyScore: Math.round(urgencyScore), badges, reason, aiSuggestion, daysSinceContact, daysToRenewal, action });
          continue;
        }
      }
      // No contact in 15+ days — base 40
      else if (daysSinceContact >= 15) {
        urgencyScore = 40 + Math.min((daysSinceContact - 15) * 1.5, 30) + (score < 60 ? 10 : 0);
        badges.push('Sem Contato');
        reason = `Sem contato há ${daysSinceContact} dias`;
        aiSuggestion = 'Fazer check-in mensal e verificar se o cliente precisa de suporte.';
        action = 'chat';
      } else {
        continue; // healthy, skip
      }

      if (urgencyScore > 0) {
        items.push({ id: c.id, name: c.name, program: c.program ?? null, healthScore: score, urgencyScore: Math.round(Math.min(urgencyScore, 100)), badges, reason, aiSuggestion, daysSinceContact, action });
      }
    }

    return { items: items.sort((a, b) => b.urgencyScore - a.urgencyScore) };
  }),
});

// ─── Tags Router ─────────────────────────────────────────────────────────────────────────────
const tagsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    return db!.select().from(conversationTags).orderBy(asc(conversationTags.sortOrder), asc(conversationTags.id));
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(64), color: z.string().default('#6366f1'), icon: z.string().default('tag') }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db!.insert(conversationTags).values({
        name: input.name, color: input.color, icon: input.icon,
        isDefault: false, isSystem: false,
        createdByUserId: ctx.user.id,
        sortOrder: 100,
      });
      return { ok: true };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(64).optional(), color: z.string().optional(), icon: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db!.update(conversationTags).set(data).where(eq(conversationTags.id, id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [tag] = await db!.select().from(conversationTags).where(eq(conversationTags.id, input.id));
      if (!tag || tag.isSystem) throw new TRPCError({ code: 'FORBIDDEN', message: 'Não é possível excluir tags do sistema' });
      await db!.delete(conversationTagAssignments).where(eq(conversationTagAssignments.tagId, input.id));
      await db!.delete(conversationTags).where(eq(conversationTags.id, input.id));
      return { ok: true };
    }),

  assign: protectedProcedure
    .input(z.object({ conversationId: z.number(), tagId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.insert(conversationTagAssignments).values(input).onDuplicateKeyUpdate({ set: { conversationId: input.conversationId } });
      return { ok: true };
    }),

  unassign: protectedProcedure
    .input(z.object({ conversationId: z.number(), tagId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.delete(conversationTagAssignments)
        .where(and(eq(conversationTagAssignments.conversationId, input.conversationId), eq(conversationTagAssignments.tagId, input.tagId)));
      return { ok: true };
    }),

  listUnified: protectedProcedure
    .input(z.object({
      tagId: z.number().optional(),
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Conversations
      const convs = await db!.select({
        id: conversations.id,
        type: sql<string>`'conversation'`,
        name: customers.name,
        phone: customers.phone,
        program: customers.program,
        lastMessage: conversations.subject,
        lastMessageAt: conversations.updatedAt,
        unreadCount: sql<number>`0`,
        status: conversations.status,
        assignedTo: sql<string | null>`NULL`,
        customerId: conversations.customerId,
        groupId: sql<number | null>`NULL`,
      })
        .from(conversations)
        .leftJoin(customers, eq(conversations.customerId, customers.id))
        .where(and(
          input.search ? or(like(customers.name, `%${input.search}%`), like(customers.phone, `%${input.search}%`)) : undefined,
          input.tagId && input.tagId !== 1 && input.tagId !== 5
            ? sql`${conversations.id} IN (SELECT conversationId FROM conversationTagAssignments WHERE tagId = ${input.tagId})`
            : undefined,
        ))
        .orderBy(desc(conversations.updatedAt))
        .limit(input.tagId === 5 ? 0 : input.limit); // tag 5 = Grupos only

      // Groups
      const groups = await db!.select({
        id: sql<number>`${whatsappGroups.id} + 100000`,
        type: sql<string>`'group'`,
        name: whatsappGroups.groupName,
        phone: sql<string>`''`,
        program: sql<string>`''`,
        lastMessage: sql<string | null>`NULL`,
        lastMessageAt: whatsappGroups.updatedAt,
        unreadCount: sql<number>`0`,
        status: sql<string>`'active'`,
        assignedTo: sql<string | null>`NULL`,
        customerId: whatsappGroups.linkedCustomerId,
        groupId: whatsappGroups.id,
      })
        .from(whatsappGroups)
        .where(input.search ? like(whatsappGroups.groupName, `%${input.search}%`) : undefined)
        .orderBy(desc(whatsappGroups.updatedAt))
        .limit(input.tagId === undefined || input.tagId === 1 || input.tagId === 5 ? 50 : 0);

      const all = [...convs, ...groups].sort((a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
      );
      return all.slice(input.offset, input.offset + input.limit);
    }),
});

// ─── Knowledge Live Router ──────────────────────────────────────────────────
const knowledgeLiveRouter = router({
  // List captured questions, ordered by frequency
  listCaptures: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      status: z.enum(['pending', 'approved', 'dismissed']).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const conditions = [];
      if (input.category) conditions.push(eq(knowledgeCaptures.category, input.category as any));
      if (input.status) conditions.push(eq(knowledgeCaptures.status, input.status));
      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db.select().from(knowledgeCaptures)
        .where(where)
        .orderBy(desc(knowledgeCaptures.frequency), desc(knowledgeCaptures.lastSeenAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await db.select({ total: count() }).from(knowledgeCaptures).where(where);
      return { rows, total: Number(total) };
    }),

  // Approve a capture: create FAQ entry and optionally push to agent KB
  approveCapture: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      answer: z.string().min(1),
      agentIds: z.array(z.number()).default([]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const [capture] = await db.select().from(knowledgeCaptures).where(eq(knowledgeCaptures.id, input.captureId)).limit(1);
      if (!capture) throw new TRPCError({ code: 'NOT_FOUND' });
      // Create FAQ entry
      const [faq] = await db.insert(knowledgeFAQ).values({
        question: capture.question,
        answer: input.answer,
        category: capture.category,
        agentIds: input.agentIds,
        captureId: input.captureId,
        isActive: true,
      }).$returningId();
      // Push to agent knowledge bases
      for (const agentId of input.agentIds) {
        await db.insert(knowledgeBase).values({
          agentId,
          title: capture.question,
          content: input.answer,
          category: capture.category,
          isActive: true,
          createdBy: 0,
        });
      }
      // Mark capture as approved
      await db.update(knowledgeCaptures).set({ status: 'approved', resolution: input.answer }).where(eq(knowledgeCaptures.id, input.captureId));
      return { faqId: faq.id };
    }),

  // Dismiss a capture
  dismissCapture: protectedProcedure
    .input(z.object({ captureId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await db.update(knowledgeCaptures).set({ status: 'dismissed' }).where(eq(knowledgeCaptures.id, input.captureId));
      return { success: true };
    }),

  // List FAQ entries
  listFAQ: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      isActive: z.boolean().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const conditions = [];
      if (input.category) conditions.push(eq(knowledgeFAQ.category, input.category as any));
      if (input.isActive !== undefined) conditions.push(eq(knowledgeFAQ.isActive, input.isActive));
      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db.select().from(knowledgeFAQ)
        .where(where)
        .orderBy(desc(knowledgeFAQ.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await db.select({ total: count() }).from(knowledgeFAQ).where(where);
      return { rows, total: Number(total) };
    }),

  // Create FAQ entry manually
  createFAQ: protectedProcedure
    .input(z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
      category: z.enum(['acesso_plataforma','conteudo_modulo','financeiro_reembolso','certificado','comunidade','suporte_tecnico','resultado_produto','outros']).default('outros'),
      agentIds: z.array(z.number()).default([]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const [faq] = await db.insert(knowledgeFAQ).values({ ...input, isActive: true }).$returningId();
      for (const agentId of input.agentIds) {
        await db.insert(knowledgeBase).values({
          agentId,
          title: input.question,
          content: input.answer,
          category: input.category,
          isActive: true,
          createdBy: 0,
        });
      }
      return { faqId: faq.id };
    }),

  // Update FAQ entry
  updateFAQ: protectedProcedure
    .input(z.object({
      id: z.number(),
      question: z.string().min(1).optional(),
      answer: z.string().min(1).optional(),
      category: z.enum(['acesso_plataforma','conteudo_modulo','financeiro_reembolso','certificado','comunidade','suporte_tecnico','resultado_produto','outros']).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { id, ...data } = input;
      await db.update(knowledgeFAQ).set(data).where(eq(knowledgeFAQ.id, id));
      return { success: true };
    }),

  // Delete FAQ entry
  deleteFAQ: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await db.delete(knowledgeFAQ).where(eq(knowledgeFAQ.id, input.id));
      return { success: true };
    }),

  // Get stats for the knowledge panel
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { pending: 0, approved: 0, dismissed: 0, totalFAQ: 0 };
    const [pending] = await db.select({ count: count() }).from(knowledgeCaptures).where(eq(knowledgeCaptures.status, 'pending'));
    const [approved] = await db.select({ count: count() }).from(knowledgeCaptures).where(eq(knowledgeCaptures.status, 'approved'));
    const [dismissed] = await db.select({ count: count() }).from(knowledgeCaptures).where(eq(knowledgeCaptures.status, 'dismissed'));
    const [totalFAQ] = await db.select({ count: count() }).from(knowledgeFAQ).where(eq(knowledgeFAQ.isActive, true));
    return {
      pending: Number(pending.count),
      approved: Number(approved.count),
      dismissed: Number(dismissed.count),
      totalFAQ: Number(totalFAQ.count),
    };
  }),

  // Capture a question from a conversation (called by AI auto-reply logic)
  captureQuestion: protectedProcedure
    .input(z.object({
      question: z.string().min(1),
      normalizedQuestion: z.string().min(1),
      category: z.enum(['acesso_plataforma','conteudo_modulo','financeiro_reembolso','certificado','comunidade','suporte_tecnico','resultado_produto','outros']).default('outros'),
      conversationId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      // Check if same normalized question already exists
      const [existing] = await db.select().from(knowledgeCaptures)
        .where(eq(knowledgeCaptures.normalizedQuestion, input.normalizedQuestion)).limit(1);
      if (existing) {
        // Increment frequency and update lastSeenAt
        const ids = (existing.sourceConversationIds as number[] ?? []);
        if (input.conversationId && !ids.includes(input.conversationId)) ids.push(input.conversationId);
        await db.update(knowledgeCaptures).set({
          frequency: existing.frequency + 1,
          lastSeenAt: new Date(),
          sourceConversationIds: ids,
        }).where(eq(knowledgeCaptures.id, existing.id));
        return { success: true, captureId: existing.id, isNew: false };
      }
      const sourceIds = input.conversationId ? [input.conversationId] : [];
      const [inserted] = await db.insert(knowledgeCaptures).values({
        question: input.question,
        normalizedQuestion: input.normalizedQuestion,
        category: input.category,
        frequency: 1,
        lastSeenAt: new Date(),
        status: 'pending',
        sourceConversationIds: sourceIds,
      }).$returningId();
      return { success: true, captureId: inserted.id, isNew: true };
    }),
});

// ─── Cadence Router (Régua de Sucesso Automatizada) ─────────────────────────
const cadenceRouter = router({
  // List all cadence rules
  listRules: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(cadenceRules).orderBy(asc(cadenceRules.createdAt));
  }),

  // Create a new cadence rule
  createRule: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      triggerType: z.enum(['days_since_entry', 'days_since_contact', 'days_before_renewal', 'health_score_below', 'new_customer']),
      triggerValue: z.number().int().default(0),
      actionType: z.enum(['send_whatsapp', 'send_group_message', 'create_task', 'update_health_score', 'notify_agent']),
      messageTemplate: z.string().optional(),
      taskTitle: z.string().optional(),
      healthScoreDelta: z.number().int().optional(),
      targetProgram: z.string().optional(),
      targetStatus: z.enum(['Active', 'At Risk', 'New', 'all']).default('all'),
      executionFrequency: z.enum(['once', 'daily', 'weekly', 'monthly']).default('once'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await db.insert(cadenceRules).values({
        name: input.name,
        description: input.description,
        triggerType: input.triggerType,
        triggerValue: input.triggerValue,
        actionType: input.actionType,
        messageTemplate: input.messageTemplate,
        taskTitle: input.taskTitle,
        healthScoreDelta: input.healthScoreDelta,
        targetProgram: input.targetProgram,
        targetStatus: input.targetStatus,
        executionFrequency: input.executionFrequency,
        isActive: true,
      });
      return { success: true };
    }),

  // Update a cadence rule
  updateRule: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      messageTemplate: z.string().optional(),
      taskTitle: z.string().optional(),
      healthScoreDelta: z.number().int().optional(),
      targetProgram: z.string().optional(),
      targetStatus: z.enum(['Active', 'At Risk', 'New', 'all']).optional(),
      triggerValue: z.number().int().optional(),
      isActive: z.boolean().optional(),
      executionFrequency: z.enum(['once', 'daily', 'weekly', 'monthly']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { id, ...updates } = input;
      await db.update(cadenceRules).set(updates).where(eq(cadenceRules.id, id));
      return { success: true };
    }),

  // Delete a cadence rule
  deleteRule: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await db.delete(cadenceRules).where(eq(cadenceRules.id, input.id));
      return { success: true };
    }),

  // List execution logs
  listExecutions: protectedProcedure
    .input(z.object({
      ruleId: z.number().int().optional(),
      customerId: z.number().int().optional(),
      status: z.enum(['sent', 'failed', 'skipped', 'pending']).optional(),
      limit: z.number().int().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.ruleId) conditions.push(eq(cadenceExecutions.ruleId, input.ruleId));
      if (input.customerId) conditions.push(eq(cadenceExecutions.customerId, input.customerId));
      if (input.status) conditions.push(eq(cadenceExecutions.status, input.status));
      const query = db.select().from(cadenceExecutions)
        .orderBy(desc(cadenceExecutions.executedAt))
        .limit(input.limit);
      if (conditions.length > 0) {
        return query.where(and(...conditions));
      }
      return query;
    }),

  // Get today's execution summary
  getTodaySummary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { sent: 0, failed: 0, skipped: 0, total: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await db.select().from(cadenceExecutions)
      .where(gte(cadenceExecutions.executedAt, today));
    const sent = rows.filter(r => r.status === 'sent').length;
    const failed = rows.filter(r => r.status === 'failed').length;
    const skipped = rows.filter(r => r.status === 'skipped').length;
    return { sent, failed, skipped, total: rows.length };
  }),

  // Execute the cadence engine manually (also called by scheduled task)
  runEngine: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const now = new Date();
    const results = { processed: 0, sent: 0, skipped: 0, failed: 0 };

    // Get all active rules
    const rules = await db.select().from(cadenceRules).where(eq(cadenceRules.isActive, true));
    if (rules.length === 0) return { ...results, message: 'Nenhuma regra ativa' };

    // Get all active customers
    const allCustomers = await db.select().from(customers)
      .where(sql`status != 'Churned'`);

    for (const rule of rules) {
      for (const customer of allCustomers) {
        // Filter by program
        if (rule.targetProgram && customer.program !== rule.targetProgram) continue;
        // Filter by status
        if (rule.targetStatus !== 'all' && customer.status !== rule.targetStatus) continue;

        const daysSinceEntry = Math.floor((now.getTime() - new Date(customer.createdAt).getTime()) / 86400000);
        const daysSinceContact = customer.lastInteractionAt
          ? Math.floor((now.getTime() - new Date(customer.lastInteractionAt).getTime()) / 86400000)
          : daysSinceEntry;
        const daysToRenewal = customer.renewalDate
          ? Math.floor((new Date(customer.renewalDate).getTime() - now.getTime()) / 86400000)
          : null;
        const healthScore = customer.healthScore ?? 50;

        // Check if rule fires today
        let fires = false;
        switch (rule.triggerType) {
          case 'days_since_entry': fires = daysSinceEntry === rule.triggerValue; break;
          case 'days_since_contact': fires = daysSinceContact >= rule.triggerValue; break;
          case 'days_before_renewal': fires = daysToRenewal !== null && daysToRenewal === rule.triggerValue; break;
          case 'health_score_below': fires = healthScore < rule.triggerValue; break;
          case 'new_customer': fires = daysSinceEntry <= 1; break;
        }

        if (!fires) continue;

        // For 'once' frequency, skip if already executed for this customer+rule
        if (rule.executionFrequency === 'once') {
          const existing = await db.select().from(cadenceExecutions)
            .where(and(eq(cadenceExecutions.ruleId, rule.id), eq(cadenceExecutions.customerId, customer.id)))
            .limit(1);
          if (existing.length > 0) continue;
        }

        results.processed++;

        // Generate message via LLM if template exists
        let generatedMessage: string | null = null;
        if (rule.messageTemplate && rule.actionType === 'send_whatsapp') {
          try {
            const prompt = rule.messageTemplate
              .replace(/\{\{name\}\}/g, customer.name)
              .replace(/\{\{program\}\}/g, customer.program ?? 'seu programa')
              .replace(/\{\{healthScore\}\}/g, String(healthScore))
              .replace(/\{\{daysSinceEntry\}\}/g, String(daysSinceEntry))
              .replace(/\{\{daysSinceContact\}\}/g, String(daysSinceContact));

            const llmResp = await invokeLLM({
              messages: [
                { role: 'system', content: 'Você é um assistente de Customer Success. Gere uma mensagem de WhatsApp profissional, calorosa e personalizada em português. Máximo 3 parágrafos curtos. Não use asteriscos ou markdown.' },
                { role: 'user', content: prompt },
              ],
            });
            const rawContent = llmResp.choices?.[0]?.message?.content;
            generatedMessage = typeof rawContent === 'string' ? rawContent : prompt;
          } catch {
            generatedMessage = rule.messageTemplate;
          }
        }

        // Execute action
        let status: 'sent' | 'failed' | 'skipped' = 'skipped';
        let errorMessage: string | null = null;

        try {
          if (rule.actionType === 'send_whatsapp' && generatedMessage) {
            // In production: integrate with WhatsApp API here
            // For now: log as sent (simulation)
            status = 'sent';
            results.sent++;
          } else if (rule.actionType === 'create_task' && rule.taskTitle) {
            await db.insert(customerJourneyTasks).values({
              customerId: customer.id,
              title: rule.taskTitle,
              status: 'pending',
              phase: 'manual',
              priority: 'normal',
              dueDate: new Date(now.getTime() + 3 * 86400000), // 3 days from now
            });
            status = 'sent';
            results.sent++;
          } else if (rule.actionType === 'update_health_score' && rule.healthScoreDelta) {
            const newScore = Math.max(0, Math.min(100, healthScore + rule.healthScoreDelta));
            await db.update(customers).set({ healthScore: newScore }).where(eq(customers.id, customer.id));
            status = 'sent';
            results.sent++;
          } else if (rule.actionType === 'notify_agent') {
            await notifyOwner({
              title: `Régua: ${rule.name}`,
              content: `Cliente ${customer.name} (${customer.program}) disparou a regra "${rule.name}".`,
            });
            status = 'sent';
            results.sent++;
          } else {
            status = 'skipped';
            results.skipped++;
          }
        } catch (e: any) {
          status = 'failed';
          errorMessage = e?.message ?? 'Erro desconhecido';
          results.failed++;
        }

        // Log execution
        await db.insert(cadenceExecutions).values({
          ruleId: rule.id,
          customerId: customer.id,
          status,
          generatedMessage,
          errorMessage,
          customerName: customer.name,
          customerProgram: customer.program,
          healthScoreAtExecution: healthScore,
        });
      }
    }

    return { ...results, message: `Engine executado: ${results.processed} verificações, ${results.sent} ações executadas` };
  }),
});

// ─── Transcripts Router ────────────────────────────────────────────────────
const transcriptsRouter = router({
  // Upload and analyze a meeting transcript
  upload: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      title: z.string(),
      content: z.string(), // full text content (extracted from PDF on frontend or raw text)
      fileUrl: z.string().optional(),
      fileKey: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // 1. Save the transcript first
      const [inserted] = await db.insert(meetingTranscripts).values({
        customerId: input.customerId,
        title: input.title,
        content: input.content,
        fileUrl: input.fileUrl ?? null,
        fileKey: input.fileKey ?? null,
        createdBy: ctx.user.id,
      });
      const transcriptId = (inserted as any).insertId as number;

      // 2. Analyze with LLM in background (non-blocking)
      try {
        const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
        const systemPrompt = `Você é um analista de Customer Success. Analise a transcrição de reunião abaixo e retorne um JSON com:\n- summary: string (resumo executivo em 2-3 parágrafos)\n- keyPoints: string[] (até 5 pontos principais discutidos)\n- actionItems: string[] (até 5 itens de ação identificados)\n- healthScoreDelta: number (entre -20 e +20)\n- sentiment: "positive" | "neutral" | "negative"\n- knowledgeItems: string[] (dúvidas recorrentes identificadas)\nResponda APENAS com o JSON, sem markdown.`;
        const userPrompt = `Cliente: ${customer?.name ?? "Desconhecido"} | Programa: ${customer?.program ?? "N/A"}\n\nTranscrição:\n${input.content.substring(0, 8000)}`;
        const analysisResult = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemPrompt },
            { role: "user" as const, content: userPrompt }
          ]
        });

        const rawContent = analysisResult.choices?.[0]?.message?.content;
        const raw = typeof rawContent === "string" ? rawContent : "{}";
        let analysis: any = {};
        try { analysis = JSON.parse(raw); } catch { /* ignore parse errors */ }

        // 3. Update transcript with analysis
        await db.update(meetingTranscripts).set({
          summary: analysis.summary ?? null,
          keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints.join("\n") : null,
          actionItems: Array.isArray(analysis.actionItems) ? analysis.actionItems.join("\n") : null,
          healthScoreDelta: analysis.healthScoreDelta ?? 0,
          analyzedAt: new Date(),
        }).where(eq(meetingTranscripts.id, transcriptId));

        // 4. Update customer health score
        if (analysis.healthScoreDelta && analysis.healthScoreDelta !== 0 && customer) {
          const newScore = Math.max(0, Math.min(100, (customer.healthScore ?? 50) + analysis.healthScoreDelta));
          await db.update(customers).set({ healthScore: newScore, updatedAt: new Date() }).where(eq(customers.id, input.customerId));
        }

        // 5. Capture knowledge items
        if (Array.isArray(analysis.knowledgeItems) && analysis.knowledgeItems.length > 0) {
          for (const item of analysis.knowledgeItems) {
            if (!item || item.length < 10) continue;
            const normalized = item.toLowerCase().trim().substring(0, 200);
            const [existing] = await db.select().from(knowledgeCaptures)
              .where(eq(knowledgeCaptures.normalizedQuestion, normalized)).limit(1);
            if (existing) {
              await db.update(knowledgeCaptures)
                .set({ frequency: (existing.frequency ?? 1) + 1, updatedAt: new Date() })
                .where(eq(knowledgeCaptures.id, existing.id));
            } else {
              await db.insert(knowledgeCaptures).values({
                question: item,
                normalizedQuestion: normalized,
                category: "outros" as const,
                frequency: 1,
                lastSeenAt: new Date(),
                status: "pending" as const,
                sourceConversationIds: [],
              });
            }
          }
        }
      } catch (err) {
        // Analysis failed silently — transcript is still saved
        console.error("[Transcripts] LLM analysis failed:", err);
      }

      return { id: transcriptId, success: true };
    }),

  // List transcripts for a customer
  list: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(meetingTranscripts)
        .where(eq(meetingTranscripts.customerId, input.customerId))
        .orderBy(desc(meetingTranscripts.createdAt));
    }),

  // Delete a transcript
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(meetingTranscripts).where(eq(meetingTranscripts.id, input.id));
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  customers: customersRouter,
  conversations: conversationsRouter,
  messages: messagesRouter,
  ai: aiRouter,
  surveys: surveysRouter,
  referrals: referralsRouter,
  productivity: productivityRouter,
  users: usersRouter,
  ghl: ghlRouter,
  upsell: upsellRouter,
  guru: guruRouter,
  aiAgents: aiAgentsRouter,
  channels: channelSettingsRouter,
  scheduledMessages: scheduledMessagesRouter,
  quickReplies: quickRepliesRouter,
  tasks: tasksRouter,
  teamChat: teamChatRouter,
  broadcasts: broadcastsRouter,
  alerts: alertsRouter,
  sla: slaRouter,
  reports: reportsRouter,
   satisfaction: satisfactionRouter,
  groups: groupsRouter,
  programDashboard: programDashboardRouter,
  renewalCalendar: renewalCalendarRouter,
  aiSupervision: aiSupervisionRouter,
  playbooks: playbooksRouter,
  triggerRules: triggerRulesRouter,
  journey: journeyRouter,
  healthScore: healthScoreRouter,
  triggerLogs: triggerLogsRouter,
  intelligence: intelligenceRouter,
  campaigns: campaignsRouter,
  journeyTasks: journeyTasksRouter,
  customerNotes: customerNotesRouter,
  customerMilestones: customerMilestonesRouter,
   commandPanel: commandPanelRouter,
  tags: tagsRouter,
  knowledgeLive: knowledgeLiveRouter,
  cadence: cadenceRouter,
  transcripts: transcriptsRouter,
  taskAttachments: taskAttachmentsRouter,
  clientROI: clientROIRouter,
  clientGoals: clientGoalsRouter,
  forms: formsRouter,
  sara: saraRouter,
});

export type AppRouter = typeof appRouter;

