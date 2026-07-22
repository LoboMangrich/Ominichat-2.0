/**
 * seedDefaults.ts
 * Seed automático executado na inicialização do servidor.
 * Cria os 5 agentes especializados e 5 playbooks padrão se o banco estiver vazio.
 */
import { getDb } from "./db";
import { aiAgents, playbooks, playbookSteps, triggerRules } from "../drizzle/schema";
import { count } from "drizzle-orm";

// ─── Agentes Especializados ───────────────────────────────────────────────────
const DEFAULT_AGENTS = [
  {
    name: "Bia",
    description: "Atendimento geral. Responde mensagens avulsas fora de qualquer playbook ativo. É o primeiro ponto de contato para dúvidas, suporte e solicitações gerais.",
    channel: "all" as const,
    isActive: true,
    programFilter: null,
    escalationThreshold: 65,
    systemPrompt: `Você é Bia, a assistente de atendimento geral do Reino. Seu objetivo é resolver dúvidas, dar suporte e atender solicitações gerais dos clientes que entram em contato fora de qualquer fluxo específico. Seja ágil, simpatética e resolutiva. Para dúvidas técnicas complexas, escale para humano. Para pedidos de reembolso, siga o protocolo: ouviça, registre e escale para gestor. Nunca prometa o que não pode cumprir. Responda sempre em português do Brasil.`,
    greetingMessage: "Olá, {{nome}}! 👋 Sou a Bia, sua assistente do Reino. Como posso te ajudar hoje?",
  },
  {
    name: "Sofia",
    description: "Especialista em onboarding. Garante que o cliente ative e comece a usar o produto nos primeiros 30 dias.",
    channel: "all" as const,
    isActive: true,
    programFilter: null,
    escalationThreshold: 70,
    systemPrompt: `Você é Sofia, a assistente de Customer Success especializada em onboarding. Seu objetivo é garantir que o cliente ative e comece a usar o produto nos primeiros 30 dias. Seja calorosa, empática e proativa. Sempre personalize pelo nome do cliente. Quando identificar dúvidas técnicas, resolva-as ou escale para o time. Comemore as conquistas do cliente. Responda sempre em português do Brasil.`,
    greetingMessage: "Olá, {{nome}}! 👋 Sou a Sofia, sua assistente de sucesso. Estou aqui para garantir que você aproveite ao máximo o programa. Como posso te ajudar hoje?",
  },
  {
    name: "Luna",
    description: "Especialista em engajamento e relacionamento. Mantém o cliente motivado ao longo de toda a jornada.",
    channel: "all" as const,
    isActive: true,
    programFilter: null,
    escalationThreshold: 70,
    systemPrompt: `Você é Luna, a assistente de engajamento e relacionamento. Seu objetivo é manter o cliente engajado e motivado ao longo de toda a jornada. Envie conteúdos relevantes, comemore marcos de progresso e faça check-ins periódicos. Seja inspiradora e motivacional. Identifique sinais de desengajamento e aja proativamente. Responda sempre em português do Brasil.`,
    greetingMessage: "Oi, {{nome}}! 🌟 Sou a Luna. Estou aqui para te ajudar a extrair o máximo do programa. Vamos juntos?",
  },
  {
    name: "Sentinel",
    description: "Especialista em prevenção de churn. Identifica e resolve problemas antes que o cliente desista.",
    channel: "all" as const,
    isActive: true,
    programFilter: null,
    escalationThreshold: 60,
    systemPrompt: `Você é Sentinel, o agente especializado em prevenção de churn. Seu objetivo é identificar e resolver problemas antes que o cliente desista. Quando ativado, significa que o cliente está em risco. Seja empático, ouça as frustrações, ofereça soluções concretas e escale para humano quando necessário. Nunca minimize os problemas do cliente. Responda sempre em português do Brasil.`,
    greetingMessage: "Olá, {{nome}}. Percebi que você não está conseguindo aproveitar o programa como esperava. Posso te ajudar a resolver isso agora?",
  },
  {
    name: "Max",
    description: "Especialista em expansão e crescimento. Identifica oportunidades de upsell em clientes satisfeitos.",
    channel: "all" as const,
    isActive: true,
    programFilter: null,
    escalationThreshold: 75,
    systemPrompt: `Você é Max, o agente de expansão e crescimento. Seu objetivo é identificar clientes satisfeitos e apresentar oportunidades de upsell, upgrade ou indicação. Só aja quando o cliente demonstrar satisfação (NPS 9-10 ou marcos de sucesso). Seja consultivo, não vendedor. Apresente o valor antes do preço. Responda sempre em português do Brasil.`,
    greetingMessage: "Oi, {{nome}}! 🚀 Sou o Max. Vi que você está tendo ótimos resultados! Posso te mostrar como acelerar ainda mais?",
  },
  {
    name: "Renata",
    description: "Especialista em renovação. Garante que o cliente renove antes do vencimento.",
    channel: "all" as const,
    isActive: true,
    programFilter: null,
    escalationThreshold: 65,
    systemPrompt: `Você é Renata, a agente especializada em renovação. Seu objetivo é garantir que o cliente renove antes do vencimento. Comece a conversa 60 dias antes, celebre os resultados alcançados, apresente o valor do próximo ciclo e remova objeções. Seja estratégica: foque em resultados, não em preço. Escale para humano quando houver objeção de preço ou insatisfação grave. Responda sempre em português do Brasil.`,
    greetingMessage: "Olá, {{nome}}! 🎯 Sou a Renata. Sua assinatura está se aproximando do fim. Vamos conversar sobre os resultados incríveis que você alcançou?",
  },
];

