import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { customers } from "../../../drizzle/schema";

// Bug real: o filtro "Situação" da audiência de disparos em massa usava
// <SelectItem value="Ativo"> / <SelectItem value="Em Risco"> — rótulos em português como VALOR
// do item, enviados para broadcasts.create (server/routers.ts), que grava filterStatus e, ao
// enviar, filtra com eq(customers.status, campaign.filterStatus as any) contra o enum real
// customers.status. Um disparo filtrado por "Ativo" ou "Em Risco" saía sem destinatário nenhum,
// silenciosamente — o disparo "funcionava" (sem erro), só não alcançava ninguém.
//
// Nota: sem harness de teste de componente React neste projeto — checagem estática do código-fonte.
const source = readFileSync(new URL("./Broadcasts.tsx", import.meta.url), "utf-8");

describe("Broadcasts — filtro de situação usa o enum real, não o rótulo em português", () => {
  it("não usa mais 'Ativo'/'Em Risco' como valor do SelectItem", () => {
    expect(source).not.toMatch(/<SelectItem value="Ativo">/);
    expect(source).not.toMatch(/<SelectItem value="Em Risco">/);
  });

  it("usa Active/At Risk como valor, com o rótulo em português no texto exibido", () => {
    expect(source).toMatch(/<SelectItem value="Active">Ativos<\/SelectItem>/);
    expect(source).toMatch(/<SelectItem value="At Risk">Em Risco<\/SelectItem>/);
  });

  it("Active e At Risk pertencem ao enum real de customers.status", () => {
    expect(customers.status.enumValues).toContain("Active");
    expect(customers.status.enumValues).toContain("At Risk");
  });
});
