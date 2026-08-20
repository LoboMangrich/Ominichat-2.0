import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./env";
import { verifyMetaSignature, verifyTelegramSecret, type RawBodyRequest } from "./webhookAuth";

function fakeRequest(headers: Record<string, string>, rawBody?: Buffer): RawBodyRequest {
  return { headers, rawBody } as unknown as RawBodyRequest;
}

describe("webhookAuth", () => {
  const originalMetaSecret = ENV.metaAppSecret;
  const originalTelegramSecret = ENV.telegramWebhookSecret;

  afterEach(() => {
    ENV.metaAppSecret = originalMetaSecret;
    ENV.telegramWebhookSecret = originalTelegramSecret;
  });

  describe("verifyMetaSignature", () => {
    it("aceita uma assinatura HMAC-SHA256 válida", () => {
      ENV.metaAppSecret = "meta-secret";
      const rawBody = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }));
      const signature = `sha256=${createHmac("sha256", "meta-secret").update(rawBody).digest("hex")}`;
      const req = fakeRequest({ "x-hub-signature-256": signature }, rawBody);

      expect(verifyMetaSignature(req)).toBe(true);
    });

    it("rejeita quando a assinatura está ausente", () => {
      ENV.metaAppSecret = "meta-secret";
      const req = fakeRequest({}, Buffer.from("{}"));

      expect(verifyMetaSignature(req)).toBe(false);
    });

    it("rejeita quando a assinatura está incorreta", () => {
      ENV.metaAppSecret = "meta-secret";
      const req = fakeRequest({ "x-hub-signature-256": "sha256=deadbeef" }, Buffer.from("{}"));

      expect(verifyMetaSignature(req)).toBe(false);
    });

    it("falha fechado quando META_APP_SECRET não está configurado", () => {
      ENV.metaAppSecret = "";
      const rawBody = Buffer.from("{}");
      const signature = `sha256=${createHmac("sha256", "qualquer-coisa").update(rawBody).digest("hex")}`;
      const req = fakeRequest({ "x-hub-signature-256": signature }, rawBody);

      expect(verifyMetaSignature(req)).toBe(false);
    });
  });

  describe("verifyTelegramSecret", () => {
    it("aceita quando o secret token bate", () => {
      ENV.telegramWebhookSecret = "telegram-secret";
      const req = fakeRequest({ "x-telegram-bot-api-secret-token": "telegram-secret" });

      expect(verifyTelegramSecret(req)).toBe(true);
    });

    it("rejeita quando o secret token está ausente", () => {
      ENV.telegramWebhookSecret = "telegram-secret";
      const req = fakeRequest({});

      expect(verifyTelegramSecret(req)).toBe(false);
    });

    it("rejeita quando o secret token está incorreto", () => {
      ENV.telegramWebhookSecret = "telegram-secret";
      const req = fakeRequest({ "x-telegram-bot-api-secret-token": "token-errado" });

      expect(verifyTelegramSecret(req)).toBe(false);
    });

    it("falha fechado quando TELEGRAM_WEBHOOK_SECRET não está configurado", () => {
      ENV.telegramWebhookSecret = "";
      const req = fakeRequest({ "x-telegram-bot-api-secret-token": "qualquer-coisa" });

      expect(verifyTelegramSecret(req)).toBe(false);
    });
  });
});
