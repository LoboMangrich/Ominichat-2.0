import { SARA_IMAGE_MAX_BYTES, SARA_IMAGE_MIME_TYPES, baseMimeType } from "@shared/sara";

// Imagem para a Sara: a Meta só entrega como IMAGEM no WhatsApp JPEG e PNG até 5 MB
// (WebP vira figurinha — no teste real de 25/09 a foto WebP foi aceita pela Sara e
// nunca chegou). Qualquer outra imagem que o navegador consiga abrir (WebP, GIF, BMP,
// PNG/JPEG grande demais) é convertida aqui para JPEG, no canvas, antes da prévia.
// Tudo em memória, no navegador.

export const JPEG_QUALITY = 0.85;
/** Lado maior depois da conversão — foto de celular não precisa de mais para WhatsApp. */
export const MAX_IMAGE_SIDE = 2560;
/** Reduções sucessivas até caber em 5 MB. */
export const JPEG_SCALE_STEPS = [1, 0.75, 0.5, 0.35] as const;

export const IMAGE_NOT_SUPPORTED_MESSAGE = "Não foi possível abrir esta imagem. Use JPEG ou PNG.";
export const IMAGE_TOO_BIG_MESSAGE = "Não foi possível reduzir a imagem para menos de 5 MB.";

/** Já está num formato que a Meta entrega e dentro do limite: envia como está. */
export function imageNeedsConversion(mimeType: string, size: number): boolean {
  const mime = baseMimeType(mimeType);
  return !(SARA_IMAGE_MIME_TYPES as readonly string[]).includes(mime) || size > SARA_IMAGE_MAX_BYTES;
}

/** Dimensões finais: respeita o lado máximo e aplica a redução da tentativa. */
export function targetSize(width: number, height: number, scale: number): { width: number; height: number } {
  const fit = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const factor = fit * scale;
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

/**
 * Devolve o arquivo pronto para enviar (JPEG/PNG ≤ 5 MB). Lança Error com mensagem
 * para o atendente se não der para abrir ou reduzir.
 */
export async function prepareSaraImage(file: File): Promise<File> {
  if (!imageNeedsConversion(file.type, file.size)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(IMAGE_NOT_SUPPORTED_MESSAGE);
  }
  try {
    for (const scale of JPEG_SCALE_STEPS) {
      const { width, height } = targetSize(bitmap.width, bitmap.height, scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(IMAGE_NOT_SUPPORTED_MESSAGE);
      // JPEG não tem transparência: fundo branco no lugar do transparente (PNG/WebP).
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasToJpeg(canvas);
      if (blob && blob.size <= SARA_IMAGE_MAX_BYTES) {
        return new File([blob], "imagem.jpg", { type: "image/jpeg" });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error(IMAGE_TOO_BIG_MESSAGE);
}