// ─── Playbooks Padrão ─────────────────────────────────────────────────────────
const DEFAULT_PLAYBOOKS = [
  {
    playbook: {
      name: "Onboarding — Primeiros 30 Dias",
      description: "Jornada de boas-vindas e ativação para novos clientes. Inicia automaticamente quando o cliente é criado.",
      triggerEvent: "customer_created" as const,
      isActive: true,
    },
    steps: [
      {
        stepOrder: 1,
        delayDays: 0,
        stepType: "send_message" as const,
        messageTemplate: "Olá, {{nome}}! 👋 Bem-vindo ao {{programa}}! Sou a Sofia, sua assistente de sucesso. Estou aqui para garantir que você aproveite ao máximo o programa. Nos próximos dias vou te acompanhar de perto. Qualquer dúvida, é só me chamar! 🚀",
        isActive: true,
      },
      {
        stepOrder: 2,
        delayDays: 3,
        stepType: "send_message" as const,
        messageTemplate: "Oi, {{nome}}! 😊 Já se passaram 3 dias desde que você começou. Como está sendo a experiência até agora? Tem alguma dúvida ou algo que posso te ajudar?",
        isActive: true,
      },
      {
        stepOrder: 3,
        delayDays: 7,
        stepType: "create_task" as const,
        taskTitle: "Check-in de 7 dias — {{nome}}",
        taskDescription: "Verificar se o cliente está avançando no programa. Ligar ou enviar mensagem personalizada.",
        isActive: true,
      },
      {
        stepOrder: 4,
        delayDays: 14,
        stepType: "send_nps" as const,
        messageTemplate: "Olá, {{nome}}! Já faz 2 semanas que você está conosco. Em uma escala de 0 a 10, o quanto você indicaria o {{programa}} para um amigo? Sua opinião é muito importante para nós! 🙏",
        isActive: true,
      },
      {
        stepOrder: 5,
        delayDays: 30,
        stepType: "send_message" as const,
        messageTemplate: "{{nome}}, parabéns! 🎉 Você completou seu primeiro mês no {{programa}}! Quero saber: quais foram seus maiores resultados até agora? Me conta!",
        isActive: true,
      },
    ],
  },
  {
    playbook: {
      name: "Engajamento Contínuo",
      description: "Mantém o cliente engajado e motivado após os primeiros 30 dias. Ativado manualmente ou por gatilho de inatividade.",
      triggerEvent: "no_interaction" as const,
      isActive: true,
    },
    steps: [
      {
        stepOrder: 1,
        delayDays: 0,
        stepType: "send_message" as const,
        messageTemplate: "Oi, {{nome}}! 🌟 Tudo bem? Percebi que faz um tempinho que não conversamos. Como está sendo sua jornada no {{programa}}? Tem algo que posso te ajudar?",
        isActive: true,
      },
      {
        stepOrder: 2,
        delayDays: 3,
        stepType: "send_message" as const,
        messageTemplate: "{{nome}}, separei um conteúdo especial para você avançar ainda mais no {{programa}}. Quer que eu te envie?",
        isActive: true,
      },
      {
        stepOrder: 3,
        delayDays: 7,
        stepType: "create_task" as const,
        taskTitle: "Follow-up urgente — {{nome}} sem interação",
        taskDescription: "Cliente sem interação há mais de 7 dias. Contato humano necessário.",
        isActive: true,
      },
    ],
  },
  {
    playbook: {
      name: "Prevenção de Churn",
      description: "Ativado quando o health score cai abaixo de 40 ou o cliente demonstra sinais de risco.",
      triggerEvent: "health_score_drop" as const,
      isActive: true,
    },
    steps: [
      {
        stepOrder: 1,
        delayDays: 0,
        stepType: "send_message" as const,
        messageTemplate: "Olá, {{nome}}. Percebi que você pode estar com alguma dificuldade no {{programa}}. Quero muito te ajudar a superar isso. Pode me contar o que está acontecendo?",
        isActive: true,
      },
      {
        stepOrder: 2,
        delayDays: 1,
        stepType: "create_task" as const,
        taskTitle: "URGENTE: Cliente em risco de churn — {{nome}}",
        taskDescription: "Health score baixo. Contato humano necessário em até 24h. Verificar histórico e preparar solução.",
        isActive: true,
      },
      {
        stepOrder: 3,
        delayDays: 3,
        stepType: "escalate_to_human" as const,
        taskTitle: "Escalação: {{nome}} sem resposta após 3 dias",
        taskDescription: "Cliente em risco não respondeu. Escalar para gestor de CS.",
        isActive: true,
      },
    ],
  },
  {
    playbook: {
      name: "Expansão & Upsell",
      description: "Ativado quando o cliente demonstra alta satisfação (NPS 9-10). Apresenta oportunidades de crescimento.",
      triggerEvent: "nps_submitted" as const,
      isActive: true,
    },
    steps: [
      {
        stepOrder: 1,
        delayDays: 0,
        stepType: "send_message" as const,
        messageTemplate: "{{nome}}, que alegria saber que você está satisfeito! 🚀 Com os resultados que você está tendo, imagina o que seria possível com ainda mais suporte? Posso te mostrar como acelerar ainda mais?",
        isActive: true,
      },
      {
        stepOrder: 2,
        delayDays: 3,
        stepType: "create_task" as const,
        taskTitle: "Oportunidade de upsell — {{nome}} (NPS alto)",
        taskDescription: "Cliente promotor. Apresentar proposta de upgrade ou programa avançado.",
        isActive: true,
      },
    ],
  },
  {
    playbook: {
      name: "Renovação — 60 Dias",
      description: "Inicia 60 dias antes do vencimento para garantir a renovação com antecedência.",
      triggerEvent: "renewal_approaching" as const,
      isActive: true,
    },
    steps: [
      {
        stepOrder: 1,
        delayDays: 0,
        stepType: "send_message" as const,
        messageTemplate: "Olá, {{nome}}! 🎯 Sua assinatura do {{programa}} está chegando ao fim em breve. Antes de falar sobre renovação, quero celebrar com você: quais foram seus maiores resultados até aqui?",
        isActive: true,
      },
      {
        stepOrder: 2,
        delayDays: 15,
        stepType: "send_message" as const,
        messageTemplate: "{{nome}}, faltam 45 dias para o vencimento. Já pensou em continuar sua jornada? Posso te apresentar as opções disponíveis para o próximo ciclo.",
        isActive: true,
      },
      {
        stepOrder: 3,
        delayDays: 30,
        stepType: "create_task" as const,
        taskTitle: "Proposta de renovação — {{nome}} (30 dias para vencer)",
        taskDescription: "Preparar e enviar proposta formal de renovação. Remover objeções.",
        isActive: true,
      },
      {
        stepOrder: 4,
        delayDays: 50,
        stepType: "send_message" as const,
        messageTemplate: "{{nome}}, faltam apenas 10 dias para o vencimento! Não quero que você perca a continuidade do seu progresso. Posso te ajudar a garantir sua renovação hoje?",
        isActive: true,
      },
    ],
  },
];

