import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";
import { AlertTriangle, MessageSquare, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useParams, useRoute } from "wouter";
import ConversationDetail from "./ConversationDetail";
import SaraConversationDetail from "./SaraConversationDetail";
import {
  SARA_TABS,
  conversationHref,
  displayName,
  initials,
  matchesLocalSearch,
  mergeConversations,
  originLabel,
  saraSearch,
  saraStatusForBucket,
  statusLabel,
  type SaraTabKey,
} from "./saraShared";

const PAGE_SIZE = 20;
// sara.listConversations aceita no máximo 100 (server/routers/sara.ts).
const SARA_MAX_LIMIT = 100;
const LIST_REFETCH_MS = 15000;

type Selection = { source: "sara"; id: string } | { source: "legacy"; id: number } | null;

// Tela única de Conversas: Sara + canal próprio na mesma lista.
// Seleção na URL: /sara/:id para Sara (links antigos continuam funcionando) e
// /sara/legado/:id para o canal próprio.
export default function Sara() {
  const params = useParams<{ id?: string }>();
  const [isLegacyRoute] = useRoute("/sara/legado/:id");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<SaraTabKey>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const selection: Selection = (() => {
    if (!params.id) return null;
    if (!isLegacyRoute) return { source: "sara", id: params.id };
    const id = Number(params.id);
    return Number.isInteger(id) && id > 0 ? { source: "legacy", id } : null;
  })();
  const selectedKey = selection ? `${selection.source}:${selection.id}` : null;

  const activeTab = SARA_TABS.find(t => t.key === tab) ?? SARA_TABS[0];
  const { phone: saraPhone, localFilter } = saraSearch(search);
  const saraLimit = Math.min(limit, SARA_MAX_LIMIT);

  const saraQuery = trpc.sara.listConversations.useQuery(
    {
      status: saraStatusForBucket(activeTab.bucket),
      phone: saraPhone,
      limit: saraLimit,
      offset: 0,
    },
    { refetchInterval: LIST_REFETCH_MS },
  );

  const legacyQuery = trpc.tags.listUnified.useQuery(
    {
      search: search.trim() || undefined,
      limit,
      excludeGroups: true, // grupos têm menu próprio; e "resposta cheia = tem mais" só vale sem eles
    },
    { refetchInterval: LIST_REFETCH_MS },
  );

  const items = useMemo(() => {
    const saraItems = (saraQuery.data?.data ?? []).filter(c =>
      localFilter ? matchesLocalSearch(c, localFilter) : true,
    );
    const merged = mergeConversations(saraItems, legacyQuery.data ?? []);
    return activeTab.bucket ? merged.filter(i => i.bucket === activeTab.bucket) : merged;
  }, [saraQuery.data, legacyQuery.data, localFilter, activeTab.bucket]);

  const saraHasMore = (saraQuery.data?.pagination.hasMore ?? false) && saraLimit < SARA_MAX_LIMIT;
  const legacyHasMore = (legacyQuery.data?.length ?? 0) >= limit;
  const hasMore = saraHasMore || legacyHasMore;
  const isFetching = saraQuery.isFetching || legacyQuery.isFetching;
  // Só "carregando" enquanto nenhuma das duas fontes respondeu (com dado ou erro).
  const isLoading = saraQuery.isLoading && legacyQuery.isLoading;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Lista de conversas ── */}
      <div
        className={cn(
          "flex flex-col border-r bg-card shrink-0 transition-all duration-200",
          selection ? "w-80" : "w-full max-w-[360px]",
        )}
      >
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
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

        {/* Falha de uma fonte não esvazia a tela: mostra a outra + aviso. */}
        {(saraQuery.isError || legacyQuery.isError) && (
          <div className="px-3 pb-2 space-y-1 shrink-0">
            {saraQuery.isError && (
              <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Sara indisponível
              </div>
            )}
            {legacyQuery.isError && (
              <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Canal próprio indisponível
              </div>
            )}
          </div>
        )}

        <div className="h-px bg-border shrink-0" />

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Carregando...
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          )}
          {items.map(item => {
            const isSelected = item.key === selectedKey;
            return (
              <button
                key={item.key}
                onClick={() => navigate(isSelected ? "/sara" : conversationHref(item))}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/40",
                  isSelected ? "bg-brand-50 dark:bg-brand-950/20" : "hover:bg-muted/50",
                )}
              >
                <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {initials(item.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="text-sm font-medium text-foreground truncate">{displayName(item)}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {timeAgo(item.lastActivityAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <Badge
                      variant={item.source === "sara" ? "default" : "secondary"}
                      className="text-[9px] h-4 px-1.5 shrink-0"
                    >
                      {originLabel(item)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground truncate">{statusLabel(item)}</span>
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
        {selection?.source === "sara" ? (
          <SaraConversationDetail id={selection.id} />
        ) : selection?.source === "legacy" ? (
          // key: remonta ao trocar de conversa — o rascunho de um cliente não pode
          // sobrar no campo de resposta de outro.
          <ConversationDetail
            key={selectedKey}
            embeddedConvId={selection.id}
            onBack={() => navigate("/sara")}
          />
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
