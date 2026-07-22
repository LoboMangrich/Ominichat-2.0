import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, BookOpen, Zap, MessageSquare, Star, BarChart2, Users, Clock,
  ChevronRight, Trash2, CheckCircle2, AlertCircle, Play, RefreshCw
} from "lucide-react";

const TRIGGER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  customer_created:    { label: "Novo cliente criado",        color: "text-emerald-700", bg: "bg-emerald-50" },
  nps_submitted:       { label: "NPS enviado",                color: "text-blue-700",    bg: "bg-blue-50" },
  health_score_drop:   { label: "Índice de Saúde caiu",          color: "text-red-700",     bg: "bg-red-50" },
  renewal_approaching: { label: "Renovação se aproximando",   color: "text-amber-700",   bg: "bg-amber-50" },
  no_interaction:      { label: "Sem interação",              color: "text-orange-700",  bg: "bg-orange-50" },
  manual:              { label: "Manual",                     color: "text-gray-700",    bg: "bg-gray-100" },
};

const STEP_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  send_message:        { label: "Enviar Mensagem",       icon: <MessageSquare className="w-4 h-4" />, color: "text-emerald-700", bg: "bg-emerald-50" },
  send_nps:            { label: "Enviar NPS",            icon: <Star className="w-4 h-4" />,          color: "text-amber-700",   bg: "bg-amber-50" },
  send_csat:           { label: "Enviar CSAT",           icon: <CheckCircle2 className="w-4 h-4" />,  color: "text-blue-700",    bg: "bg-blue-50" },
  create_task:         { label: "Criar Tarefa",          icon: <CheckCircle2 className="w-4 h-4" />,  color: "text-purple-700",  bg: "bg-purple-50" },
  update_health_score: { label: "Atualizar Índice de Saúde",icon: <BarChart2 className="w-4 h-4" />,     color: "text-orange-700",  bg: "bg-orange-50" },
  escalate_to_human:   { label: "Escalar para Humano",   icon: <Users className="w-4 h-4" />,         color: "text-red-700",     bg: "bg-red-50" },
  add_tag:             { label: "Adicionar Tag",         icon: <Zap className="w-4 h-4" />,           color: "text-cyan-700",    bg: "bg-cyan-50" },
};

const DEFAULT_PLAYBOOKS = [
  { name: "Onboarding — Comandor IA", triggerEvent: "customer_created", steps: 5 },
  { name: "Reengajamento — Clientes Inativos", triggerEvent: "no_interaction", steps: 3 },
  { name: "Renovação — 60 dias antes", triggerEvent: "renewal_approaching", steps: 3 },
];

