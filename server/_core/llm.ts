import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// Non-streaming synchronous cap: 16000 é o default recomendado para não
// truncar respostas sem se aproximar do limite HTTP não-streaming. Nenhum
// chamador hoje passa maxTokens/max_tokens explicitamente, mas o parâmetro
// continua honrado quando informado.
const DEFAULT_MAX_TOKENS = 16000;

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

// Extrai o texto puro de um content (usado para mensagens system e
// tool/function, que na API nativa da Anthropic não têm blocos próprios).
const contentToPlainText = (
  content: MessageContent | MessageContent[]
): string =>
  ensureArray(content)
    .map(part => {
      if (typeof part === "string") return part;
      if (part.type === "text") return part.text;
      return JSON.stringify(part);
    })
    .join("\n");

const contentPartToBlock = (
  part: MessageContent
): Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  if (part.type === "image_url") {
    return { type: "image", source: { type: "url", url: part.image_url.url } };
  }

  if (part.type === "file_url") {
    return { type: "document", source: { type: "url", url: part.file_url.url } };
  }

  throw new Error("Unsupported message content part");
};

// A Anthropic só aceita um system prompt inicial (nunca um "role": "system"
// no meio da conversa) e não tem role "tool"/"function" — tool results viram
// um bloco tool_result dentro de uma mensagem "user". Içamos aqui.
const splitSystemAndMessages = (
  messages: Message[]
): { system: string | undefined; messages: Anthropic.MessageParam[] } => {
  const systemParts: string[] = [];
  const converted: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(contentToPlainText(message.content));
      continue;
    }

    if (message.role === "tool" || message.role === "function") {
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id ?? "",
            content: contentToPlainText(message.content),
          },
        ],
      });
      continue;
    }

    converted.push({
      role: message.role,
      content: ensureArray(message.content).map(contentPartToBlock),
    });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n") : undefined,
    messages: converted,
  };
};

const buildTools = (tools: Tool[] | undefined): Anthropic.ToolUnion[] | undefined => {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: (tool.function.parameters as Anthropic.Tool.InputSchema | undefined) ?? {
      type: "object",
    },
  }));
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const buildToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): Anthropic.ToolChoice | undefined => {
  const normalized = normalizeToolChoice(toolChoice, tools);
  if (!normalized) return undefined;

  if (normalized === "none") return { type: "none" };
  if (normalized === "auto") return { type: "auto" };
  return { type: "tool", name: normalized.function.name };
};

const buildOutputConfig = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}): Anthropic.OutputConfig | undefined => {
  const explicitFormat = responseFormat || response_format;

  if (explicitFormat) {
    if (explicitFormat.type === "json_schema") {
      if (!explicitFormat.json_schema?.schema) {
        throw new Error(
          "responseFormat json_schema requires a defined schema object"
        );
      }
      return {
        format: { type: "json_schema", schema: explicitFormat.json_schema.schema },
      };
    }

    if (explicitFormat.type === "json_object") {
      // A Messages API nativa não tem um modo "qualquer JSON" sem schema
      // (diferente do response_format: json_object da OpenAI). Um schema
      // aberto de objeto é a aproximação mais próxima.
      return { format: { type: "json_schema", schema: { type: "object" } } };
    }

    return undefined; // "text"
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return { format: { type: "json_schema", schema: schema.schema } };
};

// stop_reason da Anthropic não é 1:1 com finish_reason da OpenAI. Mapeamos os
// casos equivalentes e repassamos o valor bruto nos demais (pause_turn,
// refusal, model_context_window_exceeded) em vez de falhar.
const FINISH_REASON_MAP: Record<string, string> = {
  end_turn: "stop",
  stop_sequence: "stop",
  max_tokens: "length",
  tool_use: "tool_calls",
};

const mapFinishReason = (stopReason: string | null): string | null => {
  if (stopReason === null) return null;
  return FINISH_REASON_MAP[stopReason] ?? stopReason;
};

const toInvokeResult = (response: Anthropic.Message): InvokeResult => {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }

  return {
    id: response.id,
    // A Messages API não devolve um timestamp de criação; aproximamos com o
    // horário da resposta, só para preencher o campo esperado pelos chamadores.
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textParts.join("\n"),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: mapFinishReason(response.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.llmApiKey) {
    throw new Error("LLM_API_KEY is not configured");
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const client = new Anthropic({
    apiKey: ENV.llmApiKey,
    // baseURL vazio → o SDK usa o endpoint oficial da Anthropic. Nunca um
    // fallback de terceiro.
    baseURL: ENV.llmApiUrl || undefined,
  });

  const { system, messages: anthropicMessages } = splitSystemAndMessages(messages);
  const anthropicTools = buildTools(tools);
  const anthropicToolChoice = buildToolChoice(toolChoice || tool_choice, tools);
  const outputConfig = buildOutputConfig({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: ENV.llmModel,
    max_tokens: maxTokens ?? max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: anthropicMessages,
    ...(system ? { system } : {}),
    ...(anthropicTools ? { tools: anthropicTools } : {}),
    ...(anthropicToolChoice ? { tool_choice: anthropicToolChoice } : {}),
    ...(outputConfig ? { output_config: outputConfig } : {}),
  };

  const response = await client.messages.create(request);

  return toInvokeResult(response);
}
