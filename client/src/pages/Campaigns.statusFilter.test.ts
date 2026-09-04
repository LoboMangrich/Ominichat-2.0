import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { customers } from "../../../drizzle/schema";

// Bug real: o filtro "Status do cliente" da audiência de campanhas usava
// <SelectItem value="Ativo"> / <SelectItem value="Em Risco"> — rótulos em português como VALOR
// do item, enviados para campaigns.getRecipients/preview (server/routers.ts), que filtra com
// eq(customers.status, input.filterStatus as any) contra o enum real customers.status
// (["Active","At Risk","Churned","New"]). Uma campanha filtrada por "Ativo" ou "Em Risco" nunca
// tinha destinatário nenhum, silenciosamente.
//
// Nota: não há harness de teste de componente React neste projeto (sem jsdom/testing-library),
// então esta é uma checagem estática do código-fonte — verifica que os `value=` dos SelectItem de
// status do cliente usam o enum real, e não os rótulos em português.
const source = readFileSync(new URL("./Campaigns.tsx", import.meta.url), "utf-8");

describe("Campaigns — filtro de status do cliente usa o enum real, não o rótulo em português", () => {
  it("não usa mais 'Ativo'/'Em Risco' como valor do SelectItem", () => {
    expect(source).not.toMatch(/<SelectItem value="Ativo">/);
    expect(source).not.toMatch(/<SelectItem value="Em Risco">/);
  });

  it("usa Active/At Risk como valor, com o rótulo em português no texto exibido", () => {
    expect(source).toMatch(/<SelectItem value="Active">Ativo<\/SelectItem>/);
    expect(source).toMatch(/<SelectItem value="At Risk">Em Risco<\/SelectItem>/);
  });

  it("Active e At Risk pertencem ao enum real de customers.status", () => {
    expect(customers.status.enumValues).toContain("Active");
    expect(customers.status.enumValues).toContain("At Risk");
  });
});
