/**
 * passwordHash.ts
 * Hash e verificação de senha (argon2id) para o login por e-mail/senha.
 * Ver CLAUDE.md > Backlog > 1 para o contexto da decisão.
 */

import argon2 from "argon2";

/**
 * Hash argon2id real (não uma string inventada) de uma senha aleatória que
 * nenhum usuário nunca vai digitar. Precisa ser um hash de verdade, com o
 * mesmo custo computacional de qualquer outro — não um valor malformado —
 * senão argon2.verify falha rápido no parse em vez de rodar o custo completo,
 * e isso reintroduz o próprio vazamento de timing que ele existe pra evitar.
 * Usado em dois lugares:
 *   1. Como valor de passwordHash para contas que nunca deveriam logar por
 *      senha (ex.: bootstrap local via scripts/dev-session.ts).
 *   2. Como alvo de argon2.verify quando o e-mail informado no login não
 *      existe — ver passwordAuth.ts. Sem isso, a resposta de "e-mail não
 *      encontrado" seria visivelmente mais rápida que a de "senha errada"
 *      (pula o hash), vazando por timing quais e-mails têm conta no sistema.
 */
export const UNUSABLE_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$cD1EoRd0k+GABmSGRqBgwA$JsF5gsMwH9ck975X8YdtDNs2nOYXMHrsPwipuS/e2Iw";

export function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

/**
 * true se a senha bate com o hash. Nunca lança — hash malformado (ex.: o
 * UNUSABLE_PASSWORD_HASH acima, ou dado corrompido) é tratado como "não bate",
 * não como erro do servidor.
 */
export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    return false;
  }
}
