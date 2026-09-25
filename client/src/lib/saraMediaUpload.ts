import { SARA_MEDIA_FIELD, SARA_MEDIA_GENERIC_ERROR, type SaraMediaKind } from "@shared/sara";
import { saraMediaUploadUrl } from "@/pages/saraShared";

/**
 * Envia áudio ou imagem para a conversa da Sara pela rota Express
 * (POST /api/sara/conversations/:id/media) — fora do tRPC por causa do tamanho (até
 * 16 MB). Cookie de sessão same-origin. Lança Error com a mensagem do servidor (que
 * já vem tratada: motivo do 400 da Sara, "Assuma a conversa para enviar", etc.).
 */
export async function uploadSaraMedia(conversationId: string, kind: SaraMediaKind, file: Blob): Promise<void> {
  const form = new FormData();
  form.append(SARA_MEDIA_FIELD, file);
  let response: Response;
  try {
    response = await fetch(saraMediaUploadUrl(conversationId, kind), {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
  } catch {
    throw new Error(SARA_MEDIA_GENERIC_ERROR);
  }
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  throw new Error(typeof body?.error === "string" && body.error ? body.error : SARA_MEDIA_GENERIC_ERROR);
}
