import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SARA_MEDIA_GENERIC_ERROR } from "@shared/sara";
import { saraMediaUploadUrl, saraOptOutConfirmText, saraOptOutPhone } from "@/pages/saraShared";
import { uploadSaraMedia } from "./saraMediaUpload";

// Nada aqui chama a Sara nem o servidor: fetch é mock.

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("uploadSaraMedia — rota Express, campo \"file\", mensagens do servidor", () => {
  it("POST multipart na rota da conversa, com o kind na query", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { ok: true }));
    const blob = new Blob([new Uint8Array(200)], { type: "audio/webm" });

    await uploadSaraMedia("conv 1", "audio", blob);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sara/conversations/conv%201/media?kind=audio");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("erro do servidor: mostra a mensagem que ele devolveu (ex.: 409)", async () => {
    fetchMock.mockResolvedValueOnce(response(409, { error: "Assuma a conversa para enviar" }));
    await expect(uploadSaraMedia("c", "image", new Blob())).rejects.toThrow("Assuma a conversa para enviar");
  });

  it("erro sem corpo legível ou falha de rede: mensagem genérica", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error("html"); } });
    await expect(uploadSaraMedia("c", "image", new Blob())).rejects.toThrow(SARA_MEDIA_GENERIC_ERROR);
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(uploadSaraMedia("c", "image", new Blob())).rejects.toThrow(SARA_MEDIA_GENERIC_ERROR);
  });
});

describe("saraOptOutPhone", () => {
  it("normaliza para + e dígitos", () => {
    expect(saraOptOutPhone("+55 (48) 98405-3595")).toBe("+5548984053595");
    expect(saraOptOutPhone("5548984053595")).toBe("+5548984053595");
  });
  it("sem telefone utilizável → null", () => {
    expect(saraOptOutPhone(null)).toBeNull();
    expect(saraOptOutPhone("123")).toBeNull();
    expect(saraOptOutPhone("1".repeat(16))).toBeNull();
  });
});

describe("saraOptOutConfirmText", () => {
  it("optedOut → texto do diálogo com a data", () => {
    expect(saraOptOutConfirmText({ optedOut: true, optedOutAt: "2026-09-20T15:00:00Z" })).toBe(
      "Este contato pediu para não receber mensagens pelo WhatsApp em 20/09/2026. Enviar mesmo assim?",
    );
  });
  it("sem opt-out, sem registro ou ainda carregando → envia direto", () => {
    expect(saraOptOutConfirmText({ optedOut: false, optedOutAt: null })).toBeNull();
    expect(saraOptOutConfirmText(undefined)).toBeNull();
  });
});

describe("saraMediaUploadUrl", () => {
  it("codifica o id", () => {
    expect(saraMediaUploadUrl("a/b", "image")).toBe("/api/sara/conversations/a%2Fb/media?kind=image");
  });
});
