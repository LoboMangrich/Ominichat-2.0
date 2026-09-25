import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { diffStats, lineDiff, toSideBySide, type SideBySideRow } from "@shared/lineDiff";
import { SARA_PROMPT_ACTIVATE_CONFIRMATION } from "@shared/sara";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { promptErrorMessage } from "./promptErrors";

type Version = { id: string; version: number; content: string };

function Cell({ cell, side }: { cell: SideBySideRow["left"]; side: "left" | "right" }) {
  if (!cell) return <div className="bg-muted/40 min-h-[1.25rem]" />;
  const changedClass = !cell.changed
    ? ""
    : side === "left"
      ? "bg-destructive/10 border-l-2 border-destructive"
      : "bg-success/10 border-l-2 border-success";
  return (
    <div className={`flex gap-2 px-2 ${changedClass}`}>
      <span className="w-8 shrink-0 text-right text-muted-foreground select-none tabular-nums">{cell.no}</span>
      <span className={`w-3 shrink-0 select-none ${side === "left" ? "text-destructive" : "text-success"}`}>
        {cell.changed ? (side === "left" ? "−" : "+") : ""}
      </span>
      <span className="whitespace-pre-wrap break-words min-w-0">{cell.text || " "}</span>
    </div>
  );
}

/**
 * Ativar uma versão (inclusive antiga = reverter). Comparação lado a lado com a ativa
 * e confirmação digitando ATIVAR — o botão só habilita com o texto exato.
 */
export function ActivatePromptDialog({
  target,
  active,
  onOpenChange,
}: {
  target: Version | null;
  active: Version | null;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (target) setConfirmation("");
  }, [target]);

  const diff = useMemo(
    () => (target ? lineDiff(active?.content ?? "", target.content) : null),
    [target, active],
  );
  const rows = useMemo(() => (diff ? toSideBySide(diff) : null), [diff]);
  const stats = diff ? diffStats(diff) : null;

  const activate = trpc.sara.activatePrompt.useMutation({
    onSuccess: async result => {
      toast.success(`v${result.version} ativada`);
      await utils.sara.listPrompts.invalidate();
      onOpenChange(false);
    },
    onError: error => toast.error(promptErrorMessage(error)),
  });

  const confirmed = confirmation === SARA_PROMPT_ACTIVATE_CONFIRMATION;

  return (
    <Dialog open={target !== null} onOpenChange={next => !activate.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-6xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Ativar v{target?.version}?</DialogTitle>
          <DialogDescription>
            A Sara passa a responder <strong>todos os clientes</strong> com esta versão assim que você confirmar.
            Não existe prévia nem ambiente de teste. Para reverter, ative outra versão.
          </DialogDescription>
        </DialogHeader>

        {stats && (
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive font-medium">−{stats.removed} linha(s)</span>
            {" · "}
            <span className="text-success font-medium">+{stats.added} linha(s)</span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-px bg-border border rounded-md overflow-hidden text-xs font-medium">
          <div className="bg-card px-3 py-2">Ativa hoje{active ? ` — v${active.version}` : " — nenhuma"}</div>
          <div className="bg-card px-3 py-2">Vai ficar ativa — v{target?.version}</div>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1 border rounded-md font-mono text-xs leading-5">
          {rows ? (
            rows.map((row, i) => (
              <div key={i} className="grid grid-cols-2 divide-x divide-border">
                <Cell cell={row.left} side="left" />
                <Cell cell={row.right} side="right" />
              </div>
            ))
          ) : (
            <div className="space-y-2 p-3">
              <p className="font-sans text-muted-foreground">
                Conteúdo grande demais para destacar as diferenças — mostrando os dois textos.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <pre className="whitespace-pre-wrap break-words">{active?.content ?? ""}</pre>
                <pre className="whitespace-pre-wrap break-words">{target?.content ?? ""}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sara-prompt-activate-confirm">
            Digite <strong>{SARA_PROMPT_ACTIVATE_CONFIRMATION}</strong> para confirmar
          </Label>
          <Input
            id="sara-prompt-activate-confirm"
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={activate.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!confirmed || activate.isPending || !target}
            onClick={() => target && confirmed && activate.mutate({ id: target.id })}
          >
            {activate.isPending ? "Ativando…" : `Ativar v${target?.version ?? ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
