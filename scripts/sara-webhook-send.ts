// Script de desenvolvimento local: simula o webhook de saída da Sara (Epic 72).
// Monta um payload, assina com SUPPORT_OUTBOUND_WEBHOOK_SECRET do .env e faz POST
// para o servidor LOCAL. Não chama a API da Sara — quem pode fazer um GET de leitura
// é o próprio servidor ao processar message_received/escalated (para evitar até isso,
// use closed ou um evento desconhecido).
//
// Uso:
//   pnpm sara:webhook:send <evento> [--conversation <id>] [--event-id <id>] [--url <url>]
//   <evento>: escalated | message_received | closed | qualquer outro (vira conversation.<evento>)
// Ex.: pnpm sara:webhook:send closed --event-id teste-1   (rode 2x para ver o dedup)
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";

if (process.env.NODE_ENV === "production") {
  console.error("[sara-webhook-send] Abortado: NODE_ENV=production. Este script é só para uso local.");
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const event = process.argv[2];
  if (!event || event.startsWith("--")) {
    console.error("Uso: pnpm sara:webhook:send <escalated|message_received|closed|...> [--conversation <id>] [--event-id <id>] [--url <url>]");
    process.exit(1);
  }

  const secret = process.env.SUPPORT_OUTBOUND_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.error("[sara-webhook-send] SUPPORT_OUTBOUND_WEBHOOK_SECRET não está no .env (a rota nega sem ele).");
    process.exit(1);
  }

  const url = new URL(arg("url") ?? `http://localhost:${process.env.PORT ?? "3000"}/api/webhooks/sara`);
  // Só servidor local: o script nunca manda nada para fora da máquina.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    console.error(`[sara-webhook-send] Abortado: destino ${url.hostname} não é local.`);
    process.exit(1);
  }

  const eventType = event.includes(".") ? event : `conversation.${event}`;
  const conversationId = arg("conversation") ?? "local-test-conversation";
  const data: Record<string, string> = { conversationId };
  // Campos de exemplo por evento (formato da especificação; valores fictícios).
  if (eventType === "conversation.escalated") data.phoneNumber = "5500000000000";
  if (eventType === "conversation.message_received") data.whatsappMessageId = `wamid.local-${randomUUID()}`;
  if (eventType === "conversation.closed") data.outcome = "completed";

  const body = JSON.stringify({
    eventId: arg("event-id") ?? randomUUID(),
    eventType,
    timestamp: new Date().toISOString(),
    data,
  });
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sara-signature": signature },
    body,
  });
  const text = await response.text();
  console.log(`${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`);
  if (!response.ok) process.exit(1);
}

main().catch(error => {
  console.error("[sara-webhook-send] Falhou:", error instanceof Error ? error.message : error);
  process.exit(1);
});
