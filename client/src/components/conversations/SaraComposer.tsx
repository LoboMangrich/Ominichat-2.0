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
import { Textarea } from "@/components/ui/textarea";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Loader2, Lock, Mic, Send, Smile, Square, Trash2, X, Zap } from "lucide-react";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { validateSaraMedia, type SaraMediaKind } from "@shared/sara";
import { IMAGE_NOT_SUPPORTED_MESSAGE, prepareSaraImage } from "@/lib/saraImagePrepare";
import { filterQuickReplies, shouldSendTyping, type QuickReply } from "@/pages/saraShared";

// Composer da conversa da Sara: o que o painel do canal próprio tem E a API da Sara
// permite — emoji, respostas rápidas (botão e "/"), "digitando...", imagem e áudio, e
// a aba "Nota Interna" (sussurro que fica só no Cashmiles, nunca vai para a Sara;
// qualquer atendente escreve). Imagem e áudio só aparecem para o dono (canReply) e só
// na aba Responder; a validação daqui é feedback rápido — o servidor valida de novo.
// Contato com opt-out: toda resposta (texto, imagem, áudio) pede confirmação, com foco
// inicial no Cancelar.

function formatDuration(seconds: number) {
  return Math.floor(seconds / 60) + ":" + (seconds % 60).toString().padStart(2, "0");
}

const SLASH_TRIGGER = /(^|\s)\/(\S*)$/;

