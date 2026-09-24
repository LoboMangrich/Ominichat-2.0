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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AlertTriangle, Bot, Mail, Phone, Send, Tag, TrendingUp, User, UserX, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { statusConfig } from "./Customers";
import { SARA_FORBIDDEN_OTHER_ACTOR, SARA_UNIDENTIFIED_ACTOR_NOTICE } from "@shared/sara";
import { SARA_STATUS_LABELS, initials, saraActorLabel } from "./saraShared";

// Mesmo padrão de fundo da área de mensagens de ConversationDetail.tsx — só tokens.
const CHAT_BACKGROUND = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
  backgroundColor: "hsl(var(--muted)/0.3)",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Painel do cliente (Cashmiles) ───────────────────────────────────────────
// Sara é dona da conversa; o Cashmiles é dono do cliente (CLAUDE.md). A ligação é
// o telefone, via sara.customerByPhone — leitura local, nada vai para a Sara.
function SaraCustomerPanel({ phone }: { phone: string | null }) {
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.sara.customerByPhone.useQuery(
    { phone: phone ?? "" },
    { enabled: !!phone },
  );
  const customer = data?.customer;

  const { data: journeyTasks = [] } = trpc.journeyTasks.listByCustomer.useQuery(
    { customerId: customer?.id ?? 0 },
    { enabled: !!customer },
  );
  const allPending = journeyTasks.filter(t => t.status === "pending");
  const pendingTasks = allPending.slice(0, 3);

  if (phone && isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <UserX className="w-6 h-6 opacity-40" />
        Cliente não cadastrado
      </div>
    );
  }

  const score = customer.healthScore;

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
          Cliente
        </h3>
        {data.ambiguous && (
          <div className="flex items-start gap-1.5 mb-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            Mais de um cliente com este telefone — mostrando o atualizado mais recentemente.
          </div>
        )}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {initials(customer.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{customer.name}</p>
              <Badge variant="outline" className="text-xs px-1.5 py-0 mt-0.5">
                {statusConfig[customer.status].label}
              </Badge>
            </div>
          </div>
          {customer.email && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
              <span className="truncate">{customer.email}</span>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
              <span>{customer.phone}</span>
            </div>
          )}
          {customer.program && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
              <span>{customer.program}</span>
            </div>
          )}
        </div>
      </div>

      {/* Índice de Saúde — mesmas faixas de ConversationDetail.tsx */}
      {score != null && (
        <div className="bg-muted/40 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Índice de Saúde
            </span>
            <span className="text-sm font-bold text-foreground">{Math.round(score)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                score >= 70 ? "bg-brand-500" : score >= 40 ? "bg-brand-300" : "bg-destructive",
              )}
              style={{ width: `${Math.min(100, score)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {score >= 70 ? "Cliente saudável" : score >= 40 ? "Atenção necessária" : "Em risco de churn"}
          </p>
        </div>
      )}

      {pendingTasks.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Próximas Tarefas
          </h3>
          <div className="space-y-1.5">
            {pendingTasks.map(t => (
              <div key={t.id} className="bg-muted/40 rounded-xl px-2.5 py-2">
                <p className="text-xs font-medium text-foreground leading-snug truncate">{t.title}</p>
                {t.dueDate && (
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(t.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </p>
                )}
              </div>
            ))}
            {allPending.length > 3 && (
              <p className="text-[10px] text-muted-foreground text-center">
                +{allPending.length - 3} mais tarefas
              </p>
            )}
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs justify-start h-8"
        onClick={() => setLocation(`/customers?id=${customer.id}`)}
      >
        <User className="w-3.5 h-3.5 mr-2" />
        Ver perfil completo
      </Button>
    </div>
  );
}

// ─── Painel da conversa (embutido em Sara.tsx) ───────────────────────────────
export default function SaraConversationDetail({ id }: { id: string }) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.sara.getConversation.useQuery(
    { id },
    { refetchInterval: 5000 },
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  useEffect(() => setDraft(""), [id]);

  // Toda ação invalida a conversa aberta E a lista — sem a lista, o status e as abas
  // ficam desatualizados até o próximo refetch (foi o que fez "Finalizar conversa"
  // parecer quebrado em /atendimentos).
  const invalidateAll = () => {
    utils.sara.getConversation.invalidate({ id });
    utils.sara.listConversations.invalidate();
  };

  const sendMutation = trpc.sara.sendMessage.useMutation({
    onSuccess: () => {
      setDraft("");
      invalidateAll();
    },
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
  const ownershipNotice = !isHuman || canSend
    ? null
    : conversation.actorId === null
      ? SARA_UNIDENTIFIED_ACTOR_NOTICE
      : `Conversa assumida por ${actorLabel}. Só quem assumiu pode responder.`;

  function handleSend() {
    const text = draft.trim();
    if (!text || !canSend) return;
    sendMutation.mutate({ id, text });
  }

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
          {isActive && (
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

      <div className="flex flex-1 overflow-hidden">
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
            {messages.map(message => {
              const isCustomer = message.senderType === "user";
              const isSara = message.senderType === "sara";
              const isAdmin = message.senderType === "admin";
              // senderType fora de user/sara/admin: não descarta — bolha neutra à esquerda
              // com o valor cru como rótulo.
              const isUnknown = !isCustomer && !isSara && !isAdmin;
              const alignRight = isSara || isAdmin;
              return (
                <div key={message.id} className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
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
                    <p className="whitespace-pre-wrap break-words">{message.text || "(sem texto)"}</p>
                    <p className="mt-1 text-right text-[10px] opacity-70">{formatDateTime(message.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t bg-card p-3 shrink-0">
            {canSend ? (
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite sua resposta..."
                  className="min-h-[44px] flex-1 resize-none"
                  maxLength={4096}
                  disabled={sendMutation.isPending}
                />
                <Button
                  size="icon"
                  className="shrink-0 h-9 w-9 rounded-full"
                  onClick={handleSend}
                  disabled={sendMutation.isPending || !draft.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                {ownershipNotice ??
                  (isActive
                    ? "Assuma o atendimento para responder diretamente ao cliente."
                    : "Esta conversa não aceita resposta.")}
              </p>
            )}
          </div>
        </div>

        {/* ── Painel do cliente ── */}
        <div className="w-72 border-l bg-card overflow-y-auto shrink-0">
          <SaraCustomerPanel phone={conversation.phoneNumber} />
        </div>
      </div>
    </div>
  );
}
