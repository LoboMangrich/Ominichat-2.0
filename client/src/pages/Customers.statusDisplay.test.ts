import { describe, it, expect } from "vitest";
import { getConversationStatusDisplay } from "./Customers";

// Bug real: o card "Últimas Interações" do cliente comparava conv.status (inglês, vindo de
// customers.getLastInteractions — server/routers.ts) contra 'Aberto'/'Aguardando'. Toda
// conversa caía no fallback e aparecia com a cor e o rótulo de "Fechado", independente do
// status real.
describe("Customers — getConversationStatusDisplay compara contra o enum real do banco", () => {
  it("Open exibe rótulo Aberto", () => {
    expect(getConversationStatusDisplay("Open").label).toBe("Aberto");
  });

  it("Waiting exibe rótulo Aguardando", () => {
    expect(getConversationStatusDisplay("Waiting").label).toBe("Aguardando");
  });

  it("Closed exibe rótulo Fechado", () => {
    expect(getConversationStatusDisplay("Closed").label).toBe("Fechado");
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
