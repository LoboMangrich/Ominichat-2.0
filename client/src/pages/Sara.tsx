import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GroupConversationPanel from "@/components/conversations/GroupConversationPanel";
import TagManagerModal, { type Tag } from "@/components/conversations/TagManagerModal";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";
import { AlertTriangle, MessageSquare, Search, Settings2, Users } from "lucide-react";
import { e164Candidates } from "@shared/phone";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams, useRoute } from "wouter";
import ConversationDetail from "./ConversationDetail";
import SaraConversationDetail from "./SaraConversationDetail";
import {
  ASSIGNMENT_TABS,
  DEFAULT_ASSIGNMENT_TAB,
  conversationHref,
  displayName,
  formatTabCount,
  readAssignmentTab,
  safeLocalStorage,
  saraMatchesAssignment,
  writeAssignmentTab,
  type AssignmentTab,
  initials,
  latestConversationHref,
  legacyQueryInput,
  matchesLocalSearch,
  mergeConversations,
  originLabel,
  parseDeepLink,
  saraMatchesFilter,
  saraSearch,
  saraSource,
  saraStatusParam,
  statusLabel,
  tabFilterFor,
  type UnifiedConversation,
} from "./saraShared";

const PAGE_SIZE = 20;
// sara.listConversations aceita no máximo 100 (server/routers/sara.ts).
const SARA_MAX_LIMIT = 100;
const LIST_REFETCH_MS = 15000;
const TAGGED_STALE_MS = 60_000;

type Selection =
  | { source: "sara"; id: string }
  | { source: "legacy"; id: number }
  | { source: "group"; id: number }
  | null;

