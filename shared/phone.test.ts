import { describe, expect, it } from "vitest";
import { e164Candidates, phoneDigits, toE164Phone } from "./phone";

describe("toE164Phone — só telefone completo vira filtro phone da Sara", () => {
  it("já em E.164 (formato da Sara) passa igual", () => {
    expect(toE164Phone("+5548984053595")).toBe("+5548984053595");
  });

  it("com + e pontuação normaliza para só dígitos", () => {
    expect(toE164Phone("+55 (48) 98405-3595")).toBe("+5548984053595");
    expect(toE164Phone("+1 415 555 0100")).toBe("+14155550100");
  });

  it("nacional brasileiro (DDD + número, 10 ou 11 dígitos) ganha +55", () => {
    expect(toE164Phone("(48) 98405-3595")).toBe("+5548984053595");
    expect(toE164Phone("4884053595")).toBe("+554884053595");
  });

  it("brasileiro com 55 sem + (12 ou 13 dígitos) ganha só o +", () => {
    expect(toE164Phone("5548984053595")).toBe("+5548984053595");
    expect(toE164Phone("554884053595")).toBe("+554884053595");
  });

  it("não mexe no 9º dígito — E.164 é o número como digitado", () => {
    expect(toE164Phone("4884053595")).not.toBe("+5548984053595");
  });

  it("número parcial (<10 dígitos) não é telefone completo", () => {
    expect(toE164Phone("98405")).toBeNull();
    expect(toE164Phone("984053595")).toBeNull();
  });

  it("nome ou texto sem dígitos suficientes não é telefone", () => {
    expect(toE164Phone("Maria")).toBeNull();
    expect(toE164Phone("")).toBeNull();
    expect(toE164Phone("Maria 48")).toBeNull();
  });

  it("formato ambíguo sem + (fora de 10–13 dígitos brasileiros) → null", () => {
    expect(toE164Phone("14155550100")).toBe("+5514155550100"); // 11 dígitos = nacional BR (DDD 14)
    expect(toE164Phone("44207946095812")).toBeNull(); // 14 dígitos sem +
    expect(toE164Phone("4848984053595")).toBeNull(); // 13 dígitos sem 55 na frente
  });

  it("mais de 15 dígitos não é E.164", () => {
    expect(toE164Phone("+1234567890123456")).toBeNull();
  });
});

describe("e164Candidates — com e sem o 9º dígito, no máximo 2 (consulta à Sara por ?customerId)", () => {
  it("celular com 9 gera também a forma sem 9", () => {
    expect(e164Candidates("+5548984053595")).toEqual(["+5548984053595", "+554884053595"]);
    expect(e164Candidates("48984053595")).toEqual(["+5548984053595", "+554884053595"]);
  });

  it("número gravado sem 9 gera também a forma com 9", () => {
    expect(e164Candidates("554884053595")).toEqual(["+554884053595", "+5548984053595"]);
    expect(e164Candidates("(48) 8405-3595")).toEqual(["+554884053595", "+5548984053595"]);
  });

  it("nunca passa de 2 formas", () => {
    for (const raw of ["+5548984053595", "48984053595", "554884053595", "4884053595"]) {
      expect(e164Candidates(raw).length).toBeLessThanOrEqual(2);
    }
  });

  it("internacional com + (não 55) fica com a forma única", () => {
    expect(e164Candidates("+1 415 555 0100")).toEqual(["+14155550100"]);
    expect(e164Candidates("+1 419 955 0100")).toEqual(["+14199550100"]); // 3º dígito 9, mas não é BR
  });

  it("parcial ou vazio não gera forma nenhuma", () => {
    expect(e164Candidates("98405")).toEqual([]);
    expect(e164Candidates("")).toEqual([]);
  });
});

describe("phoneDigits", () => {
  it("mantém só os dígitos", () => {
    expect(phoneDigits("+55 (48) 98405-3595")).toBe("5548984053595");
  });
});
