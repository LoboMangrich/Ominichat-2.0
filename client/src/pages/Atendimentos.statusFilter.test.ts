import { describe, it, expect } from "vitest";
import { conversations } from "../../../drizzle/schema";
import { TAG_STATUS_MAP } from "./Atendimentos";

// Bug real (histórico): o filtro client-side por tags padrão de status comparava item.status (que
// vem de tags.listUnified, sempre em inglês — server/routers.ts) contra "Aberto"/"Aguardando". As
// tags de status (então identificadas por id) sempre retornavam lista vazia.
//
// TAG_STATUS_MAP passou a ser chaveado por slug (conversationTags.slug — ver drizzle/schema.ts e
// server/seedDefaults.ts) em vez de id autoincrement, porque o id depende da ordem em que as tags
// são criadas e não é garantido em instalação nova.
//
// A entrada "auto" (tag "Automático") tinha o mesmo defeito e nunca era corrigível por atribuição
// manual: comparava item.status === "auto", valor que o enum de conversations.status nunca produz.
// Removida de DEFAULT_TAGS (server/seedDefaults.ts) e daqui — ver CLAUDE.md > Backlog > Correções
// pendentes.
const REAL_STATUS_VALUES = conversations.status.enumValues;

describe("Atendimentos — TAG_STATUS_MAP compara contra o enum real do banco", () => {
  it("as entradas que representam status de conversa usam valores do enum real", () => {
    // "group" não é status de conversa — é tratado à parte em filteredItems via
    // item.type === "group" (Atendimentos.tsx).
    const statusEntries = Object.entries(TAG_STATUS_MAP).filter(
      ([, value]) => value !== "group"
    );
    expect(statusEntries.length).toBeGreaterThan(0);
    for (const [, value] of statusEntries) {
      expect(REAL_STATUS_VALUES).toContain(value);
    }
  });

  it("slug 'open' filtra por Open, slug 'waiting' filtra por Waiting", () => {
    expect(TAG_STATUS_MAP.open).toBe("Open");
    expect(TAG_STATUS_MAP.waiting).toBe("Waiting");
  });

  it("'auto' não existe mais no mapa — comparava contra um valor impossível do enum", () => {
    expect(TAG_STATUS_MAP.auto).toBeUndefined();
  });
});
