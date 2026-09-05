import { describe, it, expect } from "vitest";
import { customers } from "../../../drizzle/schema";
import { isActiveCustomer } from "./HealthIndicators";

// Bug real (issue #20): a tela de Índice de Saúde filtrava clientes ativos com
// c.status === "Ativo", mas o enum real de customers.status (drizzle/schema.ts) é
// ["Active", "At Risk", "Churned", "New"]. A condição nunca era verdadeira — a tela inteira
// calculava suas métricas (excelente/bom/atenção/crítico, média, clientes em risco) sobre uma
// lista sempre vazia.
const REAL_STATUS_VALUES = customers.status.enumValues;

describe("HealthIndicators — isActiveCustomer compara contra o enum real do banco", () => {
  it("Active é reconhecido como cliente ativo", () => {
    expect(isActiveCustomer({ status: "Active" })).toBe(true);
  });

  it("nenhum outro valor do enum real é tratado como ativo", () => {
    for (const status of REAL_STATUS_VALUES) {
      if (status === "Active") continue;
      expect(isActiveCustomer({ status })).toBe(false);
    }
  });

  it("regressão direta: o rótulo em português 'Ativo' não é mais o valor comparado", () => {
    expect(isActiveCustomer({ status: "Ativo" })).toBe(false);
  });
});
