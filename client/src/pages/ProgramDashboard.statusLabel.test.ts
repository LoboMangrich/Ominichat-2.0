import { describe, it, expect } from "vitest";
import { customers } from "../../../drizzle/schema";
import { statusLabel, statusStyle } from "./ProgramDashboard";

// Bug real: statusLabel e statusStyle usavam "Em Risco" como chave (o rótulo, não o valor do
// enum customers.status). Clientes com status "At Risk" apareciam com o valor cru em inglês
// (fallback `|| client.status`) e sem a cor de destaque (fallback cinza), no painel por programa.
const REAL_STATUS_VALUES = customers.status.enumValues;

describe("ProgramDashboard — statusLabel/statusStyle usam o enum real do banco", () => {
  it("as chaves dos dois mapas são exatamente o enum real (customers.status)", () => {
    expect(Object.keys(statusLabel).sort()).toEqual([...REAL_STATUS_VALUES].sort());
    expect(Object.keys(statusStyle).sort()).toEqual([...REAL_STATUS_VALUES].sort());
  });

  it("At Risk tem rótulo Em Risco e estilo próprio (não mais o fallback cinza)", () => {
    expect(statusLabel["At Risk"]).toBe("Em Risco");
    expect(statusStyle["At Risk"]).toBeDefined();
    expect(statusStyle["At Risk"].color).not.toBe("oklch(0.50 0.04 155)"); // cor do fallback
  });

  it("regressão direta: 'Em Risco' não é mais usado como chave em nenhum dos dois mapas", () => {
    expect(statusLabel["Em Risco" as any]).toBeUndefined();
    expect(statusStyle["Em Risco" as any]).toBeUndefined();
  });
});