// ─── Gatilhos Padrão ───────────────────────────────────────────────────────────────────────────────────
const DEFAULT_TRIGGERS = [
  // 1. Inatividade 5 dias — IA manda mensagem de check-in
  {
    name: "Inatividade 5 dias — Check-in da IA",
    description: "Cliente sem interação há 5 dias. A IA envia mensagem de check-in personalizada.",
    isActive: true,
    conditionType: "no_interaction_days" as const,
    conditionValue: "5",
    actionType: "send_ai_message" as const,
    actionConfig: {
      messageTemplate: "Oi, {{nome}}! 🌟 Tudo bem? Faz alguns dias que não conversamos. Como está sendo sua jornada no {{programa}}? Tem algo que posso te ajudar?",
    },
  },
  // 2. Inatividade 10 dias — Cria tarefa urgente para humano
  {
    name: "Inatividade 10 dias — Tarefa Urgente",
    description: "Cliente sem interação há 10 dias. Cria tarefa urgente para o time humano entrar em contato.",
    isActive: true,
    conditionType: "no_interaction_days" as const,
    conditionValue: "10",
    actionType: "create_task" as const,
    actionConfig: {
      taskTitle: "URGENTE: {{nome}} sem interação há 10 dias",
    },
  },
  // 3. Health score abaixo de 40 — Sentinel entra em ação
  {
    name: "Health Score Crítico (≤40) — Prevenção de Churn",
    description: "Health score abaixo de 40. O Sentinel envia mensagem empatética e cria alerta de supervisão.",
    isActive: true,
    conditionType: "health_score_below" as const,
    conditionValue: "40",
    actionType: "create_supervision_item" as const,
    actionConfig: {
      messageTemplate: "Olá, {{nome}}. Percebi que você pode estar com alguma dificuldade no {{programa}}. Quero muito te ajudar a superar isso. Pode me contar o que está acontecendo?",
    },
  },
  // 4. Health score abaixo de 60 — IA manda mensagem de suporte
  {
    name: "Health Score Baixo (≤60) — Suporte Proativo",
    description: "Health score entre 40 e 60. A IA envia mensagem de suporte antes de virar churn.",
    isActive: true,
    conditionType: "health_score_below" as const,
    conditionValue: "60",
    actionType: "send_ai_message" as const,
    actionConfig: {
      messageTemplate: "Oi, {{nome}}! 👋 Quero saber como você está se saindo no {{programa}}. Tem alguma dúvida ou dificuldade que posso te ajudar a resolver?",
    },
  },
  // 5. Renovação em 60 dias — Renata inicia conversa
  {
    name: "Renovação em 60 dias — Renata Inicia",
    description: "Assinatura vence em 60 dias. A Renata inicia a conversa de renovação com foco em resultados.",
    isActive: true,
    conditionType: "renewal_days_remaining" as const,
    conditionValue: "60",
    actionType: "send_ai_message" as const,
    actionConfig: {
      messageTemplate: "Olá, {{nome}}! 🎯 Sua assinatura do {{programa}} está chegando ao fim em 60 dias. Antes de falar sobre renovação, quero celebrar com você: quais foram seus maiores resultados até aqui?",
    },
  },
  // 6. Renovação em 30 dias — Cria tarefa de proposta
  {
    name: "Renovação em 30 dias — Proposta Formal",
    description: "Assinatura vence em 30 dias. Cria tarefa para o time enviar proposta formal de renovação.",
    isActive: true,
    conditionType: "renewal_days_remaining" as const,
    conditionValue: "30",
    actionType: "create_task" as const,
    actionConfig: {
      taskTitle: "Proposta de renovação — {{nome}} (30 dias para vencer)",
    },
  },
  // 7. NPS 0-6 (detrator) — Escalada imediata para supervisão
  {
    name: "NPS Negativo (0–6) — Escalada Imediata",
    description: "Cliente detrator. Cria item de supervisão imediato para o gestor de CS agir em até 2h.",
    isActive: true,
    conditionType: "nps_score_below" as const,
    conditionValue: "7",
    actionType: "create_supervision_item" as const,
    actionConfig: {
      messageTemplate: "Cliente {{nome}} deu NPS negativo no {{programa}}. Ação imediata necessária: contato humano em até 2 horas para entender a insatisfação e oferecer solução.",
    },
  },
  // 8. Renovação em 10 dias — Mensagem de urgência
  {
    name: "Renovação em 10 dias — Urgência",
    description: "Assinatura vence em 10 dias. A IA envia mensagem de urgência para garantir a renovação.",
    isActive: true,
    conditionType: "renewal_days_remaining" as const,
    conditionValue: "10",
    actionType: "send_ai_message" as const,
    actionConfig: {
      messageTemplate: "{{nome}}, faltam apenas 10 dias para o vencimento da sua assinatura! 🔔 Não quero que você perca a continuidade do seu progresso. Posso te ajudar a garantir sua renovação hoje?",
    },
  },
];

