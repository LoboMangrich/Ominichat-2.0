import { describe, it, expect } from "vitest";
import { conversations } from "../../../drizzle/schema";
import { OPEN_CONVERSATIONS_POLL_INPUT } from "./useNewConversationNotification";

// Bug real: o hook que dispara o som de notificação de novo atendimento consultava
// conversations.list com { status: "Aberto" }. A contagem de conversas abertas sempre voltava 0,
// então a comparação de "aumentou desde a última leitura" nunca disparava o som.
describe("useNewConversationNotification — poll de conversas abertas usa o enum real do banco", () => {
  it("o input da query usa um valor presente no enum conversations.status", () => {
    expect(conversations.status.enumValues).toContain(OPEN_CONVERSATIONS_POLL_INPUT.status);
  });

  it("faz poll especificamente por Open, não pelo rótulo em português", () => {
    expect(OPEN_CONVERSATIONS_POLL_INPUT.status).toBe("Open");
  });
});
