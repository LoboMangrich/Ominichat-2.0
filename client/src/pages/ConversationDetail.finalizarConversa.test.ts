import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Substituído o <Select> de 3 opções (Aberto/Aguardando/Encerrar) por um botão único e
// explícito "Finalizar conversa" — pedido de teste de uso real: o seletor deixava a ação de
// encerrar a conversa pouco óbvia. O botão usa variant="destructive" (token --destructive do
// design system, nunca hex cru) e chama conversations.updateStatus só com status: "Closed" —
// nunca mais volta pra "Waiting" pela UI (ver Conversations.statusFilter.test.ts e CLAUDE.md
// para a decisão pendente sobre esse status).
//
// Nota: sem harness de teste de componente React neste projeto — checagem estática do
// código-fonte, mesmo padrão de Broadcasts.statusFilter.test.ts.
const source = readFileSync(new URL("./ConversationDetail.tsx", import.meta.url), "utf-8");

describe("ConversationDetail — botão único de finalizar conversa, sem seletor de 3 opções", () => {
  it("não usa mais o <Select> de status (Aberto/Aguardando/Encerrar)", () => {
    expect(source).not.toMatch(/<Select value=\{conv\.status\}/);
  });

  it("tem um botão destrutivo que finaliza a conversa", () => {
    expect(source).toMatch(/variant="destructive"/);
    expect(source).toMatch(/Finalizar conversa/);
  });

  it("o botão sempre manda status: \"Closed\" — nunca um valor dinâmico vindo de um <Select>", () => {
    expect(source).toMatch(/statusMutation\.mutate\(\{ id: convId, status: "Closed" \}\)/);
  });
});
