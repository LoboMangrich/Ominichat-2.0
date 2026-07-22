import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckSquare, Plus, Clock, AlertTriangle, CheckCircle2, Circle, Trash2,
  Paperclip, Calendar, ExternalLink, Users, Filter, BarChart2, X, Upload,
  FileText, Image as ImageIcon, Download, Bell
} from "lucide-react";
import { toast } from "sonner";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "⚪ Baixa", medium: "🔵 Média", high: "🟠 Alta", urgent: "🔴 Urgente",
};

const TEAM_COLORS: Record<string, string> = {
  IPL: "bg-purple-100 text-purple-700",
  MCM: "bg-blue-100 text-blue-700",
  RCC: "bg-green-100 text-green-700",
  Geral: "bg-slate-100 text-slate-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  cliente: "👤 Cliente", contrato: "📄 Contrato", onboarding: "🚀 Onboarding",
  reuniao: "📅 Reunião", passagem: "✈️ Passagem", midia: "📢 Mídia",
  contratacao: "💼 Contratação", outro: "📌 Outro",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <Circle className="w-4 h-4 text-muted-foreground" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  cancelled: <AlertTriangle className="w-4 h-4 text-gray-400" />,
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("pt-BR");
}

function isOverdue(date: Date | string | null | undefined, status: string): boolean {
  if (!date || status === "done" || status === "cancelled") return false;
  return new Date(date) < new Date();
}

