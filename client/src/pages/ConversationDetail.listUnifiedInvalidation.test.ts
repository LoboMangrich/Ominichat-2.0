import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ConversationDetail aparece embutido em /atendimentos e na tela única de Conversas (/sara),
// e as duas listas vêm de tags.listUnified. As mutations que mudam status, IA/humano ou
// updatedAt (onUpdateNow no schema) precisam invalidar essa lista — sem isso, "Finalizar
// conversa" parecia quebrado: a conversa mudava, a lista não. Checagem estática do fonte,
// mesmo padrão de ConversationDetail.finalizarConversa.test.ts.
const source = readFileSync(new URL("./ConversationDetail.tsx", import.meta.url), "utf-8");

function onSuccessOf(mutationVar: string): string {
  const start = source.indexOf(`const ${mutationVar} = trpc.`);
  expect(start, `${mutationVar} não encontrada`).toBeGreaterThan(-1);
  const onSuccess = source.indexOf("onSuccess:", start);
  const onError = source.indexOf("onError:", onSuccess);
  return source.slice(onSuccess, onError);
}

describe("ConversationDetail — mutations invalidam tags.listUnified", () => {
  it.each([
    "statusMutation",
    "takeoverMutation",
    "returnToAiMutation",
    "sendMutation",
    "forwardMutation",
    "sendTemplateMutation",
    "simulateMutation",
  ])("%s invalida tags.listUnified no onSuccess", mutationVar => {
    expect(onSuccessOf(mutationVar)).toMatch(/utils\.tags\.listUnified\.invalidate\(\)/);
  });
});
