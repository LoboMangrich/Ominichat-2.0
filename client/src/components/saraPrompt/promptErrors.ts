import { SARA_ADMIN_ONLY_MESSAGE, SARA_PROMPT_NOT_FOUND_MESSAGE } from "@shared/sara";
import { TRPCClientError } from "@trpc/client";

const GENERIC = "Não foi possível concluir. Tente novamente.";

/** Primeira mensagem de um erro de validação Zod (tRPC manda as issues como JSON). */
function firstIssueMessage(message: string): string | null {
  try {
    const issues = JSON.parse(message) as Array<{ message?: unknown }>;
    const first = Array.isArray(issues) ? issues[0]?.message : null;
    return typeof first === "string" ? first : null;
  } catch {
    return null;
  }
}

/**
 * Mensagem para a tela: 400 → motivo; 404 → versão não encontrada; 403 → só Admin;
 * outros → genérica (o detalhe fica no servidor).
 */
export function promptErrorMessage(error: unknown): string {
  if (!(error instanceof TRPCClientError)) return GENERIC;
  const code = (error.data as { code?: string } | undefined)?.code;
  if (code === "BAD_REQUEST") return firstIssueMessage(error.message) ?? (error.message || GENERIC);
  if (code === "NOT_FOUND") return SARA_PROMPT_NOT_FOUND_MESSAGE;
  if (code === "FORBIDDEN") return SARA_ADMIN_ONLY_MESSAGE;
  return GENERIC;
}