export default function SaraComposer({
  canReply,
  isSending,
  onSend,
  onTyping,
  isAddingNote,
  onAddNote,
  isSendingMedia,
  onSendMedia,
  optOutConfirmText,
  headerActions,
}: {
  /** Só o dono responde (canSend do servidor). */
  canReply: boolean;
  isSending: boolean;
  /** Resolve quando a Sara aceitou; só então o rascunho é limpo (falha não perde o texto). */
  onSend: (text: string) => Promise<unknown>;
  /** sara.sendTyping — chamado no máximo 1 vez a cada 5s enquanto o dono digita. */
  onTyping: () => void;
  isAddingNote: boolean;
  /** sara.addNote — só Cashmiles. Resolve quando salvou; só então o rascunho é limpo. */
  onAddNote: (text: string) => Promise<unknown>;
  isSendingMedia: boolean;
  /** Rota /api/sara/conversations/:id/media. Resolve quando a Sara aceitou; só então a prévia some. */
  onSendMedia: (kind: SaraMediaKind, file: Blob) => Promise<unknown>;
  /** Texto do diálogo quando o contato pediu opt-out (null = envia direto). */
  optOutConfirmText: string | null;
  /** Ações extras na barra (ex.: botão "Etiqueta"). */
  headerActions?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const isNote = mode === "note";
  // Nota interna não depende de ter assumido; resposta ao cliente só para o dono.
  const inputEnabled = isNote || canReply;
  const isBusy = isNote ? isAddingNote : isSending;
  const [draft, setDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null); // null = fora do modo "/"
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const lastTypingAt = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cancelConfirmRef = useRef<HTMLButtonElement>(null);
  const recorder = useAudioRecorder();
  const [pendingImage, setPendingImage] = useState<{ file: File; url: string } | null>(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string } | null>(null);
  // Envio aguardando o "Enviar mesmo assim" do diálogo de opt-out.
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  // Mídia vai só ao cliente: nunca na nota interna, e só para o dono.
  const mediaEnabled = !isNote && canReply;
  // Trocou para Nota Interna ou perdeu a posse no meio da gravação: solta o microfone.
  const { isRecording, cancel: cancelRecording } = recorder;
  useEffect(() => {
    if (!mediaEnabled && isRecording) cancelRecording();
  }, [mediaEnabled, isRecording, cancelRecording]);

  // Prévia usa URL de objeto: libera ao trocar/cancelar/desmontar.
  useEffect(() => () => { if (pendingImage) URL.revokeObjectURL(pendingImage.url); }, [pendingImage]);
  useEffect(() => () => { if (pendingAudio) URL.revokeObjectURL(pendingAudio.url); }, [pendingAudio]);

  const { data: quickRepliesList = [] } = trpc.quickReplies.list.useQuery();
  const quickReplies = quickRepliesList as QuickReply[];

  // Fecha o emoji ao clicar fora (igual ConversationDetail).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    }
    if (showEmoji) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmoji]);

  function applyQuickReply(qr: QuickReply, viaSlash: boolean) {
    setDraft(prev => (viaSlash ? prev.replace(SLASH_TRIGGER, (_m, prefix) => prefix + qr.content) : qr.content));
    setSlashQuery(null);
    setShowQuickReplies(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  /** Opt-out: pede confirmação antes de qualquer resposta ao cliente. Nota interna não passa aqui. */
  function withOptOutConfirm(action: () => void) {
    if (optOutConfirmText) setConfirmAction(() => action);
    else action();
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || !inputEnabled || isBusy) return;
    const send = () =>
      (isNote ? onAddNote(text) : onSend(text)).then(
        () => setDraft(""),
        () => {}, // erro já aparece em toast no onError da mutation
      );
    if (isNote) send();
    else withOptOutConfirm(send);
  }

  async function handleImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!picked) return;
    // WebP ou > 5 MB vira JPEG aqui, antes da prévia — a prévia mostra o que vai sair.
    setIsPreparingImage(true);
    let file: File;
    try {
      file = await prepareSaraImage(picked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : IMAGE_NOT_SUPPORTED_MESSAGE);
      return;
    } finally {
      setIsPreparingImage(false);
    }
    const invalid = validateSaraMedia("image", file.type, file.size);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setPendingAudio(null);
    setPendingImage({ file, url: URL.createObjectURL(file) });
  }

  async function handleStopRecording() {
    const blob = await recorder.stop();
    if (!blob) return;
    const invalid = validateSaraMedia("audio", blob.type, blob.size);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setPendingImage(null);
    setPendingAudio({ blob, url: URL.createObjectURL(blob) });
  }

  function handleSendMedia() {
    if (isSendingMedia) return; // duplo clique
    const media = pendingImage
      ? { kind: "image" as const, file: pendingImage.file as Blob, clear: () => setPendingImage(null) }
      : pendingAudio
        ? { kind: "audio" as const, file: pendingAudio.blob, clear: () => setPendingAudio(null) }
        : null;
    if (!media) return;
    withOptOutConfirm(() => {
      onSendMedia(media.kind, media.file).then(media.clear, () => {}); // erro já aparece em toast
    });
  }

  function handleChange(value: string) {
    setDraft(value);
    const slash = value.match(SLASH_TRIGGER);
    setSlashQuery(slash ? slash[2].toLowerCase() : null);
    // "Digitando..." só ao responder o cliente — nunca ao escrever nota interna.
    if (!isNote && canReply && value.trim()) {
      const now = Date.now();
      if (shouldSendTyping(lastTypingAt.current, now)) {
        lastTypingAt.current = now;
        onTyping();
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (slashQuery !== null) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        const filtered = filterQuickReplies(quickReplies, slashQuery);
        if (filtered.length > 0) {
          e.preventDefault();
          applyQuickReply(filtered[0], true);
          return;
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const slashResults = slashQuery !== null ? filterQuickReplies(quickReplies, slashQuery) : [];

  return (
    <div className="border-t bg-card shrink-0">
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-1">
        <button
          onClick={() => setMode("reply")}
          className={cn(
            "flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition-all",
            !isNote ? "bg-brand-600 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          <Send className="w-3 h-3" /> Responder
        </button>
        <button
          onClick={() => setMode("note")}
          className={cn(
            "flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition-all",
            isNote ? "bg-amber-500 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          <Lock className="w-3 h-3" /> Nota Interna
        </button>
        <div className="flex-1" />
        {headerActions}
        {inputEnabled && (
          <button
            onClick={() => setShowQuickReplies(v => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            title="Respostas rápidas"
          >
            <Zap className="w-3 h-3" /> Rápidas
          </button>
        )}
      </div>

      {inputEnabled && slashQuery !== null && (slashResults.length > 0 || slashQuery.length > 0) && (
        <div className="mx-3 mb-1 border rounded-xl bg-background shadow-xl max-h-52 overflow-y-auto z-40">
          <div className="px-3 py-1.5 border-b flex items-center gap-1.5 sticky top-0 bg-background">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">
              Respostas Rápidas{slashQuery ? ` — /${slashQuery}` : ""}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">Esc para fechar</span>
          </div>
          {slashResults.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">
              Nenhuma resposta rápida encontrada para "/{slashQuery}".
            </p>
          ) : (
            slashResults.map(qr => (
              <button
                key={qr.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-0"
                onMouseDown={e => {
                  e.preventDefault(); // não tirar o foco do campo
                  applyQuickReply(qr, true);
                }}
              >
                <div className="flex items-center gap-2">
                  {qr.shortcut && (
                    <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-mono font-semibold bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 shrink-0">
                      /{qr.shortcut}
                    </span>
                  )}
                  <span className="font-medium text-sm truncate">{qr.title}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {qr.content.substring(0, 80)}
                  {qr.content.length > 80 ? "..." : ""}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      {inputEnabled && showQuickReplies && slashQuery === null && (
        <div className="mx-3 mb-1 border rounded-xl bg-background shadow-lg max-h-44 overflow-y-auto">
          <div className="px-3 py-2 border-b flex items-center justify-between sticky top-0 bg-background">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" /> Respostas Rápidas
            </span>
            <button onClick={() => setShowQuickReplies(false)}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          {quickReplies.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">
              Nenhuma resposta rápida. Configure em Configurações.
            </p>
          ) : (
            quickReplies.map(qr => (
              <button
                key={qr.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-0"
                onClick={() => applyQuickReply(qr, false)}
              >
                <span className="font-medium text-primary text-xs">/{qr.shortcut}</span>
                <span className="ml-2 text-muted-foreground text-xs">
                  {qr.content.substring(0, 70)}
                  {qr.content.length > 70 ? "..." : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {mediaEnabled && (pendingImage || pendingAudio) && (
        <div className="mx-3 mb-2 flex items-center gap-3 rounded-xl border bg-background p-2">
          {pendingImage ? (
            <img src={pendingImage.url} alt="Prévia da imagem" className="h-20 w-20 rounded-lg object-cover" />
          ) : (
            pendingAudio && <audio src={pendingAudio.url} controls className="h-10 max-w-full flex-1" />
          )}
          <div className="flex-1 min-w-0 text-xs text-muted-foreground">
            {isSendingMedia ? "Enviando…" : pendingImage ? "Imagem pronta para enviar" : "Áudio pronto para enviar"}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => (pendingImage ? setPendingImage(null) : setPendingAudio(null))}
            disabled={isSendingMedia}
          >
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSendMedia} disabled={isSendingMedia}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {isSendingMedia ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      )}

      {mediaEnabled && recorder.isRecording ? (
        <div className="flex items-center gap-3 px-3 pb-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
          <span className="text-sm font-medium tabular-nums">{formatDuration(recorder.duration)}</span>
          <span className="flex-1 text-xs text-muted-foreground">Gravando áudio…</span>
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={recorder.cancel}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Descartar
          </Button>
          <Button size="sm" className="h-9 text-xs" onClick={handleStopRecording}>
            <Square className="mr-1.5 h-3.5 w-3.5" /> Parar
          </Button>
        </div>
      ) : inputEnabled ? (
        <div className={cn("flex items-end gap-2 px-3 pb-3", isNote && "bg-amber-50/40 dark:bg-amber-900/10")}>
          <div className="relative" ref={emojiRef}>
            <button
              onClick={() => setShowEmoji(v => !v)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
              title="Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            {showEmoji && (
              <div className="absolute bottom-12 left-0 z-50 shadow-2xl rounded-2xl overflow-hidden">
                <EmojiPicker
                  onEmojiClick={(emoji: EmojiClickData) => setDraft(prev => prev + emoji.emoji)}
                  theme={"auto" as Theme}
                  height={380}
                  width={320}
                  searchPlaceholder="Pesquisar emoji..."
                  previewConfig={{ showPreview: false }}
                />
              </div>
            )}
          </div>
          {mediaEnabled && (
            <>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePicked}
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isSendingMedia || isPreparingImage}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50"
                title={
                  isPreparingImage
                    ? "Preparando imagem…"
                    : "Enviar imagem (JPEG ou PNG até 5 MB; outros formatos são convertidos)"
                }
              >
                {isPreparingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
              </button>
              <button
                onClick={() => recorder.start()}
                disabled={isSendingMedia || !!pendingAudio || !!pendingImage}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50"
                title="Gravar áudio"
              >
                <Mic className="w-5 h-5" />
              </button>
            </>
          )}
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isNote
                ? "Escreva uma nota interna (não visível ao cliente)..."
                : "Digite / para respostas rápidas ou uma mensagem..."
            }
            className={cn(
              "flex-1 min-h-[40px] max-h-32 resize-none text-sm rounded-2xl border-0 bg-muted/60 focus-visible:ring-1",
              isNote && "border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10",
            )}
            maxLength={4096}
            rows={1}
            disabled={isBusy}
          />
          <Button
            size="icon"
            className="shrink-0 h-10 w-10 rounded-full"
            onClick={handleSend}
            disabled={isBusy || !draft.trim()}
            title={isNote ? "Salvar nota interna" : "Enviar mensagem"}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : null /* sem canReply: a faixa acima do composer explica e traz a ação */}

      <AlertDialog open={confirmAction !== null} onOpenChange={open => !open && setConfirmAction(null)}>
        <AlertDialogContent
          onOpenAutoFocus={e => {
            // Cancelar é o padrão: Enter logo após abrir não envia.
            e.preventDefault();
            cancelConfirmRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Contato pediu opt-out</AlertDialogTitle>
            <AlertDialogDescription>{optOutConfirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelConfirmRef}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                action?.();
              }}
            >
              Enviar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