// ─── Seed Function ───────────────────────────────────────────────────────────────────────────────────
export async function seedDefaultsIfEmpty(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Check if agents already exist
    const [agentCount] = await db.select({ count: count() }).from(aiAgents);
    if ((agentCount?.count ?? 0) === 0) {
      console.log("[Seed] No agents found — creating 5 default agents...");
      for (const agent of DEFAULT_AGENTS) {
        await db.insert(aiAgents).values(agent);
      }
      console.log("[Seed] 6 agents created: Bia, Sofia, Luna, Sentinel, Max, Renata");
    }

    // Check if playbooks already exist
    const [playbookCount] = await db.select({ count: count() }).from(playbooks);
    if ((playbookCount?.count ?? 0) === 0) {
      console.log("[Seed] No playbooks found — creating 5 default playbooks...");
      for (const { playbook, steps } of DEFAULT_PLAYBOOKS) {
        const [result] = await db.insert(playbooks).values(playbook);
        const playbookId = (result as any).insertId as number;
        for (const step of steps) {
          await db.insert(playbookSteps).values({ ...step, playbookId });
        }
      }
      console.log("[Seed] 5 playbooks created with steps");
    }

    // Check if trigger rules already exist
    const [triggerCount] = await db.select({ count: count() }).from(triggerRules);
    if ((triggerCount?.count ?? 0) === 0) {
      console.log("[Seed] No trigger rules found — creating 8 default triggers...");
      for (const trigger of DEFAULT_TRIGGERS) {
        await db.insert(triggerRules).values([{
          ...trigger,
          actionConfig: trigger.actionConfig as unknown as Record<string, string>,
        }]);
      }
      console.log("[Seed] 8 trigger rules created: inatividade, health score, renovação, NPS negativo");
    }
  } catch (err) {
    console.error("[Seed] Failed to seed defaults:", err);
  }
}
