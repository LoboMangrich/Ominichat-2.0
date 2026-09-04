import { describe, it, expect } from "vitest";
import { conversations } from "../../../drizzle/schema";
import { QUEUE_TABS, isConversationUnread } from "./Conversations";

// Bug real: as abas da Caixa de Entrada enviavam "Aberto"/"Aguardando"/"Fechado" (rótulo em
// português) como filtro de status para conversations.list, mas o enum do banco
// (conversations.status, drizzle/schema.ts) é ["Open", "Waiting", "Closed"]. O filtro nunca
// retornava nada. Estes testes garantem que os valores enviados pela UI sempre pertencem ao
// enum real do banco, e travam se alguém reintroduzir um rótulo em português aqui.
const REAL_STATUS_VALUES = conversations.status.enumValues;

describe("Conversations — QUEUE_TABS envia o valor real do enum, não o rótulo em português", () => {
  it("toda aba com filtro de status usa um valor presente no enum do banco", () => {
    const tabsWithStatus = QUEUE_TABS.filter(t => t.status !== undefined);
    expect(tabsWithStatus.length).toBeGreaterThan(0);
    for (const tab of tabsWithStatus) {
      expect(REAL_STATUS_VALUES).toContain(tab.status);
    }
  });

  it("aba 'Em Aberto' filtra por Open", () => {
    expect(QUEUE_TABS.find(t => t.id === "open")?.status).toBe("Open");
  });

  it("aba 'Aguardando' filtra por Waiting", () => {
    expect(QUEUE_TABS.find(t => t.id === "waiting")?.status).toBe("Waiting");
  });

  it("aba 'Finalizados' filtra por Closed", () => {
    expect(QUEUE_TABS.find(t => t.id === "closed")?.status).toBe("Closed");
  });
});

describe("Conversations — isConversationUnread compara contra o enum real", () => {
  it("conversa com status Open e não atendida por IA é não lida", () => {
    expect(isConversationUnread({ status: "Open", handledByAi: false })).toBe(true);
  });

  it("conversa com status Open mas atendida por IA não é não lida", () => {
    expect(isConversationUnread({ status: "Open", handledByAi: false && true })).toBe(true);
    expect(isConversationUnread({ status: "Open", handledByAi: true })).toBe(false);
  });

  it("conversa com status Waiting ou Closed nunca é marcada como não lida", () => {
    expect(isConversationUnread({ status: "Waiting", handledByAi: false })).toBe(false);
    expect(isConversationUnread({ status: "Closed", handledByAi: false })).toBe(false);
  });

  it("nunca compara contra o rótulo em português 'Aberto'", () => {
    // Regressão direta do bug original: se o enum do banco não mudar, mas a comparação voltar
    // a usar "Aberto" em vez de "Open", este teste falha.
    expect(isConversationUnread({ status: "Aberto", handledByAi: false })).toBe(false);
  });
});
