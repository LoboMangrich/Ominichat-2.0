import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Bot, Send, User, UserCog, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  active: "Com a IA",
  human_takeover: "Atendimento humano",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  human_takeover: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SaraConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
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

  const invalidate = () => utils.sara.getConversation.invalidate({ id });

  const sendMutation = trpc.sara.sendMessage.useMutation({
    onSuccess: () => {
      setDraft("");
      invalidate();
      utils.sara.listConversations.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const takeoverMutation = trpc.sara.takeover.useMutation({
    onSuccess: () => {
      toast.success("Você assumiu o atendimento.");
      invalidate();
      utils.sara.listConversations.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const releaseMutation = trpc.sara.release.useMutation({
    onSuccess: () => {
      toast.success("Atendimento devolvido para a Sara.");
      invalidate();
      utils.sara.listConversations.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const closeMutation = trpc.sara.close.useMutation({
    onSuccess: () => {
      toast.success("Conversa encerrada.");
      invalidate();
      utils.sara.listConversations.invalidate();
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
      <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
        <p>Conversa não encontrada.</p>
        <Button variant="outline" onClick={() => navigate("/sara")}>
          Voltar
        </Button>
      </div>
    );
  }

  const { conversation, messages } = data;
  const canReply = conversation.status === "human_takeover";
  const isBusy = sendMutation.isPending;

  function handleSend() {
    const text = draft.trim();
    if (!text || !canReply) return;
    sendMutation.mutate({ id, text });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sara")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{conversation.userName ?? "Sem nome"}</p>
            <p className="truncate text-sm text-muted-foreground">{conversation.phoneNumber ?? "—"}</p>
          </div>
          <Badge className={STATUS_COLORS[conversation.status] ?? ""} variant="outline">
            {STATUS_LABELS[conversation.status] ?? conversation.status}
          </Badge>
        </div>

        <div className="flex shrink-0 gap-2">
          {conversation.status === "active" && (
            <Button
              size="sm"
              onClick={() => takeoverMutation.mutate({ id })}
              disabled={takeoverMutation.isPending}
            >
              <UserCog className="mr-1.5 h-4 w-4" />
              Assumir atendimento
            </Button>
          )}
          {conversation.status === "human_takeover" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => releaseMutation.mutate({ id })}
                disabled={releaseMutation.isPending}
              >
                <Bot className="mr-1.5 h-4 w-4" />
                Devolver para IA
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => closeMutation.mutate({ id })}
                disabled={closeMutation.isPending}
              >
                <X className="mr-1.5 h-4 w-4" />
                Encerrar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map(message => {
          const isCustomer = message.senderType === "user";
          const isAdmin = message.senderType === "admin";
          return (
            <div key={message.id} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                  isCustomer
                    ? "bg-muted"
                    : isAdmin
                      ? "bg-emerald-600 text-white"
                      : "bg-sky-600 text-white"
                }`}
              >
                {!isCustomer && (
                  <p className="mb-0.5 text-xs opacity-80">{isAdmin ? "Você" : "Sara (IA)"}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{message.text || "(sem texto)"}</p>
                <p className="mt-1 text-right text-[10px] opacity-70">{formatDateTime(message.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        {canReply ? (
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
              disabled={isBusy}
            />
            <Button onClick={handleSend} disabled={isBusy || !draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Assuma o atendimento para responder diretamente ao cliente.
          </p>
        )}
      </div>
    </div>
  );
}
