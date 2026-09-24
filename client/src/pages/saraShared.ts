// Constantes e helpers compartilhados entre Sara.tsx e SaraConversationDetail.tsx.

// Únicos status da Sara confirmados no código. Um status fora daqui aparece com o
// valor cru no selo — não inventar rótulo nem aba para status não verificado.
export const SARA_STATUS_LABELS: Record<string, string> = {
  active: "Com a IA",
  human_takeover: "Atendimento humano",
};

export const SARA_TABS = [
  { key: "all", label: "Todos", status: undefined },
  { key: "active", label: "Com a IA", status: "active" },
  { key: "human_takeover", label: "Atendimento humano", status: "human_takeover" },
] as const;

export function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}
