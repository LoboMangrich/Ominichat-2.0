import { describe, it, expect } from "vitest";
import { conversations } from "../../../drizzle/schema";
import { TAG_STATUS_MAP } from "./Atendimentos";

// Bug real: o filtro client-side por tags padrão de status comparava item.status (que vem de
// tags.listUnified, sempre em inglês — server/routers.ts) contra "Aberto"/"Aguardando". As tags
// de status (ids 2 e 3) sempre retornavam lista vazia.
const REAL_STATUS_VALUES = conversations.status.enumValues;

describe("Atendimentos — TAG_STATUS_MAP compara contra o enum real do banco", () => {
  it("as entradas que representam status de conversa usam valores do enum real", () => {
    // "auto" e "group" (ids 4 e 5) não são status de conversa — são marcadores de outro tipo de
    // filtro (handledByAi / item.type), tratados à parte no componente.
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