function generateGoogleCalendarLink(task: {
  title: string;
  description?: string | null;
  dueDate?: Date | string | null;
  meetingLink?: string | null;
}): string {
  const title = encodeURIComponent(task.title);
  const details = encodeURIComponent(
    [task.description, task.meetingLink ? `Link: ${task.meetingLink}` : ""].filter(Boolean).join("\n")
  );
  const dateStr = task.dueDate
    ? new Date(task.dueDate).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${dateStr}/${dateStr}`;
}

// ─── Task Attachments Panel ────────────────────────────────────────────────────
function TaskAttachmentsPanel({ taskId }: { taskId: number }) {
  const utils = trpc.useUtils();
  const { data: attachments = [] } = trpc.taskAttachments.list.useQuery({ taskId });
  const createAttachment = trpc.taskAttachments.create.useMutation({
    onSuccess: () => { toast.success("Anexo adicionado!"); utils.taskAttachments.list.invalidate({ taskId }); },
    onError: () => toast.error("Erro ao adicionar anexo"),
  });
  const deleteAttachment = trpc.taskAttachments.delete.useMutation({
    onSuccess: () => { toast.success("Anexo removido"); utils.taskAttachments.list.invalidate({ taskId }); },
    onError: () => toast.error("Erro ao remover anexo"),
  });
  const [uploading, setUploading] = useState(false);
  const [attachType, setAttachType] = useState<"contrato" | "reuniao" | "grupo" | "outro">("outro");

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const key = `task-attachments/${taskId}/${Date.now()}-${file.name}`;
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, mimeType: file.type, data: Array.from(buffer) }),
      });
      if (!response.ok) throw new Error("Upload failed");
      const { url, fileKey } = await response.json();
      await createAttachment.mutateAsync({
        taskId,
        fileName: file.name,
        fileUrl: url,
        fileKey,
        fileSize: file.size,
        mimeType: file.type,
        attachmentType: attachType,
      });
    } catch {
      toast.error("Erro no upload. Tente novamente.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const typeLabel: Record<string, string> = { contrato: "📄 Contrato", reuniao: "📅 Reunião", grupo: "👥 Grupo", outro: "📎 Outro" };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={attachType} onValueChange={(v) => setAttachType(v as any)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contrato">📄 Contrato</SelectItem>
            <SelectItem value="reuniao">📅 Reunião</SelectItem>
            <SelectItem value="grupo">👥 Grupo</SelectItem>
            <SelectItem value="outro">📎 Outro</SelectItem>
          </SelectContent>
        </Select>
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border border-dashed border-muted-foreground/40 hover:border-primary/60 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload className="w-3 h-3" />
          {uploading ? "Enviando..." : "Anexar arquivo"}
          <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx" />
        </label>
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 group">
              {att.mimeType?.startsWith("image/") ? <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <span className="text-xs flex-1 truncate">{att.fileName}</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0">{typeLabel[att.attachmentType ?? "outro"]}</Badge>
              <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Download className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
              </a>
              <button onClick={() => deleteAttachment.mutate({ id: att.id })} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onStatusChange, onDelete }: {
  task: any;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = isOverdue(task.dueDate, task.status);

  return (
    <Card className={`transition-all ${task.status === "done" ? "opacity-60" : ""} ${overdue ? "border-red-200" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => onStatusChange(task.id, task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo")} className="mt-0.5 shrink-0">
            {STATUS_ICONS[task.status]}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-medium text-sm ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {task.title}
              </span>
              <Badge className={`text-xs ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</Badge>
              {task.team && task.team !== "Geral" && (
                <Badge className={`text-xs ${TEAM_COLORS[task.team]}`}>{task.team}</Badge>
              )}
              {task.category && task.category !== "outro" && (
                <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[task.category]}</span>
              )}
              {task.dueDate && (
                <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  <Clock className="w-3 h-3" />
                  {overdue ? "⚠️ " : ""}{formatDate(task.dueDate)}
                </span>
              )}
              {task.customerName && (
                <span className="text-xs text-muted-foreground">👤 {task.customerName}</span>
              )}
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
            )}
            {task.assignedUserName && (
              <p className="text-xs text-muted-foreground mt-0.5">Responsável: {task.assignedUserName}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {task.dueDate && (
              <a href={generateGoogleCalendarLink(task)} target="_blank" rel="noopener noreferrer" title="Adicionar ao Google Agenda">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-blue-600">
                  <Calendar className="w-3.5 h-3.5" />
                </Button>
              </a>
            )}
            {task.meetingLink && (
              <a href={task.meetingLink} target="_blank" rel="noopener noreferrer" title="Abrir link da reunião">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-green-600">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => setExpanded(!expanded)} title="Anexos">
              <Paperclip className="w-3.5 h-3.5" />
            </Button>
            <Select value={task.status} onValueChange={v => onStatusChange(task.id, v)}>
              <SelectTrigger className="w-[130px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">A Fazer</SelectItem>
                <SelectItem value="in_progress">Em Andamento</SelectItem>
                <SelectItem value="done">Concluído</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(task.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t border-muted">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Paperclip className="w-3 h-3" /> Anexos
            </p>
            <TaskAttachmentsPanel taskId={task.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Task Dialog ────────────────────────────────────────────────────────
function CreateTaskDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium" as const,
    dueDate: "", team: "Geral" as const, category: "outro" as const,
    meetingLink: "",
  });

  const createMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Tarefa criada!");
      setOpen(false);
      setForm({ title: "", description: "", priority: "medium", dueDate: "", team: "Geral", category: "outro", meetingLink: "" });
      onCreated();
    },
    onError: () => toast.error("Erro ao criar tarefa"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="w-4 h-4" /> Nova Tarefa</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar Nova Tarefa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input placeholder="Ex: Ligar para cliente sobre renovação" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea placeholder="Detalhes da tarefa..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Equipe</Label>
              <Select value={form.team} onValueChange={v => setForm(p => ({ ...p, team: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IPL">IPL</SelectItem>
                  <SelectItem value="MCM">MCM</SelectItem>
                  <SelectItem value="RCC">RCC</SelectItem>
                  <SelectItem value="Geral">Geral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">⚪ Baixa</SelectItem>
                  <SelectItem value="medium">🔵 Média</SelectItem>
                  <SelectItem value="high">🟠 Alta</SelectItem>
                  <SelectItem value="urgent">🔴 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Link da Reunião (opcional)</Label>
            <Input placeholder="https://meet.google.com/..." value={form.meetingLink} onChange={e => setForm(p => ({ ...p, meetingLink: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({
                title: form.title,
                description: form.description || undefined,
                priority: form.priority,
                dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
                team: form.team,
                category: form.category,
                meetingLink: form.meetingLink || undefined,
              })}
              disabled={!form.title.trim() || createMutation.isPending}
            >
              Criar Tarefa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Tasks() {
  const [activeTeam, setActiveTeam] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();

  const { data: taskList = [], isLoading } = trpc.tasks.list.useQuery({
    team: activeTeam !== "all" ? activeTeam as any : undefined,
    status: statusFilter !== "all" && statusFilter !== "active" ? statusFilter as any : undefined,
  });

  const { data: teamStats = [] } = trpc.tasks.getTeamStats.useQuery();

  const updateStatusMutation = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
    onError: () => toast.error("Erro ao atualizar tarefa"),
  });

  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => { toast.success("Tarefa removida"); utils.tasks.list.invalidate(); },
    onError: () => toast.error("Erro ao remover tarefa"),
  });

  const checkOverdueMutation = trpc.journeyTasks.checkAndNotifyOverdue.useMutation({
    onSuccess: (data) => {
      if (data.notified > 0) {
        toast.success(`⚠️ ${data.notified} tarefa(s) vencida(s) notificadas ao dono`);
      } else {
        toast.success('Nenhuma tarefa de jornada vencida encontrada!');
      }
    },
    onError: () => toast.error('Erro ao verificar tarefas vencidas'),
  });

  const filteredTasks = useMemo(() => {
    return taskList.filter(t => {
      if (statusFilter === "active" && (t.status === "done" || t.status === "cancelled")) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
          !(t.customerName?.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [taskList, statusFilter, categoryFilter, search]);

  // Compute team stats from server data
  const teamCounts = useMemo(() => {
    const counts: Record<string, { todo: number; in_progress: number; done: number; total: number }> = {};
    for (const row of teamStats) {
      const team = row.team ?? "Geral";
      if (!counts[team]) counts[team] = { todo: 0, in_progress: 0, done: 0, total: 0 };
      counts[team][row.status as keyof typeof counts[string]] = (row.count as number) ?? 0;
      counts[team].total += (row.count as number) ?? 0;
    }
    return counts;
  }, [teamStats]);

  const todoCount = filteredTasks.filter(t => t.status === "todo").length;
  const inProgressCount = filteredTasks.filter(t => t.status === "in_progress").length;
  const overdueCount = filteredTasks.filter(t => isOverdue(t.dueDate, t.status)).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-primary" />
            Tarefas do Time
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie tarefas de todas as equipes — IPL, MCM, RCC
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
            onClick={() => checkOverdueMutation.mutate()}
            disabled={checkOverdueMutation.isPending}
          >
            <Bell className="w-3.5 h-3.5" />
            {checkOverdueMutation.isPending ? 'Verificando...' : 'Verificar Vencidas'}
          </Button>
          <CreateTaskDialog onCreated={() => utils.tasks.list.invalidate()} />
        </div>
      </div>

      {/* Team Tabs */}
      <Tabs value={activeTeam} onValueChange={setActiveTeam}>
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="all" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Todas as Equipes
            <Badge variant="secondary" className="text-xs ml-1">{taskList.length}</Badge>
          </TabsTrigger>
          {["IPL", "MCM", "RCC", "Geral"].map(team => (
            <TabsTrigger key={team} value={team} className="gap-1.5">
              <span className={`w-2 h-2 rounded-full ${team === "IPL" ? "bg-purple-500" : team === "MCM" ? "bg-blue-500" : team === "RCC" ? "bg-green-500" : "bg-slate-400"}`} />
              {team}
              {teamCounts[team] && (
                <Badge variant="secondary" className="text-xs ml-1">{teamCounts[team].total}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <Card className="border-l-4 border-l-slate-400">
            <CardContent className="p-3 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">A Fazer</p><p className="text-xl font-bold">{todoCount}</p></div>
              <Circle className="w-6 h-6 text-slate-400" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Em Andamento</p><p className="text-xl font-bold text-blue-600">{inProgressCount}</p></div>
              <Clock className="w-6 h-6 text-blue-400" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-3 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Atrasadas</p><p className="text-xl font-bold text-red-600">{overdueCount}</p></div>
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Total (visíveis)</p><p className="text-xl font-bold text-green-600">{filteredTasks.length}</p></div>
              <BarChart2 className="w-6 h-6 text-green-400" />
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap mt-4">
          <Input
            placeholder="Buscar por título ou cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-[240px]"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativas (A Fazer + Em Andamento)</SelectItem>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="todo">A Fazer</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="done">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Task List */}
        <TabsContent value={activeTeam} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Nenhuma tarefa encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">Crie uma nova tarefa para começar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status: status as any })}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
