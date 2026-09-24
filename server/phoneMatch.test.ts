import { describe, expect, it } from "vitest";
import { phoneDigitCandidates, phoneLookupCandidates } from "./phoneMatch";

describe("phoneDigitCandidates", () => {
  it("formato da Sara (+55 DDD 9XXXXXXXX) gera com/sem 55 e com/sem 9º dígito", () => {
    expect(phoneDigitCandidates("+5548984053595").sort()).toEqual(
      ["4884053595", "48984053595", "554884053595", "5548984053595"].sort(),
    );
  });

  it("formato gravado no Cashmiles sem + casa com o formato da Sara", () => {
    const sara = new Set(phoneDigitCandidates("+5548984053595"));
    expect(sara.has("5548984053595")).toBe(true);
  });

  it("número antigo sem 9º dígito gera a forma com 9", () => {
    expect(phoneDigitCandidates("554884053595")).toContain("5548984053595");
  });

  it("ignora pontuação", () => {
    expect(phoneDigitCandidates("(48) 98405-3595")).toContain("5548984053595");
  });

  it("número curto demais não gera candidato (evita casar cliente errado)", () => {
    expect(phoneDigitCandidates("12345")).toEqual([]);
    expect(phoneDigitCandidates("")).toEqual([]);
  });

  it("número estrangeiro mantém só os próprios dígitos", () => {
    expect(phoneDigitCandidates("+1 415 555 0100")).toEqual(["14155550100"]);
  });
});

describe("phoneLookupCandidates", () => {
  it("inclui as formas com + para bater com o valor exato gravado", () => {
    const c = phoneLookupCandidates("+5548984053595");
    expect(c).toContain("+5548984053595");
    expect(c).toContain("5548984053595");
    expect(c).toContain("48984053595");
  });
});
