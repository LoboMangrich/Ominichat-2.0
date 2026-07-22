/**
 * playbookEngine.ts
 * Motor de execução de playbooks.
 * Processa jornadas ativas e executa os steps que já venceram (nextActionAt <= agora).
 * Chamado pelo endpoint POST /api/scheduled/process-journeys a cada 30 minutos.
 */
import { getDb } from "./db";
import { sendMessageByConversation } from "./channelSender";
import {
  customerJourney, playbookSteps, customers, conversations,
  messages, tasks, aiSupervisionQueue, surveys, journeyStepExecutions,
} from "../drizzle/schema";
import { eq, and, lte, isNotNull, asc, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────
type StepResult = {
  success: boolean;
  message: string;
};

// ─── Template Variable Replacement ───────────────────────────────────────────
function fillTemplate(template: string, customer: { name: string; program?: string | null }): string {
  return template
    .replace(/\{\{nome\}\}/gi, customer.name || "cliente")
    .replace(/\{\{name\}\}/gi, customer.name || "cliente")
    .replace(/\{\{programa\}\}/gi, customer.program || "programa")
    .replace(/\{\{program\}\}/gi, customer.program || "programa");
}

// ─── Execute a Single Step ────────────────────────────────────────────────────
async function executeStep(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  journey: {
    id: number;
    customerId: number;
    playbookId: number;
    currentStepId: number | null;
    stepsCompleted: number;
  },
  step: {
    id: number;
    stepType: string;
    messageTemplate?: string | null;
    taskTitle?: string | null;
    taskDescription?: string | null;
    healthScoreDelta?: number | null;
    tagToAdd?: string | null;
  },
  customer: { id: number; name: string; program?: string | null; phone?: string | null },
): Promise<StepResult> {
  try {
    switch (step.stepType) {
      case "send_message":
      case "send_nps":
      case "send_csat": {
        if (!step.messageTemplate) return { success: false, message: "No message template" };
        const content = fillTemplate(step.messageTemplate, customer);

        // Find or create a conversation for this customer
        const [existingConv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.customerId, customer.id),
              eq(conversations.channel, "whatsapp"),
            )
          )
          .orderBy(desc(conversations.createdAt))
          .limit(1);

        if (!existingConv) {
          return { success: false, message: "No WhatsApp conversation found for customer" };
        }

        const sendResult = await sendMessageByConversation({
          conversationId: existingConv.id,
          content,
        });

        if (sendResult.success) {
          // Record the message in the conversation
          await db.insert(messages).values({
            conversationId: existingConv.id,
            content,
            senderType: "agent",
            isInternal: false,
            whatsappMessageId: sendResult.externalId ?? null,
          });

          // For NPS/CSAT, also create a survey record
          if (step.stepType === "send_nps" || step.stepType === "send_csat") {
            await db.insert(surveys).values({
              customerId: customer.id,
              conversationId: existingConv.id,
              type: step.stepType === "send_nps" ? "NPS" : "CSAT",
              status: "Sent",
              sentAt: new Date(),
            });
          }

          return { success: true, message: `Message sent: ${content.substring(0, 50)}...` };
        } else {
          return { success: false, message: sendResult.error || "Send failed" };
        }
      }

      case "create_task": {
        const title = fillTemplate(step.taskTitle || "Tarefa automática", customer);
        const description = fillTemplate(step.taskDescription || "", customer);
        await db.insert(tasks).values({
          customerId: customer.id,
          title,
          description,
          priority: "high",
          status: "todo",
          createdBy: 1, // system user
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // due tomorrow
        });
        return { success: true, message: `Task created: ${title}` };
      }

      case "update_health_score": {
        if (step.healthScoreDelta) {
          const [current] = await db.select({ healthScore: customers.healthScore })
            .from(customers).where(eq(customers.id, customer.id)).limit(1);
          const newScore = Math.max(0, Math.min(100, (current?.healthScore ?? 50) + step.healthScoreDelta));
          await db.update(customers).set({ healthScore: newScore }).where(eq(customers.id, customer.id));
          return { success: true, message: `Health score updated by ${step.healthScoreDelta} → ${newScore}` };
        }
        return { success: false, message: "No healthScoreDelta specified" };
      }

      case "escalate_to_human": {
        const title = fillTemplate(step.taskTitle || "Escalação para humano", customer);
        const description = fillTemplate(step.taskDescription || "Cliente precisa de atenção humana.", customer);
        // Create supervision item
        await db.insert(aiSupervisionQueue).values({
          customerId: customer.id,
          actionType: "churn_risk_alert",
          actionDescription: `Playbook escalation: ${title} — ${description}`,
          status: "pending",
        });
        // Also create a task
        await db.insert(tasks).values({
          customerId: customer.id,
          title,
          description,
          priority: "urgent",
          status: "todo",
          createdBy: 1, // system user
          dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // due in 4 hours
        });
        return { success: true, message: `Escalated to human: ${title}` };
      }

      case "add_tag": {
        // Tags are stored in customer notes/labels — create a supervision note
        if (step.tagToAdd) {
          await db.insert(aiSupervisionQueue).values({
            customerId: customer.id,
            actionType: "proactive_outreach",
            actionDescription: `Tag adicionada automaticamente: ${step.tagToAdd}`,
            status: "approved", // auto-approve tag additions
          });
        }
        return { success: true, message: `Tag added: ${step.tagToAdd}` };
      }

      default:
        return { success: false, message: `Unknown step type: ${step.stepType}` };
    }
  } catch (err: any) {
    return { success: false, message: err?.message ?? "Unknown error" };
  }
}

