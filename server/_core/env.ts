export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // openId "clássico" que vira Admin automaticamente no primeiro login local
  // via cookie de sessão gerado por scripts/dev-session.ts — bootstrap
  // estritamente local, nunca em produção (ver CLAUDE.md > Rodando
  // localmente). O bootstrap do primeiro Admin em produção é
  // scripts/create-admin.ts, sem relação com esta variável.
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
  // Segredo do encaminhador de e-mail (ex.: Reclame Aqui via forwarder externo),
  // aceito no header x-email-ticket-secret (preferencial) ou no path
  // /api/webhooks/email-ticket/:token, para encaminhadores sem suporte a header
  // customizado. Ver server/_core/routeGuards.ts.
  emailTicketSecret: process.env.EMAIL_TICKET_SECRET ?? "",
  // Segredo do webhook de saída da Sara (Epic 72), fornecido pelo time da Sara.
  // Valida o HMAC-SHA256 (hex) do corpo bruto no header x-sara-signature em
  // /api/webhooks/sara. Sem ele, a rota nega sempre (fail-closed).
  supportOutboundWebhookSecret: process.env.SUPPORT_OUTBOUND_WEBHOOK_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
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
