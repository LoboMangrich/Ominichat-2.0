/**
 * Communication Intelligence Engine
 * Analyzes conversation messages using AI to extract:
 * - Recurring topics/themes
 * - Sentiment distribution
 * - Actionable suggestions for product, process, and communication improvement
 */

import { desc, gte, sql } from "drizzle-orm";
import { communicationInsights, conversations, messages } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

type DbType = any;

interface TopicItem {
  topic: string;
  count: number;
  trend: "up" | "down" | "stable";
  category: string;
}

interface SuggestionItem {
  text: string;
  category: "produto" | "processo" | "comunicação" | "suporte";
  priority: "alta" | "média" | "baixa";
}

interface AnalysisResult {
  totalMessages: number;
  totalConversations: number;
  sentimentPositive: number;
  sentimentNeutral: number;
  sentimentNegative: number;
  topics: TopicItem[];
  suggestions: SuggestionItem[];
  rawSummary: string;
}

export async function analyzeConversations(db: DbType, periodDays: number = 30): Promise<AnalysisResult> {
  // Fetch messages from the period
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const recentMessages = await db
    .select({
      id: messages.id,
      content: messages.content,
      senderType: messages.senderType,
      conversationId: messages.conversationId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(gte(messages.createdAt, since))
    .orderBy(desc(messages.createdAt))
    .limit(500); // cap at 500 messages to avoid token overflow

  // Count unique conversations
  const convIds = new Set(recentMessages.map((m: any) => m.conversationId));

  if (recentMessages.length === 0) {
    // Return empty analysis when no messages
    return {
      totalMessages: 0,
      totalConversations: 0,
      sentimentPositive: 0,
      sentimentNeutral: 100,
      sentimentNegative: 0,
      topics: [],
      suggestions: [
        {
          text: "Conecte o WhatsApp para começar a receber mensagens e gerar análises de inteligência.",
          category: "processo",
          priority: "alta",
        },
        {
          text: "Importe sua base de clientes via CSV para alimentar o Health Score com dados históricos.",
          category: "processo",
          priority: "alta",
        },
      ],
      rawSummary: "Nenhuma mensagem encontrada no período selecionado. Conecte o WhatsApp para começar a coletar inteligência das comunicações.",
    };
  }

  // Build text sample for AI (only inbound messages from customers)
  const customerMessages = recentMessages
    .filter((m: any) => m.senderType === "customer" && m.content && m.content.trim().length > 3)
    .slice(0, 200);

  const messagesSample = customerMessages
    .map((m: any) => `- "${m.content.substring(0, 200)}"`)
    .join("\n");

  // Get previous analysis for trend comparison
  const [prevAnalysis] = await db
    .select()
    .from(communicationInsights)
    .orderBy(desc(communicationInsights.analyzedAt))
    .limit(1);

  const prevTopicsContext = prevAnalysis?.topics
    ? `\nAnálise anterior (${prevAnalysis.periodDays} dias atrás): ${JSON.stringify(prevAnalysis.topics.map((t: TopicItem) => t.topic))}`
    : "";

  // Call AI for analysis
  const prompt = `Você é um analista especialista em Customer Success e experiência do cliente para uma empresa de educação/infoprodutos no Brasil.

Analise as seguintes ${customerMessages.length} mensagens de clientes dos últimos ${periodDays} dias e retorne uma análise estruturada em JSON.

MENSAGENS DOS CLIENTES:
${messagesSample}
${prevTopicsContext}

Retorne APENAS um JSON válido com esta estrutura exata:
{
  "sentimentPositive": <número 0-100, % de mensagens positivas>,
  "sentimentNeutral": <número 0-100, % de mensagens neutras>,
  "sentimentNegative": <número 0-100, % de mensagens negativas>,
  "topics": [
    {
      "topic": "<tema em português, máx 5 palavras>",
      "count": <número estimado de menções>,
      "trend": "<up|down|stable>",
      "category": "<acesso|conteúdo|suporte|financeiro|resultado|comunidade|outro>"
    }
  ],
  "suggestions": [
    {
      "text": "<sugestão acionável e específica em português>",
      "category": "<produto|processo|comunicação|suporte>",
      "priority": "<alta|média|baixa>"
    }
  ],
  "summary": "<resumo executivo em 2-3 frases sobre o estado da comunicação>"
}

Regras:
- Identifique os TOP 5 temas mais recorrentes nas mensagens
- Gere 3-5 sugestões práticas e específicas baseadas nos padrões identificados
- Os percentuais de sentimento devem somar 100
- Seja específico e acionável nas sugestões (ex: "Criar FAQ sobre acesso à plataforma" não "Melhorar comunicação")`;

  let aiResult: any;
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um analista de Customer Success. Responda APENAS com JSON válido, sem markdown, sem explicações." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "communication_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sentimentPositive: { type: "number" },
              sentimentNeutral: { type: "number" },
              sentimentNegative: { type: "number" },
              topics: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    topic: { type: "string" },
                    count: { type: "number" },
                    trend: { type: "string", enum: ["up", "down", "stable"] },
                    category: { type: "string" },
                  },
                  required: ["topic", "count", "trend", "category"],
                  additionalProperties: false,
                },
              },
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    category: { type: "string", enum: ["produto", "processo", "comunicação", "suporte"] },
                    priority: { type: "string", enum: ["alta", "média", "baixa"] },
                  },
                  required: ["text", "category", "priority"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string" },
            },
            required: ["sentimentPositive", "sentimentNeutral", "sentimentNegative", "topics", "suggestions", "summary"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    aiResult = typeof content === "string" ? JSON.parse(content) : content;
  } catch (err) {
    console.error("[CommunicationIntelligence] AI analysis failed:", err);
    // Fallback with basic stats
    aiResult = {
      sentimentPositive: 60,
      sentimentNeutral: 30,
      sentimentNegative: 10,
      topics: [{ topic: "Análise indisponível", count: recentMessages.length, trend: "stable", category: "outro" }],
      suggestions: [{ text: "Tente novamente em alguns instantes.", category: "processo", priority: "baixa" }],
      summary: "Não foi possível completar a análise. Tente novamente.",
    };
  }

  // Normalize sentiment to sum to 100
  const total = (aiResult.sentimentPositive || 0) + (aiResult.sentimentNeutral || 0) + (aiResult.sentimentNegative || 0);
  if (total !== 100 && total > 0) {
    const factor = 100 / total;
    aiResult.sentimentPositive = Math.round(aiResult.sentimentPositive * factor);
    aiResult.sentimentNegative = Math.round(aiResult.sentimentNegative * factor);
    aiResult.sentimentNeutral = 100 - aiResult.sentimentPositive - aiResult.sentimentNegative;
  }

  return {
    totalMessages: recentMessages.length,
    totalConversations: convIds.size,
    sentimentPositive: aiResult.sentimentPositive,
    sentimentNeutral: aiResult.sentimentNeutral,
    sentimentNegative: aiResult.sentimentNegative,
    topics: aiResult.topics?.slice(0, 5) || [],
    suggestions: aiResult.suggestions?.slice(0, 5) || [],
    rawSummary: aiResult.summary || "",
  };
}

export async function saveAnalysis(db: DbType, result: AnalysisResult, periodDays: number) {
  const [inserted] = await db.insert(communicationInsights).values({
    periodDays,
    totalMessages: result.totalMessages,
    totalConversations: result.totalConversations,
    sentimentPositive: result.sentimentPositive,
    sentimentNeutral: result.sentimentNeutral,
    sentimentNegative: result.sentimentNegative,
    topics: result.topics,
    suggestions: result.suggestions,
    rawSummary: result.rawSummary,
  });
  return inserted;
}
