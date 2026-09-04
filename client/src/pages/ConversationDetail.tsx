import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle,
  CheckCheck,
  Clock,
  FileText,
  Forward,
  Image,
  LayoutTemplate,
  Lock,
  Mail,
  Mic,
  MicOff,
  Paperclip,
  Phone,
  Send,
  Smile,
  Sparkles,
  Square,
  Tag,
  TrendingUp,
  DollarSign,
  RefreshCw,
  User,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  Open: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  Waiting: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

// Chaves = valores reais do enum conversations.status (drizzle/schema.ts). Única fonte de
// verdade para os valores aceitos por conversations.updateStatus — nunca hardcodear em português.
export const statusLabels: Record<string, string> = {
  Open: "Aberto",
  Waiting: "Aguardando",
  Closed: "Encerrado",
};

const channelLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
  telegram: "Telegram",
};

function formatTime(date: Date | string | number) {
  return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `0:${s.toString().padStart(2, "0")}`;
}

async function uploadMedia(file: File | Blob, mimeType: string, filename?: string): Promise<string> {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const resp = await fetch("/api/upload-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: base64, mimeType, filename }),
      });
      if (!resp.ok) reject(new Error("Upload falhou"));
      const json = await resp.json();
      resolve(json.url as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Audio Recorder Hook ──────────────────────────────────────────────────────

function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      toast.error("Permissão de microfone negada");
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) { resolve(null); return; }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        mr.stream.getTracks().forEach(t => t.stop());
        resolve(blob);
      };
      mr.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    });
  }, []);

  const cancel = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stream.getTracks().forEach(t => t.stop());
      mr.stop();
    }
    setIsRecording(false);
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return { isRecording, duration, start, stop, cancel };
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: any }) {
  // IA e agente ficam do lado direito (empresa); cliente fica do lado esquerdo
  const isAi = msg.senderType === "ai";
  const isAgent = msg.senderType === "agent" || isAi;
  const isInternal = msg.isInternal;
  const isAudio = msg.mediaType?.startsWith("audio");
  const isImage = msg.mediaType?.startsWith("image");
  const isDoc = msg.mediaType && !isAudio && !isImage;

  return (
    <div className={`flex ${isAgent ? "justify-end" : "justify-start"} group`}>
      {!isAgent && (
        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
          C
        </div>
      )}
      <div className={`max-w-[72%] ${
        isInternal
          ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100 rounded-2xl rounded-br-sm shadow-sm"
          : isAi
          ? "bg-[#d4f1ff] dark:bg-[#004c6e] text-gray-900 dark:text-gray-100 rounded-2xl rounded-br-sm shadow-sm"
          : isAgent
          ? "bg-[#dcf8c6] dark:bg-[#005c4b] text-gray-900 dark:text-gray-100 rounded-2xl rounded-br-sm shadow-sm"
          : "bg-white dark:bg-[#1f2c33] text-gray-900 dark:text-gray-100 rounded-2xl rounded-bl-sm shadow-sm"
      } px-3 py-2`}>
        {isInternal && (
          <div className="flex items-center gap-1 mb-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
            <Lock className="w-3 h-3" /> Nota interna
          </div>
        )}
        {isAi && (
          <div className="flex items-center gap-1 mb-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
            <Bot className="w-3 h-3" /> IA
          </div>
        )}

        {/* Audio message */}
        {isAudio && msg.mediaUrl && (
          <div className="flex items-center gap-2 min-w-[200px]">
            <Volume2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <audio controls src={msg.mediaUrl} className="h-8 flex-1" style={{ minWidth: 140 }} />
          </div>
        )}

        {/* Image message */}
        {isImage && msg.mediaUrl && (
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
            <img src={msg.mediaUrl} alt="imagem" className="rounded-xl max-w-full max-h-64 object-cover" />
          </a>
        )}

        {/* Document message */}
        {isDoc && msg.mediaUrl && (
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="text-sm truncate">{msg.mediaType}</span>
          </a>
        )}

        {/* Text content */}
        {msg.content && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
        )}

        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isAgent && !isInternal ? "text-[#67c15e] dark:text-[#53bdeb]" : "text-gray-400 dark:text-gray-500"}`}>
          <span className="text-[10px]">{formatTime(msg.createdAt)}</span>
          {isAgent && !isInternal && (
            <CheckCheck className="w-3.5 h-3.5" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ConversationDetailProps {
  embeddedConvId?: number;
  onBack?: () => void;
}

export default function ConversationDetail({ embeddedConvId, onBack }: ConversationDetailProps = {}) {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const convId = embeddedConvId ?? Number(id);
  const isEmbedded = embeddedConvId !== undefined;

  // Message state
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  // Label state
  const [newLabel, setNewLabel] = useState("");
  const [showLabelInput, setShowLabelInput] = useState(false);

  // Quick replies
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null); // null = not in slash mode

  // Schedule
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleMsg, setScheduleMsg] = useState("");

  // Forward
  const [showForward, setShowForward] = useState(false);
  const [forwardAgentId, setForwardAgentId] = useState<number | null>(null);
  const [forwardReason, setForwardReason] = useState("");

  // Template
  const [showTemplate, setShowTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{ name: string; language: string; components: unknown[] } | null>(null);
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Audio
  const { isRecording, duration, start: startRec, stop: stopRec, cancel: cancelRec } = useAudioRecorder();
  const [transcribeMode, setTranscribeMode] = useState(false); // true = transcribe to text, false = send as audio

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Queries
  const { data: conv, isLoading } = trpc.conversations.getById.useQuery({ id: convId });
  const { data: quickRepliesList = [] } = trpc.quickReplies.list.useQuery();
  const { data: teamMembers = [] } = trpc.teamChat.getTeamMembers.useQuery();
  const { data: scheduledList = [], refetch: refetchScheduled } = trpc.scheduledMessages.list.useQuery({ conversationId: convId });

  // Journey tasks for mini-panel (only when customer is loaded)
  const customerId = (conv as any)?.customer?.id;
  const { data: pendingJourneyTasks = [] } = trpc.journeyTasks.listByCustomer.useQuery(
    { customerId: customerId! },
    { enabled: !!customerId }
  );
  const pendingTasks = pendingJourneyTasks.filter((t: any) => t.status === 'pending').slice(0, 3);

  // Mutations
  const cancelScheduledMutation = trpc.scheduledMessages.cancel.useMutation({
    onSuccess: () => { toast.success("Mensagem cancelada!"); refetchScheduled(); },
    onError: () => toast.error("Erro ao cancelar mensagem agendada"),
  });

  const retryScheduledMutation = trpc.scheduledMessages.retry.useMutation({
    onSuccess: () => { toast.success("Mensagem reagendada para daqui 5 minutos!"); refetchScheduled(); },
    onError: () => toast.error("Erro ao reagendar mensagem"),
  });

  const scheduleMessageMutation = trpc.scheduledMessages.create.useMutation({
    onSuccess: () => {
      toast.success("Mensagem agendada!");
      setShowSchedule(false);
      setScheduleDate("");
      setScheduleMsg("");
      refetchScheduled();
    },
    onError: () => toast.error("Erro ao agendar mensagem"),
  });

  const forwardMutation = trpc.conversations.forward.useMutation({
    onSuccess: (data) => {
      toast.success(`🔄 Atendimento transferido para ${data.targetName}!`);
      setShowForward(false);
      setForwardAgentId(null);
      setForwardReason("");
      utils.conversations.getById.invalidate({ id: convId });
    },
    onError: () => toast.error("Erro ao transferir atendimento"),
  });

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => {
      setMessage("");
      utils.conversations.getById.invalidate({ id: convId });
    },
    onError: (e) => toast.error(e.message),
  });

  const simulateMutation = trpc.messages.simulateIncoming.useMutation({
    onSuccess: () => utils.conversations.getById.invalidate({ id: convId }),
    onError: (e) => toast.error(e.message),
  });

  const statusMutation = trpc.conversations.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); utils.conversations.getById.invalidate({ id: convId }); },
    onError: (e) => toast.error(e.message),
  });

  const labelMutation = trpc.conversations.addLabel.useMutation({
    onSuccess: () => { setNewLabel(""); setShowLabelInput(false); utils.conversations.getById.invalidate({ id: convId }); },
    onError: (e) => toast.error(e.message),
  });

  const takeoverMutation = trpc.conversations.takeOver.useMutation({
    onSuccess: () => { toast.success("👤 Você assumiu o controle do atendimento!"); utils.conversations.getById.invalidate({ id: convId }); utils.messages.list.invalidate({ conversationId: convId }); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const returnToAiMutation = trpc.conversations.returnToAI.useMutation({
    onSuccess: () => { toast.success("🤖 Atendimento devolvido para a IA!"); utils.conversations.getById.invalidate({ id: convId }); utils.messages.list.invalidate({ conversationId: convId }); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const aiMutation = trpc.ai.analyzeConversation.useMutation({
    onSuccess: () => { toast.success("Análise de IA concluída!"); utils.conversations.getById.invalidate({ id: convId }); },
    onError: (e) => toast.error(e.message),
  });

  const surveyMutation = trpc.surveys.create.useMutation({
    onSuccess: () => toast.success("Pesquisa enviada!"),
    onError: (e) => toast.error(e.message),
  });

  const { data: satisfactionRatingsList = [] } = trpc.satisfaction.getRatings.useQuery(
    { conversationId: convId },
    { enabled: !!convId }
  );

  // Templates (only fetch when modal is open and channel is whatsapp)
  const { data: templatesList = [], isLoading: isLoadingTemplates } = trpc.channels.listTemplates.useQuery(
    undefined,
    { enabled: showTemplate }
  );

  const sendTemplateMutation = trpc.channels.sendTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template enviado com sucesso!");
      setShowTemplate(false);
      setSelectedTemplate(null);
      setTemplateVariables([]);
      utils.conversations.getById.invalidate({ id: convId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages]);

  // Close emoji on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    }
    if (showEmoji) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmoji]);

  // Handlers
  function handleSend() {
    if (!message.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ conversationId: convId, content: message.trim(), isInternal });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Slash command popup controls
    if (slashQuery !== null) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        const filtered = (quickRepliesList as any[]).filter((qr: any) =>
          !slashQuery ||
          String(qr.shortcut ?? "").toLowerCase().startsWith(slashQuery) ||
          String(qr.title ?? "").toLowerCase().includes(slashQuery)
        );
        if (filtered.length > 0) {
          e.preventDefault();
          const qr = filtered[0];
          setMessage(prev => prev.replace(/(^|\s)\/\S*$/, (m, prefix) => prefix + qr.content));
          setSlashQuery(null);
          return;
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleEmojiClick(emojiData: EmojiClickData) {
    setMessage(prev => prev + emojiData.emoji);
    textareaRef.current?.focus();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadMedia(file, file.type, file.name);
      sendMutation.mutate({
        conversationId: convId,
        content: file.name,
        isInternal,
        mediaUrl: url,
        mediaType: file.type,
      } as any);
    } catch {
      toast.error("Erro ao enviar arquivo");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleStopRecording() {
    const blob = await stopRec();
    if (!blob) return;
    setIsUploading(true);
    try {
      if (transcribeMode) {
        // Upload then transcribe via server
        const url = await uploadMedia(blob, "audio/webm", `audio-${Date.now()}.webm`);
        const res = await fetch("/api/trpc/conversations.transcribeAudio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: { audioUrl: url } }),
        });
        const json = await res.json();
        const text = json?.result?.data?.json?.text;
        if (text) {
          setMessage(prev => prev ? prev + " " + text : text);
          toast.success("🎤 Áudio transcrito! Revise e envie.");
        } else {
          toast.error("Não foi possível transcrever o áudio");
        }
      } else {
        const url = await uploadMedia(blob, "audio/webm", `audio-${Date.now()}.webm`);
        sendMutation.mutate({
          conversationId: convId,
          content: `🎤 Áudio (${formatDuration(duration)})`,
          isInternal,
          mediaUrl: url,
          mediaType: "audio/webm",
        } as any);
      }
    } catch {
      toast.error("Erro ao processar áudio");
    } finally {
      setIsUploading(false);
    }
  }

  // ─── Loading / Não encontrado ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="col-span-2 h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!conv) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Atendimento não encontrado</p>
        <Button variant="ghost" className="mt-3" onClick={() => onBack ? onBack() : setLocation("/conversations")}>
          Voltar para atendimentos
        </Button>
      </div>
    );
  }

  const customer = conv.customer;
  const msgs = conv.messages ?? [];
  const labels = conv.labels ?? [];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={isEmbedded ? "flex flex-col h-full overflow-hidden bg-background" : "flex flex-col h-screen max-h-screen overflow-hidden bg-background"}>
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {!isEmbedded && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onBack ? onBack() : setLocation("/conversations")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}

          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {customer ? customer.name.charAt(0).toUpperCase() : "#"}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                {customer ? customer.name : `Atendimento #${conv.id}`}
              </span>
              <Badge className={`text-xs px-2 py-0 ${statusColors[conv.status] ?? ""}`}>
                {statusLabels[conv.status] ?? conv.status}
              </Badge>
              <Badge variant="outline" className="text-xs px-2 py-0 capitalize">
                {channelLabels[conv.channel] ?? conv.channel}
              </Badge>
              {conv.handledByAi && (
                <Badge className="text-xs px-2 py-0 bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300">
                  <Bot className="w-3 h-3 mr-1" /> IA
                </Badge>
              )}
            </div>
            {customer && <p className="text-xs text-muted-foreground">{customer.phone ?? customer.email ?? ""}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AI/Human control toggle */}
          {conv.handledByAi ? (
            <Button
              size="sm"
              className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white border-0 shadow-sm"
              onClick={() => takeoverMutation.mutate({ conversationId: convId })}
              disabled={takeoverMutation.isPending}
            >
              <User className="w-3.5 h-3.5 mr-1.5" />
              {takeoverMutation.isPending ? "Assumindo..." : "Assumir Controle"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              onClick={() => returnToAiMutation.mutate({ conversationId: convId })}
              disabled={returnToAiMutation.isPending}
            >
              <Bot className="w-3.5 h-3.5 mr-1.5" />
              {returnToAiMutation.isPending ? "Devolvendo..." : "Devolver para IA"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => aiMutation.mutate({ conversationId: convId })}
            disabled={aiMutation.isPending}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {aiMutation.isPending ? "Analisando..." : "Analisar IA"}
          </Button>
          <Select value={conv.status} onValueChange={v => statusMutation.mutate({ id: convId, status: v as any })}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Body: Chat + Right Panel ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Chat Column ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Archived conversation banner */}
          {conv.archivedAt && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 shrink-0">
              <span className="text-amber-600 dark:text-amber-400 text-sm">📦</span>
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-semibold">Conversa arquivada</span>
                {conv.archivedReason && <span className="ml-1 text-amber-600 dark:text-amber-400">— {conv.archivedReason}</span>}
                {conv.archivedAt && (
                  <span className="ml-1 text-amber-500 dark:text-amber-500">
                    em {new Date(conv.archivedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                )}
                <span className="ml-1 text-amber-500 dark:text-amber-500">. Histórico preservado automaticamente.</span>
              </div>
            </div>
          )}

          {/* AI/Human mode banner */}
          {conv.handledByAi ? (
            <div className="flex items-center justify-between px-4 py-1.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800 shrink-0">
              <div className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
                <Bot className="w-3.5 h-3.5" />
                <span className="font-medium">IA está atendendo</span>
                <span className="text-purple-500 dark:text-purple-400">— as mensagens estão sendo respondidas automaticamente</span>
              </div>
              <button
                onClick={() => takeoverMutation.mutate({ conversationId: convId })}
                disabled={takeoverMutation.isPending}
                className="text-xs text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 font-medium underline underline-offset-2"
              >
                {takeoverMutation.isPending ? "Assumindo..." : "Assumir agora"}
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
                onClick={() => returnToAiMutation.mutate({ conversationId: convId })}
                disabled={returnToAiMutation.isPending}
                className="text-xs text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 font-medium underline underline-offset-2"
              >
                {returnToAiMutation.isPending ? "Devolvendo..." : "Devolver para IA"}
              </button>
            </div>
          )}

          {/* Messages area — WhatsApp-style background */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-1.5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              backgroundColor: "hsl(var(--muted)/0.3)",
            }}
          >
            {/* Labels strip */}
            {labels.length > 0 && (
              <div className="flex gap-1.5 mb-2 flex-wrap justify-center">
                {labels.map(l => (
                  <span
                    key={l.id}
                    className="text-xs px-2.5 py-0.5 rounded-full border font-medium"
                    style={{ borderColor: l.color ?? "#6366f1", color: l.color ?? "#6366f1", background: `${l.color ?? "#6366f1"}15` }}
                  >
                    {l.label}
                  </span>
                ))}
              </div>
            )}

            {msgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
                  <Mail className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
                <p className="text-xs mt-1 opacity-60">Inicie a conversa abaixo</p>
              </div>
            ) : (
              msgs.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Area ── */}
          <div className="border-t bg-card shrink-0">
            {/* Mode tabs */}
            <div className="flex items-center gap-1 px-3 pt-2.5 pb-1">
              <button
                onClick={() => setIsInternal(false)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition-all ${
                  !isInternal
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Send className="w-3 h-3" /> Responder
              </button>
              <button
                onClick={() => setIsInternal(true)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition-all ${
                  isInternal
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Lock className="w-3 h-3" /> Nota Interna
              </button>

              <div className="flex-1" />

              {/* Action buttons */}
              <button
                onClick={() => setShowLabelInput(!showLabelInput)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                title="Adicionar etiqueta"
              >
                <Tag className="w-3 h-3" /> Etiqueta
              </button>
              <button
                onClick={() => setShowQuickReplies(!showQuickReplies)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                title="Respostas rápidas"
              >
                <Zap className="w-3 h-3" /> Rápidas
              </button>
              <button
                onClick={() => setShowSchedule(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                title="Agendar mensagem"
              >
                <Calendar className="w-3 h-3" /> Agendar
              </button>
              <button
                onClick={() => setShowForward(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                title="Encaminhar"
              >
                <Forward className="w-3 h-3" /> Encaminhar
              </button>
            </div>

            {/* Label input */}
            {showLabelInput && (
              <div className="flex gap-2 px-3 pb-1">
                <Input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Nome da etiqueta..."
                  className="h-8 text-sm"
                  onKeyDown={e => { if (e.key === "Enter" && newLabel) labelMutation.mutate({ conversationId: convId, label: newLabel }); }}
                />
                <Button size="sm" className="h-8" onClick={() => newLabel && labelMutation.mutate({ conversationId: convId, label: newLabel })}>
                  Adicionar
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowLabelInput(false)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Slash command popup (auto-triggered by "/" in textarea) */}
            {slashQuery !== null && (() => {
              const filtered = (quickRepliesList as any[]).filter(qr =>
                !slashQuery || String(qr.shortcut ?? "").toLowerCase().startsWith(slashQuery) ||
                String(qr.title ?? "").toLowerCase().includes(slashQuery) ||
                String(qr.content ?? "").toLowerCase().includes(slashQuery)
              );
              if (filtered.length === 0 && slashQuery.length === 0) return null;
              return (
                <div className="mx-3 mb-1 border rounded-xl bg-background shadow-xl max-h-52 overflow-y-auto z-40">
                  <div className="px-3 py-1.5 border-b flex items-center gap-1.5 sticky top-0 bg-background">
                    <Zap className="w-3 h-3 text-emerald-500" />
                    <span className="text-xs font-semibold text-muted-foreground">
                      Respostas Rápidas{slashQuery ? ` — /${slashQuery}` : ""}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">Esc para fechar</span>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground text-center">
                      Nenhuma resposta rápida encontrada para "/{slashQuery}".
                    </p>
                  ) : (
                    filtered.map((qr: any) => (
                      <button
                        key={qr.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors border-b last:border-0 group"
                        onMouseDown={e => {
                          e.preventDefault(); // prevent blur
                          // Replace the slash trigger with the reply content
                          setMessage(prev => prev.replace(/(^|\s)\/\S*$/, (m, prefix) => prefix + qr.content));
                          setSlashQuery(null);
                          setTimeout(() => textareaRef.current?.focus(), 0);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {qr.shortcut && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 shrink-0">
                              /{qr.shortcut}
                            </span>
                          )}
                          <span className="font-medium text-sm truncate">{qr.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{String(qr.content).substring(0, 80)}{String(qr.content).length > 80 ? "..." : ""}</p>
                      </button>
                    ))
                  )}
                </div>
              );
            })()}

            {/* Quick replies panel (via button) */}
            {showQuickReplies && slashQuery === null && (
              <div className="mx-3 mb-1 border rounded-xl bg-background shadow-lg max-h-44 overflow-y-auto">
                <div className="px-3 py-2 border-b flex items-center justify-between sticky top-0 bg-background">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Respostas Rápidas
                  </span>
                  <button onClick={() => setShowQuickReplies(false)}>
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
                {(quickRepliesList as any[]).length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground text-center">
                    Nenhuma resposta rápida. Configure em Configurações.
                  </p>
                ) : (
                  (quickRepliesList as any[]).map((qr) => (
                    <button
                      key={qr.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-0"
                      onClick={() => { setMessage(qr.content); setShowQuickReplies(false); textareaRef.current?.focus(); }}
                    >
                      <span className="font-medium text-emerald-600 text-xs">/{qr.shortcut}</span>
                      <span className="ml-2 text-muted-foreground text-xs">
                        {String(qr.content).substring(0, 70)}{String(qr.content).length > 70 ? "..." : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Main input row */}
            <div className={`flex items-end gap-2 px-3 pb-3 ${isInternal ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>

              {/* Emoji picker */}
              <div className="relative" ref={emojiRef}>
                <button
                  onClick={() => setShowEmoji(!showEmoji)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                  title="Emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-12 left-0 z-50 shadow-2xl rounded-2xl overflow-hidden">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      theme={"auto" as Theme}
                      height={380}
                      width={320}
                      searchPlaceholder="Pesquisar emoji..."
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                )}
              </div>

              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRecording}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
                title="Anexar arquivo"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = "image/*"; fileInputRef.current.click(); } }}
                disabled={isUploading || isRecording}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
                title="Enviar imagem"
              >
                <Image className="w-5 h-5" />
              </button>
              {/* Template button — only for WhatsApp conversations */}
              {conv.channel === "whatsapp" && (
                <button
                  onClick={() => setShowTemplate(true)}
                  disabled={isUploading || isRecording}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
                  title="Enviar template HSM"
                >
                  <LayoutTemplate className="w-5 h-5" />
                </button>
              )}

              {/* Text area or recording indicator */}
              {isRecording ? (
                <div className="flex-1 flex items-center gap-3 h-10 px-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                    Gravando... {formatDuration(duration)}
                  </span>
                </div>
              ) : (
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={e => {
                    const val = e.target.value;
                    setMessage(val);
                    // Slash command: detect "/" at start or after space
                    const slashMatch = val.match(/(^|\s)\/(\S*)$/);
                    if (slashMatch) {
                      setSlashQuery(slashMatch[2].toLowerCase());
                    } else {
                      setSlashQuery(null);
                    }
                  }}
                  placeholder={isInternal ? "Escreva uma nota interna (não visível ao cliente)..." : "Digite / para respostas rápidas ou uma mensagem..."}
                  className={`flex-1 min-h-[40px] max-h-32 resize-none text-sm rounded-2xl border-0 bg-muted/60 focus-visible:ring-1 focus-visible:ring-emerald-400 ${
                    isInternal ? "border border-amber-300 bg-amber-50/60 dark:bg-amber-900/10" : ""
                  }`}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
              )}

              {/* Audio / Send button */}
              {isRecording ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={cancelRec}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors text-muted-foreground"
                    title="Cancelar gravação"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleStopRecording}
                    disabled={isUploading}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors text-white shadow-md disabled:opacity-50"
                    title={transcribeMode ? "Parar e transcrever" : "Parar e enviar áudio"}
                  >
                    {transcribeMode ? <FileText className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              ) : message.trim() ? (
                <button
                  onClick={handleSend}
                  disabled={sendMutation.isPending || isUploading}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors text-white shadow-md disabled:opacity-50"
                  title="Enviar mensagem"
                >
                  <Send className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    onClick={startRec}
                    disabled={isUploading}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors text-white shadow-md disabled:opacity-50"
                    title={transcribeMode ? "Gravar e transcrever para texto" : "Gravar áudio"}
                  >
                    {transcribeMode ? <FileText className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setTranscribeMode(v => !v)}
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-colors"
                    style={transcribeMode
                      ? { background: "rgba(139,92,246,0.15)", color: "#7c3aed" }
                      : { background: "rgba(0,0,0,0.06)", color: "oklch(0.55 0.04 155)" }
                    }
                    title={transcribeMode ? "Modo: transcrever para texto" : "Modo: enviar áudio"}
                  >
                    {transcribeMode ? "Texto" : "Áudio"}
                  </button>
                </div>
              )}
            </div>

            <p className="text-center text-[10px] text-muted-foreground pb-2 opacity-60">
              Enter para enviar · Shift+Enter para nova linha · 🎤 Segure para gravar
            </p>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-72 border-l bg-card overflow-y-auto shrink-0">
          <div className="p-4 space-y-5">

            {/* Customer Info */}
            {customer ? (
              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                  Cliente
                </h3>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{customer.name}</p>
                      <Badge className={`text-xs px-1.5 py-0 mt-0.5 ${
                        customer.status === "Active" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" :
                        customer.status === "At Risk" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
                        customer.status === "Churned" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
                        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                      }`}>
                        {customer.status === "Active" ? "Ativo" :
                         customer.status === "At Risk" ? "Em Risco" :
                         customer.status === "Churned" ? "Cancelado" : customer.status}
                      </Badge>
                    </div>
                  </div>
                  {customer.email && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="truncate">{customer.email}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                  {customer.program && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                      <span>{customer.program}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-2">
                Sem cliente associado
              </div>
            )}

            {/* ── Contexto Rico ── */}
            {customer && (
              <>
                {/* Índice de Saúde */}
                {(customer as any).healthScore != null && (
                  <div className="bg-muted/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Índice de Saúde
                      </span>
                      <span className={`text-base font-bold ${
                        (customer as any).healthScore >= 70 ? "text-emerald-600" :
                        (customer as any).healthScore >= 40 ? "text-amber-600" : "text-red-500"
                      }`}>{Math.round((customer as any).healthScore)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          (customer as any).healthScore >= 70 ? "bg-emerald-500" :
                          (customer as any).healthScore >= 40 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, (customer as any).healthScore)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {(customer as any).healthScore >= 70 ? "Cliente saudável" :
                       (customer as any).healthScore >= 40 ? "Atenção necessária" : "Em risco de churn"}
                    </p>
                  </div>
                )}

                {/* MRR & Renovação */}
                {((customer as any).mrr || (customer as any).renewalDate) && (
                  <div className="grid grid-cols-2 gap-2">
                    {(customer as any).mrr > 0 && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2.5 text-center">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600 mx-auto mb-0.5" />
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          R$ {Number((customer as any).mrr).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">MRR</p>
                      </div>
                    )}
                    {(customer as any).renewalDate && (
                      <div className={`rounded-xl p-2.5 text-center ${
                        new Date((customer as any).renewalDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                          ? "bg-amber-50 dark:bg-amber-900/20"
                          : "bg-blue-50 dark:bg-blue-900/20"
                      }`}>
                        <RefreshCw className={`w-3.5 h-3.5 mx-auto mb-0.5 ${
                          new Date((customer as any).renewalDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                            ? "text-amber-600" : "text-blue-600"
                        }`} />
                        <p className={`text-xs font-bold ${
                          new Date((customer as any).renewalDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                            ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"
                        }`}>
                          {new Date((customer as any).renewalDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Renovação</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Último NPS */}
                {customer.npsScore != null && (
                  <div className="bg-muted/40 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Último NPS</span>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                      customer.npsScore >= 9 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                      customer.npsScore >= 7 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    }`}>
                      {customer.npsScore}/10 {customer.npsScore >= 9 ? "😊" : customer.npsScore >= 7 ? "😐" : "😞"}
                    </span>
                  </div>
                )}

                {/* LTV */}
                {customer.lifetimeValue != null && customer.lifetimeValue > 0 && (
                  <div className="bg-muted/40 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">LTV</span>
                    <span className="text-sm font-bold text-foreground">
                      R$ {Number(customer.lifetimeValue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Divider */}
            <div className="border-t" />

            {/* Análise de IA */}
            {conv.aiSummary && (
              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Análise de IA
                </h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Qualidade", value: conv.qualityScore },
                      { label: "Sentimento", value: conv.sentimentScore != null ? Math.round((conv.sentimentScore + 1) * 50) : null },
                      { label: "Upsell", value: conv.upsellOpportunity },
                      { label: "Indicação", value: conv.referralReadiness },
                    ].map(m => (
                      <div key={m.label} className="bg-muted/50 rounded-xl p-2 text-center">
                        <div className={`text-base font-bold ${
                          (m.value ?? 0) >= 70 ? "text-emerald-600" :
                          (m.value ?? 0) >= 50 ? "text-amber-600" : "text-red-500"
                        }`}>
                          {m.value != null ? `${Math.round(m.value)}` : "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {(conv as any).empathyScore != null && (
                    <div className="bg-muted/30 rounded-xl p-2.5 space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Qualidade Detalhada</p>
                      {[
                        { label: "Empatia", value: (conv as any).empathyScore },
                        { label: "Clareza", value: (conv as any).clarityScore },
                        { label: "Resolução", value: (conv as any).resolutionScore },
                        { label: "Conformidade", value: (conv as any).complianceScore },
                      ].map(d => (
                        <div key={d.label} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-20 shrink-0">{d.label}</span>
                          <div className="flex-1 bg-muted rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                (d.value ?? 0) >= 70 ? "bg-emerald-500" :
                                (d.value ?? 0) >= 50 ? "bg-amber-500" : "bg-red-500"
                              }`}
                              style={{ width: `${d.value ?? 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-medium w-6 text-right text-muted-foreground">
                            {d.value != null ? Math.round(d.value) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-muted/50 rounded-xl p-2.5">
                    <p className="text-xs text-muted-foreground leading-relaxed">{conv.aiSummary}</p>
                  </div>

                  {conv.aiRecommendations && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Coaching
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{conv.aiRecommendations}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t" />

            {/* Satisfaction Ratings */}
            {satisfactionRatingsList.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-500" /> Avaliação Pós-Atendimento
                </h3>
                <div className="space-y-1.5">
                  {satisfactionRatingsList.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
                      <span className="text-sm">{r.ratingLabel}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {satisfactionRatingsList.length > 0 && <div className="border-t" />}

            {/* Mini Journey Tasks */}
            {pendingTasks.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" /> Próximas Tarefas
                </h3>
                <div className="space-y-1.5">
                  {pendingTasks.map((t: any) => (
                    <div key={t.id} className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-2.5 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                        t.priority === 'critical' ? 'bg-red-500' :
                        t.priority === 'high' ? 'bg-amber-500' : 'bg-blue-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-amber-900 dark:text-amber-100 leading-snug truncate">{t.title}</p>
                        {t.dueDate && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            {new Date(t.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {pendingJourneyTasks.filter((t: any) => t.status === 'pending').length > 3 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      +{pendingJourneyTasks.filter((t: any) => t.status === 'pending').length - 3} mais tarefas
                    </p>
                  )}
                </div>
              </div>
            )}

            {pendingTasks.length > 0 && <div className="border-t" />}

            {/* Actions */}
            <div>
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Ações</h3>
              <div className="space-y-1.5">
                {customer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs justify-start h-8 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                    onClick={() => setLocation(`/customers?id=${customer.id}`)}
                  >
                    <User className="w-3.5 h-3.5 mr-2" />
                    Ver Perfil Completo
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs justify-start h-8"
                  onClick={() => customer && surveyMutation.mutate({ customerId: customer.id, conversationId: convId, type: "NPS" })}
                  disabled={!customer || surveyMutation.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                  Enviar Pesquisa NPS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs justify-start h-8"
                  onClick={() => customer && surveyMutation.mutate({ customerId: customer.id, conversationId: convId, type: "CSAT" })}
                  disabled={!customer || surveyMutation.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-2 text-blue-500" />
                  Enviar Pesquisa CSAT
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs justify-start h-8"
                  onClick={() => simulateMutation.mutate({ conversationId: convId, content: "Olá, preciso de ajuda com algo." })}
                >
                  <User className="w-3.5 h-3.5 mr-2 text-violet-500" />
                  Simular Msg do Cliente
                </Button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Timing Indicadores */}
            <div>
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Tempos & Indicadores
              </h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Criado em</span>
                  <span>{new Date(conv.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
                {conv.firstResponseAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">1ª Resposta</span>
                    <span className="font-semibold text-emerald-600">
                      {(() => {
                        const ms = new Date(conv.firstResponseAt).getTime() - new Date(conv.createdAt).getTime();
                        const min = Math.round(ms / 60000);
                        return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
                      })()}
                    </span>
                  </div>
                )}
                {conv.closedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tempo Total (TMA)</span>
                    <span className="font-semibold">
                      {(() => {
                        const ms = new Date(conv.closedAt).getTime() - new Date(conv.createdAt).getTime();
                        const min = Math.round(ms / 60000);
                        return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
                      })()}
                    </span>
                  </div>
                )}
                {conv.slaBreached && (
                  <div className="flex justify-between text-red-500">
                    <span>ANS</span>
                    <span className="font-semibold">⚠ Violado</span>
                  </div>
                )}
                {conv.closedAt && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Fechado em</span>
                    <span>{new Date(conv.closedAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Schedule Dialog ── */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Agendar Mensagem
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(scheduledList as any[]).filter(s => ["pending", "failed"].includes(s.status)).length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Histórico de Mensagens Agendadas</Label>
                <div className="mt-1 space-y-1.5 max-h-48 overflow-y-auto">
                  {(scheduledList as any[]).filter(s => ["pending", "failed"].includes(s.status)).map((s: any) => (
                    <div key={s.id} className={`rounded-lg p-2 text-xs border ${
                      s.status === "failed"
                        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-muted/50 border-transparent"
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium ${
                              s.status === "failed"
                                ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                            }`}>
                              {s.status === "failed" ? "❌ Falhou" : "⏳ Pendente"}
                            </span>
                            {s.retryCount > 0 && (
                              <span className="text-muted-foreground">{s.retryCount}x tentativa</span>
                            )}
                          </div>
                          <p className="truncate font-medium">{s.content}</p>
                          <p className="text-muted-foreground mt-0.5">
                            Agendado: {new Date(s.scheduledAt).toLocaleString("pt-BR")}
                          </p>
                          {s.status === "failed" && s.lastError && (
                            <p className="text-red-600 dark:text-red-400 mt-0.5 break-words">
                              ⚠️ {s.lastError}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          {s.status === "failed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                              onClick={() => retryScheduledMutation.mutate({ id: s.id })}
                              title="Tentar novamente em 5 minutos"
                              disabled={retryScheduledMutation.isPending}
                            >
                              🔄 Tentar
                            </Button>
                          )}
                          {s.status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 shrink-0"
                              onClick={() => cancelScheduledMutation.mutate({ id: s.id })}
                              title="Cancelar mensagem"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Mensagem</Label>
              <Textarea
                value={scheduleMsg}
                onChange={e => setScheduleMsg(e.target.value)}
                placeholder="Digite a mensagem..."
                rows={3}
              />
            </div>
            <div>
              <Label>Data e Hora do Envio</Label>
              <Input
                type="datetime-local"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancelar</Button>
              <Button
                disabled={!scheduleMsg.trim() || !scheduleDate || scheduleMessageMutation.isPending}
                onClick={() => scheduleMessageMutation.mutate({
                  conversationId: convId,
                  content: scheduleMsg.trim(),
                  scheduledAt: new Date(scheduleDate),
                })}
                className="gap-2 bg-emerald-500 hover:bg-emerald-600"
              >
                <Calendar className="w-4 h-4" /> Agendar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Template Dialog ── */}
      <Dialog open={showTemplate} onOpenChange={(open) => { setShowTemplate(open); if (!open) { setSelectedTemplate(null); setTemplateVariables([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-emerald-600" /> Enviar Template HSM
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedTemplate ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Selecione um template aprovado pela Meta para enviar ao cliente.
                  Templates são obrigatórios para iniciar conversas após 24h de inatividade.
                </p>
                {isLoadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-sm text-muted-foreground animate-pulse">Carregando templates...</span>
                  </div>
                ) : templatesList.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <LayoutTemplate className="w-10 h-10 mx-auto text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Nenhum template encontrado.</p>
                    <p className="text-xs text-muted-foreground">
                      Configure o Business Account ID em{" "}
                      <a href="/integrations" className="text-emerald-600 hover:underline">Integrações</a>{" "}
                      e crie templates em{" "}
                      <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">Meta Business Manager</a>.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {(templatesList as any[]).filter(t => t.status === 'APPROVED').map((tmpl: any) => (
                      <button
                        key={`${tmpl.name}-${tmpl.language}`}
                        onClick={() => {
                          setSelectedTemplate({ name: tmpl.name, language: tmpl.language, components: tmpl.components ?? [] });
                          // Pre-fill variables array based on body component placeholders
                          const body = (tmpl.components ?? []).find((c: any) => c.type === 'BODY');
                          const text = body?.text ?? '';
                          const matches = text.match(/\{\{\d+\}\}/g) ?? [];
                          setTemplateVariables(matches.map(() => ''));
                        }}
                        className="w-full text-left p-3 rounded-xl border hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{tmpl.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{tmpl.language}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {(tmpl.components ?? []).find((c: any) => c.type === 'BODY')?.text ?? 'Sem prévia disponível'}
                        </p>
                      </button>
                    ))}
                    {(templatesList as any[]).filter(t => t.status !== 'APPROVED').length > 0 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">
                        {(templatesList as any[]).filter(t => t.status !== 'APPROVED').length} template(s) pendente(s) de aprovação oculto(s)
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-muted/50 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{selectedTemplate.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{selectedTemplate.language}</span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {(selectedTemplate.components as any[]).find((c: any) => c.type === 'BODY')?.text ?? ''}
                  </p>
                </div>
                {templateVariables.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Preencha as variáveis do template:</Label>
                    {templateVariables.map((val, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12 shrink-0">{`{{${idx + 1}}}`}</span>
                        <Input
                          value={val}
                          onChange={e => setTemplateVariables(prev => prev.map((v, i) => i === idx ? e.target.value : v))}
                          placeholder={`Valor para {{${idx + 1}}}`}
                          className="text-sm h-8"
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => { setSelectedTemplate(null); setTemplateVariables([]); }}>
                    Voltar
                  </Button>
                  <Button
                    disabled={sendTemplateMutation.isPending || !customer?.phone}
                    onClick={() => {
                      if (!customer?.phone) { toast.error('Cliente sem número de telefone'); return; }
                      sendTemplateMutation.mutate({
                        to: customer.phone,
                        templateName: selectedTemplate.name,
                        languageCode: selectedTemplate.language,
                        variables: templateVariables.filter(v => v.trim()),
                        conversationId: convId,
                      });
                    }}
                    className="gap-2 bg-emerald-500 hover:bg-emerald-600"
                  >
                    {sendTemplateMutation.isPending ? (
                      <><span className="animate-spin">&#8987;</span> Enviando...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Enviar Template</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Forward Dialog ── */}
      <Dialog open={showForward} onOpenChange={(open) => { setShowForward(open); if (!open) { setForwardAgentId(null); setForwardReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Forward className="w-4 h-4 text-emerald-600" /> Transferir Atendimento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Selecione o agente que irá assumir este atendimento:</p>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {(teamMembers as any[]).map((member) => (
                <button
                  key={member.id}
                  onClick={() => setForwardAgentId(member.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    forwardAgentId === member.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm"
                      : "hover:bg-muted border-transparent hover:border-border"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                    forwardAgentId === member.id ? "bg-emerald-500 text-white" : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                  }`}>
                    {String(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium">{member.name ?? member.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{member.role === 'admin' ? 'Administrador' : 'Agente'}</p>
                  </div>
                  {forwardAgentId === member.id && (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Motivo da transferência (opcional)</Label>
              <Input
                placeholder="Ex: especialista em cobranças, cliente VIP..."
                value={forwardReason}
                onChange={e => setForwardReason(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForward(false)}>Cancelar</Button>
              <Button
                disabled={!forwardAgentId || forwardMutation.isPending}
                onClick={() => forwardAgentId && forwardMutation.mutate({ conversationId: convId, agentId: forwardAgentId, reason: forwardReason || undefined })}
                className="gap-2 bg-emerald-500 hover:bg-emerald-600"
              >
                {forwardMutation.isPending ? (
                  <><span className="animate-spin">&#8987;</span> Transferindo...</>
                ) : (
                  <><Forward className="w-4 h-4" /> Transferir</>  
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
