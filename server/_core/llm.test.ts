import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { ENV } from "./env";
import { invokeLLM } from "./llm";

function fakeAnthropicResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_fake",
    model: ENV.llmModel,
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  };
}

describe("invokeLLM — camada de tradução para a Anthropic Messages API", () => {
  const originalApiKey = ENV.llmApiKey;

  beforeEach(() => {
    mockCreate.mockReset();
    ENV.llmApiKey = "test-api-key";
  });

  afterAll(() => {
    ENV.llmApiKey = originalApiKey;
  });

  it("falha alto sem chamar rede quando LLM_API_KEY não está configurada", async () => {
    ENV.llmApiKey = "";

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "oi" }] })
    ).rejects.toThrow("LLM_API_KEY is not configured");

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("içça mensagens role:system para o parâmetro system nativo, fora do array messages", async () => {
    mockCreate.mockResolvedValue(fakeAnthropicResponse());

    await invokeLLM({
      messages: [
        { role: "system", content: "Você é um assistente de suporte." },
        { role: "user", content: "Preciso de ajuda" },
      ],
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const request = mockCreate.mock.calls[0][0];

    expect(request.system).toBe("Você é um assistente de suporte.");
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Preciso de ajuda" }],
    });
    // Nenhuma mensagem role:"system" deve sobrar dentro do array messages —
    // a Anthropic rejeita isso (só aceita system fora do array).
    expect(request.messages.some((m: { role: string }) => m.role === "system")).toBe(false);
  });

  it("concatena múltiplas mensagens system (join com \\n) no mesmo parâmetro system", async () => {
    mockCreate.mockResolvedValue(fakeAnthropicResponse());

    await invokeLLM({
      messages: [
        { role: "system", content: "Primeira instrução." },
        { role: "system", content: "Segunda instrução." },
        { role: "user", content: "Oi" },
      ],
    });

    const request = mockCreate.mock.calls[0][0];
    expect(request.system).toBe("Primeira instrução.\nSegunda instrução.");
  });

  it("concatena múltiplos blocos de texto da resposta em content como string única", async () => {
    mockCreate.mockResolvedValue(
      fakeAnthropicResponse({
        content: [
          { type: "text", text: "Parte 1." },
          { type: "text", text: "Parte 2." },
        ],
      })
    );

    const result = await invokeLLM({ messages: [{ role: "user", content: "oi" }] });

    expect(typeof result.choices[0].message.content).toBe("string");
    expect(result.choices[0].message.content).toBe("Parte 1.\nParte 2.");
  });

  it.each([
    ["end_turn", "stop"],
    ["stop_sequence", "stop"],
    ["max_tokens", "length"],
    ["tool_use", "tool_calls"],
    // stop_reason sem equivalente direto na OpenAI: repassado como veio, em
    // vez de falhar ou mapear para algo enganoso.
    ["pause_turn", "pause_turn"],
    ["refusal", "refusal"],
  ])("mapeia stop_reason %s para finish_reason %s", async (stopReason, expectedFinishReason) => {
    mockCreate.mockResolvedValue(fakeAnthropicResponse({ stop_reason: stopReason }));

    const result = await invokeLLM({ messages: [{ role: "user", content: "oi" }] });

    expect(result.choices[0].finish_reason).toBe(expectedFinishReason);
  });

  it("mapeia finish_reason null quando stop_reason é null", async () => {
    mockCreate.mockResolvedValue(fakeAnthropicResponse({ stop_reason: null }));

    const result = await invokeLLM({ messages: [{ role: "user", content: "oi" }] });

    expect(result.choices[0].finish_reason).toBeNull();
  });

  it("mapeia usage.input_tokens/output_tokens para prompt_tokens/completion_tokens/total_tokens", async () => {
    mockCreate.mockResolvedValue(
      fakeAnthropicResponse({ usage: { input_tokens: 42, output_tokens: 8 } })
    );

    const result = await invokeLLM({ messages: [{ role: "user", content: "oi" }] });

    expect(result.usage).toEqual({
      prompt_tokens: 42,
      completion_tokens: 8,
      total_tokens: 50,
    });
  });

  describe("response_format: json_schema — ponto de maior risco da migração", () => {
    it("envia output_config.format json_schema e devolve JSON parseável em content (schema genérico)", async () => {
      const schema = {
        type: "object",
        properties: { foo: { type: "string" } },
        required: ["foo"],
        additionalProperties: false,
      };

      mockCreate.mockResolvedValue(
        fakeAnthropicResponse({
          content: [{ type: "text", text: JSON.stringify({ foo: "bar" }) }],
        })
      );

      const result = await invokeLLM({
        messages: [{ role: "user", content: "classifique isto" }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "generic_schema", strict: true, schema },
        },
      });

      const request = mockCreate.mock.calls[0][0];
      expect(request.output_config).toEqual({ format: { type: "json_schema", schema } });

      const content = result.choices[0]?.message?.content as string;
      expect(() => JSON.parse(content)).not.toThrow();
      expect(JSON.parse(content)).toEqual({ foo: "bar" });
    });

    // Replica exatamente o call site de server/routers.ts (classificação de
    // pergunta do cliente, schema "question_classification").
    it("call site routers.ts (question_classification) continua recebendo JSON parseável", async () => {
      const questionClassificationSchema = {
        type: "object",
        properties: {
          isQuestion: { type: "boolean" },
          normalizedQuestion: { type: "string" },
          category: { type: "string" },
        },
        required: ["isQuestion", "normalizedQuestion", "category"],
        additionalProperties: false,
      };

      const fakeClassification = {
        isQuestion: true,
        normalizedQuestion: "Como acesso a plataforma?",
        category: "acesso_plataforma",
      };

      mockCreate.mockResolvedValue(
        fakeAnthropicResponse({
          content: [{ type: "text", text: JSON.stringify(fakeClassification) }],
        })
      );

      const classifyResponse = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um classificador de perguntas de suporte ao cliente." },
          { role: "user", content: "Como faço para acessar a plataforma?" },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "question_classification",
            strict: true,
            schema: questionClassificationSchema,
          },
        },
      });

      const request = mockCreate.mock.calls[0][0];
      expect(request.output_config).toEqual({
        format: { type: "json_schema", schema: questionClassificationSchema },
      });

      const classification = JSON.parse(classifyResponse.choices[0]?.message?.content as string);
      expect(classification).toEqual(fakeClassification);
    });

    // Replica exatamente o call site de server/communicationIntelligence.ts
    // (análise de comunicação, schema "communication_analysis").
    it("call site communicationIntelligence.ts (communication_analysis) continua recebendo JSON parseável", async () => {
      const communicationAnalysisSchema = {
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
      };

      const fakeAnalysis = {
        sentimentPositive: 70,
        sentimentNeutral: 20,
        sentimentNegative: 10,
        topics: [{ topic: "Cobrança", count: 3, trend: "up", category: "financeiro" }],
        suggestions: [{ text: "Criar FAQ sobre cobrança", category: "processo", priority: "alta" }],
        summary: "Resumo da análise.",
      };

      mockCreate.mockResolvedValue(
        fakeAnthropicResponse({
          content: [{ type: "text", text: JSON.stringify(fakeAnalysis) }],
        })
      );

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um analista de Customer Success. Responda APENAS com JSON válido, sem markdown, sem explicações." },
          { role: "user", content: "Analise estas conversas..." },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "communication_analysis",
            strict: true,
            schema: communicationAnalysisSchema,
          },
        },
      });

      const request = mockCreate.mock.calls[0][0];
      expect(request.output_config).toEqual({
        format: { type: "json_schema", schema: communicationAnalysisSchema },
      });

      const content = response.choices?.[0]?.message?.content;
      expect(typeof content).toBe("string");
      const parsed = JSON.parse(content as string);
      expect(parsed).toEqual(fakeAnalysis);
    });
  });
});
