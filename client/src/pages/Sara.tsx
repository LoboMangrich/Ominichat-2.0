import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import SaraConversationDetail from "./SaraConversationDetail";
import { SARA_STATUS_LABELS, SARA_TABS, initials } from "./saraShared";

type SaraTabKey = (typeof SARA_TABS)[number]["key"];

const PAGE_SIZE = 20;

// ─── Helper (mesmo formato de Atendimentos.tsx) ─────────────────────────────
function timeAgo(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// /sara e /sara/:id renderizam esta tela; o :id seleciona a conversa, então links
// antigos para /sara/:id continuam funcionando.
export default function Sara() {
  const params = useParams<{ id?: string }>();
  const selectedId = params.id;
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<SaraTabKey>("all");
  const [phone, setPhone] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const status = SARA_TABS.find(t => t.key === tab)?.status;

  const { data, isLoading, isFetching } = trpc.sara.listConversations.useQuery(
    {
      status,
      phone: phone.trim() || undefined,
      limit,
      offset: 0,
    },
    { refetchInterval: 15000 },
  );

  const conversations = data?.data ?? [];
  const hasMore = data?.pagination.hasMore ?? false;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Lista de conversas ── */}
      <div
        className={cn(
          "flex flex-col border-r bg-card shrink-0 transition-all duration-200",
          selectedId ? "w-80" : "w-full max-w-[360px]",
        )}
      >
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Buscar por telefone (+55...)"
              className="pl-9 h-9 bg-muted border-0 rounded-full text-sm focus-visible:ring-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 pb-2 shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {SARA_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setLimit(PAGE_SIZE);
              }}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap border",
                tab === t.key
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="h-px bg-border shrink-0" />

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Carregando...
            </div>
          )}
          {!isLoading && conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          )}
          {conversations.map(conv => {
            const isSelected = conv.id === selectedId;
            return (
              <button
                key={conv.id}
                onClick={() => navigate(isSelected ? "/sara" : `/sara/${conv.id}`)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/40",
                  isSelected ? "bg-brand-50 dark:bg-brand-950/20" : "hover:bg-muted/50",
                )}
              >
                <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {initials(conv.userName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {conv.userName ?? conv.phoneNumber ?? "Desconhecido"}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {timeAgo(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.messageCount} {conv.messageCount === 1 ? "mensagem" : "mensagens"}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {SARA_STATUS_LABELS[conv.status] ?? conv.status}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          {hasMore && (
            <div className="flex justify-center p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={isFetching}
                onClick={() => setLimit(l => l + PAGE_SIZE)}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Painel da conversa ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedId ? (
          <SaraConversationDetail id={selectedId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground select-none bg-muted/10">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">Selecione um atendimento</p>
            <p className="text-xs opacity-60">Escolha uma conversa na lista ao lado</p>
          </div>
        )}
      </div>
    </div>
  );
}
