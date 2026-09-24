import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ImageOff, Play, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";

// Mídia recebida numa conversa da Sara. A URL é assinada e expira em 900s
// (docs/sara-support-openapi.json), então:
// - é buscada sob demanda (áudio: ao clicar em ouvir; imagem: ao renderizar);
// - o cache nunca guarda uma URL por tempo perto de 900s (staleTime/gcTime abaixo);
// - se o <audio>/<img> der erro (ex.: bolha montada por muito tempo e o src venceu),
//   busca uma URL nova.
// A URL nunca é logada.
export const MEDIA_URL_STALE_MS = 5 * 60_000;
export const MEDIA_URL_GC_MS = 10 * 60_000;

const mediaQueryOptions = {
  staleTime: MEDIA_URL_STALE_MS,
  gcTime: MEDIA_URL_GC_MS,
  retry: 1,
  refetchOnWindowFocus: false,
} as const;

/**
 * Uma nova busca por erro de carregamento. O contador zera quando uma URL
 * CARREGA com sucesso — não só quando chega: assim a segunda (terceira…)
 * expiração também se recupera, mas uma mídia quebrada de vez não entra em loop
 * (URL nova → falha → URL nova → falha…). Esgotado, a tela oferece "Tentar de novo".
 */
export function useMediaRetry(refetch: () => unknown) {
  const [attempts, setAttempts] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const onError = useCallback(() => {
    if (attempts >= 1) {
      setExhausted(true);
      return;
    }
    setAttempts(a => a + 1);
    void refetch();
  }, [attempts, refetch]);

  const onLoad = useCallback(() => {
    setAttempts(0);
    setExhausted(false);
  }, []);

  const retryManually = useCallback(() => {
    setAttempts(0);
    setExhausted(false);
    void refetch();
  }, [refetch]);

  return { onError, onLoad, exhausted, retryManually };
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SaraAudio({ audio }: { audio: { audioMessageId: string; duration: number | null } }) {
  const [requested, setRequested] = useState(false);
  const query = trpc.sara.audioUrl.useQuery(
    { audioMessageId: audio.audioMessageId },
    { ...mediaQueryOptions, enabled: requested },
  );
  const { onError, onLoad, exhausted, retryManually } = useMediaRetry(query.refetch);
  const duration = formatDuration(audio.duration);

  if (!requested) {
    return (
      <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => setRequested(true)}>
        <Play className="w-3.5 h-3.5 mr-1.5" /> Ouvir áudio{duration && ` (${duration})`}
      </Button>
    );
  }
  if (query.isLoading) return <p className="text-xs opacity-80">Carregando áudio...</p>;
  if (query.isError || exhausted || !query.data) {
    return (
      <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={retryManually}>
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Áudio indisponível — tentar de novo
      </Button>
    );
  }
  return (
    <audio
      controls
      autoPlay
      src={query.data.url}
      onError={onError}
      onLoadedMetadata={onLoad}
      className="h-9 max-w-full"
    />
  );
}

export function SaraImage({
  image,
}: {
  image: { imageMessageId: string; width: number | null; height: number | null; visionSummary: string | null };
}) {
  const query = trpc.sara.imageUrl.useQuery({ imageMessageId: image.imageMessageId }, mediaQueryOptions);
  const { onError, onLoad, exhausted, retryManually } = useMediaRetry(query.refetch);
  const alt = image.visionSummary ?? "Imagem enviada pelo cliente";
  const aspectRatio = image.width && image.height ? `${image.width} / ${image.height}` : undefined;

  return (
    <figure className="space-y-1">
      {query.isError || exhausted ? (
        <button
          onClick={retryManually}
          className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          <ImageOff className="w-4 h-4" /> Imagem indisponível — tentar de novo
        </button>
      ) : query.data ? (
        <img
          src={query.data.url}
          alt={alt}
          onError={onError}
          onLoad={onLoad}
          className="rounded-xl max-w-full max-h-64 object-cover"
          style={{ aspectRatio }}
        />
      ) : (
        <div className="rounded-xl bg-muted/40 max-w-full w-48" style={{ aspectRatio: aspectRatio ?? "4 / 3" }} />
      )}
      {image.visionSummary && <figcaption className="text-xs opacity-80">{image.visionSummary}</figcaption>}
    </figure>
  );
}
