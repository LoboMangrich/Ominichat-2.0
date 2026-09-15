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
const REAL_STATUS_VALUES = conversations.status.enumValues;

describe("Atendimentos — TAG_STATUS_MAP compara contra o enum real do banco", () => {
  it("as entradas que representam status de conversa usam valores do enum real", () => {
    // "group" não é status de conversa — é tratado à parte em filteredItems via
    // item.type === "group" (Atendimentos.tsx). "auto" NÃO é tratado à parte: cai em
    // item.status === "auto", que nunca casa (ChatItem não tem status "auto"), então a tag
    // "Automático" sempre devolve lista vazia. Bug pré-existente, fora do escopo deste fix — não
    // corrigido aqui.
    const statusEntries = Object.entries(TAG_STATUS_MAP).filter(
      ([, value]) => value !== "auto" && value !== "group"
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
});
