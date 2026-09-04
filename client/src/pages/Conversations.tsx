import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Bot,
  CheckCheck,
  Clock,
  Filter,
  MessageSquare,
  Mic,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_GLASS: Record<string, { bg: string; color: string; border: string }> = {
  Open:    { bg: "rgba(139,92,246,0.10)", color: "#6d28d9", border: "rgba(139,92,246,0.20)" },
  Waiting: { bg: "rgba(201,130,39,0.12)", color: "#9a6010", border: "rgba(201,130,39,0.22)" },
  Closed:  { bg: "rgba(100,116,139,0.10)", color: "#475569", border: "rgba(100,116,139,0.18)" },
};

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  Waiting: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export const STATUS_LABELS: Record<string, string> = {
  Open: "Aberto",
  Waiting: "Aguardando",
  Closed: "Finalizado",
};

const CHANNEL_GLASS: Record<string, { bg: string; color: string; border: string }> = {
  whatsapp: { bg: "rgba(13,107,78,0.10)",  color: "#0d6b4e", border: "rgba(13,107,78,0.20)" },
  email:    { bg: "rgba(52,130,246,0.10)", color: "#1d4ed8", border: "rgba(52,130,246,0.20)" },
  instagram:{ bg: "rgba(236,72,153,0.10)", color: "#be185d", border: "rgba(236,72,153,0.20)" },
  telegram: { bg: "rgba(14,165,233,0.10)", color: "#0369a1", border: "rgba(14,165,233,0.20)" },
  chat:     { bg: "rgba(100,116,139,0.10)",color: "#475569", border: "rgba(100,116,139,0.18)" },
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  email: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  instagram: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300",
  telegram: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300",
  chat: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
  telegram: "Telegram",
  chat: "Chat",
};

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: "💬",
  email: "✉️",
  instagram: "📸",
  telegram: "✈️",
  chat: "💻",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date | null | string | number) {
  if (!date) return "";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ─── Queue tabs ───────────────────────────────────────────────────────────────

type QueueTab = "all" | "open" | "waiting" | "closed" | "ai" | "group";
// `status` aqui é o valor do enum conversations.status no banco (drizzle/schema.ts) — sempre em
// inglês. Nunca usar o rótulo em português aqui: é enviado direto como filtro para conversations.list.
export const QUEUE_TABS: { id: QueueTab; label: string; icon: string; status?: string; aiOnly?: boolean; groupOnly?: boolean; activeColor: string; badgeColor: string }[] = [
  { id: "all",     label: "Todos",       icon: "#",  activeColor: "border-slate-500 text-slate-700 dark:text-slate-300",    badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { id: "open",    label: "Em Aberto",   icon: "🟣", status: "Open",    activeColor: "border-violet-500 text-violet-700 dark:text-violet-300",  badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  { id: "waiting", label: "Aguardando",  icon: "⏳", status: "Waiting", activeColor: "border-amber-500 text-amber-700 dark:text-amber-300",    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { id: "ai",      label: "Automático",  icon: "🤖", aiOnly: true,      activeColor: "border-purple-500 text-purple-700 dark:text-purple-300", badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { id: "group",   label: "Grupo",       icon: "👥", groupOnly: true,   activeColor: "border-blue-500 text-blue-700 dark:text-blue-300",       badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { id: "closed",  label: "Finalizados", icon: "✅", status: "Closed",  activeColor: "border-slate-400 text-slate-600 dark:text-slate-400",   badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
];

// ─── ConvCard ─────────────────────────────────────────────────────────────────

// conv.status vem do banco em inglês (enum conversations.status) — comparar sempre contra "Open".
export function isConversationUnread(conv: { status: string; handledByAi: boolean }): boolean {
  return conv.status === "Open" && !conv.handledByAi;
}

function ConvCard({ conv, onClick, onLabelClick }: { conv: any; onClick: () => void; onLabelClick?: (label: string) => void }) {
  const lastMsg = conv.messages?.[conv.messages.length - 1];
  const unread = isConversationUnread(conv);
  const chGlass = CHANNEL_GLASS[conv.channel] ?? { bg: "rgba(100,116,139,0.10)", color: "#475569", border: "rgba(100,116,139,0.18)" };
  const stGlass = STATUS_GLASS[conv.status] ?? { bg: "rgba(100,116,139,0.10)", color: "#475569", border: "rgba(100,116,139,0.18)" };
  const qsColor = conv.qualityScore >= 80 ? "#0d6b4e" : conv.qualityScore >= 60 ? "#9a6010" : "#b91c1c";

  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 px-3 py-3 mx-2 my-0.5 rounded-xl cursor-pointer transition-all"
      style={{
        background: unread ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.45)",
        border: unread ? "1px solid rgba(255,255,255,0.88)" : "1px solid rgba(255,255,255,0.60)",
        boxShadow: unread ? "0 2px 10px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.95) inset" : "none",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "rgba(255,255,255,0.85)";
        el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,1) inset";
        el.style.transform = "translateX(2px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = unread ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.45)";
        el.style.boxShadow = unread ? "0 2px 10px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.95) inset" : "none";
        el.style.transform = "";
      }}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-black text-sm"
          style={conv.handledByAi ? {
            background: "rgba(139,92,246,0.15)",
            border: "2px solid rgba(139,92,246,0.25)",
            color: "#6d28d9",
          } : {
            background: "rgba(13,107,78,0.14)",
            border: "2px solid rgba(13,107,78,0.25)",
            color: "#0d6b4e",
          }}
        >
          {(conv.customer?.name ?? String(conv.id)).charAt(0).toUpperCase()}
        </div>
        {/* Channel badge */}
        <div
          className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          style={{ background: "rgba(255,255,255,0.95)", border: "1px solid rgba(255,255,255,0.90)", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }}
        >
          {CHANNEL_ICONS[conv.channel] ?? "💬"}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-sm truncate"
              style={{ color: unread ? "oklch(0.18 0.08 155)" : "oklch(0.45 0.05 155)", fontWeight: unread ? 700 : 500 }}
            >
              {conv.customer?.name ?? `Atendimento #${conv.id}`}
            </span>
            {conv.handledByAi && (
              <Bot className="w-3.5 h-3.5 shrink-0" style={{ color: "#6d28d9" }} />
            )}
          </div>
          <span className="text-[11px] shrink-0 ml-2" style={{ color: "oklch(0.55 0.04 155)" }}>
            {timeAgo(conv.updatedAt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs truncate flex-1" style={{ color: unread ? "oklch(0.30 0.06 155)" : "oklch(0.52 0.04 155)" }}>
            {lastMsg?.content
              ? lastMsg.content.substring(0, 60)
              : conv.subject ?? "Sem mensagens"}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {conv.slaBreached ? (
              <span className="text-[10px] font-bold" style={{ color: "#b91c1c" }}>⚠ ANS</span>
            ) : conv.status !== "Closed" && conv.createdAt && (() => {
              const mins = Math.floor((Date.now() - new Date(conv.createdAt).getTime()) / 60000);
              if (mins < 30) return null;
              const label = mins < 60 ? `${mins}min` : mins < 1440 ? `${Math.floor(mins/60)}h` : `${Math.floor(mins/1440)}d`;
              const color = mins < 60 ? "#0d6b4e" : mins < 120 ? "#9a6010" : "#b91c1c";
              return <span className="text-[10px] font-bold" style={{ color }}>⏱ {label}</span>;
            })()}
            {conv.qualityScore != null && (
              <span className="text-[10px] font-black" style={{ color: qsColor }}>
                {conv.qualityScore}
              </span>
            )}
            {unread && (
              <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.49 0.19 155)", boxShadow: "0 0 6px rgba(52,168,83,0.50)" }} />
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: chGlass.bg, color: chGlass.color, border: `1px solid ${chGlass.border}` }}
          >
            {CHANNEL_LABELS[conv.channel] ?? conv.channel}
          </span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: stGlass.bg, color: stGlass.color, border: `1px solid ${stGlass.border}` }}
          >
            {STATUS_LABELS[conv.status] ?? conv.status}
          </span>
          {conv.archivedAt && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(217,119,6,0.12)", color: "#b45309", border: "1px solid rgba(217,119,6,0.25)" }}
            >
              Arquivado
            </span>
          )}
          {conv.labels?.slice(0, 2).map((l: any) => (
            <span
              key={l.id}
              onClick={(e) => { e.stopPropagation(); onLabelClick?.(l.label); }}
              className="text-[10px] px-1.5 py-0 rounded-full border font-medium cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor: l.color ?? "#6366f1", color: l.color ?? "#6366f1", background: `${l.color ?? "#6366f1"}15` }}
              title={`Filtrar por: ${l.label}`}
            >
              {l.label}
            </span>
          ))}
          {conv.assignedAgent?.name && (
            <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-0.5">
              <span className="w-3.5 h-3.5 rounded-full bg-muted inline-flex items-center justify-center text-[8px] font-bold">
                {conv.assignedAgent.name.charAt(0).toUpperCase()}
              </span>
              {conv.assignedAgent.name.split(" ")[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Conversations() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const customerIdParam = params.get("customerId");

  const [activeTab, setActiveTab] = useState<QueueTab>("all");
  const [channelFilter, setChannelFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [newConv, setNewConv] = useState({
    customerId: customerIdParam ? Number(customerIdParam) : 0,
    channel: "whatsapp" as const,
    subject: "",
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const activeTabDef = QUEUE_TABS.find(t => t.id === activeTab);
  const statusFilter = activeTabDef?.status ?? "";

  const { data, isLoading, refetch } = trpc.conversations.list.useQuery({
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    customerId: customerIdParam ? Number(customerIdParam) : undefined,
    page,
    limit: 50,
  });

  const { data: customerData } = trpc.customers.list.useQuery({ search: customerSearch, limit: 10 });

  const utils = trpc.useUtils();
  const bulkDeleteMutation = trpc.conversations.bulkDeleteEmpty.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.deleted} atendimento(s) sem mensagem real removido(s).`);
      setShowCleanup(false);
      utils.conversations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createMutation = trpc.conversations.create.useMutation({
    onSuccess: () => {
      toast.success("Atendimento criado!");
      setShowCreate(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const allConversations = data?.conversations ?? [];
  const total = data?.total ?? 0;

  // Client-side search filter + tab filter for ai/group + label filter + agent filter
  const conversations = useMemo(() => {
    let list = allConversations;
    if (activeTab === "ai") list = list.filter(c => c.handledByAi);
    if (activeTab === "group") list = list.filter(c => (c.channel as string) === "group");
    if (labelFilter) {
      list = list.filter(c =>
        (c.labels as any[])?.some((l: any) => l.label?.toLowerCase() === labelFilter.toLowerCase())
      );
    }
    if (agentFilter) {
      list = list.filter(c => (c.assignedAgent as any)?.name?.toLowerCase().includes(agentFilter.toLowerCase()));
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(c =>
      c.subject?.toLowerCase().includes(q) ||
      (c.customer as any)?.name?.toLowerCase().includes(q) ||
      String(c.id).includes(q) ||
      c.channel?.toLowerCase().includes(q) ||
      (c.messages as any[])?.[0]?.content?.toLowerCase().includes(q) ||
      (c.labels as any[])?.some((l: any) => l.label?.toLowerCase().includes(q))
    );
  }, [allConversations, searchQuery, activeTab, labelFilter, agentFilter]);

  // Unique agents from current conversations for filter dropdown
  const uniqueAgents = useMemo(() => {
    const seen = new Set<string>();
    const agents: { name: string }[] = [];
    allConversations.forEach(c => {
      const name = (c.assignedAgent as any)?.name;
      if (name && !seen.has(name)) { seen.add(name); agents.push({ name }); }
    });
    return agents;
  }, [allConversations]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const all = allConversations;
    return {
      all: total,
      open: all.filter(c => c.status === "Open").length,
      waiting: all.filter(c => c.status === "Waiting").length,
      closed: all.filter(c => c.status === "Closed").length,
      ai: all.filter(c => c.handledByAi).length,
      group: all.filter(c => (c.channel as string) === "group").length,
    };
  }, [allConversations, total]);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden" style={{ background: "oklch(0.960 0.010 155)" }}>

      {/* ── Header ── */}
      <div
        className="px-4 pt-4 pb-0 shrink-0"
        style={{
          background: "rgba(255,255,255,0.82)",
          borderBottom: "1px solid rgba(255,255,255,0.70)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.05), 0 1px 0 rgba(255,255,255,1) inset",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-black" style={{ color: "oklch(0.18 0.08 155)", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em" }}>Atendimentos</h1>
            <p className="text-xs" style={{ color: "oklch(0.50 0.05 155)" }}>{total} no total</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Label filter */}
            {labelFilter && (
              <button
                onClick={() => setLabelFilter("")}
                className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors border border-emerald-200 dark:border-emerald-700"
              >
                🏷️ {labelFilter} ×
              </button>
            )}

            {/* Agent filter */}
            {uniqueAgents.length > 0 && (
              <Select value={agentFilter} onValueChange={v => { setAgentFilter(v === "todos" ? "" : v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <User className="w-3 h-3 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os agentes</SelectItem>
                  {uniqueAgents.map(a => (
                    <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Channel filter */}
            <Select value={channelFilter} onValueChange={v => { setChannelFilter(v === "todos" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <Filter className="w-3 h-3 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os canais</SelectItem>
                <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                <SelectItem value="email">✉️ E-mail</SelectItem>
                <SelectItem value="instagram">📸 Instagram</SelectItem>
                <SelectItem value="telegram">✈️ Telegram</SelectItem>
                <SelectItem value="chat">💻 Chat</SelectItem>
              </SelectContent>
            </Select>

            {/* Cleanup button */}
            <Dialog open={showCleanup} onOpenChange={setShowCleanup}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  title="Remover atendimentos sem mensagem real"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Limpar atendimentos vazios</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <p className="text-sm text-muted-foreground">
                    Isso vai remover todos os atendimentos que <strong>não têm nenhuma mensagem real do cliente</strong> — criados automaticamente quando o WhatsApp não estava configurado.
                  </p>
                  <p className="text-xs text-red-600 font-medium">⚠️ Esta ação não pode ser desfeita.</p>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowCleanup(false)}>Cancelar</Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => bulkDeleteMutation.mutate()}
                      disabled={bulkDeleteMutation.isPending}
                    >
                      {bulkDeleteMutation.isPending ? "Removendo..." : "Confirmar limpeza"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Novo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Iniciar Novo Atendimento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <Label>Cliente *</Label>
                    <Input
                      placeholder="Buscar cliente pelo nome ou e-mail..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                    />
                    {customerData?.customers && customerSearch && (
                      <div className="border rounded-xl overflow-hidden max-h-44 overflow-y-auto shadow-lg">
                        {customerData.customers.length === 0 ? (
                          <p className="p-3 text-xs text-muted-foreground text-center">Nenhum cliente encontrado</p>
                        ) : customerData.customers.map(c => (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex items-center gap-2.5 border-b last:border-0"
                            onClick={() => { setNewConv(p => ({ ...p, customerId: c.id })); setCustomerSearch(c.name); }}
                          >
                            <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{c.name}</p>
                              {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Canal</Label>
                    <Select value={newConv.channel} onValueChange={v => setNewConv(p => ({ ...p, channel: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                        <SelectItem value="email">✉️ E-mail</SelectItem>
                        <SelectItem value="chat">💻 Chat</SelectItem>
                        <SelectItem value="instagram">📸 Instagram</SelectItem>
                        <SelectItem value="telegram">✈️ Telegram</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assunto <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                    <Input
                      value={newConv.subject}
                      onChange={e => setNewConv(p => ({ ...p, subject: e.target.value }))}
                      placeholder="Descreva brevemente o assunto..."
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
                    <Button
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                      disabled={!newConv.customerId || createMutation.isPending}
                      onClick={() => createMutation.mutate(newConv)}
                    >
                      {createMutation.isPending ? "Criando..." : "Iniciar Atendimento"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "oklch(0.55 0.05 155)" }} />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, mensagem, etiqueta, canal ou ID... (pressione / para focar)"
            className="w-full h-9 pl-9 pr-4 text-sm rounded-xl transition-all"
            style={{
              background: "rgba(255,255,255,0.75)",
              border: "1px solid rgba(255,255,255,0.90)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04), 0 1px 0 rgba(255,255,255,0.95) inset",
              color: "oklch(0.20 0.08 155)",
              outline: "none",
            }}
            onFocus={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.98)";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(52,168,83,0.20), 0 2px 8px rgba(0,0,0,0.06)";
            }}
            onBlur={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.75)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04), 0 1px 0 rgba(255,255,255,0.95) inset";
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Queue tabs */}
        <div className="flex gap-0 -mb-px overflow-x-auto scrollbar-none" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          {QUEUE_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const count = tab.id === "all" ? total : tabCounts[tab.id] ?? 0;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPage(1); }}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all whitespace-nowrap relative"
                style={isActive ? {
                  color: "oklch(0.20 0.08 155)",
                  fontWeight: 700,
                  borderBottom: "2px solid oklch(0.49 0.19 155)",
                } : {
                  color: "oklch(0.52 0.05 155)",
                  borderBottom: "2px solid transparent",
                }}
              >
                <span className="text-[11px]">{tab.icon}</span>
                {tab.label}
                {count > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                    style={isActive ? {
                      background: "rgba(13,107,78,0.12)",
                      color: "#0d6b4e",
                    } : {
                      background: "rgba(0,0,0,0.06)",
                      color: "oklch(0.50 0.05 155)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 border-b">
                <Skeleton className="w-11 h-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 opacity-30" />
            </div>
            <p className="font-medium text-sm">Nenhum atendimento encontrado</p>
            <p className="text-xs mt-1 opacity-60">
              {searchQuery ? `Nenhum resultado para "${searchQuery}"` : "Inicie um novo atendimento para começar."}
            </p>
            {!searchQuery && (
              <Button
                size="sm"
                className="mt-4 bg-emerald-500 hover:bg-emerald-600 gap-1.5"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="w-3.5 h-3.5" /> Novo Atendimento
              </Button>
            )}
          </div>
        ) : (
          <>
            {conversations.map((conv) => (
              <ConvCard
                key={conv.id}
                conv={conv}
                onClick={() => setLocation(`/conversations/${conv.id}`)}
                onLabelClick={(label) => { setLabelFilter(label); setPage(1); }}
              />
            ))}

            {/* Pagination */}
            {total > 50 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
                <span>Exibindo {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>
                    Próximo
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
