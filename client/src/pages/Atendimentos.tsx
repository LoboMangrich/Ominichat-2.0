import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Users, MessageSquare, Settings2, Plus, Pencil, Trash2, Check, X, Mic, Send, Bot, User, Sparkles, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import ConversationDetail from "./ConversationDetail";

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

type Tag = { id: number; name: string; color: string | null; icon: string | null; isDefault: boolean | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(date: string | Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

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

// ─── Group Conversation Panel ─────────────────────────────────────────────────
function GroupConversationPanel({ item, onClose }: { item: ChatItem; onClose: () => void }) {
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const groupId = item.name ?? ""; // groupId is stored as the item's groupId field
  const actualGroupId = item.groupId ? String(item.groupId) : "";

  const groupData = trpc.groups.get.useQuery(
    { groupId: actualGroupId },
    { enabled: !!actualGroupId, refetchInterval: 10000 }
  );

  const sendGroupMsg = trpc.groups.ingestMessage.useMutation({
    onSuccess: () => {
      utils.groups.get.invalidate({ groupId: actualGroupId });
      utils.tags.listUnified.invalidate();
    },
  });

  const toggleAi = trpc.groups.updateGroupSettings.useMutation({
    onSuccess: () => utils.groups.get.invalidate({ groupId: actualGroupId }),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [groupData.data?.messages]);

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || !actualGroupId) return;
    setText("");
    sendGroupMsg.mutate({
      groupId: actualGroupId,
      groupName: item.name ?? "Grupo",
      senderId: "agent",
      senderName: "Agente",
      senderType: "agent",
      content,
    });
  }, [text, item, actualGroupId, sendGroupMsg]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const group = groupData.data?.group;
  const msgs = (groupData.data?.messages ?? []).slice().reverse();
  const aiEnabled = group?.aiAutoReply ?? false;

  // Sender label helper
  function senderLabel(senderType: string | null | undefined, senderName: string | null): string {
    if (senderType === "agent") return "Agente";
    if ((senderType as string) === "ai") return "IA Assistente";
    return senderName ?? "Cliente";
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{item.name ?? "Grupo"}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Grupo WhatsApp</Badge>
              {group?.groupType === "vip" && (
                <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30">VIP</Badge>
              )}
              {aiEnabled ? (
                <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-400 border-purple-500/30">
                  <Bot className="w-2.5 h-2.5 mr-0.5" /> IA Ativa
                </Badge>
              ) : (
                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <User className="w-2.5 h-2.5 mr-0.5" /> Humano
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {group?.participantCount ? `${group.participantCount} participantes` : "Grupo de atendimento"}
              {group?.description ? ` · ${group.description}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* AI toggle */}
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-8 text-xs",
              aiEnabled
                ? "border-purple-400 text-purple-400 hover:bg-purple-900/20"
                : "border-emerald-400 text-emerald-400 hover:bg-emerald-900/20"
            )}
            onClick={() => group && toggleAi.mutate({ groupId: actualGroupId, aiAutoReply: !aiEnabled })}
            disabled={toggleAi.isPending || !group}
          >
            {aiEnabled ? (
              <><User className="w-3.5 h-3.5 mr-1.5" /> Assumir Controle</>
            ) : (
              <><Bot className="w-3.5 h-3.5 mr-1.5" /> Ativar IA</>
            )}
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── AI/Human banner ── */}
      {aiEnabled ? (
        <div className="flex items-center justify-between px-4 py-1.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800 shrink-0">
          <div className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
            <Bot className="w-3.5 h-3.5" />
            <span className="font-medium">IA está atendendo o grupo</span>
            <span className="text-purple-500 dark:text-purple-400">— mensagens respondidas automaticamente</span>
          </div>
          <button
            onClick={() => group && toggleAi.mutate({ groupId: actualGroupId, aiAutoReply: false })}
            className="text-xs text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 font-medium underline underline-offset-2"
          >
            Assumir agora
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 shrink-0">
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <User className="w-3.5 h-3.5" />
            <span className="font-medium">Humano no controle</span>
            <span className="text-emerald-500 dark:text-emerald-400">— você está respondendo manualmente</span>
          </div>
          <button
            onClick={() => group && toggleAi.mutate({ groupId: actualGroupId, aiAutoReply: true })}
            className="text-xs text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 font-medium underline underline-offset-2"
          >
            Ativar IA
          </button>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-muted/20">
        {groupData.isLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Carregando mensagens...
          </div>
        )}
        {!groupData.isLoading && msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="w-8 h-8 opacity-20" />
            <p className="text-sm">Nenhuma mensagem ainda</p>
            <p className="text-xs opacity-60">As mensagens do grupo aparecerão aqui</p>
          </div>
        )}
        {msgs.map((msg) => {
          const isAgent = msg.senderType === "agent";
          const isAi = (msg.senderType as string) === "ai";
          const isOutgoing = isAgent || isAi;
          return (
            <div key={msg.id} className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                isAi
                  ? "bg-purple-600 text-white rounded-br-sm"
                  : isAgent
                  ? "bg-emerald-600 text-white rounded-br-sm"
                  : "bg-card text-foreground border rounded-bl-sm"
              )}>
                {/* Sender label for group context */}
                <span className={cn(
                  "text-[10px] font-semibold block mb-0.5",
                  isAi ? "text-purple-200" : isAgent ? "text-emerald-200" : "text-muted-foreground"
                )}>
                  {senderLabel(msg.senderType, msg.senderName)}
                  {isAi && <Sparkles className="w-2.5 h-2.5 inline ml-1" />}
                </span>
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={cn(
                  "text-[10px] mt-1 text-right",
                  isOutgoing ? "text-white/60" : "text-muted-foreground"
                )}>
                  {timeAgo(msg.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-t bg-card shrink-0">
        {aiEnabled && (
          <div className="flex items-center gap-1.5 text-xs text-purple-400 shrink-0">
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">IA ativa</span>
          </div>
        )}
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={aiEnabled ? "Mensagem manual (sobrepõe a IA)..." : "Digite uma mensagem para o grupo..."}
          className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1 text-sm"
        />
        <Button size="icon" variant="ghost" className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground">
          <Mic className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          className="shrink-0 h-9 w-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full"
          onClick={handleSend}
          disabled={!text.trim() || sendGroupMsg.isPending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Tag Manager Modal ────────────────────────────────────────────────────────
function TagManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [newTagName, setNewTagName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const utils = trpc.useUtils();

  const { data: tags = [] } = trpc.tags.list.useQuery();
  const createTag = trpc.tags.create.useMutation({
    onSuccess: () => { utils.tags.list.invalidate(); setNewTagName(""); }
  });
  const updateTag = trpc.tags.update.useMutation({
    onSuccess: () => { utils.tags.list.invalidate(); setEditingId(null); }
  });
  const deleteTag = trpc.tags.delete.useMutation({
    onSuccess: () => utils.tags.list.invalidate()
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gerenciar Tags</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {(tags as Tag[]).filter(t => t.name !== "Todos").map(tag => (
            <div key={tag.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50">
              {editingId === tag.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    className="flex-1 h-7 text-sm"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") updateTag.mutate({ id: tag.id, name: editingName });
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
                    onClick={() => updateTag.mutate({ id: tag.id, name: editingName })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => setEditingId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{tag.name}</span>
                  {!tag.isDefault ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                        onClick={() => { setEditingId(tag.id); setEditingName(tag.name); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => deleteTag.mutate({ id: tag.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] h-4">padrão</Badge>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Input
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            placeholder="Nova tag (ex: Cristiano)..."
            className="flex-1 h-8 text-sm"
            onKeyDown={e => {
              if (e.key === "Enter" && newTagName.trim()) createTag.mutate({ name: newTagName.trim() });
            }}
          />
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
            disabled={!newTagName.trim() || createTag.isPending}
            onClick={() => createTag.mutate({ name: newTagName.trim() })}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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

  // Client-side filter for default status tags
  const TAG_STATUS_MAP: Record<number, string> = {
    2: "Aberto",
    3: "Aguardando",
    4: "auto",
    5: "group",
  };

  const filteredItems = items.filter(item => {
    if (!selectedTagId) return true;
    const statusFilter = TAG_STATUS_MAP[selectedTagId];
    if (!statusFilter) return true; // custom tag — server already filtered
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
                ? "bg-emerald-600 text-white border-emerald-600"
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
                  ? "bg-emerald-600 text-white border-emerald-600"
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
                  isSelected ? "bg-emerald-50 dark:bg-emerald-950/20" : "hover:bg-muted/50"
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0",
                  item.type === "group" ? "bg-emerald-600" : avatarColor(item.name)
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
