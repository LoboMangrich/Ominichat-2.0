import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalEmail } from "./validators";

describe("optionalEmail", () => {
  it("aceita e-mail válido e mantém o valor", () => {
    expect(optionalEmail.parse("cliente@example.com")).toBe("cliente@example.com");
  });

  it("remove espaços em volta de um e-mail válido", () => {
    expect(optionalEmail.parse("  cliente@example.com  ")).toBe("cliente@example.com");
  });

  it("aceita string vazia e normaliza para null (coluna nullable)", () => {
    expect(optionalEmail.parse("")).toBeNull();
  });

  it("aceita string só com espaços e normaliza para null", () => {
    expect(optionalEmail.parse("   ")).toBeNull();
  });

  it("aceita o campo ausente (undefined) sem exigir valor", () => {
    expect(optionalEmail.parse(undefined)).toBeUndefined();
  });

  it("rejeita e-mail com formato inválido", () => {
    expect(() => optionalEmail.parse("nao-e-um-email")).toThrow();
  });

  it("rejeita e-mail com formato inválido mesmo com texto não vazio", () => {
    expect(() => optionalEmail.parse("cliente@")).toThrow();
  });

  it("num objeto, campo ausente permanece undefined (não sobrescreve update parcial)", () => {
    const schema = z.object({ name: z.string(), email: optionalEmail });

    const parsed = schema.parse({ name: "Cliente" });

    expect(parsed.email).toBeUndefined();
  });
});
