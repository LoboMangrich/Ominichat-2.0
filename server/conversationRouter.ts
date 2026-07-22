/**
 * conversationRouter.ts
 * Roteamento automático de conversas para o agente de IA correto.
 *
 * Lógica de roteamento (em ordem de prioridade):
 *   1. Cliente tem jornada de playbook ativa → usa o agente do playbook
 *   2. Cliente tem health score < 40 → Sentinel (prevenção de churn)
 *   3. Cliente tem renovação em ≤ 30 dias → Renata (renovação)
 *   4. Cliente criado há ≤ 30 dias → Sofia (onboarding)
 *   5. Qualquer outra mensagem → Bia (atendimento geral)
 *
 * Chamado automaticamente pelo webhook de mensagem recebida (webhooks.ts).
 */
import { getDb } from "./db";
import {
  conversations,
  customers,
  aiAgents,
  customerJourney,
  playbooks,
} from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export type RoutingResult = {
  agentId: number;
  agentName: string;
  reason: string;
};

/**
 * Determina o agente correto para uma conversa e atualiza a conversa
 * para ser gerenciada por esse agente automaticamente.
 */
export async function routeConversationToAgent(
  conversationId: number
): Promise<RoutingResult | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    // 1. Buscar a conversa e o cliente associado
    const [conv] = await db
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
        handledByAi: conversations.handledByAi,
        aiAgentId: conversations.aiAgentId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!conv || !conv.customerId) return null;

    // Se já está sendo gerenciado por humano, não roteamos
    if (conv.handledByAi === false && conv.aiAgentId) return null;

    const customerId = conv.customerId;

    // 2. Buscar dados do cliente
    const [customer] = await db
      .select({
        id: customers.id,
        healthScore: customers.healthScore,
        renewalDate: customers.renewalDate,
        createdAt: customers.createdAt,
        status: customers.status,
      })
      .from(customers)
      .where(eq(customers.id, customerId));

    if (!customer) return null;

    const now = new Date();

    // Helper para buscar agente pelo nome
    const getAgentByName = async (name: string) => {
      const [agent] = await db
        .select({ id: aiAgents.id, name: aiAgents.name })
        .from(aiAgents)
        .where(and(eq(aiAgents.name, name), eq(aiAgents.isActive, true)));
      return agent ?? null;
    };

    // Helper para buscar o primeiro agente ativo como fallback
    const getFallbackAgent = async () => {
      const [agent] = await db
        .select({ id: aiAgents.id, name: aiAgents.name })
        .from(aiAgents)
        .where(eq(aiAgents.isActive, true));
      return agent ?? null;
    };

    let selectedAgent: { id: number; name: string } | null = null;
    let reason = "";

    // ── Regra 1: Jornada de playbook ativa ──────────────────────────────────
    const [activeJourney] = await db
      .select({
        id: customerJourney.id,
        playbookId: customerJourney.playbookId,
      })
      .from(customerJourney)
      .where(
        and(
          eq(customerJourney.customerId, customerId),
          eq(customerJourney.status, "active")
        )
      )
      .orderBy(desc(customerJourney.startedAt))
      .limit(1);

    if (activeJourney) {
      // Determinar agente baseado no nome do playbook
      const [pb] = await db
        .select({ name: playbooks.name })
        .from(playbooks)
        .where(eq(playbooks.id, activeJourney.playbookId));

      if (pb) {
        const pbName = pb.name.toLowerCase();
        if (pbName.includes("onboarding")) {
          selectedAgent = await getAgentByName("Sofia");
          reason = "Playbook de onboarding ativo";
        } else if (pbName.includes("engajamento")) {
          selectedAgent = await getAgentByName("Luna");
          reason = "Playbook de engajamento ativo";
        } else if (pbName.includes("churn") || pbName.includes("preven")) {
          selectedAgent = await getAgentByName("Sentinel");
          reason = "Playbook de prevenção de churn ativo";
        } else if (pbName.includes("expans") || pbName.includes("upsell")) {
          selectedAgent = await getAgentByName("Max");
          reason = "Playbook de expansão ativo";
        } else if (pbName.includes("renova")) {
          selectedAgent = await getAgentByName("Renata");
          reason = "Playbook de renovação ativo";
        }
      }
    }

    // ── Regra 2: Health score crítico → Sentinel ────────────────────────────
    if (!selectedAgent && customer.healthScore !== null && customer.healthScore < 40) {
      selectedAgent = await getAgentByName("Sentinel");
      reason = `Health score crítico (${customer.healthScore})`;
    }

    // ── Regra 3: Renovação próxima (≤ 30 dias) → Renata ────────────────────
    if (!selectedAgent && customer.renewalDate) {
      const renewal = new Date(customer.renewalDate);
      const daysUntilRenewal = Math.floor(
        (renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilRenewal >= 0 && daysUntilRenewal <= 30) {
        selectedAgent = await getAgentByName("Renata");
        reason = `Renovação em ${daysUntilRenewal} dias`;
      }
    }

    // ── Regra 4: Cliente novo (≤ 30 dias) → Sofia ───────────────────────────
    if (!selectedAgent && customer.createdAt) {
      const created = new Date(customer.createdAt);
      const daysSinceCreation = Math.floor(
        (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceCreation <= 30) {
        selectedAgent = await getAgentByName("Sofia");
        reason = `Cliente novo (${daysSinceCreation} dias)`;
      }
    }

    // ── Regra 5: Fallback → Bia (atendimento geral) ─────────────────────────
    if (!selectedAgent) {
      selectedAgent = await getAgentByName("Bia");
      reason = "Atendimento geral";
    }

    // ── Fallback final: primeiro agente ativo ────────────────────────────────
    if (!selectedAgent) {
      selectedAgent = await getFallbackAgent();
      reason = "Fallback — primeiro agente ativo";
    }

    if (!selectedAgent) return null;

    // 3. Atualizar a conversa para ser gerenciada por esse agente
    await db
      .update(conversations)
      .set({
        handledByAi: true,
        aiAgentId: selectedAgent.id,
      })
      .where(eq(conversations.id, conversationId));

    console.log(
      `[Router] Conversa #${conversationId} → ${selectedAgent.name} (${reason})`
    );

    return {
      agentId: selectedAgent.id,
      agentName: selectedAgent.name,
      reason,
    };
  } catch (err) {
    console.error("[Router] Erro no roteamento automático:", err);
    return null;
  }
}