function positiveInt(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Links diretos vindos de Customers.tsx/Home.tsx (ou do redirect de /atendimentos):
 * - ?conversationId=X → conversa X do canal próprio.
 * - ?customerId=X → conversa mais recente do cliente: a última do canal próprio contra
 *   as da Sara achadas pelo telefone dele, com e sem o 9º dígito (no máximo 2
 *   consultas de leitura à Sara, em paralelo). Nenhuma outra chamada à Sara.
 * Resolve uma vez, ao montar, e troca a URL (replace) pela da conversa.
 */
function useDeepLinkRedirect(navigate: (to: string, options?: { replace?: boolean }) => void) {
  const [deepLink, setDeepLink] = useState(() => parseDeepLink(window.location.search));
  const customerId = deepLink?.kind === "customer" ? deepLink.id : null;

  const lastInteraction = trpc.customers.getLastInteractions.useQuery(
    { customerId: customerId ?? 0, limit: 1 },
    { enabled: customerId !== null },
  );
  const customer = trpc.customers.getById.useQuery({ id: customerId ?? 0 }, { enabled: customerId !== null });
  const phoneForms = customer.data?.phone ? e164Candidates(customer.data.phone) : [];
  const saraByPhone = trpc.useQueries(t =>
    phoneForms.map(phone => t.sara.listConversations({ phone, limit: 20, offset: 0 })),
  );
  const saraPending = saraByPhone.some(q => q.isLoading);

  useEffect(() => {
    if (!deepLink) return;
    if (deepLink.kind === "conversation") {
      setDeepLink(null);
      navigate(conversationHref({ source: "legacy", id: deepLink.id }), { replace: true });
      return;
    }
    if (lastInteraction.isLoading || customer.isLoading || saraPending) return;
    setDeepLink(null);
    const href = latestConversationHref(
      lastInteraction.data?.[0],
      saraByPhone.map(q => q.data?.data ?? []),
    );
    if (href) {
      navigate(href, { replace: true });
    } else {
      navigate("/sara", { replace: true });
      toast.info("Nenhuma conversa encontrada para este cliente.");
    }
    // saraByPhone muda de identidade a cada render; saraPending cobre o que importa.
  }, [deepLink, lastInteraction.isLoading, lastInteraction.data, customer.isLoading, saraPending]);

  return { resolving: customerId !== null };
}

// Tela única de Conversas: Sara + canal próprio (+ grupos, na aba Grupos) na mesma lista.
// Seleção na URL: /sara/:id (Sara — links antigos continuam funcionando),
// /sara/legado/:id (canal próprio) e /sara/grupo/:id (grupo do WhatsApp).
export default function Sara() {
  const params = useParams<{ id?: string }>();
  const [isLegacyRoute] = useRoute("/sara/legado/:id");
  const [isGroupRoute] = useRoute("/sara/grupo/:id");
  const [, navigate] = useLocation();
  const [selectedTagId, setSelectedTagId] = useState<number | undefined>(undefined);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { resolving } = useDeepLinkRedirect(navigate);

  // ── Abas de atribuição (Minhas / Não atribuídas / Todas) — lembradas por usuário ──
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<AssignmentTab>(DEFAULT_ASSIGNMENT_TAB);
  useEffect(() => {
    if (user) setAssignment(readAssignmentTab(safeLocalStorage(), user.id));
  }, [user?.id]);
  function selectAssignment(tab: AssignmentTab) {
    setAssignment(tab);
    setLimit(PAGE_SIZE);
    if (user) writeAssignmentTab(safeLocalStorage(), user.id, tab);
  }

  const selection: Selection = (() => {
    if (!params.id) return null;
    if (isGroupRoute) {
      const id = positiveInt(params.id);
      return id ? { source: "group", id } : null;
    }
    if (isLegacyRoute) {
      const id = positiveInt(params.id);
      return id ? { source: "legacy", id } : null;
    }
    return { source: "sara", id: params.id };
  })();
  const selectedKey = selection ? `${selection.source}:${selection.id}` : null;

  // ── Abas: Todos + etiquetas de tags.list (mesmas chips de Atendimentos.tsx) ──
  const { data: rawTags = [] } = trpc.tags.list.useQuery();
  const tags = (rawTags as Tag[]).filter(t => t.name !== "Todos");
  const selectedTag = tags.find(t => t.id === selectedTagId);
  const filter = tabFilterFor(selectedTag);
  const source = saraSource(filter);
  const saraEnabled = source === "list";
  const taggedEnabled = source === "tag";

  const { phone: saraPhone, localFilter } = saraSearch(search);
  const saraLimit = Math.min(limit, SARA_MAX_LIMIT);

  const saraQuery = trpc.sara.listConversations.useQuery(
    {
      status: saraStatusParam(filter),
      phone: saraPhone,
      limit: saraLimit,
      offset: 0,
    },
    // Grupos não têm Sara; etiqueta personalizada usa listTaggedConversations.
    { refetchInterval: LIST_REFETCH_MS, enabled: saraEnabled },
  );

  // Etiqueta personalizada → conversas da Sara buscadas por id (até 50, 5 em paralelo, no
  // servidor). SEM polling: a Sara é produção — atualiza ao abrir a aba ou trocar de
  // etiqueta (staleTime 60s).
  const taggedTagId = filter.kind === "tag" ? filter.tagId : 0;
  const taggedQuery = trpc.sara.listTaggedConversations.useQuery(
    { tagId: taggedTagId },
    { enabled: taggedEnabled, staleTime: TAGGED_STALE_MS, refetchInterval: false, refetchOnWindowFocus: false },
  );
  const activeSaraQuery = taggedEnabled ? taggedQuery : saraQuery;

  // Canal próprio: uma consulta por aba de atribuição (filtro no servidor, assignedUserId),
  // para os contadores. Mesma página (limit) — consultas no nosso banco, não na Sara.
  const legacyOpts = { refetchInterval: LIST_REFETCH_MS };
  const legacyByTab = {
    mine: trpc.tags.listUnified.useQuery(legacyQueryInput(filter, search, limit, "mine"), legacyOpts),
    unassigned: trpc.tags.listUnified.useQuery(legacyQueryInput(filter, search, limit, "unassigned"), legacyOpts),
    all: trpc.tags.listUnified.useQuery(legacyQueryInput(filter, search, limit, "all"), legacyOpts),
  };
  const legacyQuery = legacyByTab[assignment];

  // Sara: a mesma página serve às três abas (a API não filtra por actorId).
  const saraPage = saraEnabled || taggedEnabled
    ? (activeSaraQuery.data?.data ?? []).filter(
        c => saraMatchesFilter(c.status, filter) && (localFilter ? matchesLocalSearch(c, localFilter) : true),
      )
    : [];
  // Grupos não têm atribuição: na aba Grupos a atribuição não se aplica.
  const appliesAssignment = filter.kind !== "groups";
  const saraForTab = (tab: AssignmentTab) =>
    appliesAssignment ? saraPage.filter(c => saraMatchesAssignment(c, tab)) : saraPage;
  const saraItems = saraForTab(assignment);
  const items = mergeConversations(saraItems, legacyQuery.data ?? [], {
    includeGroups: filter.kind === "groups",
  });

  const saraHasMore =
    saraEnabled && (saraQuery.data?.pagination.hasMore ?? false) && saraLimit < SARA_MAX_LIMIT;
  const legacyHasMoreFor = (tab: AssignmentTab) => (legacyByTab[tab].data?.length ?? 0) >= limit;
  const legacyHasMore = legacyHasMoreFor(assignment);
  const hasMore = saraHasMore || legacyHasMore;
  // Contador = o que está CARREGADO nesta página (já com a etiqueta), não o total.
  const tabCount = (tab: AssignmentTab) =>
    formatTabCount(
      saraForTab(tab).length +
        (legacyByTab[tab].data ?? []).filter(i => i.type === "conversation" || filter.kind === "groups").length,
      saraHasMore || legacyHasMoreFor(tab),
    );
  const isFetching = activeSaraQuery.isFetching || legacyQuery.isFetching;
  const saraActive = saraEnabled || taggedEnabled;
  // Só "carregando" enquanto nenhuma fonte ativa respondeu (com dado ou erro).
  const isLoading = (!saraActive || activeSaraQuery.isLoading) && legacyQuery.isLoading;
  const saraFailed = saraActive && activeSaraQuery.isError;

  // Grupo só abre se estiver na lista carregada (o painel precisa do nome do grupo).
  const selectedGroup =
    selection?.source === "group"
      ? items.find(
          (i): i is Extract<UnifiedConversation, { source: "group" }> =>
            i.source === "group" && i.id === selection.id,
        )
      : undefined;

  function selectTag(tagId: number | undefined) {
    setSelectedTagId(tagId);
    setLimit(PAGE_SIZE);
  }

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

        {/* Atribuição — acima das etiquetas; as duas linhas combinam. */}
        <div className="flex items-center gap-1 px-3 pb-2 shrink-0" role="tablist" aria-label="Atribuição">
          {ASSIGNMENT_TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={assignment === t.key}
              onClick={() => selectAssignment(t.key)}
              className={cn(
                "flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                assignment === t.key ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : "text-muted-foreground hover:bg-muted",
              )}
              title="Contagem do que está carregado nesta página"
            >
              {t.label} <span className="opacity-70">{tabCount(t.key)}</span>
            </button>
          ))}
        </div>

        {/* Chips — mesmo visual de Atendimentos.tsx */}
        <div className="flex items-center gap-1.5 px-3 pb-2 shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => selectTag(undefined)}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap border",
              !selectedTagId
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted",
            )}
          >
            Todos
          </button>
          {tags.map(tag => (
            <button
              key={tag.id}
              onClick={() => selectTag(tag.id === selectedTagId ? undefined : tag.id)}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap border",
                selectedTagId === tag.id
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted",
              )}
            >
              {tag.name}
            </button>
          ))}
          <button
            onClick={() => setTagManagerOpen(true)}
            className="shrink-0 ml-1 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent"
            title="Gerenciar tags"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Falha de uma fonte não esvazia a tela: mostra a outra + aviso. */}
        {(saraFailed || legacyQuery.isError) && (
          <div className="px-3 pb-2 space-y-1 shrink-0">
            {saraFailed && (
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
            const label = statusLabel(item);
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
                  {item.source === "group" ? <Users className="w-5 h-5" /> : initials(item.name)}
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
                    {label && <span className="text-[10px] text-muted-foreground truncate">{label}</span>}
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
        ) : selectedGroup ? (
          <GroupConversationPanel
            key={selectedKey}
            item={{ name: selectedGroup.name, groupId: selectedGroup.id }}
            onClose={() => navigate("/sara")}
          />
        ) : resolving ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground bg-muted/10">
            Abrindo conversa do cliente...
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground select-none bg-muted/10">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">Selecione um atendimento</p>
            <p className="text-xs opacity-60">Escolha uma conversa na lista ao lado</p>
          </div>
        )}
      </div>

      <TagManagerModal open={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />
    </div>
  );
}
