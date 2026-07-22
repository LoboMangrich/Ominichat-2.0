/**
 * TriggerRules.tsx — Painel de Monitoramento de Gatilhos (somente leitura)
 * Para criar ou editar gatilhos, acesse o agente → aba "Quando Agir".
 */
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart2, Bot, CheckCircle2, Clock, ExternalLink,
  MessageSquare, Play, RefreshCw, Settings, Star, Tag, TrendingDown, Zap,
} from "lucide-react";

const CONDITION_TYPES = [
  { value: "no_interaction_days",    label: "Sem interação por X dias",  icon: Clock,         color: "text-orange-600", bg: "bg-orange-50" },
  { value: "health_score_below",     label: "Índice de Saúde abaixo de X",  icon: TrendingDown,  color: "text-red-600",    bg: "bg-red-50" },
  { value: "nps_score_below",        label: "NPS abaixo de X",           icon: Star,          color: "text-amber-600",  bg: "bg-amber-50" },
  { value: "renewal_days_remaining", label: "Renovação em X dias",       icon: RefreshCw,     color: "text-blue-600",   bg: "bg-blue-50" },
  { value: "tag_added",              label: "Tag adicionada",            icon: Tag,           color: "text-purple-600", bg: "bg-purple-50" },
  { value: "status_changed",         label: "Status mudou para",         icon: AlertTriangle, color: "text-cyan-600",   bg: "bg-cyan-50" },
];

const ACTION_TYPES = [
  { value: "send_ai_message",         label: "IA envia mensagem",           icon: MessageSquare, color: "text-emerald-600", bg: "bg-emerald-50" },
  { value: "create_supervision_item", label: "Criar item de supervisão",    icon: CheckCircle2,  color: "text-blue-600",    bg: "bg-blue-50" },
  { value: "update_status",           label: "Atualizar status do cliente", icon: RefreshCw,     color: "text-amber-600",   bg: "bg-amber-50" },
  { value: "assign_playbook",         label: "Iniciar playbook",            icon: Play,          color: "text-purple-600",  bg: "bg-purple-50" },
  { value: "create_task",             label: "Criar tarefa para o time",    icon: CheckCircle2,  color: "text-orange-600",  bg: "bg-orange-50" },
  { value: "send_nps",                label: "Enviar pesquisa NPS",         icon: Star,          color: "text-cyan-600",    bg: "bg-cyan-50" },
];

const AGENT_COLORS: Record<string, string> = {
  Sofia:    "bg-violet-100 text-violet-700",
  Bia:      "bg-blue-100 text-blue-700",
  Luna:     "bg-emerald-100 text-emerald-700",
  Sentinel: "bg-red-100 text-red-700",
  Max:      "bg-amber-100 text-amber-700",
  Renata:   "bg-pink-100 text-pink-700",
};

