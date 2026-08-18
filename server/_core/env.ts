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
};
