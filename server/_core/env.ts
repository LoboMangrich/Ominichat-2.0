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
  // Base URL e API key (header x-api-key) da Sara Support API, sistema externo
  // (Epic 71) que expõe conversas de um bot de IA no WhatsApp com takeover
  // humano. Não confundir com o usuário/senha que só protegem o Swagger dela.
  saraSupportApiUrl: process.env.SARA_SUPPORT_API_URL ?? "",
  saraSupportApiKey: process.env.SARA_SUPPORT_API_KEY ?? "",
  // Login com Google Workspace (substitui o OAuth do Manus — ver backlog
  // item 1 no CLAUDE.md). Client ID/Secret e redirect URI do OAuth Client
  // configurado no Google Cloud Console.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  // E-mails que viram Admin automaticamente no primeiro login (bootstrap).
  // Lista separada por vírgula em OWNER_EMAILS, normalizada para minúsculas.
  //
  // IMPORTANTE: isto é bootstrap de primeiro login, não controle de acesso
  // contínuo. É consultado uma única vez, no INSERT do usuário novo
  // (server/_core/googleAuth.ts). Remover um e-mail daqui depois NÃO revoga
  // o acesso nem o papel de Admin de quem já foi criado por essa lista — o
  // estado do usuário já foi persistido no banco (isActive, role) e passa a
  // ser gerenciado exclusivamente pela tela de Usuários (usersRouter).
  ownerEmails: parseOwnerEmails(process.env.OWNER_EMAILS ?? ""),
};

function parseOwnerEmails(raw: string): string[] {
  return raw
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
}

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

// Regex simples, só para pegar erro grosseiro de digitação em OWNER_EMAILS
// (ex.: esqueceu o "@", colou um domínio sem usuário). Não precisa validar
// RFC 5322 completo — o Google já garante que o e-mail autenticado é real.
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // Login com Google Workspace ainda é opcional (convive com o OAuth do
  // Manus). Mas se alguém começou a configurar, exigimos as três variáveis
  // juntas — meia-configuração falha em runtime de um jeito confuso.
  const googleVars = {
    GOOGLE_CLIENT_ID: ENV.googleClientId,
    GOOGLE_CLIENT_SECRET: ENV.googleClientSecret,
    GOOGLE_REDIRECT_URI: ENV.googleRedirectUri,
  };
  const googleVarsPresent = Object.entries(googleVars).filter(([, value]) => value.length > 0);
  if (googleVarsPresent.length > 0 && googleVarsPresent.length < Object.keys(googleVars).length) {
    const missingGoogleVars = Object.entries(googleVars)
      .filter(([, value]) => value.length === 0)
      .map(([name]) => name);
    throw new Error(
      `Login com Google Workspace parcialmente configurado. Faltam: ${missingGoogleVars.join(", ")}. Configure as três variáveis (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) ou nenhuma.`
    );
  }

  const invalidOwnerEmails = ENV.ownerEmails.filter(email => !SIMPLE_EMAIL_PATTERN.test(email));
  if (invalidOwnerEmails.length > 0) {
    throw new Error(
      `OWNER_EMAILS contém valor que não parece e-mail: ${invalidOwnerEmails.join(", ")}. Use uma lista separada por vírgula, ex.: admin@empresa.com,outro@empresa.com.`
    );
  }
}
