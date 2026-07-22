import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Zap, Plus, Play, Trash2, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, SkipForward, Clock, RefreshCw,
  MessageSquare, ListTodo, TrendingUp, Bell, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────
type TriggerType = 'days_since_entry' | 'days_since_contact' | 'days_before_renewal' | 'health_score_below' | 'new_customer';
type ActionType = 'send_whatsapp' | 'send_group_message' | 'create_task' | 'update_health_score' | 'notify_agent';
type FrequencyType = 'once' | 'daily' | 'weekly' | 'monthly';

const TRIGGER_LABELS: Record<TriggerType, string> = {
  days_since_entry: 'Dias desde entrada',
  days_since_contact: 'Dias sem contato',
  days_before_renewal: 'Dias antes da renovação',
  health_score_below: 'Índice de Saúde abaixo de',
  new_customer: 'Novo cliente (dia 0)',
};

const ACTION_LABELS: Record<ActionType, string> = {
  send_whatsapp: 'Enviar WhatsApp',
  send_group_message: 'Mensagem no grupo',
  create_task: 'Criar tarefa',
  update_health_score: 'Atualizar Índice de Saúde',
  notify_agent: 'Notificar agente',
};

const ACTION_ICONS: Record<ActionType, React.ReactNode> = {
  send_whatsapp: <MessageSquare className="w-3.5 h-3.5" />,
  send_group_message: <Users className="w-3.5 h-3.5" />,
  create_task: <ListTodo className="w-3.5 h-3.5" />,
  update_health_score: <TrendingUp className="w-3.5 h-3.5" />,
  notify_agent: <Bell className="w-3.5 h-3.5" />,
};

