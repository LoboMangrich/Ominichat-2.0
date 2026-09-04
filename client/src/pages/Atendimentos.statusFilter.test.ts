import { describe, it, expect } from "vitest";
import { conversations } from "../../../drizzle/schema";
import { TAG_STATUS_MAP } from "./Atendimentos";

// Bug real: o filtro client-side por tags padrão de status comparava item.status (que vem de
// tags.listUnified, sempre em inglês — server/routers.ts) contra "Aberto"/"Aguardando". As tags
// de status (ids 2 e 3) sempre retornavam lista vazia.
const REAL_STATUS_VALUES = conversations.status.enumValues;

describe("Atendimentos — TAG_STATUS_MAP compara contra o enum real do banco", () => {
  it("as entradas que representam status de conversa usam valores do enum real", () => {
    // "group" (id 5) não é status de conversa — é tratado à parte em filteredItems via
    // item.type === "group" (Atendimentos.tsx). "auto" (id 4) NÃO é tratado à parte: cai em
    // item.status === "auto", que nunca casa (ChatItem não tem status "auto"), então a tag
    // "Automático" sempre devolve lista vazia. Bug pré-existente, fora do escopo deste fix (que é
    // só o idioma dos valores de status "Open"/"Waiting") — não corrigido aqui.
    const statusEntries = Object.entries(TAG_STATUS_MAP).filter(
      ([, value]) => value !== "auto" && value !== "group"
    );
    expect(statusEntries.length).toBeGreaterThan(0);
    for (const [, value] of statusEntries) {
      expect(REAL_STATUS_VALUES).toContain(value);
    }
  });

  it("tag id 2 filtra por Open, tag id 3 filtra por Waiting", () => {
    expect(TAG_STATUS_MAP[2]).toBe("Open");
    expect(TAG_STATUS_MAP[3]).toBe("Waiting");
  });
});
