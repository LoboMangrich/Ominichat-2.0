import { describe, expect, it } from "vitest";
import { SARA_IMAGE_MAX_BYTES } from "@shared/sara";
import { MAX_IMAGE_SIDE, imageNeedsConversion, prepareSaraImage, targetSize } from "./saraImagePrepare";

// O canvas não existe no ambiente de teste (node); aqui fica a decisão de converter e
// o cálculo de tamanho. A conversão em si é validada no navegador.

describe("imageNeedsConversion — só JPEG/PNG até 5 MB saem como estão", () => {
  it("JPEG e PNG dentro do limite: não converte", () => {
    expect(imageNeedsConversion("image/jpeg", 1000)).toBe(false);
    expect(imageNeedsConversion("image/png", SARA_IMAGE_MAX_BYTES)).toBe(false);
  });
  it("WebP (causa da foto que não chegou em 25/09): converte", () => {
    expect(imageNeedsConversion("image/webp", 1000)).toBe(true);
  });
  it("outros formatos que o navegador abre: converte", () => {
    expect(imageNeedsConversion("image/gif", 1000)).toBe(true);
    expect(imageNeedsConversion("image/bmp", 1000)).toBe(true);
  });
  it("JPEG/PNG acima de 5 MB: converte (reduz)", () => {
    expect(imageNeedsConversion("image/jpeg", SARA_IMAGE_MAX_BYTES + 1)).toBe(true);
  });
});

describe("targetSize", () => {
  it("não amplia imagem pequena", () => {
    expect(targetSize(800, 600, 1)).toEqual({ width: 800, height: 600 });
  });
  it("limita o lado maior, mantendo a proporção", () => {
    expect(targetSize(4000, 3000, 1)).toEqual({ width: MAX_IMAGE_SIDE, height: 1920 });
    expect(targetSize(3000, 4000, 1)).toEqual({ width: 1920, height: MAX_IMAGE_SIDE });
  });
  it("aplica a redução da tentativa", () => {
    expect(targetSize(1000, 500, 0.5)).toEqual({ width: 500, height: 250 });
  });
});

describe("prepareSaraImage", () => {
  it("JPEG dentro do limite volta o mesmo arquivo, sem tocar no canvas", async () => {
    const file = new File([new Uint8Array(100)], "foto.jpg", { type: "image/jpeg" });
    await expect(prepareSaraImage(file)).resolves.toBe(file);
  });
});