const FREQ_LABELS: Record<FrequencyType, string> = {
  once: 'Uma vez',
  daily: 'Diário',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

const STATUS_CONFIG = {
  sent: { label: 'Enviado', color: '#0d6b4e', bg: 'rgba(13,107,78,0.10)', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: 'Falhou', color: '#b91c1c', bg: 'rgba(185,28,28,0.10)', icon: <XCircle className="w-3.5 h-3.5" /> },
  skipped: { label: 'Pulado', color: 'oklch(0.55 0.05 155)', bg: 'rgba(0,0,0,0.06)', icon: <SkipForward className="w-3.5 h-3.5" /> },
  pending: { label: 'Pendente', color: '#9a6010', bg: 'rgba(201,130,39,0.10)', icon: <Clock className="w-3.5 h-3.5" /> },
};

// ─── Create Rule Modal ────────────────────────────────────────────────────────
function CreateRuleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('days_since_entry');
  const [triggerValue, setTriggerValue] = useState(3);
  const [actionType, setActionType] = useState<ActionType>('send_whatsapp');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [healthScoreDelta, setHealthScoreDelta] = useState(5);
  const [targetProgram, setTargetProgram] = useState('');
  const [targetStatus, setTargetStatus] = useState<'Active' | 'At Risk' | 'New' | 'all'>('all');
  const [frequency, setFrequency] = useState<FrequencyType>('once');

  const createMutation = trpc.cadence.createRule.useMutation({
    onSuccess: () => {
      toast.success('Regra criada com sucesso!');
      onCreated();
      onClose();
      // Reset
      setName(''); setDescription(''); setMessageTemplate(''); setTaskTitle('');
    },
    onError: (e) => toast.error(e.message),
  });

  const needsTemplate = actionType === 'send_whatsapp' || actionType === 'send_group_message';
  const needsTask = actionType === 'create_task';
  const needsDelta = actionType === 'update_health_score';
  const needsValue = triggerType !== 'new_customer';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: '#9a6010' }} />
            Nova Regra de Automação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome da regra *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Boas-vindas no dia 1" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Opcional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gatilho</Label>
              <Select value={triggerType} onValueChange={v => setTriggerType(v as TriggerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(TRIGGER_LABELS) as [TriggerType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsValue && (
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <Input
                  type="number"
                  value={triggerValue}
                  onChange={e => setTriggerValue(Number(e.target.value))}
                  min={0}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ação</Label>
              <Select value={actionType} onValueChange={v => setActionType(v as ActionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(ACTION_LABELS) as [ActionType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Select value={frequency} onValueChange={v => setFrequency(v as FrequencyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(FREQ_LABELS) as [FrequencyType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsTemplate && (
            <div className="space-y-1.5">
              <Label>Template da mensagem</Label>
              <Textarea
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                placeholder="Use {{name}}, {{program}}, {{healthScore}}, {{daysSinceEntry}}, {{daysSinceContact}}"
                rows={4}
                className="text-sm"
              />
              <p className="text-[10px]" style={{ color: 'oklch(0.55 0.05 155)' }}>
                A IA vai personalizar esta mensagem para cada cliente. Use as variáveis entre chaves duplas.
              </p>
            </div>
          )}

          {needsTask && (
            <div className="space-y-1.5">
              <Label>Título da tarefa</Label>
              <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Ex: Fazer check-in mensal" />
            </div>
          )}

          {needsDelta && (
            <div className="space-y-1.5">
              <Label>Variação do Índice de Saúde</Label>
              <Input
                type="number"
                value={healthScoreDelta}
                onChange={e => setHealthScoreDelta(Number(e.target.value))}
                placeholder="Ex: +5 ou -10"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Programa alvo</Label>
              <Input value={targetProgram} onChange={e => setTargetProgram(e.target.value)} placeholder="Todos os programas" />
            </div>
            <div className="space-y-1.5">
              <Label>Status alvo</Label>
              <Select value={targetStatus} onValueChange={v => setTargetStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Active">Ativo</SelectItem>
                  <SelectItem value="At Risk">Em Risco</SelectItem>
                  <SelectItem value="New">Novo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => createMutation.mutate({
              name, description, triggerType, triggerValue, actionType,
              messageTemplate: messageTemplate || undefined,
              taskTitle: taskTitle || undefined,
              healthScoreDelta: needsDelta ? healthScoreDelta : undefined,
              targetProgram: targetProgram || undefined,
              targetStatus, executionFrequency: frequency,
            })}
            disabled={!name || createMutation.isPending}
            style={{ background: '#0d6b4e', color: 'white' }}
          >
            {createMutation.isPending ? 'Criando...' : 'Criar Regra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CadenceAutomation() {
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'log'>('rules');

  const { data: rules = [], refetch: refetchRules } = trpc.cadence.listRules.useQuery();
  const { data: executions = [], refetch: refetchExec } = trpc.cadence.listExecutions.useQuery({ limit: 100 });
  const { data: todaySummary } = trpc.cadence.getTodaySummary.useQuery();

  const toggleMutation = trpc.cadence.updateRule.useMutation({
    onSuccess: () => refetchRules(),
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.cadence.deleteRule.useMutation({
    onSuccess: () => { toast.success('Regra removida'); refetchRules(); },
    onError: (e) => toast.error(e.message),
  });

  const runEngineMutation = trpc.cadence.runEngine.useMutation({
    onSuccess: (data) => {
      toast.success(data.message ?? 'Engine executado com sucesso!');
      refetchExec();
      refetchRules();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'oklch(0.20 0.06 155)' }}>
            Régua de Sucesso Automatizada
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'oklch(0.55 0.05 155)' }}>
            Regras que executam automaticamente todos os dias — sem intervenção humana
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runEngineMutation.mutate()}
            disabled={runEngineMutation.isPending}
            className="flex items-center gap-1.5 text-xs"
          >
            <Play className="w-3.5 h-3.5" />
            {runEngineMutation.isPending ? 'Executando...' : 'Executar Agora'}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-xs"
            style={{ background: '#0d6b4e', color: 'white' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Regra
          </Button>
        </div>
      </div>

      {/* Today's summary */}
      {todaySummary && todaySummary.total > 0 && (
        <div
          className="rounded-xl p-3 flex items-center gap-4"
          style={{ background: 'rgba(13,107,78,0.06)', border: '1px solid rgba(13,107,78,0.15)' }}
        >
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" style={{ color: '#0d6b4e' }} />
            <span className="text-xs font-bold" style={{ color: '#0d6b4e' }}>Hoje</span>
          </div>
          <div className="flex gap-4">
            <span className="text-xs"><span className="font-bold text-emerald-700">{todaySummary.sent}</span> enviadas</span>
            <span className="text-xs"><span className="font-bold text-red-700">{todaySummary.failed}</span> falhas</span>
            <span className="text-xs"><span className="font-bold" style={{ color: 'oklch(0.55 0.05 155)' }}>{todaySummary.skipped}</span> puladas</span>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
        {(['rules', 'log'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={activeTab === tab
              ? { background: '#0d6b4e', color: 'white' }
              : { color: 'oklch(0.55 0.05 155)' }
            }
          >
            {tab === 'rules' ? `Regras (${rules.length})` : `Log de Execuções (${executions.length})`}
          </button>
        ))}
      </div>

      {/* Rules list */}
      {activeTab === 'rules' && (
        <div className="space-y-2">
          {rules.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center space-y-3"
              style={{ background: 'rgba(13,107,78,0.04)', border: '1px dashed rgba(13,107,78,0.20)' }}
            >
              <div className="text-4xl">⚡</div>
              <p className="text-sm font-semibold" style={{ color: 'oklch(0.30 0.06 155)' }}>Nenhuma regra criada ainda</p>
              <p className="text-xs" style={{ color: 'oklch(0.55 0.05 155)' }}>
                Crie regras para automatizar boas-vindas, check-ins mensais, alertas de renovação e muito mais.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: '#0d6b4e', color: 'white' }}
              >
                + Criar primeira regra
              </button>
            </div>
          ) : (
            rules.map(rule => (
              <div
                key={rule.id}
                className="rounded-xl p-3.5"
                style={{
                  background: rule.isActive ? 'rgba(13,107,78,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${rule.isActive ? 'rgba(13,107,78,0.15)' : 'rgba(0,0,0,0.08)'}`,
                  opacity: rule.isActive ? 1 : 0.65,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Action icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(13,107,78,0.12)', color: '#0d6b4e' }}
                  >
                    {ACTION_ICONS[rule.actionType as ActionType]}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.06 155)' }}>{rule.name}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {FREQ_LABELS[rule.executionFrequency as FrequencyType]}
                      </Badge>
                      {rule.targetProgram && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: '#1d4ed8', color: '#1d4ed8' }}>
                          {rule.targetProgram}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[11px]" style={{ color: 'oklch(0.55 0.05 155)' }}>
                        🎯 {TRIGGER_LABELS[rule.triggerType as TriggerType]}
                        {rule.triggerType !== 'new_customer' && ` = ${rule.triggerValue}`}
                      </span>
                      <span className="text-[11px]" style={{ color: 'oklch(0.55 0.05 155)' }}>
                        ⚡ {ACTION_LABELS[rule.actionType as ActionType]}
                      </span>
                    </div>

                    {rule.messageTemplate && (
                      <p className="text-[11px] mt-1.5 line-clamp-2" style={{ color: 'oklch(0.50 0.05 155)', fontStyle: 'italic' }}>
                        "{rule.messageTemplate.substring(0, 100)}{rule.messageTemplate.length > 100 ? '...' : ''}"
                      </p>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                      disabled={toggleMutation.isPending}
                      className="p-1 rounded-lg transition-all"
                      title={rule.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {rule.isActive
                        ? <ToggleRight className="w-5 h-5" style={{ color: '#0d6b4e' }} />
                        : <ToggleLeft className="w-5 h-5" style={{ color: 'oklch(0.55 0.05 155)' }} />
                      }
                    </button>
                    <button
                      onClick={() => { if (confirm(`Remover "${rule.name}"?`)) deleteMutation.mutate({ id: rule.id }); }}
                      disabled={deleteMutation.isPending}
                      className="p-1 rounded-lg transition-all hover:bg-red-50"
                      title="Remover regra"
                    >
                      <Trash2 className="w-4 h-4" style={{ color: '#b91c1c' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Execution log */}
      {activeTab === 'log' && (
        <div className="space-y-2">
          {executions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'oklch(0.55 0.05 155)' }}>Nenhuma execução registrada ainda.</p>
              <p className="text-xs mt-1" style={{ color: 'oklch(0.65 0.04 155)' }}>Clique em "Executar Agora" para rodar o engine manualmente.</p>
            </div>
          ) : (
            executions.map(exec => {
              const cfg = STATUS_CONFIG[exec.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
              return (
                <div
                  key={exec.id}
                  className="rounded-xl p-3 flex items-start gap-3"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.color}25` }}
                >
                  <div style={{ color: cfg.color }} className="mt-0.5 shrink-0">{cfg.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold" style={{ color: 'oklch(0.25 0.06 155)' }}>
                        {exec.customerName ?? `Cliente #${exec.customerId}`}
                      </p>
                      {exec.customerProgram && (
                        <span className="text-[10px]" style={{ color: 'oklch(0.55 0.05 155)' }}>{exec.customerProgram}</span>
                      )}
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                        style={{ borderColor: cfg.color, color: cfg.color }}
                      >
                        {cfg.label}
                      </Badge>
                    </div>
                    {exec.generatedMessage && (
                      <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'oklch(0.45 0.05 155)', fontStyle: 'italic' }}>
                        "{exec.generatedMessage.substring(0, 120)}{exec.generatedMessage.length > 120 ? '...' : ''}"
                      </p>
                    )}
                    {exec.errorMessage && (
                      <p className="text-[11px] mt-1" style={{ color: '#b91c1c' }}>Erro: {exec.errorMessage}</p>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: 'oklch(0.65 0.04 155)' }}>
                      {new Date(exec.executedAt).toLocaleString('pt-BR')}
                      {exec.healthScoreAtExecution != null && ` · Score: ${exec.healthScoreAtExecution}`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create modal */}
      <CreateRuleModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refetchRules}
      />
    </div>
  );
}