// ─── Main Engine Function ─────────────────────────────────────────────────────
export async function processJourneys(): Promise<{ processed: number; failed: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { processed: 0, failed: 0, skipped: 0 };

  const now = new Date();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  // Find all active journeys where nextActionAt has passed
  const dueJourneys = await db
    .select()
    .from(customerJourney)
    .where(
      and(
        eq(customerJourney.status, "active"),
        isNotNull(customerJourney.nextActionAt),
        lte(customerJourney.nextActionAt, now),
      )
    )
    .limit(100); // process max 100 per run

  for (const journey of dueJourneys) {
    try {
      if (!journey.currentStepId) {
        // No more steps — mark as completed
        await db.update(customerJourney)
          .set({ status: "completed", completedAt: now })
          .where(eq(customerJourney.id, journey.id));
        skipped++;
        continue;
      }

      // Get the current step
      const [currentStep] = await db
        .select()
        .from(playbookSteps)
        .where(eq(playbookSteps.id, journey.currentStepId))
        .limit(1);

      if (!currentStep || !currentStep.isActive) {
        skipped++;
        continue;
      }

      // Get customer info
      const [customer] = await db
        .select({ id: customers.id, name: customers.name, program: customers.program, phone: customers.phone })
        .from(customers)
        .where(eq(customers.id, journey.customerId))
        .limit(1);

      if (!customer) {
        await db.update(customerJourney)
          .set({ status: "cancelled" })
          .where(eq(customerJourney.id, journey.id));
        skipped++;
        continue;
      }

      // Execute the step
      const result = await executeStep(db, journey, currentStep, customer);

      // Record execution
      await db.insert(journeyStepExecutions).values({
        journeyId: journey.id,
        stepId: currentStep.id,
        customerId: customer.id,
        status: result.success ? "executed" : "failed",
        scheduledAt: journey.nextActionAt!,
        executedAt: now,
        result: result.message,
        errorMessage: result.success ? null : result.message,
      });

      if (result.success) {
        processed++;
      } else {
        failed++;
      }

      // Find the next step in this playbook (same playbookId, higher stepOrder)
      const [nextStep] = await db
        .select()
        .from(playbookSteps)
        .where(
          and(
            eq(playbookSteps.playbookId, journey.playbookId),
            eq(playbookSteps.isActive, true),
          )
        )
        .orderBy(asc(playbookSteps.stepOrder))
        .limit(100); // get all steps

      // Get all steps ordered to find the next one
      const allSteps = await db
        .select()
        .from(playbookSteps)
        .where(
          and(
            eq(playbookSteps.playbookId, journey.playbookId),
            eq(playbookSteps.isActive, true),
          )
        )
        .orderBy(asc(playbookSteps.stepOrder));

      const currentIndex = allSteps.findIndex(s => s.id === currentStep.id);
      const nextStepData = currentIndex >= 0 && currentIndex < allSteps.length - 1
        ? allSteps[currentIndex + 1]
        : null;

      if (nextStepData) {
        // Schedule next step
        const nextActionAt = new Date(now.getTime() + nextStepData.delayDays * 24 * 60 * 60 * 1000);
        await db.update(customerJourney)
          .set({
            currentStepId: nextStepData.id,
            nextActionAt,
            stepsCompleted: (journey.stepsCompleted ?? 0) + 1,
          })
          .where(eq(customerJourney.id, journey.id));
      } else {
        // No more steps — mark as completed
        await db.update(customerJourney)
          .set({
            status: "completed",
            completedAt: now,
            currentStepId: null,
            nextActionAt: null,
            stepsCompleted: (journey.stepsCompleted ?? 0) + 1,
          })
          .where(eq(customerJourney.id, journey.id));
      }
    } catch (err: any) {
      console.error(`[PlaybookEngine] Error processing journey ${journey.id}:`, err?.message);
      failed++;
    }
  }

  console.log(`[PlaybookEngine] Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`);
  return { processed, failed, skipped };
}

