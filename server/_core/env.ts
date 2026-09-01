export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  // Segredo compartilhado com o scheduler externo, enviado no header x-cron-secret
  // nas chamadas a /api/scheduled/*. Sem ele, essas rotas só aceitam sessão de Admin.
  cronSecret: process.env.CRON_SECRET ?? "",
  // App Secret da Meta (Facebook Developers), usado para validar o HMAC-SHA256
  // no header x-hub-signature-256 dos webhooks de WhatsApp e Instagram.
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  // Secret token configurado via setWebhook do Telegram, enviado no header
  // x-telegram-bot-api-secret-token em toda chamada ao webhook.
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Provedor de LLM (server/_core/llm.ts), direto na Anthropic — não passa
  // mais pela Forge API do Manus. llmApiUrl fica vazio por padrão: nesse caso
  // o SDK usa o endpoint oficial da Anthropic, nunca um fallback de terceiro.
  llmApiUrl: process.env.LLM_API_URL ?? "",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001",
  // Base URL e API key (header x-api-key) da Sara Support API, sistema externo
  // (Epic 71) que expõe conversas de um bot de IA no WhatsApp com takeover
  // humano. Não confundir com o usuário/senha que só protegem o Swagger dela.
  saraSupportApiUrl: process.env.SARA_SUPPORT_API_URL ?? "",
  saraSupportApiKey: process.env.SARA_SUPPORT_API_KEY ?? "",
};

const MIN_JWT_SECRET_LENGTH = 32;

// Valores comuns de placeholder que alguém pode colar de um exemplo e esquecer
// de trocar. Comparação por substring (case-insensitive) pega tanto o valor
// cru ("secret") quanto versões "preenchidas" pra passar do tamanho mínimo
// (ex.: "changemechangemechangemechangeme").
const PLACEHOLDER_SECRET_SUBSTRINGS = [
  "changeme",
  "change-me",
  "change_me",
  "changethis",
  "secret",
  "password",
  "your-secret-here",
  "your_secret_here",
  "placeholder",
  "insecure",
  "example",
];

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_SECRET_SUBSTRINGS.some(pattern => normalized.includes(pattern));
}

/**
 * Falha rápido na inicialização do servidor se variáveis de ambiente
 * obrigatórias estiverem ausentes ou inseguras. Não chamar no topo do módulo
 * (quebraria os testes, que importam routers.ts sem essas variáveis) — só em
 * startServer().
 */
export function assertRequiredEnv(): void {
  const missing: string[] = [];
  if (!ENV.databaseUrl) missing.push("DATABASE_URL");
  if (!ENV.cookieSecret) missing.push("JWT_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(", ")}. Veja .env.example.`
    );
  }

  if (ENV.cookieSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET precisa ter pelo menos ${MIN_JWT_SECRET_LENGTH} caracteres (atual: ${ENV.cookieSecret.length}). Gere um valor aleatório, ex.: openssl rand -base64 32.`
    );
  }

  if (isPlaceholderSecret(ENV.cookieSecret)) {
    throw new Error(
      "JWT_SECRET parece um valor placeholder/inseguro (ex.: contém \"changeme\" ou \"secret\"). Gere um valor aleatório, ex.: openssl rand -base64 32."
    );
  }
}
