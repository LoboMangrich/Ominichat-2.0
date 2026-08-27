import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Bot, MessageSquare, Search, User } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  active: "Com a IA",
  human_takeover: "Atendimento humano",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  human_takeover: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const PAGE_SIZE = 20;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Sara() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<string>("all");
  const [phone, setPhone] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isFetching } = trpc.sara.listConversations.useQuery(
    {
      status: status === "all" ? undefined : status,
      phone: phone.trim() || undefined,
      limit,
      offset: 0,
    },
    { refetchInterval: 15000 },
  );

  const conversations = data?.data ?? [];
  const hasMore = data?.pagination.hasMore ?? false;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-emerald-600" />
          <h1 className="text-2xl font-semibold">Sara IA — Conversas</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Conversas do bot de IA no WhatsApp (Sara Support API). Assuma o atendimento para responder
          diretamente ao cliente.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone (+55...)"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Com a IA</SelectItem>
            <SelectItem value="human_takeover">Atendimento humano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8" />
          <p>Nenhuma conversa encontrada.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => navigate(`/sara/${conv.id}`)}
              className="flex items-center justify-between gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{conv.userName ?? "Sem nome"}</p>
                  <p className="truncate text-sm text-muted-foreground">{conv.phoneNumber ?? "—"}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge className={STATUS_COLORS[conv.status] ?? ""} variant="outline">
                  {STATUS_LABELS[conv.status] ?? conv.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {conv.messageCount} msg · {formatDateTime(conv.lastMessageAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {hasMore && (
        <Button
          variant="outline"
          disabled={isFetching}
          onClick={() => setLimit(l => l + PAGE_SIZE)}
          className="self-center"
        >
          Carregar mais
        </Button>
      )}
    </div>
  );
}
