/**
 * Normalização de telefone compartilhada entre client e server.
 *
 * O filtro `phone` de `GET /conversations` da Sara Support API espera E.164
 * ("+5548984053595"). A tela única de Conversas só manda o termo de busca para
 * a Sara quando ele é um telefone completo; nos outros casos (nome, número
 * parcial) filtra no client — ver `Sara.tsx`.
 */

const BR_COUNTRY_CODE = "55";
/** E.164: no máximo 15 dígitos, sem contar o "+". */
const E164_MAX_DIGITS = 15;
/** Menor telefone completo aceito: DDD + 8 dígitos (fixo brasileiro). */
const MIN_FULL_PHONE_DIGITS = 10;

export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Formas nacionais (DDD + número) equivalentes: com e sem o 9º dígito.
 * Retorna [] quando o número não parece brasileiro. Usada por
 * `server/phoneMatch.ts` (cadastro do Cashmiles) e por `e164Candidates` (Sara).
 */
export function brazilianNationalForms(digits: string): string[] {
  let national = digits;
  if (national.startsWith(BR_COUNTRY_CODE) && (national.length === 12 || national.length === 13)) {
    national = national.slice(2);
  }
  if (national.length === 11 && national[2] === "9") {
    return [national, national.slice(0, 2) + national.slice(3)];
  }
  if (national.length === 10) {
    return [national, national.slice(0, 2) + "9" + national.slice(2)];
  }
  return [];
}

/**
 * Formas E.164 com e sem o 9º dígito — no máximo 2 — para consultar o filtro
 * `phone` da Sara a partir de um telefone gravado no Cashmiles, que pode estar
 * sem o 9 (ou sem DDI). Número com "+" que não é brasileiro, ou fora do padrão
 * brasileiro, cai no E.164 único de `toE164Phone` (ou em nenhuma forma).
 */
export function e164Candidates(raw: string): string[] {
  const digits = phoneDigits(raw);
  const explicitInternational = raw.trim().startsWith("+");
  if (!explicitInternational || digits.startsWith(BR_COUNTRY_CODE)) {
    const national = brazilianNationalForms(digits);
    if (national.length > 0) return national.map(n => `+${BR_COUNTRY_CODE}${n}`);
  }
  const single = toE164Phone(raw);
  return single ? [single] : [];
}

/**
 * Converte um telefone completo (≥10 dígitos) para E.164. Retorna `null` quando
 * o termo não é um telefone completo ou quando o formato é ambíguo — nesse caso
 * quem chama não deve mandá-lo como filtro `phone`.
 *
 * - Com "+" na frente: já é internacional → "+" + dígitos.
 * - 10 ou 11 dígitos sem "+": nacional brasileiro (DDD + número) → "+55" + dígitos.
 * - 12 ou 13 dígitos começando com 55: brasileiro com DDI, sem "+" → "+" + dígitos.
 * - Qualquer outro tamanho sem "+": ambíguo → null.
 *
 * Não acrescenta nem remove o 9º dígito de celular: E.164 é o número como foi
 * digitado. O casamento tolerante ao 9º dígito é de `server/phoneMatch.ts`, usado
 * contra o cadastro do Cashmiles, não contra a Sara.
 */
export function toE164Phone(raw: string): string | null {
  const digits = phoneDigits(raw);
  if (digits.length < MIN_FULL_PHONE_DIGITS || digits.length > E164_MAX_DIGITS) return null;

  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+${BR_COUNTRY_CODE}${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith(BR_COUNTRY_CODE)) {
    return `+${digits}`;
  }
  return null;
}
