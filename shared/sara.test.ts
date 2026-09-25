import { describe, expect, it } from "vitest";
import {
  SARA_AUDIO_MIN_BYTES,
  SARA_IMAGE_MAX_BYTES,
  SARA_MEDIA_MAX_BYTES,
  saraCanReleaseOrClose,
  saraCanSend,
  saraOptOutMessage,
  formatWindowRemaining,
  saraWindowState,
  validateSaraMedia,
} from "./sara";

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

describe("validateSaraMedia — mesmas regras no navegador e no servidor (contrato do TI, 25/09)", () => {
  it("áudio: qualquer audio/*, inclusive com parâmetros (webm;codecs=opus)", () => {
    expect(validateSaraMedia("audio", "audio/webm;codecs=opus", 500)).toBeNull();
    expect(validateSaraMedia("audio", "audio/ogg", 500)).toBeNull();
    expect(validateSaraMedia("audio", "AUDIO/MPEG", 500)).toBeNull();
  });
  it("áudio: mínimo de 100 bytes", () => {
    expect(validateSaraMedia("audio", "audio/ogg", SARA_AUDIO_MIN_BYTES)).toBeNull();
    expect(validateSaraMedia("audio", "audio/ogg", SARA_AUDIO_MIN_BYTES - 1)).not.toBeNull();
  });
  it("áudio: mimetype que não é audio/* é recusado", () => {
    expect(validateSaraMedia("audio", "video/webm", 500)).not.toBeNull();
  });
  it("imagem: só JPEG e PNG — WebP não (a Meta só entrega WebP como figurinha)", () => {
    expect(validateSaraMedia("image", "image/jpeg", 500)).toBeNull();
    expect(validateSaraMedia("image", "image/png", 500)).toBeNull();
    expect(validateSaraMedia("image", "image/webp", 500)).toBe("Formato de imagem não aceito. Use JPEG ou PNG.");
    expect(validateSaraMedia("image", "image/gif", 500)).not.toBeNull();
    expect(validateSaraMedia("image", "image/heic", 500)).not.toBeNull();
  });
  it("imagem: 5 MB é o limite exato (limite da Meta)", () => {
    expect(validateSaraMedia("image", "image/png", SARA_IMAGE_MAX_BYTES)).toBeNull();
    expect(validateSaraMedia("image", "image/png", SARA_IMAGE_MAX_BYTES + 1)).toBe("Imagem maior que 5 MB.");
  });
  it("áudio: 16 MB é o limite exato", () => {
    expect(validateSaraMedia("audio", "audio/ogg", SARA_MEDIA_MAX_BYTES)).toBeNull();
    expect(validateSaraMedia("audio", "audio/ogg", SARA_MEDIA_MAX_BYTES + 1)).toBe("Arquivo maior que 16 MB.");
  });
});

describe("saraOptOutMessage", () => {
  it("com data", () => {
    expect(saraOptOutMessage("2026-09-20T15:00:00Z")).toBe(
      "Este contato pediu para não receber mensagens pelo WhatsApp em 20/09/2026.",
    );
  });
  it("sem data (ou inválida) não inventa uma", () => {
    expect(saraOptOutMessage(null)).toBe("Este contato pediu para não receber mensagens pelo WhatsApp.");
    expect(saraOptOutMessage("xx")).toBe("Este contato pediu para não receber mensagens pelo WhatsApp.");
  });
});

describe("saraWindowState — janela de 24h a partir da ÚLTIMA mensagem do cliente", () => {
  const NOW = Date.parse("2026-09-25T18:00:00Z");
  const at = (iso: string, senderType = "user") => ({ senderType, createdAt: iso });

  it("sem mensagem do cliente → fechada", () => {
    expect(saraWindowState([], NOW)).toEqual({ open: false, closesAt: null, remainingMs: 0 });
    expect(saraWindowState([at("2026-09-25T17:00:00Z", "admin"), at("2026-09-25T17:30:00Z", "sara")], NOW).open).toBe(false);
  });

  it("dentro das 24h → aberta, com quanto falta", () => {
    const state = saraWindowState([at("2026-09-25T10:00:00Z")], NOW);
    expect(state.open).toBe(true);
    expect(state.remainingMs).toBe(16 * 60 * 60 * 1000);
  });

  it("exatamente 24h depois → fechada", () => {
    expect(saraWindowState([at("2026-09-24T18:00:00Z")], NOW).open).toBe(false);
  });

  it("usa a mais recente do cliente, em qualquer ordem, e ignora as nossas", () => {
    const messages = [at("2026-09-25T09:00:00Z"), at("2026-09-23T09:00:00Z"), at("2026-09-25T17:59:00Z", "admin")];
    expect(saraWindowState(messages, NOW).closesAt).toBe(Date.parse("2026-09-26T09:00:00Z"));
  });

  it("createdAt inválido é ignorado", () => {
    expect(saraWindowState([at("xx")], NOW).open).toBe(false);
  });
});

describe("formatWindowRemaining", () => {
  it("formata e arredonda para cima", () => {
    expect(formatWindowRemaining(80 * 60_000)).toBe("1h20");
    expect(formatWindowRemaining(2 * 60 * 60_000)).toBe("2h");
    expect(formatWindowRemaining(65 * 60_000)).toBe("1h05");
    expect(formatWindowRemaining(44 * 60_000 + 1)).toBe("45min");
    expect(formatWindowRemaining(10_000)).toBe("1min");
  });
});
