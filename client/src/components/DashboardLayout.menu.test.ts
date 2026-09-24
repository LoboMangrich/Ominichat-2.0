import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Decisão de produto: "Conversas" é UMA tela só (/sara), com Sara + canal próprio juntos.
// O item "Conversas (legado)" e os sectionHeader "Atendimento via Sara"/"Canal próprio"
// saíram do menu. /atendimentos só redireciona para /sara (ver App.atendimentosRedirect.test.ts).
// Checagem estática do código-fonte (NAV_MODULES não é exportado).
const layout = readFileSync(new URL("./DashboardLayout.tsx", import.meta.url), "utf-8");

describe("DashboardLayout — menu de Atendimento com tela única de Conversas", () => {
  it("não tem mais o item \"Conversas (legado)\" nem link de menu para /atendimentos", () => {
    expect(layout).not.toMatch(/Conversas \(legado\)/);
    expect(layout).not.toMatch(/path: "\/atendimentos"/);
  });

  it("não tem os sectionHeader \"Atendimento via Sara\" e \"Canal próprio\"", () => {
    expect(layout).not.toMatch(/sectionHeader: "Atendimento via Sara"/);
    expect(layout).not.toMatch(/sectionHeader: "Canal próprio"/);
  });

  it("Atendimento fica com Conversas (/sara), Disparos em Massa e Grupos", () => {
    expect(layout).toMatch(/label: "Conversas",\s+path: "\/sara"/);
    expect(layout).toMatch(/label: "Disparos em Massa",\s+path: "\/broadcasts"/);
    expect(layout).toMatch(/label: "Grupos",\s+path: "\/groups"/);
  });
});
