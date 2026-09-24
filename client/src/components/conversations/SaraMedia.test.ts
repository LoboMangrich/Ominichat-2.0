import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Mídia recebida da Sara: URL assinada que expira em 900s. Checagem estática do fonte
// (sem harness de componente React neste projeto).
const media = readFileSync(new URL("./SaraMedia.tsx", import.meta.url), "utf-8");
const detail = readFileSync(new URL("../../pages/SaraConversationDetail.tsx", import.meta.url), "utf-8");

const EXPIRES_MS = 900_000;

function constantMs(name: string): number {
  const match = media.match(new RegExp(`export const ${name} = (\\d+) \\* 60_000;`));
  expect(match, `${name} não encontrada`).not.toBeNull();
  return Number(match![1]) * 60_000;
}

describe("SaraMedia — URL assinada de 900s", () => {
  it("staleTime e gcTime ficam bem abaixo dos 900s de validade", () => {
    expect(constantMs("MEDIA_URL_STALE_MS")).toBeLessThan(EXPIRES_MS);
    expect(constantMs("MEDIA_URL_GC_MS")).toBeLessThan(EXPIRES_MS);
  });

  it("áudio só busca a URL depois do clique (enabled: requested)", () => {
    expect(media).toMatch(/trpc\.sara\.audioUrl\.useQuery\([\s\S]*?enabled: requested/);
  });

  it("<audio> e <img> buscam URL nova no erro e zeram o contador quando carregam", () => {
    expect(media).toMatch(/<audio[\s\S]*?onError=\{onError\}[\s\S]*?onLoadedMetadata=\{onLoad\}/);
    expect(media).toMatch(/<img[\s\S]*?onError=\{onError\}[\s\S]*?onLoad=\{onLoad\}/);
    // onLoad zera → a segunda expiração também se recupera.
    expect(media).toMatch(/const onLoad = useCallback\(\(\) => \{\s*setAttempts\(0\);/);
    // Uma nova busca por erro; esgotado, para (sem loop) e oferece "tentar de novo".
    expect(media).toMatch(/if \(attempts >= 1\) \{\s*setExhausted\(true\);/);
  });

  it("imagem usa visionSummary como alt e legenda", () => {
    expect(media).toContain('const alt = image.visionSummary ?? "Imagem enviada pelo cliente";');
    expect(media).toMatch(/<figcaption[^>]*>\{image\.visionSummary\}<\/figcaption>/);
  });

  it("nunca loga a URL assinada", () => {
    expect(media).not.toMatch(/console\./);
  });

  it("bolha do chat renderiza áudio e imagem; sem texto e sem mídia mostra \"[<messageType>]\"", () => {
    expect(detail).toContain("{message.audio && <SaraAudio audio={message.audio} />}");
    expect(detail).toContain("{message.image && <SaraImage image={message.image} />}");
    expect(detail).toMatch(/!message\.audio && !message\.image && \(\s*<p[^>]*>\[\{message\.messageType\}\]<\/p>/);
    expect(detail).not.toContain("(sem texto)");
  });
});
