// Dados e helpers puros dos filtros de audiência de Campaigns.tsx, extraídos para um módulo sem
// JSX — Campaigns.tsx avalia JSX no escopo do módulo (STATUS_ICONS), o que impede importar o
// arquivo inteiro num teste sob ambiente Node (sem runtime de JSX). Mantém a lógica testável sem
// depender do texto-fonte do componente.

// Valor do SelectItem "Todos"/"Todos os programas" nos filtros de audiência. Não é um valor real
// de filtro — precisa virar "" antes de chegar em campaigns.previewAudience/create, senão a
// audiência sai zerada em silêncio (achado do @qa na revisão do PR #21).
export const ALL_FILTER_SENTINEL = "_all";

export function clearAllSentinel(value: string): string {
  return value === ALL_FILTER_SENTINEL ? "" : value;
}

// value = enum real de customers.status (drizzle/schema.ts); rótulo em português só em label.
export const CUSTOMER_STATUS_FILTER_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: "Active", label: "Ativo" },
  { value: "At Risk", label: "Em Risco" },
  { value: "New", label: "Novo" },
  { value: "Churned", label: "Churned" },
];
