/**
 * Casamento de telefone entre a Sara e o cadastro de clientes do Cashmiles.
 *
 * A ligação entre os dois sistemas é o telefone (ver "Decisão de arquitetura"
 * no CLAUDE.md), mas o formato não é garantido: a Sara manda "+5548984053595",
 * e `customers.phone` tem registros gravados por webhooks e importações
 * diferentes — com ou sem "+", com ou sem 55, com ou sem o 9º dígito de
 * celular. Esta função gera todas as formas equivalentes para buscar com
 * `IN (...)` e aproveitar o índice `idx_customers_phone`.
 */

import { brazilianNationalForms, phoneDigits } from "@shared/phone";

export { phoneDigits };

const BR_COUNTRY_CODE = "55";

/** Só dígitos — para comparar contra `REGEXP_REPLACE(phone, '[^0-9]', '')`. */
export function phoneDigitCandidates(raw: string): string[] {
  const digits = phoneDigits(raw);
  if (digits.length < 8) return [];
  const national = brazilianNationalForms(digits);
  if (national.length === 0) return [digits];
  const out = new Set<string>();
  for (const n of national) {
    out.add(n);
    out.add(BR_COUNTRY_CODE + n);
  }
  return Array.from(out);
}

/** Valores exatos como podem estar gravados em `customers.phone`. */
export function phoneLookupCandidates(raw: string): string[] {
  const out = new Set<string>();
  for (const d of phoneDigitCandidates(raw)) {
    out.add(d);
    out.add("+" + d);
  }
  return Array.from(out);
}
