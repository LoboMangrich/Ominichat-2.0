import { describe, expect, it } from "vitest";
import { UNUSABLE_PASSWORD_HASH, hashPassword, verifyPassword } from "./passwordHash";

describe("passwordHash", () => {
  it("hashPassword gera um hash argon2id que verifyPassword reconhece", async () => {
    const hash = await hashPassword("senha-correta-123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(hash, "senha-correta-123")).resolves.toBe(true);
  });

  it("verifyPassword rejeita senha errada", async () => {
    const hash = await hashPassword("senha-correta-123");
    await expect(verifyPassword(hash, "senha-errada")).resolves.toBe(false);
  });

  it("verifyPassword nunca lança, mesmo com hash malformado", async () => {
    await expect(verifyPassword("isto-nao-e-um-hash-argon2", "qualquer-coisa")).resolves.toBe(false);
  });

  it("UNUSABLE_PASSWORD_HASH nunca bate com nenhuma senha", async () => {
    await expect(verifyPassword(UNUSABLE_PASSWORD_HASH, "123456")).resolves.toBe(false);
    await expect(verifyPassword(UNUSABLE_PASSWORD_HASH, "")).resolves.toBe(false);
  });
});
