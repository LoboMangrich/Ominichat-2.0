import { useState, useRef, useEffect, useCallback } from "react";
import { Users, MessageSquare, X, Mic, Send, Bot, User, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";

// Painel de conversa de grupo do WhatsApp. Extraído de Atendimentos.tsx sem mudança de
// comportamento, para ser usado também pela tela única de Conversas (/sara).
export type GroupPanelItem = { name: string | null; groupId: number | null };

export default function GroupConversationPanel({ item, onClose }: { item: GroupPanelItem; onClose: () => void }) {
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
          <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0">
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
                <Badge className="text-[10px] px-1.5 py-0 bg-brand-500/20 text-brand-400 border-brand-500/30">
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
                : "border-brand-400 text-brand-400 hover:bg-brand-900/20"
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
        <div className="flex items-center justify-between px-4 py-1.5 bg-brand-50 dark:bg-brand-900/20 border-b border-brand-200 dark:border-brand-800 shrink-0">
          <div className="flex items-center gap-2 text-xs text-brand-700 dark:text-brand-300">
            <User className="w-3.5 h-3.5" />
            <span className="font-medium">Humano no controle</span>
            <span className="text-brand-500 dark:text-brand-400">— você está respondendo manualmente</span>
          </div>
          <button
            onClick={() => group && toggleAi.mutate({ groupId: actualGroupId, aiAutoReply: true })}
            className="text-xs text-brand-700 dark:text-brand-300 hover:text-brand-900 dark:hover:text-brand-100 font-medium underline underline-offset-2"
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
                  ? "bg-brand-600 text-white rounded-br-sm"
                  : "bg-card text-foreground border rounded-bl-sm"
              )}>
                {/* Sender label for group context */}
                <span className={cn(
                  "text-[10px] font-semibold block mb-0.5",
                  isAi ? "text-purple-200" : isAgent ? "text-brand-200" : "text-muted-foreground"
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
          className="shrink-0 h-9 w-9 bg-brand-600 hover:bg-brand-700 text-white rounded-full"
          onClick={handleSend}
          disabled={!text.trim() || sendGroupMsg.isPending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
