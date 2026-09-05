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

describe("Campaigns — o sentinela '_all' (opção \"Todos\") não vaza como filtro real", () => {
  // Achado do @qa na revisão do PR #21: onValueChange={setFilterStatus} gravava o literal
  // "_all" no estado, e `filterStatus || undefined` não removia esse valor (string não-vazia é
  // truthy). Escolher "Todos" mandava filterStatus: "_all" para campaigns.previewAudience/create,
  // que devolvia audiência zero silenciosamente. Mesmo problema em filterProgram (SelectItem
  // value="_all" de "Todos os programas"). Corrigido normalizando "_all" para "" no próprio
  // onValueChange, no mesmo padrão já usado em Broadcasts.tsx e Customers.tsx.
  it("normaliza '_all' para string vazia ao selecionar 'Todos' no filtro de status", () => {
    expect(source).toMatch(/onValueChange=\{v => setFilterStatus\(v === "_all" \? "" : v\)\}/);
  });

  it("normaliza '_all' para string vazia ao selecionar 'Todos os programas'", () => {
    expect(source).toMatch(/onValueChange=\{v => setFilterProgram\(v === "_all" \? "" : v\)\}/);
  });

  it("regressão direta: não usa mais setFilterStatus/setFilterProgram direto como onValueChange", () => {
    expect(source).not.toMatch(/onValueChange=\{setFilterStatus\}/);
    expect(source).not.toMatch(/onValueChange=\{setFilterProgram\}/);
  });
});