// ─── Start Journey for a Customer ────────────────────────────────────────────
export async function startJourneyForCustomer(
  customerId: number,
  triggerEvent: string,
  program?: string | null,
): Promise<{ started: number }> {
  const db = await getDb();
  if (!db) return { started: 0 };

  let started = 0;

  try {
    // Find matching playbooks for this trigger event and program
    const { playbooks } = await import("../drizzle/schema");
    const { eq: eqOp, or, isNull } = await import("drizzle-orm");

    const matchingPlaybooks = await db
      .select()
      .from(playbooks)
      .where(
        and(
          eq(playbooks.triggerEvent, triggerEvent as any),
          eq(playbooks.isActive, true),
        )
      );

    // Filter by program: prefer exact match, fallback to null/empty program (applies to all)
    const programPlaybooks = matchingPlaybooks.filter(pb =>
      !pb.program || pb.program === "" || (program && pb.program.toLowerCase() === program.toLowerCase())
    );

    for (const pb of programPlaybooks) {
      // Check if already active
      const existing = await db
        .select({ id: customerJourney.id })
        .from(customerJourney)
        .where(
          and(
            eq(customerJourney.customerId, customerId),
            eq(customerJourney.playbookId, pb.id),
            eq(customerJourney.status, "active"),
          )
        )
        .limit(1);

      if (existing.length > 0) continue; // already running

      // Get first step
      const [firstStep] = await db
        .select()
        .from(playbookSteps)
        .where(
          and(
            eq(playbookSteps.playbookId, pb.id),
            eq(playbookSteps.isActive, true),
          )
        )
        .orderBy(asc(playbookSteps.stepOrder))
        .limit(1);

      const nextActionAt = firstStep
        ? new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000)
        : null;

      await db.insert(customerJourney).values({
        customerId,
        playbookId: pb.id,
        currentStepId: firstStep?.id ?? null,
        nextActionAt,
        status: "active",
      });

      started++;
      console.log(`[PlaybookEngine] Started journey: customer=${customerId}, playbook="${pb.name}"`);
    }
  } catch (err: any) {
    console.error("[PlaybookEngine] startJourneyForCustomer error:", err?.message);
  }

  return { started };
}
