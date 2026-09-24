import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// /sara virou tela unificada no formato de /atendimentos: lista à esquerda, chat e painel
// do cliente à direita. A Sara está em produção com clientes reais — sendMessage, takeover,
// release e close alteram conversa de verdade —, então nada aqui chama a API: checagem
// estática do código-fonte, mesmo padrão de ConversationDetail.finalizarConversa.test.ts
// (sem harness de teste de componente React neste projeto).
const detail = readFileSync(new URL("./SaraConversationDetail.tsx", import.meta.url), "utf-8");
const list = readFileSync(new URL("./Sara.tsx", import.meta.url), "utf-8");
const shared = readFileSync(new URL("./saraShared.ts", import.meta.url), "utf-8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf-8");

function mutationBlock(name: string): string {
  const start = detail.indexOf(`trpc.sara.${name}.useMutation(`);
  expect(start, `mutation ${name} não encontrada`).toBeGreaterThan(-1);
  const end = detail.indexOf("});", start);
  return detail.slice(start, end);
}

describe("SaraConversationDetail — toda mutation invalida conversa e lista", () => {
  it("invalidateAll invalida sara.getConversation E sara.listConversations", () => {
    const start = detail.indexOf("const invalidateAll = () => {");
    expect(start).toBeGreaterThan(-1);
    const body = detail.slice(start, detail.indexOf("};", start));
    expect(body).toMatch(/utils\.sara\.getConversation\.invalidate\(\{ id \}\)/);
    expect(body).toMatch(/utils\.sara\.listConversations\.invalidate\(\)/);
  });

  it.each(["sendMessage", "takeover", "release", "close"])("%s chama invalidateAll no onSuccess", name => {
    expect(mutationBlock(name)).toMatch(/onSuccess:[\s\S]*invalidateAll\(\)/);
  });
});

describe("Sara — abas só com status confirmados no código", () => {
  it("SARA_TABS só filtra por active e human_takeover (Todos = sem filtro)", () => {
    const tabs = shared.slice(shared.indexOf("export const SARA_TABS"), shared.indexOf("] as const"));
    const statuses = [...tabs.matchAll(/status: ("[^"]*"|undefined)/g)].map(m => m[1]);
    expect(statuses).toEqual(["undefined", '"active"', '"human_takeover"']);
  });

  it("não reintroduz status não verificados (awaiting_response / Aguardando / Waiting)", () => {
    for (const source of [detail, list, shared]) {
      expect(source).not.toMatch(/awaiting_response|Aguardando|"Waiting"/);
    }
  });
});

describe("SaraConversationDetail — Encerrar e remetentes", () => {
  it("Encerrar pede confirmação (AlertDialog) antes de chamar close", () => {
    expect(detail).toMatch(/<AlertDialogAction[\s\S]*?closeMutation\.mutate\(\{ id \}\)/);
    expect(detail).toMatch(/O cliente deixa de ser atendido por aqui\./);
  });

  it("senderType desconhecido não é descartado — mostra o valor cru", () => {
    expect(detail).toMatch(/const isUnknown = !isCustomer && !isSara && !isAdmin/);
    expect(detail).toMatch(/\{isUnknown && \([\s\S]*?\{message\.senderType\}/);
  });

  it("cores: Sara bg-brand-600, atendente bg-emerald-700 (AA com texto branco)", () => {
    expect(detail).toMatch(/bg-emerald-700 text-white/);
    expect(detail).toMatch(/bg-brand-600 text-white/);
    expect(detail).not.toMatch(/bg-emerald-600 text-white/);
  });

  it("não cria cor hex nova", () => {
    for (const source of [detail, list, shared]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("Rotas — /sara e /sara/:id renderizam a tela unificada", () => {
  it("as duas rotas usam o componente Sara", () => {
    expect(app).toMatch(/<Route path="\/sara" component=\{Sara\} \/>/);
    expect(app).toMatch(/<Route path="\/sara\/:id" component=\{Sara\} \/>/);
  });
});
