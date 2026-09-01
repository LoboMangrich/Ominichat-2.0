/**
 * Origem pública da aplicação, para montar URLs que precisam resolver fora
 * desta aba (webhooks configurados em provedores externos, links copiados e
 * enviados a terceiros). Usa VITE_PUBLIC_BASE_URL quando definida — útil
 * quando a origem servida (preview, proxy) não é a origem pública real — e
 * cai em window.location.origin caso contrário.
 */
export function getPublicBaseUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_BASE_URL;
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/$/, "");
  }
  return window.location.origin;
}
