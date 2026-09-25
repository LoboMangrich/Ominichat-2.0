import { readFileSync } from "node:fs";
import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { promptErrorMessage } from "./promptErrors";

// Checagens estáticas do código-fonte da tela "Sara (IA)" — o prompt fala com
// clientes reais, então as travas da interface não podem sumir num refactor.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf-8");
const layout = read("../DashboardLayout.tsx");
const activateDialog = read("./ActivatePromptDialog.tsx");
const editorDialog = read("./PromptEditorDialog.tsx");
const tab = read("./SaraPromptTab.tsx");
const page = read("../../pages/SaraAdmin.tsx");
const app = read("../../App.tsx");

describe("Sara (IA) — menu e acesso", () => {
  it("item \"Sara (IA)\" em Configurações é adminOnly e o menu filtra por papel", () => {
    expect(layout).toMatch(/label: "Sara \(IA\)",\s+path: "\/settings\/sara", adminOnly: true/);
    expect(layout).toMatch(/SETTINGS_ITEMS\.filter\(item => !item\.adminOnly \|\| role === "Admin"\)/);
    expect(layout).toMatch(/visibleSettingsItems\(ctx\.userRole\)/);
    // A lista renderizada é a filtrada, não SETTINGS_ITEMS cru.
    expect(layout).not.toMatch(/\{SETTINGS_ITEMS\.map\(/);
  });

  it("rota /settings/sara existe e a página barra quem não é Admin", () => {
    expect(app).toMatch(/<Route path="\/settings\/sara" component=\{SaraAdmin\} \/>/);
    expect(page).toMatch(/user\?\.role !== "Admin"/);
    expect(page).toMatch(/SARA_ADMIN_ONLY_MESSAGE/);
  });

  it("só existe a aba Prompt (sem abas vazias de Templates/Números bloqueados)", () => {
    expect(page.match(/<TabsTrigger /g)).toHaveLength(1);
    expect(page).toMatch(/<TabsTrigger value="prompt">Prompt<\/TabsTrigger>/);
  });
});

describe("Sara (IA) — travas da tela", () => {
  it("ativar exige digitar ATIVAR exato: o botão só habilita e só dispara com a confirmação", () => {
    expect(activateDialog).toMatch(/const confirmed = confirmation === SARA_PROMPT_ACTIVATE_CONFIRMATION;/);
    expect(activateDialog).toMatch(/disabled=\{!confirmed \|\| activate\.isPending \|\| !target\}/);
    expect(activateDialog).toMatch(/target && confirmed && activate\.mutate\(/);
  });

  it("faixa de aviso fixa no topo da aba", () => {
    expect(tab).toMatch(/Alterações aqui mudam como a Sara responde a <strong>TODOS<\/strong> os clientes, na hora\./);
    expect(tab).toMatch(/Não existe\s+ambiente de teste\./);
  });

  it("editor bloqueia salvar texto idêntico ao ativo e confirma antes de descartar", () => {
    expect(editorDialog).toMatch(/const canSave = !identical && /);
    expect(editorDialog).toMatch(/Descartar alterações\?/);
    expect(editorDialog).toMatch(/SARA_PROMPT_CONTENT_MAX/);
  });

  it("sem cor hex/rgb crua nos arquivos da tela", () => {
    for (const source of [activateDialog, editorDialog, tab, page]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/);
      expect(source).not.toMatch(/\b(emerald|green|red)-\d{2,3}\b/);
    }
  });
});

describe("promptErrorMessage", () => {
  const trpcError = (code: string, message: string) =>
    new TRPCClientError(message, { result: { error: { message, code: -1, data: { code } } } } as never);

  it("mapeia 400/404/403 e cai na genérica nos outros", () => {
    expect(promptErrorMessage(trpcError("BAD_REQUEST", "notes is required"))).toBe("notes is required");
    expect(
      promptErrorMessage(trpcError("BAD_REQUEST", JSON.stringify([{ message: "Descreva o que mudou" }]))),
    ).toBe("Descreva o que mudou");
    expect(promptErrorMessage(trpcError("NOT_FOUND", "x"))).toBe("Versão não encontrada (pode ter sido removida)");
    expect(promptErrorMessage(trpcError("FORBIDDEN", "x"))).toBe("Acesso restrito ao Admin");
    expect(promptErrorMessage(trpcError("INTERNAL_SERVER_ERROR", "detalhe interno"))).toBe(
      "Não foi possível concluir. Tente novamente.",
    );
  });
});
