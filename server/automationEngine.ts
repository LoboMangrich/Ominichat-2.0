/**
 * automationEngine.ts
 * Motor de automação proativa do Cashmiles CS.
 * Contém:
 *   1. evaluateTriggers() — avalia todas as regras ativas e cria ações na fila de supervisão
 *   2. recalculateAllHealthScores() — recalcula health score de todos os clientes e atualiza status
 * Chamados pelos endpoints /api/scheduled/evaluate-triggers e /api/scheduled/recalculate-health.
 */
import { getDb } from "./db";
import { sendMessageByConversation } from "./channelSender";
import {
  triggerRules, customers, conversations, messages,
  aiSupervisionQueue, tasks, surveys, triggerLogs, aiAgents,
} from "../drizzle/schema";
import { eq, and, sql, desc, gte, count, lt } from "drizzle-orm";
import { startJourneyForCustomer } from "./playbookEngine";

// ─── Evaluate Triggers ────────────────────────────────────────────────────────
export async function evaluateTriggers(): Promise<{ triggered: number; rules: number }> {
  const db = await getDb();
  if (!db) return { triggered: 0, rules: 0 };

  const now = new Date();
  let triggered = 0;

  const rules = await db.select().from(triggerRules).where(eq(triggerRules.isActive, true));

  for (const rule of rules) {
    try {
      let affectedCustomers: Array<{ id: number; name: string; program: string | null; phone: string | null }> = [];

      // ── Evaluate condition ──────────────────────────────────────────────────
      if (rule.conditionType === "no_interaction_days") {
        const days = parseInt(rule.conditionValue, 10);
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const allActive = await db
          .select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone, lastInteractionAt: customers.lastInteractionAt })
          .from(customers)
          .where(eq(customers.status, "Active"));

        for (const c of allActive) {
          const lastInteraction = c.lastInteractionAt ? new Date(c.lastInteractionAt) : null;
          if (!lastInteraction || lastInteraction < cutoff) {
            affectedCustomers.push({ id: c.id, name: c.name, program: c.program, phone: c.phone });
          }
        }
      } else if (rule.conditionType === "health_score_below") {
        const threshold = parseInt(rule.conditionValue, 10);
        const rows = await db
          .select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone })
          .from(customers)
          .where(and(
            sql`healthScore < ${threshold}`,
            sql`healthScore IS NOT NULL`,
            eq(customers.status, "Active"),
          ));
        affectedCustomers = rows;
      } else if (rule.conditionType === "renewal_days_remaining") {
        const days = parseInt(rule.conditionValue, 10);
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const rows = await db
          .select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone })
          .from(customers)
          .where(and(
            sql`renewalDate <= ${future}`,
            sql`renewalDate >= ${now}`,
            eq(customers.status, "Active"),
          ));
        affectedCustomers = rows;
      } else if (rule.conditionType === "nps_score_below") {
        const threshold = parseInt(rule.conditionValue, 10);
        const rows = await db
          .select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone })
          .from(customers)
          .where(and(
            sql`npsScore < ${threshold}`,
            sql`npsScore IS NOT NULL`,
            eq(customers.status, "Active"),
          ));
        affectedCustomers = rows;
      } else if (rule.conditionType === "health_score_above") {
        const threshold = parseInt(rule.conditionValue, 10);
        const rows = await db
          .select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone })
          .from(customers)
          .where(and(
            sql`healthScore > ${threshold}`,
            sql`healthScore IS NOT NULL`,
            eq(customers.status, "Active"),
          ));
        affectedCustomers = rows;
      } else if (rule.conditionType === "nps_score_above") {
        const threshold = parseInt(rule.conditionValue, 10);
        const rows = await db
          .select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone })
          .from(customers)
          .where(and(
            sql`npsScore > ${threshold}`,
            sql`npsScore IS NOT NULL`,
            eq(customers.status, "Active"),
          ));
        affectedCustomers = rows;
      }

      // Filter by program if rule has a program filter
      if (rule.program) {
        affectedCustomers = affectedCustomers.filter(c =>
          c.program && c.program.toLowerCase() === rule.program!.toLowerCase()
        );
      }

      // Fetch agent name once per rule for logging
      let agentNameForLog: string | null = null;
      if (rule.agentId) {
        const [ag] = await db.select({ name: aiAgents.name }).from(aiAgents).where(eq(aiAgents.id, rule.agentId)).limit(1);
        agentNameForLog = ag?.name ?? null;
      }

      // ── Execute action (max 50 per rule per run) ────────────────────────────
      for (const customer of affectedCustomers.slice(0, 50)) {
        try {
          if (rule.actionType === "create_supervision_item") {
            await db.insert(aiSupervisionQueue).values({
              customerId: customer.id,
              agentId: rule.agentId ?? null,
              actionType: "proactive_outreach",
              actionDescription: `Gatilho: ${rule.name}${rule.description ? ` — ${rule.description}` : ""}`,
              messageContent: rule.actionConfig?.messageTemplate ?? null,
              status: "pending",
            });
            await db.insert(triggerLogs).values({
              ruleId: rule.id, ruleName: rule.name,
              customerId: customer.id, customerName: customer.name,
              agentId: rule.agentId ?? null, agentName: agentNameForLog,
              conditionType: rule.conditionType, conditionValue: rule.conditionValue,
              conditionSnapshot: {},
              actionType: rule.actionType, actionResult: 'success',
              actionDetail: `Item de supervisão criado: "${rule.name}"`,
              isSimulation: false,
            });
            triggered++;
          } else if (rule.actionType === "send_ai_message") {
            const template = rule.actionConfig?.messageTemplate;
            if (template) {
              const content = template
                .replace(/\{\{nome\}\}/gi, customer.name || "cliente")
                .replace(/\{\{programa\}\}/gi, customer.program || "programa");

              // Find active conversation
              const [conv] = await db
                .select({ id: conversations.id })
                .from(conversations)
                .where(and(
                  eq(conversations.customerId, customer.id),
                  eq(conversations.channel, "whatsapp"),
                ))
                .orderBy(desc(conversations.createdAt))
                .limit(1);

              if (conv) {
                const sendResult = await sendMessageByConversation({ conversationId: conv.id, content });
                if (sendResult.success) {
                  await db.insert(messages).values({
                    conversationId: conv.id,
                    content,
                    senderType: "agent",
                    isInternal: false,
                    whatsappMessageId: sendResult.externalId ?? null,
                  });
                  triggered++;
                }
              }
            }
          } else if (rule.actionType === "update_status") {
            const newStatus = rule.actionConfig?.status as any;
            if (newStatus) {
              await db.update(customers).set({ status: newStatus }).where(eq(customers.id, customer.id));
              triggered++;
            }
          } else if (rule.actionType === "assign_playbook") {
            const playbookId = rule.actionConfig?.playbookId ? parseInt(rule.actionConfig.playbookId) : null;
            if (playbookId) {
              // Import and use journey router logic
              const { customerJourney, playbookSteps } = await import("../drizzle/schema");
              const { asc } = await import("drizzle-orm");
              const [firstStep] = await db
                .select()
                .from(playbookSteps)
                .where(and(eq(playbookSteps.playbookId, playbookId), eq(playbookSteps.isActive, true)))
                .orderBy(asc(playbookSteps.stepOrder))
                .limit(1);
              const nextActionAt = firstStep
                ? new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000)
                : null;
              await db.insert(customerJourney).values({
                customerId: customer.id,
                playbookId,
                currentStepId: firstStep?.id ?? null,
                nextActionAt,
                status: "active",
              });
              triggered++;
            }
          } else if (rule.actionType === "create_task") {
            const taskTitle = rule.actionConfig?.taskTitle || `Ação necessária: ${rule.name}`;
            await db.insert(tasks).values({
              customerId: customer.id,
              title: taskTitle.replace(/\{\{nome\}\}/gi, customer.name || "cliente"),
              description: rule.description || "",
              priority: "high",
              status: "todo",
              createdBy: 1,
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });
            triggered++;
          } else if (rule.actionType === "send_nps") {
            const [conv] = await db
              .select({ id: conversations.id })
              .from(conversations)
              .where(and(
                eq(conversations.customerId, customer.id),
                eq(conversations.channel, "whatsapp"),
              ))
              .orderBy(desc(conversations.createdAt))
              .limit(1);

            if (conv) {
              const npsMessage = `Olá, ${customer.name || "cliente"}! Em uma escala de 0 a 10, o quanto você indicaria o ${customer.program || "programa"} para um amigo? 🙏`;
              await sendMessageByConversation({ conversationId: conv.id, content: npsMessage });
              await db.insert(surveys).values({
                customerId: customer.id,
                conversationId: conv.id,
                type: "NPS",
                status: "Sent",
                sentAt: new Date(),
              });
              triggered++;
            }
          }
        } catch (err: any) {
          console.error(`[AutomationEngine] Error processing customer ${customer.id} for rule ${rule.id}:`, err?.message);
        }
      }

      // Update rule metadata
      await db.update(triggerRules)
        .set({
          lastEvaluatedAt: now,
          triggerCount: sql`triggerCount + ${affectedCustomers.length}`,
        })
        .where(eq(triggerRules.id, rule.id));
    } catch (err: any) {
      console.error(`[AutomationEngine] Error evaluating rule ${rule.id}:`, err?.message);
    }
  }

  console.log(`[AutomationEngine] Evaluated ${rules.length} rules, triggered ${triggered} actions`);
  return { triggered, rules: rules.length };
}

