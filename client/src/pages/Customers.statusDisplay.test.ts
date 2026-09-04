import { describe, it, expect } from "vitest";
import { conversations } from "../../../drizzle/schema";
import { getConversationStatusDisplay } from "./Customers";

// Bug real: o card "Últimas Interações" do cliente comparava conv.status (inglês, vindo de
// customers.getLastInteractions — server/routers.ts) contra 'Aberto'/'Aguardando'. Toda
// conversa caía no fallback e aparecia com a cor e o rótulo de "Fechado", independente do
// status real.
const REAL_STATUS_VALUES = conversations.status.enumValues;

describe("Customers — getConversationStatusDisplay compara contra o enum real do banco", () => {
  it("reconhece todo valor do enum real de conversations.status", () => {
    // Trava se o enum mudar (novo status adicionado/renomeado) sem esta função acompanhar —
    // ao contrário de comparar contra strings hardcoded, que não pegaria a divergência.
    expect(REAL_STATUS_VALUES).toEqual(["Open", "Waiting", "Closed"]);
    for (const status of REAL_STATUS_VALUES) {
      expect(getConversationStatusDisplay(status).label).not.toBe("");
    }
  });

  it("Open exibe rótulo Aberto", () => {
    expect(getConversationStatusDisplay(REAL_STATUS_VALUES[0]).label).toBe("Aberto");
  });

  it("Waiting exibe rótulo Aguardando", () => {
    expect(getConversationStatusDisplay(REAL_STATUS_VALUES[1]).label).toBe("Aguardando");
  });

  it("Closed exibe rótulo Fechado", () => {
    expect(getConversationStatusDisplay(REAL_STATUS_VALUES[2]).label).toBe("Fechado");
  });

  it("valores desconhecidos ou ausentes caem no fallback Fechado sem lançar erro", () => {
    expect(getConversationStatusDisplay(null).label).toBe("Fechado");
    expect(getConversationStatusDisplay(undefined).label).toBe("Fechado");
  });

  it("regressão direta: rótulo em português não é mais o valor comparado", () => {
    // Antes da correção, comparar contra 'Aberto' era o próprio bug — confirma que a função não
    // trata o rótulo em português como um status válido.
    expect(getConversationStatusDisplay("Aberto" as any).label).toBe("Fechado");
  });
});
