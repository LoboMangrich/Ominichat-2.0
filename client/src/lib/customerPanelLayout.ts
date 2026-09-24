// Painel do cliente (direita) em telas menores: abaixo de ~1280px (breakpoint `xl` do
// Tailwind) ele começa recolhido e abre por cima do chat pelo botão "Cliente" na barra
// do topo. A partir de 1280px fica sempre visível, ao lado do chat, como antes.
// Usado pela conversa da Sara e pelo ConversationDetail embutido na tela única.

/** Classes do painel. O container pai precisa de `relative`. */
export function customerPanelClasses(open: boolean): string {
  const base = "w-72 border-l bg-card overflow-y-auto shrink-0";
  return open
    ? `${base} absolute inset-y-0 right-0 z-30 shadow-xl xl:static xl:shadow-none`
    : `${base} hidden xl:block`;
}

/** Botão "Cliente" só existe abaixo de xl. */
export const CUSTOMER_PANEL_TOGGLE_CLASSES = "xl:hidden";
