import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CUSTOMER_PANEL_TOGGLE_CLASSES, customerPanelClasses } from "./customerPanelLayout";

// Painel do cliente recolhe abaixo de ~1280px (breakpoint xl do Tailwind) e abre por cima
// do chat pelo botão "Cliente". Checagem das classes + do fonte das duas telas que usam.
const sara = readFileSync(new URL("../pages/SaraConversationDetail.tsx", import.meta.url), "utf-8");
const legacy = readFileSync(new URL("../pages/ConversationDetail.tsx", import.meta.url), "utf-8");

describe("customerPanelClasses — painel direito em telas menores", () => {
  it("fechado: escondido abaixo de xl (1280px), sempre visível a partir de xl", () => {
    const c = customerPanelClasses(false);
    expect(c).toContain("hidden");
    expect(c).toContain("xl:block");
  });

  it("aberto abaixo de xl: por cima do chat; a partir de xl volta ao lado do chat", () => {
    const c = customerPanelClasses(true);
    expect(c).toContain("absolute");
    expect(c).toContain("xl:static");
    expect(c).not.toContain("hidden");
  });

  it("botão \"Cliente\" só aparece abaixo de xl", () => {
    expect(CUSTOMER_PANEL_TOGGLE_CLASSES).toBe("xl:hidden");
  });

  it.each([
    ["SaraConversationDetail", sara],
    ["ConversationDetail (canal próprio)", legacy],
  ])("%s: painel usa as classes, começa fechado, e o container é relative", (_name, source) => {
    expect(source).toContain("const [panelOpen, setPanelOpen] = useState(false);");
    expect(source).toContain("<div className={customerPanelClasses(panelOpen)}>");
    expect(source).toContain('<div className="relative flex flex-1 overflow-hidden">');
    expect(source).toMatch(/CUSTOMER_PANEL_TOGGLE_CLASSES[\s\S]*?setPanelOpen\(v => !v\)[\s\S]*?Cliente/);
  });
});
