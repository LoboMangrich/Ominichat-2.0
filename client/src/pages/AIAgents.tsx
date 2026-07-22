import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart2,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  all: "Todos os canais",
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
  telegram: "Telegram",
};

const CHANNEL_COLORS: Record<string, string> = {
  all: "bg-violet-100 text-violet-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  email: "bg-blue-100 text-blue-700",
  instagram: "bg-pink-100 text-pink-700",
  telegram: "bg-sky-100 text-sky-700",
};

const CONDITION_TYPES = [
  { value: "no_interaction_days",    label: "Sem interação por X dias",     icon: Clock,         color: "text-orange-600", bg: "bg-orange-50",   placeholder: "Ex: 5" },
  { value: "health_score_below",     label: "Índice de Saúde abaixo de X",    icon: TrendingDown,  color: "text-red-600",    bg: "bg-red-50",      placeholder: "Ex: 40" },
  { value: "health_score_above",     label: "Índice de Saúde acima de X",     icon: TrendingUp,    color: "text-green-600",  bg: "bg-green-50",    placeholder: "Ex: 75" },
  { value: "nps_score_below",        label: "NPS abaixo de X",             icon: Star,          color: "text-amber-600",  bg: "bg-amber-50",    placeholder: "Ex: 7" },
  { value: "nps_score_above",        label: "NPS acima de X",              icon: Star,          color: "text-emerald-600",bg: "bg-emerald-50",  placeholder: "Ex: 8" },
  { value: "renewal_days_remaining", label: "Renovação em X dias",         icon: RefreshCw,     color: "text-blue-600",   bg: "bg-blue-50",     placeholder: "Ex: 30" },
  { value: "tag_added",              label: "Tag adicionada",              icon: Tag,           color: "text-purple-600", bg: "bg-purple-50",   placeholder: "Ex: em-risco" },
  { value: "status_changed",         label: "Status mudou para",           icon: AlertTriangle, color: "text-cyan-600",   bg: "bg-cyan-50",     placeholder: "Ex: churned" },
] as const;

const ACTION_TYPES = [
  { value: "send_ai_message",         label: "IA envia mensagem",           icon: MessageSquare, color: "text-emerald-600", bg: "bg-emerald-50" },
  { value: "create_supervision_item", label: "Criar item de supervisão",    icon: CheckCircle2,  color: "text-blue-600",    bg: "bg-blue-50" },
  { value: "update_status",           label: "Atualizar status do cliente", icon: RefreshCw,     color: "text-amber-600",   bg: "bg-amber-50" },
  { value: "assign_playbook",         label: "Iniciar playbook",            icon: Play,          color: "text-purple-600",  bg: "bg-purple-50" },
  { value: "create_task",             label: "Criar tarefa para o time",    icon: CheckCircle2,  color: "text-orange-600",  bg: "bg-orange-50" },
  { value: "send_nps",                label: "Enviar pesquisa NPS",         icon: Star,          color: "text-cyan-600",    bg: "bg-cyan-50" },
] as const;

type ConditionType = typeof CONDITION_TYPES[number]["value"];
type ActionType = typeof ACTION_TYPES[number]["value"];

