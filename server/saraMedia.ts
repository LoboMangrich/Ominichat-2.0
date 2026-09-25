/**
 * Envio de áudio e imagem nas conversas da Sara.
 *
 * POST /api/sara/conversations/:id/media?kind=audio|image (multipart, campo "file").
 * Fora do tRPC porque tRPC não é bom para arquivo de 16 MB. A rota recebe o arquivo
 * e o REPASSA para a Sara (POST .../audio ou .../image).
 *
 * LGPD: o arquivo fica SÓ em memória durante o repasse (multer.memoryStorage) —
 * nunca é gravado em disco, no banco ou no storage, e nunca é logado. O log registra
 * só status e kind.
 *
 * Ordem (cada etapa recusa sem chamar a próxima):
 *   1. requireSession
 *   2. kind válido (query)
 *   3. dono: GET da conversa na Sara + saraCanSend — só quem assumiu envia, Admin não
 *      é exceção. Acontece ANTES de ler o arquivo.
 *   4. multer com limite de 16 MB: corta o stream ao passar do limite, sem ler o resto
 *   5. tipo/tamanho (validateSaraMedia) e assinatura dos bytes da imagem
 *   6. repasse para a Sara com x-sara-actor-id
 */
import type { Express, NextFunction, Response } from "express";
import multer from "multer";
import {
  SARA_FORBIDDEN_OTHER_ACTOR,
  SARA_MEDIA_CONFLICT_MESSAGE,
  SARA_MEDIA_FIELD,
  SARA_MEDIA_GENERIC_ERROR,
  SARA_MEDIA_KINDS,
  SARA_MEDIA_MAX_BYTES,
  SARA_UNIDENTIFIED_ACTOR_NOTICE,
  baseMimeType,
  saraCanSend,
  validateSaraMedia,
  type SaraMediaKind,
} from "@shared/sara";
import { requireSession, type AuthedRequest } from "./_core/routeGuards";
import { SaraSupportApiError, getSaraConversation, saraErrorReason, sendSaraMedia } from "./saraSupportClient";

export const SARA_MEDIA_ROUTE = "/api/sara/conversations/:id/media";

type MediaRequest = AuthedRequest & { saraMediaKind?: SaraMediaKind };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SARA_MEDIA_MAX_BYTES, files: 1, fields: 5 },
}).single(SARA_MEDIA_FIELD);

function fail(res: Response, status: number, error: string, kind?: string) {
  console.error(`[SaraMedia] recusado ${status}${kind ? ` kind=${kind}` : ""}`);
  res.status(status).json({ error });
}

/**
 * Assinatura dos primeiros bytes: o mimetype vem do navegador e pode mentir. Só para
 * imagem (JPEG/PNG, os que a Meta entrega); áudio é "qualquer audio/*" e a Sara
 * valida o resto. Um WebP renomeado para .jpg cai aqui.
 */
export function imageBytesMatch(mimeType: string, buffer: Buffer): boolean {
  const mime = baseMimeType(mimeType);
  if (mime === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return false;
}

function parseKind(req: MediaRequest, res: Response, next: NextFunction) {
  const kind = req.query.kind;
  if (typeof kind !== "string" || !(SARA_MEDIA_KINDS as readonly string[]).includes(kind)) {
    return fail(res, 400, "Tipo de mídia inválido.");
  }
  req.saraMediaKind = kind as SaraMediaKind;
  next();
}

/** Mesma regra do texto (sara.sendMessage): só quem assumiu, checado aqui no servidor. */
async function requireSaraOwner(req: MediaRequest, res: Response, next: NextFunction) {
  const user = req.user!;
  try {
    const { conversation } = await getSaraConversation(req.params.id, user.id);
    if (!saraCanSend(conversation.actorId, user.id)) {
      return fail(
        res,
        403,
        conversation.actorId === null ? SARA_UNIDENTIFIED_ACTOR_NOTICE : SARA_FORBIDDEN_OTHER_ACTOR,
        req.saraMediaKind,
      );
    }
    next();
  } catch (error) {
    if (error instanceof SaraSupportApiError && error.status === 404) {
      return fail(res, 404, "Conversa não encontrada.", req.saraMediaKind);
    }
    return fail(res, 502, SARA_MEDIA_GENERIC_ERROR, req.saraMediaKind);
  }
}

function receiveFile(req: MediaRequest, res: Response, next: NextFunction) {
  upload(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return fail(res, 413, "Arquivo maior que 16 MB.", req.saraMediaKind);
    }
    return fail(res, 400, "Envie um único arquivo no campo \"file\".", req.saraMediaKind);
  });
}

async function forwardToSara(req: MediaRequest, res: Response) {
  const kind = req.saraMediaKind!;
  const file = req.file;
  if (!file) return fail(res, 400, "Nenhum arquivo enviado.", kind);

  const invalid = validateSaraMedia(kind, file.mimetype, file.size);
  if (invalid) return fail(res, 400, invalid, kind);
  if (kind === "image" && !imageBytesMatch(file.mimetype, file.buffer)) {
    return fail(res, 400, "O conteúdo do arquivo não é uma imagem JPEG, PNG ou WebP.", kind);
  }

  try {
    const result = await sendSaraMedia(req.params.id, kind, { buffer: file.buffer, mimeType: file.mimetype }, req.user!.id);
    res.status(200).json({ ok: true, messageId: result?.message?.id ?? null });
  } catch (error) {
    if (error instanceof SaraSupportApiError && error.status === 400) {
      return fail(res, 400, saraErrorReason(error.body) ?? SARA_MEDIA_GENERIC_ERROR, kind);
    }
    if (error instanceof SaraSupportApiError && error.status === 409) {
      return fail(res, 409, SARA_MEDIA_CONFLICT_MESSAGE, kind);
    }
    return fail(res, 502, SARA_MEDIA_GENERIC_ERROR, kind);
  }
}

export function registerSaraMediaRoute(app: Express) {
  app.post(SARA_MEDIA_ROUTE, requireSession, parseKind, requireSaraOwner, receiveFile, forwardToSara);
}
