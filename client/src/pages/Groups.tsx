import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Users, MessageSquare, Search, Send, Bot, User, Clock,
  AlertTriangle, ChevronLeft, Crown, Globe, RefreshCw, Wifi, WifiOff,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  if (hours < 24) return `${hours}h`;
  if (days === 1) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatFullTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const GROUP_TYPE_ICON: Record<string, React.ReactNode> = {
  vip: <Crown className="w-3 h-3" />,
  community: <Globe className="w-3 h-3" />,
  support: <MessageSquare className="w-3 h-3" />,
};

const GROUP_TYPE_LABEL: Record<string, string> = {
  vip: "VIP",
  community: "Comunidade",
  support: "Suporte",
};

// ─── GroupList (left panel) ────────────────────────────────────────────────────

function GroupList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: groups = [], refetch, isLoading } = trpc.groups.list.useQuery();

  const filtered = groups.filter((g) =>
    g.groupName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full" style={{ borderRight: "1px solid rgba(0,0,0,0.08)" }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-base" style={{ color: "oklch(0.20 0.08 155)" }}>
              Grupos WhatsApp
            </h2>
            <p className="text-xs" style={{ color: "oklch(0.55 0.04 155)" }}>
              {groups.length} grupo{groups.length !== 1 ? "s" : ""} monitorado{groups.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            title="Atualizar"
          >
            <RefreshCw className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.04 155)" }} />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "oklch(0.60 0.04 155)" }} />
          <Input
            placeholder="Pesquisar grupos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "oklch(0.55 0.04 155)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
            <Users className="w-8 h-8" style={{ color: "oklch(0.70 0.04 155)" }} />
            <p className="text-sm" style={{ color: "oklch(0.55 0.04 155)" }}>
              {search ? "Nenhum grupo encontrado" : "Nenhum grupo cadastrado"}
            </p>
          </div>
        ) : (
          filtered.map((group) => {
            const isActive = selectedId === group.groupId;
            const lastMsg = group.lastMessage as { content?: string; senderName?: string; senderType?: string; timestamp?: unknown } | null;
            const hasAlert = (group.openAlerts as number) > 0;

            return (
              <button
                key={group.groupId}
                onClick={() => onSelect(group.groupId)}
                className="w-full text-left px-4 py-3 transition-all"
                style={{
                  background: isActive
                    ? "linear-gradient(135deg, rgba(0,180,100,0.10), rgba(0,160,90,0.06))"
                    : "transparent",
                  borderLeft: isActive ? "3px solid oklch(0.55 0.18 155)" : "3px solid transparent",
                  borderBottom: "1px solid rgba(0,0,0,0.04)",
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, oklch(0.55 0.18 155), oklch(0.45 0.16 155))"
                        : "linear-gradient(135deg, rgba(0,0,0,0.08), rgba(0,0,0,0.05))",
                      color: isActive ? "#fff" : "oklch(0.40 0.06 155)",
                    }}
                  >
                    {group.groupName.charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="font-semibold text-sm truncate"
                        style={{ color: isActive ? "oklch(0.20 0.10 155)" : "oklch(0.25 0.06 155)" }}
                      >
                        {group.groupName}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasAlert && (
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                            style={{ background: "#ef4444", color: "#fff" }}
                          >
                            {group.openAlerts as number}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: "oklch(0.65 0.04 155)" }}>
                          {formatTime(lastMsg?.timestamp as string | Date | null | undefined)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 mt-0.5">
                      {group.groupType && (
                        <span
                          className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            background: group.groupType === "vip" ? "rgba(139,92,246,0.10)" : "rgba(59,130,246,0.10)",
                            color: group.groupType === "vip" ? "#7c3aed" : "#2563eb",
                          }}
                        >
                          {GROUP_TYPE_ICON[group.groupType]}
                          {GROUP_TYPE_LABEL[group.groupType] || group.groupType}
                        </span>
                      )}
                      <span className="text-[10px] flex items-center gap-0.5" style={{ color: "oklch(0.65 0.04 155)" }}>
                        <Users className="w-2.5 h-2.5" />
                        {group.participantCount || 0}
                      </span>
                    </div>

                    {lastMsg?.content && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: "oklch(0.60 0.04 155)" }}>
                        <span style={{ color: lastMsg.senderType === "agent" ? "oklch(0.45 0.16 155)" : "oklch(0.60 0.04 155)" }}>
                          {lastMsg.senderType === "agent" ? "Você: " : lastMsg.senderName ? `${lastMsg.senderName}: ` : ""}
                        </span>
                        {lastMsg.content}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── GroupChat (right panel) ──────────────────────────────────────────────────

function GroupChat({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.groups.get.useQuery({ groupId });
  const ingestMutation = trpc.groups.ingestMessage.useMutation({
    onSuccess: () => {
      utils.groups.get.invalidate({ groupId });
      utils.groups.list.invalidate();
    },
  });

  const messages = data?.messages ? [...data.messages].reverse() : [];
  const group = data?.group;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    ingestMutation.mutate({
      groupId,
      groupName: group?.groupName || groupId,
      senderId: `agent_${user?.id || "1"}`,
      senderName: user?.name || "Guardião",
      senderType: "agent",
      content: text,
    });
    setMessage("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "oklch(0.55 0.04 155)" }} />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "oklch(0.55 0.04 155)" }}>Grupo não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "linear-gradient(135deg, rgba(0,180,100,0.06), rgba(255,255,255,0.95))",
        }}
      >
        <button
          onClick={onBack}
          className="md:hidden p-1.5 rounded-lg hover:bg-black/5 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
          style={{
            background: "linear-gradient(135deg, oklch(0.55 0.18 155), oklch(0.45 0.16 155))",
            color: "#fff",
          }}
        >
          {group.groupName.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm truncate" style={{ color: "oklch(0.20 0.08 155)" }}>
              {group.groupName}
            </h3>
            {group.groupType && (
              <span
                className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  background: group.groupType === "vip" ? "rgba(139,92,246,0.10)" : "rgba(59,130,246,0.10)",
                  color: group.groupType === "vip" ? "#7c3aed" : "#2563eb",
                }}
              >
                {GROUP_TYPE_ICON[group.groupType]}
                {GROUP_TYPE_LABEL[group.groupType]}
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: "oklch(0.60 0.04 155)" }}>
            {group.participantCount || 0} participantes
            {group.isMonitored ? (
              <span className="ml-2 inline-flex items-center gap-0.5" style={{ color: "#10b981" }}>
                <Wifi className="w-2.5 h-2.5" /> Monitorado
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center gap-0.5" style={{ color: "#9ca3af" }}>
                <WifiOff className="w-2.5 h-2.5" /> Não monitorado
              </span>
            )}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          title="Atualizar mensagens"
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.04 155)" }} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ background: "rgba(0,0,0,0.015)" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare className="w-10 h-10" style={{ color: "oklch(0.75 0.04 155)" }} />
            <div>
              <p className="font-semibold text-sm" style={{ color: "oklch(0.40 0.06 155)" }}>
                Nenhuma mensagem ainda
              </p>
              <p className="text-xs mt-1" style={{ color: "oklch(0.60 0.04 155)" }}>
                As mensagens do grupo aparecerão aqui quando chegarem via webhook.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isAgent = msg.senderType === "agent";
            const isAI = msg.senderType === "agent" && msg.senderName?.toLowerCase().includes("ia");

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isAgent ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: isAgent
                      ? "linear-gradient(135deg, oklch(0.55 0.18 155), oklch(0.45 0.16 155))"
                      : "rgba(0,0,0,0.08)",
                  }}
                >
                  {isAI ? (
                    <Bot className="w-3.5 h-3.5 text-white" />
                  ) : isAgent ? (
                    <User className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <span className="text-[10px] font-bold" style={{ color: "oklch(0.40 0.06 155)" }}>
                      {(msg.senderName || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Bubble */}
                <div className={`max-w-[72%] ${isAgent ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  <span className="text-[10px] font-medium px-1" style={{ color: "oklch(0.60 0.04 155)" }}>
                    {msg.senderName || msg.senderId}
                  </span>
                  <div
                    className="px-3 py-2 rounded-2xl text-sm leading-relaxed"
                    style={{
                      background: isAgent
                        ? "linear-gradient(135deg, oklch(0.55 0.18 155), oklch(0.48 0.16 155))"
                        : "#fff",
                      color: isAgent ? "#fff" : "oklch(0.20 0.06 155)",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                      borderRadius: isAgent ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
                    }}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] px-1 flex items-center gap-0.5" style={{ color: "oklch(0.65 0.04 155)" }}>
                    <Clock className="w-2.5 h-2.5" />
                    {formatFullTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: "1px solid rgba(0,0,0,0.08)", background: "#fff" }}
      >
        {(data?.alerts?.length ?? 0) > 0 && (
          <div
            className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "#dc2626" }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{data!.alerts[0].message}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Input
            placeholder="Digite uma mensagem para o grupo..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 text-sm"
            style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12 }}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || ingestMutation.isPending}
            size="sm"
            className="shrink-0 h-9 px-3"
            style={{
              background: message.trim() ? "oklch(0.55 0.18 155)" : "rgba(0,0,0,0.08)",
              color: message.trim() ? "#fff" : "oklch(0.60 0.04 155)",
              border: "none",
              borderRadius: 10,
            }}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Groups() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  return (
    <div className="flex h-full" style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
      {/* Left: group list — hidden on mobile when chat is open */}
      <div
        className={`${selectedGroupId ? "hidden md:flex" : "flex"} flex-col`}
        style={{ width: 320, minWidth: 280, maxWidth: 360, flexShrink: 0 }}
      >
        <GroupList selectedId={selectedGroupId} onSelect={setSelectedGroupId} />
      </div>

      {/* Right: chat or empty state */}
      <div className={`${selectedGroupId ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
        {selectedGroupId ? (
          <GroupChat groupId={selectedGroupId} onBack={() => setSelectedGroupId(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(0,180,100,0.12), rgba(0,160,90,0.06))" }}
            >
              <MessageSquare className="w-8 h-8" style={{ color: "oklch(0.55 0.18 155)" }} />
            </div>
            <div>
              <h3 className="font-bold text-base" style={{ color: "oklch(0.25 0.08 155)" }}>
                Selecione um grupo
              </h3>
              <p className="text-sm mt-1" style={{ color: "oklch(0.55 0.04 155)" }}>
                Clique em um grupo à esquerda para ver o histórico de mensagens e conversar com o time.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
