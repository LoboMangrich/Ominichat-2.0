import { describe, it, expect } from "vitest";
import { customers } from "../../../drizzle/schema";
import { statusConfig } from "./Customers";

// Bug real: a chave do status "At Risk" em statusConfig estava escrita como "Em Risco" (o
// rótulo, não o valor do enum). statusConfig[c.status] nunca casava para clientes em risco —
// o badge de status simplesmente não aparecia (nem na lista, nem no painel de detalhe do
// cliente), embora o guard `cfg &&` evitasse um crash. O <Select> de criar cliente e o filtro
// de status também enviavam "Ativo"/"Em Risco" como valor, quebrando customers.create
// (z.enum estrito) e devolvendo lista vazia em customers.list (filtro silencioso).
const REAL_STATUS_VALUES = customers.status.enumValues;

describe("Customers — statusConfig é a única fonte de verdade dos Selects de status", () => {
  it("as chaves de statusConfig são exatamente o enum real do banco (customers.status)", () => {
    expect(Object.keys(statusConfig).sort()).toEqual([...REAL_STATUS_VALUES].sort());
  });

  it("todo status real do banco tem uma entrada com rótulo em português", () => {
    for (const status of REAL_STATUS_VALUES) {
      expect(statusConfig[status]).toBeDefined();
      expect(statusConfig[status].label.length).toBeGreaterThan(0);
    }
  });

  it("At Risk exibe o rótulo Em Risco (chave correta, não mais invertida)", () => {
    expect(statusConfig["At Risk"].label).toBe("Em Risco");
  });

  it("regressão direta: 'Em Risco' não é mais usado como chave", () => {
    expect(statusConfig["Em Risco" as any]).toBeUndefined();
  });
});