function StepCard({ step, index, onDelete }: { step: any; index: number; onDelete: () => void }) {
  const cfg = STEP_TYPE_CONFIG[step.stepType] || { label: step.stepType, icon: null, color: "text-gray-600", bg: "bg-gray-50" };
  return (
    <div className="flex items-start gap-3 group">
      {/* Timeline */}
      <div className="flex flex-col items-center gap-0 flex-shrink-0 w-10">
        <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center`}>
          <span className={cfg.color}>{cfg.icon}</span>
        </div>
        {index >= 0 && <div className="w-px flex-1 min-h-[16px] bg-gray-200 mt-1" />}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
            {step.delayDays === 0 ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                <Zap className="w-3 h-3" /> Imediato
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 font-medium">
                <Clock className="w-3 h-3" /> Dia {step.delayDays}
              </span>
            )}
          </div>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {step.messageTemplate && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2 bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
            {step.messageTemplate}
          </p>
        )}
        {step.taskTitle && (
          <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
            {step.taskTitle}
          </p>
        )}
      </div>
    </div>
  );
}

function AddStepForm({ playbookId, onAdded }: { playbookId: number; onAdded: () => void }) {
  const [stepType, setStepType] = useState("send_message");
  const [delayDays, setDelayDays] = useState(0);
  const [messageTemplate, setMessageTemplate] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [open, setOpen] = useState(false);

  const addStep = trpc.playbooks.addStep.useMutation({
    onSuccess: () => {
      toast.success("Passo adicionado!");
      setOpen(false);
      setMessageTemplate(""); setTaskTitle(""); setDelayDays(0);
      onAdded();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 border-dashed text-gray-500 hover:text-gray-700 w-full mt-1">
          <Plus className="w-3.5 h-3.5" />
          Adicionar Passo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Passo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo de Ação</Label>
            <Select value={stepType} onValueChange={setStepType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STEP_TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <div className="flex items-center gap-2">
                      <span className={v.color}>{v.icon}</span>
                      {v.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Delay (dias após o trigger)</Label>
            <Input type="number" min={0} value={delayDays} onChange={e => setDelayDays(Number(e.target.value))} />
          </div>
          {(stepType === "send_message" || stepType === "send_nps" || stepType === "send_csat" || stepType === "escalate_to_human") && (
            <div>
              <Label>Mensagem / Template</Label>
              <Textarea
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                placeholder="Use {{nome}} para personalizar"
                className="min-h-[80px]"
              />
            </div>
          )}
          {stepType === "create_task" && (
            <div>
              <Label>Título da Tarefa</Label>
              <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Ex: Ligar para {{nome}}" />
            </div>
          )}
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => addStep.mutate({
              playbookId, stepOrder: 99, stepType: stepType as any, delayDays,
              messageTemplate: messageTemplate || undefined,
              taskTitle: taskTitle || undefined,
              isActive: true,
            })}
            disabled={addStep.isPending}
          >
            {addStep.isPending ? "Adicionando..." : "Adicionar Passo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlaybookDetail({ playbookId, onClose }: { playbookId: number; onClose: () => void }) {
  const { data, refetch } = trpc.playbooks.get.useQuery({ id: playbookId });
  const deleteStep = trpc.playbooks.deleteStep.useMutation({ onSuccess: () => refetch() });
  const toggleActive = trpc.playbooks.update.useMutation({ onSuccess: () => refetch() });

  if (!data) return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
    </div>
  );

  const triggerCfg = TRIGGER_LABELS[data.triggerEvent] || TRIGGER_LABELS.manual;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-800 text-lg leading-tight">{data.name}</h3>
          {data.description && <p className="text-sm text-gray-500 mt-0.5">{data.description}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${triggerCfg.bg} ${triggerCfg.color} border-current/20`}>
              {triggerCfg.label}
            </span>
            {data.program && (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {data.program}
              </span>
            )}
            <span className="inline-flex items-center text-xs text-gray-500 gap-1">
              <CheckCircle2 className="w-3 h-3" /> {data.steps?.length ?? 0} passos
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">{data.isActive ? "Ativo" : "Inativo"}</span>
          <Switch
            checked={data.isActive}
            onCheckedChange={v => toggleActive.mutate({ id: data.id, isActive: v })}
          />
        </div>
      </div>

      {/* Steps timeline */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sequência de Passos</h4>
        {data.steps?.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
            Nenhum passo configurado ainda
          </div>
        ) : (
          <div className="space-y-0">
            {data.steps?.map((step: any, i: number) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                onDelete={() => deleteStep.mutate({ id: step.id })}
              />
            ))}
          </div>
        )}
        <AddStepForm playbookId={playbookId} onAdded={() => refetch()} />
      </div>
    </div>
  );
}

function CreatePlaybookDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [program, setProgram] = useState("");
  const [triggerEvent, setTriggerEvent] = useState<any>("customer_created");

  const create = trpc.playbooks.create.useMutation({
    onSuccess: () => {
      toast.success("Playbook criado com sucesso!");
      setOpen(false);
      setName(""); setDescription(""); setProgram("");
      onCreated();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          Novo Playbook
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Playbook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome do Playbook</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Onboarding Comandor IA" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o objetivo deste playbook" />
          </div>
          <div>
            <Label>Programa (opcional)</Label>
            <Input value={program} onChange={e => setProgram(e.target.value)} placeholder="Ex: Comandor IA, RCC..." />
          </div>
          <div>
            <Label>Evento Gatilho</Label>
            <Select value={triggerEvent} onValueChange={setTriggerEvent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => create.mutate({ name, description, program: program || undefined, triggerEvent, isActive: true })}
            disabled={create.isPending || !name}
          >
            {create.isPending ? "Criando..." : "Criar Playbook"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Playbooks() {
  const { data: playbooks, refetch, isLoading } = trpc.playbooks.list.useQuery();
  const { data: journeyStats } = trpc.journey.stats.useQuery();
  const deletePlaybook = trpc.playbooks.delete.useMutation({
    onSuccess: () => { toast.success("Playbook removido"); refetch(); setSelectedId(null); },
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Playbooks de Sucesso</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sequências automáticas de mensagens por programa e evento</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw size={14} />
            Atualizar
          </Button>
          <CreatePlaybookDialog onCreated={() => refetch()} />
        </div>
      </div>

      {/* Indicador Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Playbooks Ativos",       value: playbooks?.filter(p => p.isActive).length ?? 0, icon: BookOpen,      color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Total de Playbooks",     value: playbooks?.length ?? 0,                          icon: BookOpen,      color: "text-blue-600",    bg: "bg-blue-50" },
          { label: "Jornadas em Andamento",  value: journeyStats?.active ?? 0,                       icon: Play,          color: "text-purple-600",  bg: "bg-purple-50" },
          { label: "Jornadas Concluídas",    value: journeyStats?.completed ?? 0,                    icon: CheckCircle2,  color: "text-amber-600",   bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state with templates */}
      {!isLoading && (!playbooks || playbooks.length === 0) && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Nenhum playbook configurado</span>
          </div>
          <p className="text-sm text-gray-500">Crie seu primeiro playbook para começar a automatizar o sucesso dos seus clientes. Sugerimos começar com os templates abaixo:</p>
          <div className="grid gap-2">
            {DEFAULT_PLAYBOOKS.map((pb, i) => {
              const trig = TRIGGER_LABELS[pb.triggerEvent];
              return (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{pb.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{pb.steps} passos configurados</div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${trig.bg} ${trig.color}`}>
                    {trig.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content: list + detail */}
      {isLoading ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 space-y-3">
            {[1,2,3].map(i => <div key={i} className="glass-card p-4 animate-pulse h-20 bg-gray-100" />)}
          </div>
          <div className="col-span-8 glass-card p-5 animate-pulse h-64 bg-gray-100" />
        </div>
      ) : playbooks && playbooks.length > 0 ? (
        <div className="grid grid-cols-12 gap-6">
          {/* List */}
          <div className="col-span-4 space-y-2">
            {playbooks.map(pb => {
              const trig = TRIGGER_LABELS[pb.triggerEvent] || TRIGGER_LABELS.manual;
              return (
                <button
                  key={pb.id}
                  onClick={() => setSelectedId(pb.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selectedId === pb.id
                      ? "bg-emerald-50 border-emerald-300 shadow-sm"
                      : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm truncate">{pb.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{pb.description}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pb.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {pb.isActive ? "Ativo" : "Inativo"}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${trig.bg} ${trig.color}`}>
                          {trig.label}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 mt-1 flex-shrink-0 transition-colors ${selectedId === pb.id ? "text-emerald-500" : "text-gray-300"}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          <div className="col-span-8">
            {selectedId ? (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
                  <span className="text-xs text-gray-400">Detalhes do playbook</span>
                  <button
                    onClick={() => deletePlaybook.mutate({ id: selectedId })}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir playbook
                  </button>
                </div>
                <PlaybookDetail playbookId={selectedId} onClose={() => setSelectedId(null)} />
              </div>
            ) : (
              <div className="glass-card p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                  <BookOpen className="w-7 h-7 text-emerald-500" />
                </div>
                <p className="font-medium text-gray-700">Selecione um playbook</p>
                <p className="text-sm text-gray-400 mt-1">Clique em um playbook à esquerda para ver e editar os passos</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
