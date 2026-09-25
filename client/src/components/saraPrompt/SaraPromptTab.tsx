import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivatePromptDialog } from "./ActivatePromptDialog";
import { PromptEditorDialog } from "./PromptEditorDialog";
import { promptErrorMessage } from "./promptErrors";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

/** Aba "Prompt" da tela Sara (IA): versões, nova versão (inativa) e ativação. */
export function SaraPromptTab() {
  const prompts = trpc.sara.listPrompts.useQuery(undefined, { refetchOnWindowFocus: false });
  const versions = prompts.data ?? [];
  const active = versions.find(v => v.isActive) ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activateId, setActivateId] = useState<string | null>(null);

  useEffect(() => {
    if (versions.length === 0) return;
    if (!selectedId || !versions.some(v => v.id === selectedId)) setSelectedId((active ?? versions[0]).id);
  }, [versions, active, selectedId]);

  const selected = versions.find(v => v.id === selectedId) ?? null;
  const activateTarget = versions.find(v => v.id === activateId) ?? null;

  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="sticky top-0 z-10 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Alterações aqui mudam como a Sara responde a <strong>TODOS</strong> os clientes, na hora. Não existe
          ambiente de teste.
        </span>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {active ? `Versão ativa: v${active.version}` : prompts.isSuccess ? "Nenhuma versão ativa." : ""}
        </p>
        <Button onClick={() => setEditorOpen(true)} disabled={!prompts.isSuccess}>
          <Plus className="w-4 h-4 mr-1" /> Nova versão
        </Button>
      </div>

      {prompts.isLoading && <Skeleton className="h-64 w-full" />}
      {prompts.isError && <p className="text-sm text-destructive">{promptErrorMessage(prompts.error)}</p>}

      {prompts.isSuccess && versions.length === 0 && (
        <p className="text-sm text-muted-foreground">A Sara não devolveu nenhuma versão do prompt.</p>
      )}

      {versions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <ul className="space-y-2" aria-label="Versões do prompt">
            {versions.map(v => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  aria-current={v.id === selectedId}
                  className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                    v.id === selectedId ? "border-primary bg-primary/5" : "bg-card hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">v{v.version}</span>
                    {v.isActive && (
                      <Badge className="bg-success text-success-foreground hover:bg-success">Ativa</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateTime(v.createdAt)} · {v.createdByName}
                  </p>
                  {v.notes && <p className="text-xs mt-1 line-clamp-2">{v.notes}</p>}
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <section className="rounded-md border bg-card min-w-0">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h2 className="font-semibold flex items-center gap-2">
                    v{selected.version}
                    {selected.isActive && (
                      <Badge className="bg-success text-success-foreground hover:bg-success">Ativa</Badge>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Criada em {formatDateTime(selected.createdAt)} por {selected.createdByName}
                    {selected.activatedAt &&
                      ` · Ativada em ${formatDateTime(selected.activatedAt)} por ${selected.activatedByName}`}
                  </p>
                </div>
                {!selected.isActive && (
                  <Button variant="destructive" onClick={() => setActivateId(selected.id)}>
                    Ativar esta versão
                  </Button>
                )}
              </header>
              {selected.notes && (
                <p className="px-4 pt-3 text-sm">
                  <span className="font-medium">O que mudou:</span> {selected.notes}
                </p>
              )}
              <pre className="px-4 py-3 font-mono text-sm whitespace-pre-wrap break-words max-h-[65vh] overflow-y-auto">
                {selected.content}
              </pre>
            </section>
          )}
        </div>
      )}

      <PromptEditorDialog open={editorOpen} onOpenChange={setEditorOpen} activeContent={active?.content ?? ""} />
      <ActivatePromptDialog
        target={activateTarget}
        active={active}
        onOpenChange={open => !open && setActivateId(null)}
      />
    </div>
  );
}