export default function TriggerRules() {
  const [, navigate] = useLocation();
  const { data: rules = [], isLoading } = trpc.triggerRules.list.useQuery();
  const { data: agents = [] } = trpc.aiAgents.list.useQuery();

  const evaluateMutation = trpc.triggerRules.evaluate.useMutation({
    onSuccess: (data) => toast.success(`Avaliação concluída: ${data.triggered} ação(ões) criada(s)`),
    onError: (e) => toast.error(e.message),
  });

  async function handleEvaluateNow() {
    try {
      await fetch("/api/scheduled/evaluate-triggers", { method: "POST" });
      toast.success("Avaliação de gatilhos iniciada!");
    } catch {
      evaluateMutation.mutate();
    }
  }

  const activeRules = rules.filter(r => r.isActive);
  const totalTriggers = rules.reduce((sum, r) => sum + (r.triggerCount ?? 0), 0);
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]));
  const rulesWithAgent = rules.map(r => ({ ...r, agentData: r.agentId ? agentMap[r.agentId] : null }));

  const grouped: Record<string, typeof rulesWithAgent> = {};
  for (const rule of rulesWithAgent) {
    const key = rule.agentData?.name ?? "Sem agente";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(rule);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Monitoramento de Gatilhos
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Visão geral de todos os gatilhos proativos. Para criar ou editar, acesse o agente correspondente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
            onClick={handleEvaluateNow}
            disabled={evaluateMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 ${evaluateMutation.isPending ? "animate-spin" : ""}`} />
            {evaluateMutation.isPending ? "Avaliando..." : "Avaliar Agora"}
          </Button>
          <Button className="gap-2 bg-violet-600 hover:bg-violet-700" onClick={() => navigate("/ai-agents")}>
            <Settings className="w-4 h-4" /> Configurar Agentes
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total de Gatilhos",      value: rules.length,                                                               icon: Zap,          color: "text-amber-600",   bg: "bg-amber-50" },
          { label: "Gatilhos Ativos",        value: activeRules.length,                                                         icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Agentes com Gatilhos",   value: Object.keys(grouped).filter(k => k !== "Sem agente").length,                icon: Bot,          color: "text-violet-600",  bg: "bg-violet-50" },
          { label: "Total de Disparos",      value: totalTriggers,                                                              icon: BarChart2,    color: "text-blue-600",    bg: "bg-blue-50" },
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

      {/* Info banner */}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
        <Settings className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Como configurar gatilhos</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Os gatilhos são configurados dentro de cada agente. Acesse <strong>Agentes de IA</strong> → selecione um agente → aba <strong>"Quando Agir"</strong>.
          </p>
        </div>
      </div>

      {/* Rules grouped by agent */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-30" />
          <p className="text-sm">Carregando gatilhos...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Nenhum gatilho configurado ainda.</p>
          <p className="text-gray-400 text-sm mt-1">Acesse um agente de IA e configure seus gatilhos proativos.</p>
          <Button className="mt-4 bg-violet-600 hover:bg-violet-700" onClick={() => navigate("/ai-agents")}>
            Ir para Agentes de IA
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([agentName, agentRules]) => {
            const agentData = agentRules[0]?.agentData;
            const activeCount = agentRules.filter(r => r.isActive).length;
            return (
              <div key={agentName} className="glass-card overflow-hidden">
                {/* Agent header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    {agentData ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-violet-200 bg-violet-50 shrink-0">
                        <img
                          src={agentData.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(agentName)}&background=6366f1&color=fff&size=64&bold=true&rounded=true`}
                          alt={agentName}
                          className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-gray-800 text-sm">{agentName}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${AGENT_COLORS[agentName] ?? "bg-gray-100 text-gray-600"}`}>
                          {agentRules.length} gatilho{agentRules.length !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs text-gray-400">{activeCount} ativo{activeCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                  {agentData && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-violet-600 hover:bg-violet-50 text-xs"
                      onClick={() => navigate("/ai-agents")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Configurar
                    </Button>
                  )}
                </div>

                {/* Rules list */}
                <div className="divide-y divide-gray-50">
                  {agentRules.map(rule => {
                    const condition = CONDITION_TYPES.find(c => c.value === rule.conditionType);
                    const action = ACTION_TYPES.find(a => a.value === rule.actionType);
                    const CondIcon = condition?.icon ?? Zap;
                    const ActIcon = action?.icon ?? Zap;
                    return (
                      <div key={rule.id} className={`px-5 py-4 flex items-start justify-between gap-4 ${!rule.isActive ? "opacity-50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-gray-800 text-sm">{rule.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                              {rule.isActive ? "Ativo" : "Pausado"}
                            </span>
                          </div>
                          {rule.description && <p className="text-xs text-gray-500 mb-2">{rule.description}</p>}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${condition?.bg ?? "bg-gray-50"}`}>
                              <CondIcon size={12} className={condition?.color ?? "text-gray-500"} />
                              <span className={`text-xs font-medium ${condition?.color ?? "text-gray-600"}`}>{condition?.label}</span>
                              <span className="text-xs font-bold text-gray-700 ml-0.5">= {rule.conditionValue}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-400">
                              <Zap size={11} /><span className="text-xs">então</span>
                            </div>
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${action?.bg ?? "bg-gray-50"}`}>
                              <ActIcon size={12} className={action?.color ?? "text-gray-500"} />
                              <span className={`text-xs font-medium ${action?.color ?? "text-gray-600"}`}>{action?.label}</span>
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {(rule.triggerCount ?? 0) > 0 && (
                            <div className="text-xs text-gray-400">
                              <span className="font-semibold text-gray-600">{rule.triggerCount}</span> disparo{rule.triggerCount !== 1 ? "s" : ""}
                            </div>
                          )}
                          {rule.lastEvaluatedAt && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              Avaliado: {new Date(rule.lastEvaluatedAt).toLocaleDateString("pt-BR")}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
