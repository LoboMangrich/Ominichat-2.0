import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { referrals } from "../../../drizzle/schema";

// Bug real: o filtro de status da tela "Indicações & Upsell" usava
// {["Pendente", "Contacted", "Converted", "Lost"].map(...)} — "Pendente" é o rótulo em
// português, não o valor do enum (que é "Pending"). Enviado para referrals.list
// (server/routers.ts), que filtrava com eq(referrals.status, input.status as any) contra o
// enum real referrals.status. Filtrar por "Pendente" devolvia lista vazia, silenciosamente —
// mesmo padrão de bug já corrigido em Broadcasts.tsx e Campaigns.tsx, mas presente aqui.
//
// Nota: sem harness de teste de componente React neste projeto — checagem estática do
// código-fonte, mesmo padrão de Broadcasts.statusFilter.test.ts.
const source = readFileSync(new URL("./Referrals.tsx", import.meta.url), "utf-8");

describe("Referrals — filtro de status usa o enum real, não o rótulo em português", () => {
  it("não usa mais 'Pendente' como valor de SelectItem (só pode aparecer em label/comentário)", () => {
    expect(source).not.toMatch(/value=["']Pendente["']/);
    expect(source).not.toMatch(/\[["']Pendente["']/);
  });

  it("deriva as opções de referrals.status.enumValues, não de um array copiado à mão", () => {
    expect(source).toMatch(/referralsTable\.status\.enumValues\.map/);
  });

  it("referrals.status.enumValues não contém 'Pendente'", () => {
    expect(referrals.status.enumValues).not.toContain("Pendente");
  });

  it("referrals.status.enumValues contém 'Pending', o valor real", () => {
    expect(referrals.status.enumValues).toContain("Pending");
  });
});