// ─── Recalculate All Health Scores ────────────────────────────────────────────
export async function recalculateAllHealthScores(): Promise<{ updated: number; atRiskAlerts: number }> {
  const db = await getDb();
  if (!db) return { updated: 0, atRiskAlerts: 0 };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const allCustomers = await db.select().from(customers);
  let updated = 0;
  let atRiskAlerts = 0;

  for (const customer of allCustomers) {
    try {
      const recentConvs = await db
        .select({ qualityScore: conversations.qualityScore })
        .from(conversations)
        .where(and(
          eq(conversations.customerId, customer.id),
          gte(conversations.createdAt, thirtyDaysAgo),
        ));

      // NPS component (0-30 pts)
      const npsComponent = customer.npsScore != null ? (customer.npsScore / 10) * 30 : 15;

      // Recency component (0-30 pts)
      const daysSinceContact = customer.lastInteractionAt
        ? Math.min(30, Math.floor((Date.now() - new Date(customer.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24)))
        : 30;
      const recencyComponent = ((30 - daysSinceContact) / 30) * 30;

      // Quality component (0-25 pts)
      const qualityConvs = recentConvs.filter(c => c.qualityScore != null);
      const avgQuality = qualityConvs.length > 0
        ? qualityConvs.reduce((sum, c) => sum + (c.qualityScore ?? 0), 0) / qualityConvs.length
        : 50;
      const qualityComponent = (avgQuality / 100) * 25;

      // Status component (0-15 pts)
      const statusComponent = customer.status === "Active" ? 15
        : customer.status === "New" ? 12
        : customer.status === "At Risk" ? 5
        : 0;

      const newScore = Math.round(npsComponent + recencyComponent + qualityComponent + statusComponent);
      const prevScore = customer.healthScore ?? null;

      // Determine new status based on score
      let newStatus = customer.status;
      if (newScore < 20 && customer.status !== "Churned") {
        newStatus = "At Risk";
      } else if (newScore >= 20 && newScore < 40 && customer.status === "Active") {
        newStatus = "At Risk";
      } else if (newScore >= 40 && customer.status === "At Risk") {
        newStatus = "Active"; // recovered
      }

      await db.update(customers)
        .set({ healthScore: newScore, status: newStatus })
        .where(eq(customers.id, customer.id));

      updated++;

      // Create supervision alert if score dropped significantly or is critically low
      const scoreDrop = prevScore !== null ? prevScore - newScore : 0;
      if (newScore < 30 && newStatus === "At Risk") {
        // Check if we already created an alert recently (avoid duplicates)
        const recentAlert = await db
          .select({ id: aiSupervisionQueue.id })
          .from(aiSupervisionQueue)
          .where(and(
            eq(aiSupervisionQueue.customerId, customer.id),
            eq(aiSupervisionQueue.actionType, "churn_risk_alert"),
            eq(aiSupervisionQueue.status, "pending"),
          ))
          .limit(1);

        if (!recentAlert.length) {
          await db.insert(aiSupervisionQueue).values({
            customerId: customer.id,
            actionType: "churn_risk_alert",
            actionDescription: `Health score crítico: ${newScore}/100${scoreDrop > 10 ? ` (queda de ${scoreDrop} pontos)` : ""}. Cliente em risco de churn.`,
            status: "pending",
          });
          atRiskAlerts++;

          // Also start churn prevention playbook if not already active
          await startJourneyForCustomer(customer.id, "health_score_drop", customer.program);
        }
      }
    } catch (err: any) {
      console.error(`[AutomationEngine] Error recalculating health for customer ${customer.id}:`, err?.message);
    }
  }

  console.log(`[AutomationEngine] Health scores updated: ${updated}, at-risk alerts created: ${atRiskAlerts}`);
  return { updated, atRiskAlerts };
}
