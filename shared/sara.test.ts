import { describe, expect, it } from "vitest";
import { saraCanReleaseOrClose, saraCanSend } from "./sara";

describe("saraCanSend — só quem assumiu envia", () => {
  it("dono envia", () => expect(saraCanSend("7", 7)).toBe(true));
  it("outro atendente não envia", () => expect(saraCanSend("99", 7)).toBe(false));
  it("actorId null não envia (ninguém)", () => expect(saraCanSend(null, 7)).toBe(false));
});

describe("saraCanReleaseOrClose — dono, Admin, ou qualquer um com actorId null", () => {
  it("dono", () => expect(saraCanReleaseOrClose("7", 7, "Agent")).toBe(true));
  it("Admin em conversa de outro", () => expect(saraCanReleaseOrClose("99", 7, "Admin")).toBe(true));
  it("qualquer atendente com actorId null", () => expect(saraCanReleaseOrClose(null, 7, "Agent")).toBe(true));
  it("outro atendente (Agent/Manager) não", () => {
    expect(saraCanReleaseOrClose("99", 7, "Agent")).toBe(false);
    expect(saraCanReleaseOrClose("99", 7, "Manager")).toBe(false);
  });
});
