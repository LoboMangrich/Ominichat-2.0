import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  SARA_PROMPT_CONTENT_MAX,
  SARA_PROMPT_NOTES_MAX,
  SARA_PROMPT_NOTES_MIN,
  samePromptContent,
} from "@shared/sara";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { promptErrorMessage } from "./promptErrors";

const formatCount = (n: number) => n.toLocaleString("pt-BR");

/**
 * Nova versão do prompt: começa com o conteúdo da versão ATIVA. Salvar cria a versão
 * INATIVA — ativar é outra ação. Fechar com alterações pede confirmação.
 */
export function PromptEditorDialog({
  open,
  onOpenChange,
  activeContent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeContent: string;
}) {
  const utils = trpc.useUtils();
  const [content, setContent] = useState(activeContent);
  const [notes, setNotes] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Cada abertura começa do conteúdo ativo atual.
  useEffect(() => {
    if (open) {
      setContent(activeContent);
      setNotes("");
    }
  }, [open, activeContent]);

  const dirty = content !== activeContent || notes.trim() !== "";
  const identical = samePromptContent(content, activeContent);
  const empty = content.trim() === "";
  const tooLong = content.length > SARA_PROMPT_CONTENT_MAX;
  const notesOk = notes.trim().length >= SARA_PROMPT_NOTES_MIN;

  // Fechar a aba/recarregar com rascunho: o navegador pede confirmação.
  useEffect(() => {
    if (!open || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, dirty]);

  const create = trpc.sara.createPrompt.useMutation({
    onSuccess: async created => {
      toast.success(`Versão v${created.version} criada (inativa)`);
      await utils.sara.listPrompts.invalidate();
      onOpenChange(false);
    },
    onError: error => toast.error(promptErrorMessage(error)),
  });

  const requestClose = () => {
    if (create.isPending) return;
    if (dirty) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  const canSave = !identical && !empty && !tooLong && notesOk && !create.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : requestClose())}>
        <DialogContent
          className="sm:max-w-4xl max-h-[90vh] flex flex-col"
          onInteractOutside={e => {
            e.preventDefault();
            requestClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nova versão do prompt</DialogTitle>
            <DialogDescription>
              Começa com o conteúdo da versão ativa. Salvar cria a versão <strong>inativa</strong> — nada muda
              para os clientes até alguém ativá-la.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto min-h-0">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="sara-prompt-content">Prompt</Label>
                <span
                  className={`text-xs tabular-nums ${tooLong ? "text-destructive font-medium" : "text-muted-foreground"}`}
                  aria-live="polite"
                >
                  {formatCount(content.length)} / {formatCount(SARA_PROMPT_CONTENT_MAX)}
                </span>
              </div>
              <Textarea
                id="sara-prompt-content"
                value={content}
                onChange={e => setContent(e.target.value)}
                className="font-mono text-sm min-h-[45vh] whitespace-pre-wrap"
                spellCheck={false}
              />
              {identical && !empty && (
                <p className="text-xs text-destructive">Igual à versão ativa — altere o texto para criar uma nova versão.</p>
              )}
              {empty && <p className="text-xs text-destructive">O prompt não pode ficar vazio.</p>}
              {tooLong && (
                <p className="text-xs text-destructive">
                  Passa do limite de {formatCount(SARA_PROMPT_CONTENT_MAX)} caracteres.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sara-prompt-notes">O que mudou (obrigatório)</Label>
              <Textarea
                id="sara-prompt-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                maxLength={SARA_PROMPT_NOTES_MAX}
                placeholder="Ex.: tom mais formal na saudação; nova regra sobre reembolso"
                className="min-h-[70px]"
              />
              {!notesOk && notes.length > 0 && (
                <p className="text-xs text-muted-foreground">Mínimo de {SARA_PROMPT_NOTES_MIN} caracteres.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose} disabled={create.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate({ content, notes: notes.trim() })}
              disabled={!canSave}
            >
              {create.isPending ? "Salvando…" : "Salvar versão inativa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>O texto editado e o "O que mudou" serão perdidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
