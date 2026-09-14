import { z } from "zod";

/**
 * E-mail opcional em formulários: aceita o campo ausente (mantém undefined —
 * não sobrescreve valor existente em updates parciais) e string vazia/só
 * espaços (normaliza para null — a coluna correspondente é nullable), mas
 * continua rejeitando qualquer valor não vazio que não seja um e-mail válido.
 *
 * Motivo: muitos clientes de canais como WhatsApp não têm e-mail, e o
 * formulário envia "" em vez de omitir o campo — z.string().email().optional()
 * sozinho rejeita "", porque .optional() só cobre "ausente", não "vazio".
 */
export const optionalEmail = z
  .preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  }, z.string().trim().email("E-mail inválido").nullable())
  .optional();
