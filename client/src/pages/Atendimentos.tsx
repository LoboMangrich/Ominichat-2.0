import { useState, useEffect } from "react";
import { Search, Users, MessageSquare, Settings2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import ConversationDetail from "./ConversationDetail";
import GroupConversationPanel from "@/components/conversations/GroupConversationPanel";
import TagManagerModal, { type Tag } from "@/components/conversations/TagManagerModal";
import { timeAgo } from "@/lib/timeAgo";

// ─── Types ────────────────────────────────────────────────────────────────────
type ChatItem = {
  id: number;
  type: "conversation" | "group";
  name: string | null;
  phone: string | null;
  program: string | null;
  lastMessage: string | null;
  lastMessageAt: string | Date | null;
  unreadCount: number;
  status: string | null;
  customerId: number | null;
  groupId: number | null;
};

// Client-side filter para as tags padrão de status/tipo, chaveado pelo slug estável da tag
// (conversationTags.slug, ver drizzle/schema.ts e server/seedDefaults.ts) — não pelo id
// autoincrement, que varia conforme a ordem em que as tags são criadas.
export const TAG_STATUS_MAP: Record<string, string> = {
  open: "Open",
  waiting: "Waiting",
  group: "group",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-orange-500",
];

function avatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Atendimentos() {
  const [search, setSearch] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<number | undefined>(undefined);
  const [selectedItem, setSelectedItem] = useState<ChatItem | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  // Auto-select customer from URL param (e.g. coming from Customers page chat button)
  const urlCustomerId = typeof window !== 'undefined'
    ? parseInt(new URLSearchParams(window.location.search).get('customerId') ?? '') || null
    : null;

  const { data: tags = [] } = trpc.tags.list.useQuery();

  const { data: rawItems = [], isLoading } = trpc.tags.listUnified.useQuery({
    search: search || undefined,
    tagId: selectedTagId,
    limit: 100,
  });

  // Cast to ChatItem[] since listUnified returns a compatible shape
  const items = rawItems as ChatItem[];

  // When items load and we have a customerId from URL, auto-select that customer's first conversation
  useEffect(() => {
    if (urlCustomerId && items.length > 0 && !selectedItem) {
      const match = items.find(i => i.type === 'conversation' && i.customerId === urlCustomerId);
      if (match) setSelectedItem(match);
    }
  }, [urlCustomerId, items.length]);

  const selectedTagSlug = (tags as Tag[]).find(t => t.id === selectedTagId)?.slug;

  const filteredItems = items.filter(item => {
    if (!selectedTagId) return true;
    const statusFilter = selectedTagSlug ? TAG_STATUS_MAP[selectedTagSlug] : undefined;
    if (!statusFilter) return true; // custom tag (sem slug) — server já filtrou
    // "Em Aberto"/"Aguardando": tags.listUnified (server/routers.ts) já restringe a
    // conversas com uma linha em conversationTagAssignments para esta tag antes de chegar
    // aqui — e nada no projeto cria essa linha automaticamente a partir de conversations.status
    // (nenhuma automação insere em conversationTagAssignments). Na prática, hoje, esses dois
    // filtros só retornam algo se um atendente atribuiu a tag manualmente à conversa; a
    // comparação abaixo por conversations.status é redundante enquanto isso não mudar.
    // Decisão pendente com o time de CS: status deve espelhar conversations.status
    // automaticamente, ou é marcação manual do atendente (dois produtos diferentes)?
    if (statusFilter === "group") return item.type === "group";
    return item.status === statusFilter;
  });

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* ── Left panel: chat list ── */}
      <div className={cn(
        "flex flex-col border-r bg-card shrink-0 transition-all duration-200",
        selectedItem ? "w-80" : "w-full max-w-[360px]"
      )}>

        {/* Search */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversa ou cliente..."
              className="pl-9 h-9 bg-muted border-0 rounded-full text-sm focus-visible:ring-1"
            />
          </div>
        </div>

        {/* Tags row */}
        <div className="flex items-center gap-1.5 px-3 pb-2 shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setSelectedTagId(undefined)}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap border",
              !selectedTagId
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted"
            )}
          >
            Todos
          </button>
          {(tags as Tag[]).filter(t => t.name !== "Todos").map(tag => (
            <button
              key={tag.id}
              onClick={() => setSelectedTagId(tag.id === selectedTagId ? undefined : tag.id)}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap border",
                selectedTagId === tag.id
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted"
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

        <div className="h-px bg-border shrink-0" />

        {/* Scrollable chat list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Carregando...
            </div>
          )}
          {!isLoading && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhum atendimento encontrado</p>
            </div>
          )}
          {filteredItems.map(item => {
            const isSelected = selectedItem?.id === item.id && selectedItem?.type === item.type;
            return (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => setSelectedItem(isSelected ? null : item)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/40",
                  isSelected ? "bg-brand-50 dark:bg-brand-950/20" : "hover:bg-muted/50"
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0",
                  item.type === "group" ? "bg-brand-600" : avatarColor(item.name)
                )}>
                  {item.type === "group" ? <Users className="w-5 h-5" /> : initials(item.name)}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.name ?? item.phone ?? "Desconhecido"}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {timeAgo(item.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {item.lastMessage ?? (item.type === "group" ? "Grupo WhatsApp" : item.phone ?? "Sem mensagens")}
                    </p>
                    {item.type === "group" && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">grupo</Badge>
                    )}
                  </div>
                  {item.program && item.type === "conversation" && (
                    <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{item.program}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedItem ? (
          selectedItem.type === "conversation" ? (
            <ConversationDetail
              embeddedConvId={selectedItem.id}
              onBack={() => setSelectedItem(null)}
            />
          ) : (
            <GroupConversationPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
          )
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
