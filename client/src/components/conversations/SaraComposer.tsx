import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Send, Smile, X, Zap } from "lucide-react";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { useEffect, useRef, useState } from "react";
import { filterQuickReplies, shouldSendTyping, type QuickReply } from "@/pages/saraShared";

// Composer da conversa da Sara: o que o painel do canal próprio tem E a API da Sara
// permite — emoji, respostas rápidas (botão e "/"), "digitando...". Anexo/áudio/imagem
// não entram: a doc não traz o campo multipart (ver CLAUDE.md). Não mostrar botão
// desabilitado para eles.

const SLASH_TRIGGER = /(^|\s)\/(\S*)$/;

export default function SaraComposer({
  canReply,
  replyNotice,
  isSending,
  onSend,
  onTyping,
}: {
  /** Só o dono responde (canSend do servidor). */
  canReply: boolean;
  /** Aviso quando não pode responder. */
  replyNotice: string;
  isSending: boolean;
  /** Resolve quando a Sara aceitou; só então o rascunho é limpo (falha não perde o texto). */
  onSend: (text: string) => Promise<unknown>;
  /** sara.sendTyping — chamado no máximo 1 vez a cada 5s enquanto o dono digita. */
  onTyping: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null); // null = fora do modo "/"
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const lastTypingAt = useRef<number | null>(null);

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

  function handleSend() {
    const text = draft.trim();
    if (!text || !canReply || isSending) return;
    onSend(text).then(
      () => setDraft(""),
      () => {}, // erro já aparece em toast no onError da mutation
    );
  }

  function handleChange(value: string) {
    setDraft(value);
    const slash = value.match(SLASH_TRIGGER);
    setSlashQuery(slash ? slash[2].toLowerCase() : null);
    if (canReply && value.trim()) {
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
        <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium bg-brand-600 text-white shadow-sm">
          <Send className="w-3 h-3" /> Responder
        </span>
        <div className="flex-1" />
        {canReply && (
          <button
            onClick={() => setShowQuickReplies(v => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            title="Respostas rápidas"
          >
            <Zap className="w-3 h-3" /> Rápidas
          </button>
        )}
      </div>

      {canReply && slashQuery !== null && (slashResults.length > 0 || slashQuery.length > 0) && (
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

      {canReply && showQuickReplies && slashQuery === null && (
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

      {canReply ? (
        <div className="flex items-end gap-2 px-3 pb-3">
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
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite / para respostas rápidas ou uma mensagem..."
            className="flex-1 min-h-[40px] max-h-32 resize-none text-sm rounded-2xl border-0 bg-muted/60 focus-visible:ring-1"
            maxLength={4096}
            rows={1}
            disabled={isSending}
          />
          <Button
            size="icon"
            className="shrink-0 h-10 w-10 rounded-full"
            onClick={handleSend}
            disabled={isSending || !draft.trim()}
            title="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <p className={cn("px-3 pb-3 pt-1 text-center text-sm text-muted-foreground")}>{replyNotice}</p>
      )}
    </div>
  );
}
