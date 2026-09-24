import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CUSTOMER_PANEL_TOGGLE_CLASSES, customerPanelClasses } from "@/lib/customerPanelLayout";
import { Bot, Lock, PanelRight, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SaraAudio, SaraImage } from "@/components/conversations/SaraMedia";
import SaraComposer from "@/components/conversations/SaraComposer";
import SaraCustomerPanel from "@/components/conversations/SaraCustomerPanel";
import { SaraTagPicker, SaraTagStrip } from "@/components/conversations/SaraTags";
import { SARA_FORBIDDEN_OTHER_ACTOR } from "@shared/sara";
import {
  SARA_STATUS_LABELS,
  initials,
  mergeTimeline,
  saraActorLabel,
  saraCanTakeover,
  saraComposerBanner,
} from "./saraShared";

// Mesmo padrão de fundo da área de mensagens de ConversationDetail.tsx — só tokens.
const CHAT_BACKGROUND = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
  backgroundColor: "hsl(var(--muted)/0.3)",
};

function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Painel da conversa (embutido em Sara.tsx) ───────────────────────────────
export default function SaraConversationDetail({ id }: { id: string }) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.sara.getConversation.useQuery(
    { id },
    { refetchInterval: 5000 },
  );

  // Notas internas: só no Cashmiles (nunca vão para a Sara). Atualizam junto com a conversa.
  const { data: notes = [] } = trpc.sara.listNotes.useQuery(
    { conversationId: id },
    { refetchInterval: 5000 },
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length, notes.length]);

  // Toda ação invalida a conversa aberta E a lista — sem a lista, o status e as abas
  // ficam desatualizados até o próximo refetch (foi o que fez "Finalizar conversa"
  // parecer quebrado em /atendimentos).
  const invalidateAll = () => {
    utils.sara.getConversation.invalidate({ id });
    utils.sara.listConversations.invalidate();
  };

  const sendMutation = trpc.sara.sendMessage.useMutation({
    onSuccess: () => invalidateAll(),
    onError: e => toast.error(e.message),
  });

  // "Digitando..." é best-effort: falha não interrompe quem está digitando.
  const typingMutation = trpc.sara.sendTyping.useMutation();

  const addNoteMutation = trpc.sara.addNote.useMutation({
    onSuccess: () => utils.sara.listNotes.invalidate({ conversationId: id }),
    onError: e => toast.error(e.message),
  });

  const takeoverMutation = trpc.sara.takeover.useMutation({
    onSuccess: () => {
      toast.success("Você assumiu o atendimento.");
      invalidateAll();
    },
    onError: e => toast.error(e.message),
  });

  const releaseMutation = trpc.sara.release.useMutation({
    onSuccess: () => {
      toast.success("Atendimento devolvido para a Sara.");
      invalidateAll();
    },
    onError: e => toast.error(e.message),
  });

  const closeMutation = trpc.sara.close.useMutation({
    onSuccess: () => {
      toast.success("Conversa encerrada.");
      invalidateAll();
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-12 text-center text-muted-foreground">
        <p className="text-sm">Conversa não encontrada.</p>
      </div>
    );
  }

  const { conversation, messages } = data;
  const isActive = conversation.status === "active";
  const isHuman = conversation.status === "human_takeover";
  const displayName = conversation.userName ?? conversation.phoneNumber ?? "Desconhecido";
  // Regras de dono calculadas no servidor (saraCanSend/saraCanReleaseOrClose) — a tela
  // só reflete; o servidor recusa de novo se alguém contornar.
  const canSend = isHuman && conversation.canSend;
  const canReleaseOrClose = conversation.canReleaseOrClose;
  const actorLabel = saraActorLabel(conversation);
  const canTakeover = saraCanTakeover(conversation.status);
  // Faixa acima do composer, no lugar de campo desabilitado: diz por que não dá para
  // responder e traz o botão da ação que resolve.
  const banner = saraComposerBanner(conversation);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Barra do topo ── */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b bg-card shrink-0 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {initials(conversation.userName)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{displayName}</span>
              <Badge variant="outline" className="text-xs px-2 py-0">
                {SARA_STATUS_LABELS[conversation.status] ?? conversation.status}
              </Badge>
            </div>
            {conversation.userName && conversation.phoneNumber && (
              <p className="text-xs text-muted-foreground">{conversation.phoneNumber}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Painel do cliente: abaixo de 1280px começa recolhido — este botão abre/fecha. */}
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 text-xs", CUSTOMER_PANEL_TOGGLE_CLASSES)}
            onClick={() => setPanelOpen(v => !v)}
            aria-expanded={panelOpen}
          >
            <PanelRight className="w-3.5 h-3.5 mr-1.5" /> Cliente
          </Button>
          {canTakeover && (
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => takeoverMutation.mutate({ id })}
              disabled={takeoverMutation.isPending}
            >
              <User className="w-3.5 h-3.5 mr-1.5" />
              {takeoverMutation.isPending ? "Assumindo..." : "Assumir"}
            </Button>
          )}
          {isHuman && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => releaseMutation.mutate({ id })}
                disabled={releaseMutation.isPending || !canReleaseOrClose}
                title={canReleaseOrClose ? undefined : SARA_FORBIDDEN_OTHER_ACTOR}
              >
                <Bot className="w-3.5 h-3.5 mr-1.5" />
                {releaseMutation.isPending ? "Devolvendo..." : "Devolver para IA"}
              </Button>
              {/* Encerrar é irreversível em conversa real da Sara e não existe "reabrir" do
                  nosso lado — por isso pede confirmação. */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={closeMutation.isPending || !canReleaseOrClose}
                    title={canReleaseOrClose ? undefined : SARA_FORBIDDEN_OTHER_ACTOR}
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    {closeMutation.isPending ? "Encerrando..." : "Encerrar"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Encerrar a conversa com {displayName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O cliente deixa de ser atendido por aqui.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className={buttonVariants({ variant: "destructive" })}
                      onClick={() => closeMutation.mutate({ id })}
                    >
                      Encerrar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* ── Coluna do chat ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {isActive && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-brand-50 dark:bg-brand-900/20 border-b border-brand-200 dark:border-brand-800 text-xs text-brand-700 dark:text-brand-300 shrink-0">
              <Bot className="w-3.5 h-3.5" />
              <span className="font-medium">IA está atendendo</span>
              <span className="text-brand-500 dark:text-brand-400">— a Sara está respondendo automaticamente</span>
            </div>
          )}
          {isHuman && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 shrink-0">
              <User className="w-3.5 h-3.5" />
              <span className="font-medium">Humano no controle</span>
              <span className="text-emerald-700 dark:text-emerald-400">
                {actorLabel ? `— Assumido por ${actorLabel}` : "— a Sara não responde enquanto isso"}
              </span>
            </div>
          )}
          {isHuman && !canReleaseOrClose && (
            <div className="px-4 py-1.5 border-b bg-muted/40 text-xs text-muted-foreground shrink-0">
              {SARA_FORBIDDEN_OTHER_ACTOR}: só quem assumiu ou um Admin pode devolver ou encerrar.
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-1.5" style={CHAT_BACKGROUND}>
            <SaraTagStrip conversationId={id} />
            {mergeTimeline(messages, notes).map(entry => {
              if (entry.kind === "note") {
                const note = entry.item;
                // Mesmo estilo âmbar de nota interna do ConversationDetail.
                return (
                  <div key={entry.key} className="flex justify-end">
                    <div className="max-w-[72%] rounded-2xl rounded-br-sm px-3 py-2 text-sm shadow-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100">
                      <p className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <Lock className="w-3 h-3" /> Nota interna · {note.authorName ?? "Atendente"}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{note.text}</p>
                      <p className="mt-1 text-right text-[10px] opacity-70">{formatDateTime(note.createdAt)}</p>
                    </div>
                  </div>
                );
              }
              const message = entry.item;
              const isCustomer = message.senderType === "user";
              const isSara = message.senderType === "sara";
              const isAdmin = message.senderType === "admin";
              // senderType fora de user/sara/admin: não descarta — bolha neutra à esquerda
              // com o valor cru como rótulo.
              const isUnknown = !isCustomer && !isSara && !isAdmin;
              const alignRight = isSara || isAdmin;
              return (
                <div key={entry.key} className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
                  <div
                    className={cn(
                      "max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      isCustomer
                        ? "bg-card text-foreground rounded-bl-sm"
                        : isAdmin
                          ? "bg-emerald-700 text-white rounded-br-sm"
                          : isSara
                            ? "bg-brand-600 text-white rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    {isSara && (
                      <p className="mb-0.5 flex items-center gap-1 text-xs font-medium opacity-80">
                        <Bot className="w-3 h-3" /> Sara (IA)
                      </p>
                    )}
                    {isAdmin && (
                      <p className="mb-0.5 flex items-center gap-1 text-xs font-medium opacity-80">
                        <User className="w-3 h-3" /> Atendente
                      </p>
                    )}
                    {isUnknown && (
                      <p className="mb-0.5 text-xs font-medium text-muted-foreground">{message.senderType}</p>
                    )}
                    {message.audio && <SaraAudio audio={message.audio} />}
                    {message.image && <SaraImage image={message.image} />}
                    {message.text ? (
                      <p className="whitespace-pre-wrap break-words">{message.text}</p>
                    ) : (
                      // Sem texto e sem mídia: mostra o tipo cru (ex.: [sticker]) em vez de esconder.
                      !message.audio && !message.image && (
                        <p className="whitespace-pre-wrap break-words italic opacity-80">[{message.messageType}]</p>
                      )
                    )}
                    <p className="mt-1 text-right text-[10px] opacity-70">{formatDateTime(message.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {banner && (
            <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2 shrink-0">
              <p className="text-xs text-muted-foreground">{banner.text}</p>
              {banner.action === "takeover" && (
                <Button
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => takeoverMutation.mutate({ id })}
                  disabled={takeoverMutation.isPending}
                >
                  <User className="w-3.5 h-3.5 mr-1.5" />
                  {takeoverMutation.isPending ? "Assumindo..." : "Assumir"}
                </Button>
              )}
              {banner.action === "release" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => releaseMutation.mutate({ id })}
                  disabled={releaseMutation.isPending}
                >
                  <Bot className="w-3.5 h-3.5 mr-1.5" />
                  {releaseMutation.isPending ? "Devolvendo..." : "Devolver para IA"}
                </Button>
              )}
            </div>
          )}

          <SaraComposer
            key={id}
            canReply={canSend}
            isSending={sendMutation.isPending}
            onSend={text => sendMutation.mutateAsync({ id, text })}
            onTyping={() => typingMutation.mutate({ id })}
            isAddingNote={addNoteMutation.isPending}
            onAddNote={text => addNoteMutation.mutateAsync({ conversationId: id, text })}
            headerActions={<SaraTagPicker conversationId={id} />}
          />
        </div>

        {/* ── Painel do cliente ── */}
        <div className={customerPanelClasses(panelOpen)}>
          <SaraCustomerPanel
            conversationId={conversation.id}
            phone={conversation.phoneNumber}
            userName={conversation.userName}
          />
        </div>
      </div>
    </div>
  );
}