function getAutoAvatar(name: string): string {
  const encoded = encodeURIComponent(name.trim() || "AI");
  return `https://ui-avatars.com/api/?name=${encoded}&background=6366f1&color=fff&size=128&bold=true&rounded=true`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AIAgents() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const { data: agents = [], refetch: refetchAgents } = trpc.aiAgents.list.useQuery();
  const { data: stats } = trpc.aiAgents.getStats.useQuery();

  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    channel: "all" as "all" | "whatsapp" | "email" | "instagram" | "telegram",
    systemPrompt: "",
    greetingMessage: "",
    escalationMessage: "",
    escalationThreshold: 70,
    maxAutoReplies: 5,
    avatarUrl: "",
    programFilter: "",
  });

  const createMutation = trpc.aiAgents.create.useMutation({
    onSuccess: () => { toast.success("Agente criado com sucesso!"); setCreateOpen(false); refetchAgents(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.aiAgents.update.useMutation({
    onSuccess: () => { toast.success("Agente atualizado!"); setEditOpen(false); refetchAgents(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.aiAgents.delete.useMutation({
    onSuccess: () => { toast.success("Agente removido!"); refetchAgents(); setSelectedAgent(null); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.aiAgents.update.useMutation({
    onSuccess: () => { refetchAgents(); },
  });

  const seedDefaultsMutation = trpc.aiAgents.seedDefaults.useMutation({
    onSuccess: (data) => {
      if ("skipped" in data && data.skipped) {
        toast.info("Agentes já existem no sistema.");
      } else {
        toast.success("6 agentes especializados criados!");
        refetchAgents();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedAgentData = agents.find(a => a.id === selectedAgent);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Brain className="w-6 h-6 text-violet-600" />
            Agentes de IA
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Configure cada agente: quem é, o que sabe e quando age proativamente.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {agents.length === 0 && (
              <Button
                variant="outline"
                className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => seedDefaultsMutation.mutate()}
                disabled={seedDefaultsMutation.isPending}
              >
                <Zap className="w-4 h-4" />
                {seedDefaultsMutation.isPending ? "Criando..." : "Criar Agentes Padrão"}
              </Button>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-violet-600 hover:bg-violet-700">
                  <Plus className="w-4 h-4" /> Novo Agente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Criar Novo Agente de IA</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
                    <div className="w-14 h-14 rounded-full border-2 border-violet-200 overflow-hidden bg-violet-100 flex items-center justify-center shrink-0">
                      {(form.avatarUrl || form.name) ? (
                        <img src={form.avatarUrl || getAutoAvatar(form.name)} alt="avatar" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <Bot className="w-7 h-7 text-violet-500" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">URL da Foto/Avatar</Label>
                      <Input placeholder="https://exemplo.com/foto.jpg" value={form.avatarUrl} onChange={e => setForm(f => ({ ...f, avatarUrl: e.target.value }))} />
                      <p className="text-xs text-gray-400">Deixe em branco para gerar automaticamente</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nome do Agente *</Label>
                      <Input placeholder="ex: Sofia" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Canal</Label>
                      <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v as typeof form.channel }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input placeholder="Descreva o propósito deste agente" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Programa / Produto <span className="text-gray-400 font-normal">(opcional)</span></Label>
                    <Input placeholder="ex: Premium, Básico, todos" value={form.programFilter} onChange={e => setForm(f => ({ ...f, programFilter: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Prompt do Sistema</Label>
                    <Textarea className="min-h-[100px]" placeholder="Você é um assistente de CS especializado em..." value={form.systemPrompt} onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem de Boas-vindas</Label>
                    <Textarea className="min-h-[70px]" placeholder="Olá, {{nome}}! Sou a assistente virtual..." value={form.greetingMessage} onChange={e => setForm(f => ({ ...f, greetingMessage: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Threshold de Escalada (%)</Label>
                      <Input type="number" min={0} max={100} value={form.escalationThreshold} onChange={e => setForm(f => ({ ...f, escalationThreshold: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Máx. Respostas Auto.</Label>
                      <Input type="number" min={1} max={50} value={form.maxAutoReplies} onChange={e => setForm(f => ({ ...f, maxAutoReplies: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                    <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending}>
                      {createMutation.isPending ? "Criando..." : "Criar Agente"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total de Agentes", value: stats?.totalAgents ?? 0, icon: Bot, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Agentes Ativos", value: stats?.activeAgents ?? 0, icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Atendidos pela IA", value: stats?.aiHandledConversations ?? 0, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Escaladas p/ Humano", value: stats?.escalations ?? 0, icon: ChevronRight, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-gray-800">{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Agents List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Seus Agentes</h2>
          {agents.length === 0 ? (
            <div className="glass-card p-8 text-center border-dashed">
              <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nenhum agente criado ainda.</p>
              {isAdmin && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Criar primeiro agente
                </Button>
              )}
            </div>
          ) : (
            agents.map(agent => (
              <div
                key={agent.id}
                className={`glass-card p-4 cursor-pointer transition-all hover:shadow-md ${selectedAgent === agent.id ? "ring-2 ring-violet-500" : ""}`}
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full overflow-hidden border-2 flex items-center justify-center shrink-0 ${agent.isActive ? "border-violet-300 bg-violet-50" : "border-gray-200 bg-gray-50"}`}>
                      <img src={agent.avatarUrl || getAutoAvatar(agent.name)} alt={agent.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{agent.name}</p>
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[agent.channel] ?? "bg-gray-100 text-gray-600"}`}>
                          {CHANNEL_LABELS[agent.channel] ?? agent.channel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${agent.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {agent.isActive ? "Ativo" : "Inativo"}
                  </span>
                </div>
                {agent.description && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{agent.description}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Agent Detail */}
        <div className="lg:col-span-2">
          {!selectedAgentData ? (
            <div className="glass-card p-12 text-center flex flex-col items-center justify-center h-full min-h-[300px] border-dashed">
              <Brain className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 text-sm">Selecione um agente para ver e configurar seus detalhes.</p>
            </div>
          ) : (
            <div className="glass-card">
              {/* Agent Header */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-violet-200 bg-violet-50 flex items-center justify-center shrink-0">
                      <img src={selectedAgentData.avatarUrl || getAutoAvatar(selectedAgentData.name)} alt={selectedAgentData.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">{selectedAgentData.name}</h3>
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[selectedAgentData.channel] ?? "bg-gray-100 text-gray-600"}`}>
                          {CHANNEL_LABELS[selectedAgentData.channel] ?? selectedAgentData.channel}
                        </span>
                        {selectedAgentData.programFilter && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {selectedAgentData.programFilter}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: selectedAgentData.id, isActive: !selectedAgentData.isActive })}>
                        {selectedAgentData.isActive ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => { if (confirm("Remover este agente?")) deleteMutation.mutate({ id: selectedAgentData.id }); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="p-5">
                <Tabs defaultValue="perfil">
                  <TabsList className="mb-5 bg-gray-100">
                    <TabsTrigger value="perfil" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      <UserCheck className="w-4 h-4" /> Perfil
                    </TabsTrigger>
                    <TabsTrigger value="conhecimento" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      <BookOpen className="w-4 h-4" /> Conhecimento
                    </TabsTrigger>
                    <TabsTrigger value="quando-agir" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      <Zap className="w-4 h-4" /> Ações Proativas
                    </TabsTrigger>
                    <TabsTrigger value="atividade" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      <BarChart2 className="w-4 h-4" /> Atividade
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Aba Perfil ── */}
                  <TabsContent value="perfil" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3 rounded-xl bg-gray-50">
                        <p className="text-xs text-gray-400 mb-1">Threshold de Escalada</p>
                        <p className="font-semibold text-gray-800">{selectedAgentData.escalationThreshold ?? 70}%</p>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-50">
                        <p className="text-xs text-gray-400 mb-1">Máx. Respostas Auto.</p>
                        <p className="font-semibold text-gray-800">{selectedAgentData.maxAutoReplies ?? 5} mensagens</p>
                      </div>
                    </div>
                    {selectedAgentData.description && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Descrição</p>
                        <div className="p-3 rounded-xl bg-gray-50 text-sm text-gray-700">{selectedAgentData.description}</div>
                      </div>
                    )}
                    {selectedAgentData.systemPrompt && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Prompt do Sistema</p>
                        <div className="p-3 rounded-xl bg-gray-50 text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{selectedAgentData.systemPrompt}</div>
                      </div>
                    )}
                    {selectedAgentData.greetingMessage && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mensagem de Boas-vindas</p>
                        <div className="p-3 rounded-xl bg-emerald-50 text-sm text-emerald-800 border border-emerald-100">{selectedAgentData.greetingMessage}</div>
                      </div>
                    )}
                    {selectedAgentData.escalationMessage && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mensagem de Escalada</p>
                        <div className="p-3 rounded-xl bg-amber-50 text-sm text-amber-800 border border-amber-100">{selectedAgentData.escalationMessage}</div>
                      </div>
                    )}
                    {!selectedAgentData.systemPrompt && !selectedAgentData.greetingMessage && (
                      <p className="text-sm text-gray-400 text-center py-6">Nenhuma configuração avançada definida. Clique em editar para personalizar.</p>
                    )}
                  </TabsContent>

                  {/* ── Aba Conhecimento ── */}
                  <TabsContent value="conhecimento">
                    <KnowledgeBaseTab agentId={selectedAgentData.id} isAdmin={isAdmin} />
                  </TabsContent>

                  {/* ── Aba Ações Proativas ── */}
                  <TabsContent value="quando-agir">
                    <WhenToActTab agentId={selectedAgentData.id} agentName={selectedAgentData.name} isAdmin={isAdmin} />
                  </TabsContent>

                  {/* ── Aba Atividade ── */}
                  <TabsContent value="atividade">
                    <AgentActivityLog agentId={selectedAgentData.id} agentName={selectedAgentData.name} />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Agent Dialog */}
      {selectedAgentData && (
        <EditAgentDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          agent={selectedAgentData}
          onSave={(data) => updateMutation.mutate({ id: selectedAgentData.id, ...data })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Aba: Quando Agir ─────────────────────────────────────────────────────────

function WhenToActTab({ agentId, agentName, isAdmin }: { agentId: number; agentName: string; isAdmin: boolean }) {
  const { data: triggers = [], refetch } = trpc.triggerRules.listByAgent.useQuery({ agentId });

  const createMutation = trpc.triggerRules.create.useMutation({
    onSuccess: () => { toast.success("Gatilho criado!"); setAddOpen(false); resetForm(); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.triggerRules.update.useMutation({
    onSuccess: () => { toast.success("Gatilho atualizado!"); setEditingId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.triggerRules.delete.useMutation({
    onSuccess: () => { toast.success("Gatilho removido!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const emptyForm = {
    name: "",
    description: "",
    conditionType: "no_interaction_days" as ConditionType,
    conditionValue: "",
    actionType: "create_supervision_item" as ActionType,
    messageTemplate: "",
    program: "",
    isActive: true,
  };

  const [form, setForm] = useState(emptyForm);

  function resetForm() {
    setForm(emptyForm);
  }

  function startEdit(rule: typeof triggers[number]) {
    setForm({
      name: rule.name,
      description: rule.description ?? "",
      conditionType: rule.conditionType as ConditionType,
      conditionValue: rule.conditionValue,
      actionType: rule.actionType as ActionType,
      messageTemplate: (rule.actionConfig as any)?.messageTemplate ?? "",
      program: rule.program ?? "",
      isActive: rule.isActive,
    });
    setEditingId(rule.id);
  }

  function submitCreate() {
    createMutation.mutate({
      name: form.name,
      description: form.description || undefined,
      conditionType: form.conditionType,
      conditionValue: form.conditionValue,
      actionType: form.actionType,
      actionConfig: form.messageTemplate ? { messageTemplate: form.messageTemplate } : undefined,
      agentId,
      program: form.program || undefined,
      isActive: form.isActive,
    });
  }

  function submitEdit() {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      name: form.name,
      description: form.description || undefined,
      conditionType: form.conditionType,
      conditionValue: form.conditionValue,
      actionType: form.actionType,
      actionConfig: form.messageTemplate ? { messageTemplate: form.messageTemplate } : undefined,
      agentId,
      program: form.program || undefined,
      isActive: form.isActive,
    });
  }

  const conditionPlaceholder = CONDITION_TYPES.find(c => c.value === form.conditionType)?.placeholder ?? "Valor";

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="p-3 rounded-xl bg-violet-50 border border-violet-100 flex items-start gap-3">
        <Zap className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-violet-800">Gatilhos proativos da {agentName}</p>
          <p className="text-xs text-violet-600 mt-0.5">
            Defina as condições que fazem a {agentName} agir automaticamente. Quando a condição for detectada, a ação configurada será executada.
          </p>
        </div>
      </div>

      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{triggers.length} gatilho{triggers.length !== 1 ? "s" : ""} configurado{triggers.length !== 1 ? "s" : ""}</p>
        {isAdmin && (
          <Button size="sm" variant="outline" className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50" onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Adicionar Gatilho
          </Button>
        )}
      </div>

      {/* Triggers list */}
      {triggers.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum gatilho configurado para a {agentName}.</p>
          {isAdmin && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetForm(); setAddOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Criar primeiro gatilho
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {triggers.map(rule => {
            const condition = CONDITION_TYPES.find(c => c.value === rule.conditionType);
            const action = ACTION_TYPES.find(a => a.value === rule.actionType);
            const CondIcon = condition?.icon ?? Zap;
            const ActIcon = action?.icon ?? Zap;
            const isEditing = editingId === rule.id;

            if (isEditing) {
              return (
                <div key={rule.id} className="p-4 rounded-xl border-2 border-violet-300 bg-violet-50 space-y-3">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Editando gatilho</p>
                  <TriggerForm form={form} setForm={setForm} conditionPlaceholder={conditionPlaceholder} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={submitEdit} disabled={!form.name || !form.conditionValue || updateMutation.isPending}>
                      {updateMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div key={rule.id} className={`p-4 rounded-xl border bg-white transition-all ${!rule.isActive ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-800 text-sm">{rule.name}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {rule.isActive ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-gray-500 mb-2">{rule.description}</p>
                    )}
                    {/* SE → ENTÃO */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${condition?.bg ?? "bg-gray-50"}`}>
                        <CondIcon size={12} className={condition?.color ?? "text-gray-500"} />
                        <span className={`text-xs font-medium ${condition?.color ?? "text-gray-600"}`}>{condition?.label}</span>
                        <span className="text-xs font-bold text-gray-700 ml-0.5">= {rule.conditionValue}</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-400">
                        <Zap size={11} />
                        <span className="text-xs">então</span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${action?.bg ?? "bg-gray-50"}`}>
                        <ActIcon size={12} className={action?.color ?? "text-gray-500"} />
                        <span className={`text-xs font-medium ${action?.color ?? "text-gray-600"}`}>{action?.label}</span>
                      </div>
                    </div>
                    {rule.triggerCount > 0 && (
                      <p className="text-xs text-gray-400 mt-2">Disparado {rule.triggerCount} vez{rule.triggerCount !== 1 ? "es" : ""}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={() => updateMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                      />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-violet-600" onClick={() => startEdit(rule)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => { if (confirm("Remover este gatilho?")) deleteMutation.mutate({ id: rule.id }); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Trigger Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Gatilho para {agentName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <TriggerForm form={form} setForm={setForm} conditionPlaceholder={conditionPlaceholder} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button className="bg-violet-600 hover:bg-violet-700" onClick={submitCreate} disabled={!form.name || !form.conditionValue || createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Gatilho"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Trigger Form (shared between create and edit) ────────────────────────────

function TriggerForm({ form, setForm, conditionPlaceholder }: {
  form: {
    name: string;
    description: string;
    conditionType: ConditionType;
    conditionValue: string;
    actionType: ActionType;
    messageTemplate: string;
    program: string;
    isActive: boolean;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  conditionPlaceholder: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome do Gatilho *</Label>
        <Input placeholder="ex: Inatividade 5 dias — Check-in" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label>Descrição <span className="text-gray-400 font-normal">(opcional)</span></Label>
        <Input placeholder="Descreva quando e por que este gatilho dispara" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Condição (SE)</Label>
          <Select value={form.conditionType} onValueChange={v => setForm(f => ({ ...f, conditionType: v as ConditionType }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONDITION_TYPES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Valor</Label>
          <Input placeholder={conditionPlaceholder} value={form.conditionValue} onChange={e => setForm(f => ({ ...f, conditionValue: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Ação (ENTÃO)</Label>
        <Select value={form.actionType} onValueChange={v => setForm(f => ({ ...f, actionType: v as ActionType }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(form.actionType === "send_ai_message" || form.actionType === "create_supervision_item") && (
        <div className="space-y-1.5">
          <Label>Mensagem / Instrução <span className="text-gray-400 font-normal">(opcional)</span></Label>
          <Textarea
            placeholder="Olá, {{nome}}! Percebi que você não acessa o programa há alguns dias..."
            className="min-h-[80px] text-sm"
            value={form.messageTemplate}
            onChange={e => setForm(f => ({ ...f, messageTemplate: e.target.value }))}
          />
          <p className="text-xs text-gray-400">Variáveis: <code className="bg-gray-100 px-1 rounded">{"{{nome}}"}</code>, <code className="bg-gray-100 px-1 rounded">{"{{programa}}"}</code></p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Filtrar por Programa <span className="text-gray-400 font-normal">(opcional)</span></Label>
        <Input placeholder="ex: Premium — deixe vazio para todos" value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
        <Label className="cursor-pointer">Gatilho ativo</Label>
      </div>
    </div>
  );
}

// ─── Aba: Conhecimento ────────────────────────────────────────────────────────

function KnowledgeBaseTab({ agentId, isAdmin }: { agentId: number; isAdmin: boolean }) {
  const { data: entries = [], refetch } = trpc.aiAgents.listKB.useQuery({ agentId });
  const [addOpen, setAddOpen] = useState(false);
  const [kbForm, setKbForm] = useState({ title: "", content: "", category: "" });

  const addMutation = trpc.aiAgents.addKB.useMutation({
    onSuccess: () => { toast.success("Entrada adicionada!"); setAddOpen(false); setKbForm({ title: "", content: "", category: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.aiAgents.deleteKB.useMutation({
    onSuccess: () => { toast.success("Entrada removida!"); refetch(); },
  });

  const toggleMutation = trpc.aiAgents.updateKB.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{entries.length} entrada{entries.length !== 1 ? "s" : ""} na base de conhecimento</p>
        {isAdmin && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Adicionar Entrada
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nova Entrada na Base de Conhecimento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Pergunta / Título *</Label>
                  <Input placeholder="ex: Como cancelar minha assinatura?" value={kbForm.title} onChange={e => setKbForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Resposta / Conteúdo *</Label>
                  <Textarea placeholder="Para cancelar sua assinatura, acesse..." className="min-h-[100px]" value={kbForm.content} onChange={e => setKbForm(f => ({ ...f, content: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input placeholder="ex: Cancelamento, Pagamento, Acesso..." value={kbForm.category} onChange={e => setKbForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                  <Button onClick={() => addMutation.mutate({ agentId, ...kbForm })} disabled={!kbForm.title || !kbForm.content || addMutation.isPending}>
                    {addMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma entrada ainda. Adicione perguntas e respostas para treinar o agente.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {entries.map(entry => (
            <div key={entry.id} className={`p-3 rounded-xl border text-sm ${entry.isActive ? "bg-white" : "bg-gray-50 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{entry.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{entry.content}</p>
                  {entry.category && (
                    <Badge variant="outline" className="text-xs mt-1">{entry.category}</Badge>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400"
                      onClick={() => toggleMutation.mutate({ id: entry.id, isActive: !entry.isActive })}>
                      {entry.isActive ? "⏸" : "▶"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                      onClick={() => { if (confirm("Remover?")) deleteMutation.mutate({ id: entry.id }); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Agent Dialog ────────────────────────────────────────────────────────

function EditAgentDialog({ open, onClose, agent, onSave, isPending }: {
  open: boolean;
  onClose: () => void;
  agent: {
    id: number; name: string; description: string | null; channel: string;
    systemPrompt: string | null; greetingMessage: string | null; escalationMessage: string | null;
    escalationThreshold: number | null; maxAutoReplies: number | null;
    avatarUrl?: string | null; programFilter?: string | null;
  };
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    name: agent.name,
    description: agent.description ?? "",
    channel: agent.channel as "all" | "whatsapp" | "email" | "instagram" | "telegram",
    systemPrompt: agent.systemPrompt ?? "",
    greetingMessage: agent.greetingMessage ?? "",
    escalationMessage: agent.escalationMessage ?? "",
    escalationThreshold: agent.escalationThreshold ?? 70,
    maxAutoReplies: agent.maxAutoReplies ?? 5,
    avatarUrl: agent.avatarUrl ?? "",
    programFilter: agent.programFilter ?? "",
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Agente: {agent.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
            <div className="w-14 h-14 rounded-full border-2 border-violet-200 overflow-hidden bg-violet-100 flex items-center justify-center shrink-0">
              <img src={form.avatarUrl || getAutoAvatar(form.name)} alt="avatar" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">URL da Foto/Avatar</Label>
              <Input placeholder="https://exemplo.com/foto.jpg" value={form.avatarUrl ?? ""} onChange={e => setForm(f => ({ ...f, avatarUrl: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v as typeof form.channel }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Programa / Produto <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <Input placeholder="ex: Premium, Básico, todos" value={form.programFilter ?? ""} onChange={e => setForm(f => ({ ...f, programFilter: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Prompt do Sistema</Label>
            <Textarea className="min-h-[100px]" value={form.systemPrompt} onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Mensagem de Boas-vindas</Label>
            <Textarea className="min-h-[70px]" placeholder="Olá, {{nome}}! Sou a assistente virtual..." value={form.greetingMessage} onChange={e => setForm(f => ({ ...f, greetingMessage: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Mensagem de Escalada</Label>
            <Textarea className="min-h-[60px]" value={form.escalationMessage} onChange={e => setForm(f => ({ ...f, escalationMessage: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Threshold de Escalada (%)</Label>
              <Input type="number" min={0} max={100} value={form.escalationThreshold} onChange={e => setForm(f => ({ ...f, escalationThreshold: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Máx. Respostas Auto.</Label>
              <Input type="number" min={1} max={50} value={form.maxAutoReplies} onChange={e => setForm(f => ({ ...f, maxAutoReplies: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => onSave(form)} disabled={!form.name || isPending}>
              {isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Aba: Atividade ───────────────────────────────────────────────────────────

function AgentActivityLog({ agentId, agentName }: { agentId: number; agentName: string }) {
  const { data: activityData, isLoading } = trpc.aiAgents.getActivityLog.useQuery({ agentId, limit: 50 });
  const logs = activityData?.logs ?? [];
  const stats = activityData?.stats;

  const EVENT_LABELS: Record<string, { label: string; color: string }> = {
    auto_reply: { label: "Resposta Auto.", color: "bg-violet-100 text-violet-700" },
    escalated: { label: "Escalado", color: "bg-amber-100 text-amber-700" },
    greeted: { label: "Boas-vindas", color: "bg-blue-100 text-blue-700" },
    resolved: { label: "Resolvido", color: "bg-emerald-100 text-emerald-700" },
  };

  function fmtMs(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="text-center p-3 rounded-xl bg-violet-50">
          <p className="text-xl font-bold text-violet-600">{stats?.autoReplies ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Respostas Auto.</p>
        </div>
        <div className="text-center p-3 rounded-xl bg-emerald-50">
          <p className="text-xl font-bold text-emerald-600">{stats?.resolved ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Resolvidos</p>
        </div>
        <div className="text-center p-3 rounded-xl bg-amber-50">
          <p className="text-xl font-bold text-amber-600">{stats?.escalations ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Escalações</p>
        </div>
        <div className="text-center p-3 rounded-xl bg-blue-50">
          <p className="text-xl font-bold text-blue-600">{stats?.avgQualityScore ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pontuação de Qualidade</p>
        </div>
      </div>
      {stats?.avgResponseMs != null && stats.avgResponseMs > 0 && (
        <p className="text-xs text-gray-400">Tempo médio de resposta: <span className="font-semibold">{fmtMs(stats.avgResponseMs)}</span></p>
      )}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Histórico de Atividade ({logs.length} registros)
        </p>
        {isLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma atividade registrada ainda.</p>
            <p className="text-xs mt-1">O log será preenchido quando o agente processar mensagens.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between p-3 rounded-xl border bg-white text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-violet-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-xs text-gray-800">
                      {log.customerName ?? `Conversa #${log.conversationId ?? log.id}`}
                    </p>
                    {log.note && <p className="text-xs text-gray-500 truncate">{log.note}</p>}
                    {log.channel && <p className="text-xs text-gray-400 capitalize">{log.channel}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {log.qualityScore != null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      log.qualityScore >= 70 ? "bg-emerald-100 text-emerald-700" :
                      log.qualityScore >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                    }`}>{log.qualityScore}pts</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${EVENT_LABELS[log.event]?.color ?? "bg-gray-100 text-gray-600"}`}>
                    {EVENT_LABELS[log.event]?.label ?? log.event}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
