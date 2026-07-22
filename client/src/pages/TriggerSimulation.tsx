import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  AlertCircle, CheckCircle2, Clock, FlaskConical, Play, RefreshCw,
  TrendingUp, TrendingDown, Star, Activity, Search, ChevronRight,
  Zap, BarChart2, History, Eye
} from "lucide-react";
import { toast } from "sonner";

// ─── Condition label map ──────────────────────────────────────────────────────
const CONDITION_LABELS: Record<string, string> = {
  no_interaction_days: "Sem interação por X dias",
  health_score_below: "Índice de Saúde abaixo de X",
  health_score_above: "Índice de Saúde acima de X",
  nps_score_below: "NPS abaixo de X",
  nps_score_above: "NPS acima de X",
  renewal_days_remaining: "Renovação em X dias",
  tag_added: "Tag adicionada",
  status_changed: "Status mudou para",
};

const ACTION_LABELS: Record<string, string> = {
  send_ai_message: "IA envia mensagem",
  create_supervision_item: "Criar item de supervisão",
  update_status: "Atualizar status",
  assign_playbook: "Iniciar playbook",
  create_task: "Criar tarefa",
  send_nps: "Enviar NPS",
};

function ScoreBar({ value, max = 100, color = "bg-emerald-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function HealthScoreCard({ customerId }: { customerId: number }) {
  const { data, isLoading, refetch } = trpc.healthScore.preview.useQuery({ customerId }, { enabled: !!customerId });
  const recalcMutation = trpc.healthScore.recalculate.useMutation({
    onSuccess: () => { refetch(); },
  });

  if (isLoading) return (
    <Card className="border-dashed">
      <CardContent className="p-4 text-sm text-muted-foreground">Calculando health score...</CardContent>
    </Card>
  );

  if (!data) return null;

  const scoreColor = data.score >= 70 ? "text-emerald-600" : data.score >= 40 ? "text-amber-600" : "text-red-600";
  const barColor = data.score >= 70 ? "bg-emerald-500" : data.score >= 40 ? "bg-amber-500" : "bg-red-500";

  const factors = [
    { label: "Inatividade", value: data.breakdown.inactivity, weight: "30%", detail: `${data.breakdown.inactivityDays} dias sem interação` },
    { label: "NPS", value: data.breakdown.nps, weight: "25%", detail: data.breakdown.npsRaw !== null ? `NPS: ${data.breakdown.npsRaw}` : "Sem NPS registrado" },
    { label: "Tickets Abertos", value: data.breakdown.openTickets, weight: "20%", detail: `${data.breakdown.openTicketsCount} ticket(s) aberto(s)` },
    { label: "Proximidade Renovação", value: data.breakdown.renewalProximity, weight: "15%", detail: data.breakdown.renewalDaysLeft !== null ? `${data.breakdown.renewalDaysLeft} dias para renovar` : "Sem data de renovação" },
    { label: "Progresso no Programa", value: data.breakdown.programProgress, weight: "10%", detail: "Baseado no tempo como cliente" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            Índice de Saúde Calculado
          </CardTitle>
          <Button
            variant="ghost" size="sm"
            onClick={() => recalcMutation.mutate({ customerId })}
            disabled={recalcMutation.isPending}
          >
            <RefreshCw className={`w-3 h-3 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <span className={`text-4xl font-bold ${scoreColor}`}>{data.score}</span>
          <div className="flex-1">
            <ScoreBar value={data.score} color={barColor} />
            <p className="text-xs text-muted-foreground mt-1">
              {data.score >= 70 ? "Saudável" : data.score >= 40 ? "Em atenção" : "Em risco"}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {factors.map(f => (
            <div key={f.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{f.label} <span className="text-muted-foreground/60">({f.weight})</span></span>
                <span className="font-medium">{f.value}/100</span>
              </div>
              <ScoreBar value={f.value} color={f.value >= 70 ? "bg-emerald-400" : f.value >= 40 ? "bg-amber-400" : "bg-red-400"} />
              <p className="text-xs text-muted-foreground/70">{f.detail}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SimulationResult({ result }: { result: any }) {
  if (!result) return null;

  return (
    <Card className={`border-2 ${result.conditionMet ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {result.conditionMet
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            : <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          }
          <div className="flex-1">
            <p className="font-medium text-sm">
              {result.conditionMet ? "Condição ATENDIDA — gatilho dispararia" : "Condição NÃO atendida — gatilho não dispararia"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{result.reason}</p>
          </div>
        </div>

        {result.conditionMet && result.actionPreview && (
          <div className="bg-background rounded-lg p-3 border">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Ação que seria executada:</p>
            <p className="text-sm">{result.actionPreview}</p>
            {result.agentName && (
              <Badge variant="secondary" className="mt-2 text-xs">
                Agente: {result.agentName}
              </Badge>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span className="font-medium">Cliente:</span> {result.customer?.name}
          </div>
          <div>
            <span className="font-medium">Índice de Saúde:</span> {result.customer?.healthScore ?? "não calculado"}
          </div>
          <div>
            <span className="font-medium">NPS:</span> {result.customer?.npsScore ?? "não registrado"}
          </div>
          <div>
            <span className="font-medium">Última interação:</span>{" "}
            {result.customer?.lastInteractionAt
              ? new Date(result.customer.lastInteractionAt).toLocaleDateString("pt-BR")
              : "nunca"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TriggerSimulation() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [logFilter, setLogFilter] = useState<"all" | "real" | "simulation">("all");

  // Data fetching
  const { data: customersData } = trpc.customers.list.useQuery({ limit: 200 });
  const rulesData = trpc.triggerRules.list.useQuery();
  const { data: logsData, refetch: refetchLogs } = trpc.triggerLogs.list.useQuery({
    isSimulation: logFilter === "all" ? undefined : logFilter === "simulation",
    limit: 100,
  });

  // Recalculate all health scores
  const recalcAllMutation = trpc.healthScore.recalculateAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Índice de Saúdes atualizados: ${data.updated} clientes recalculados, ${data.errors} erros.`);
    },
  });

  // Simulate mutation
  const simulateMutation = trpc.triggerLogs.simulate.useMutation({
    onSuccess: (data) => {
      setSimulationResult(data);
      refetchLogs();
    },
    onError: (err) => {
      toast.error(`Erro na simulação: ${err.message}`);
    },
  });

  const filteredCustomers = useMemo(() => {
    if (!customersData?.customers) return [];
    if (!customerSearch) return customersData.customers;
    return customersData.customers.filter((c: any) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(customerSearch.toLowerCase())
    );
  }, [customersData, customerSearch]);

  const selectedCustomer = customersData?.customers?.find((c: any) => c.id === selectedCustomerId);
  const selectedRule = (rulesData.data as any[])?.find((r: any) => r.id === selectedRuleId);

  const conditionLabel = (type: string, value: string) => {
    const label = CONDITION_LABELS[type] ?? type;
    return label.replace("X", value);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-purple-500" />
            Simulação de Gatilhos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Teste os gatilhos proativos sem precisar de WhatsApp conectado. Veja exatamente o que cada agente faria.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => recalcAllMutation.mutate()}
          disabled={recalcAllMutation.isPending}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${recalcAllMutation.isPending ? "animate-spin" : ""}`} />
          Recalcular Índice de Saúdes
        </Button>
      </div>

      <Tabs defaultValue="simulate">
        <TabsList>
          <TabsTrigger value="simulate" className="gap-2">
            <Play className="w-4 h-4" /> Simular Gatilho
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="w-4 h-4" /> Log de Disparos
          </TabsTrigger>
        </TabsList>

        {/* ── Simulate Tab ── */}
        <TabsContent value="simulate" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Selectors */}
            <div className="space-y-4">
              {/* Customer selector */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">1. Selecione o Cliente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredCustomers.slice(0, 30).map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCustomerId(c.id); setSimulationResult(null); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedCustomerId === c.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className={`text-xs ${selectedCustomerId === c.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {c.program ?? "Sem programa"} · HS: {c.healthScore ?? "?"} · NPS: {c.npsScore ?? "?"}
                        </div>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente encontrado</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Rule selector */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">2. Selecione o Gatilho</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(rulesData.data as any[])?.filter((r: any) => r.isActive).map((rule: any) => (
                    <button
                      key={rule.id}
                      onClick={() => { setSelectedRuleId(rule.id); setSimulationResult(null); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                        selectedRuleId === rule.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{rule.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {ACTION_LABELS[rule.actionType] ?? rule.actionType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {conditionLabel(rule.conditionType, rule.conditionValue)}
                      </p>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Simulate button */}
              <Button
                className="w-full gap-2"
                disabled={!selectedCustomerId || !selectedRuleId || simulateMutation.isPending}
                onClick={() => {
                  if (selectedCustomerId && selectedRuleId) {
                    simulateMutation.mutate({ customerId: selectedCustomerId, ruleId: selectedRuleId });
                  }
                }}
              >
                {simulateMutation.isPending
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Simulando...</>
                  : <><Play className="w-4 h-4" /> Simular Agora</>
                }
              </Button>
            </div>

            {/* Right: Results */}
            <div className="space-y-4">
              {selectedCustomerId && <HealthScoreCard customerId={selectedCustomerId} />}

              {simulationResult && <SimulationResult result={simulationResult} />}

              {!selectedCustomerId && !simulationResult && (
                <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                  <FlaskConical className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">Selecione um cliente e um gatilho</p>
                  <p className="text-sm mt-1">O resultado da simulação aparecerá aqui</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Logs Tab ── */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Select value={logFilter} onValueChange={(v) => setLogFilter(v as any)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os registros</SelectItem>
                <SelectItem value="real">Apenas reais</SelectItem>
                <SelectItem value="simulation">Apenas simulações</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Atualizar
            </Button>
            <span className="text-sm text-muted-foreground">
              {logsData?.total ?? 0} registros
            </span>
          </div>

          <div className="space-y-2">
            {logsData?.rows?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum disparo registrado ainda</p>
                <p className="text-sm mt-1">Execute uma simulação ou aguarde o motor de automação rodar</p>
              </div>
            )}

            {logsData?.rows?.map(log => (
              <Card key={log.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                        log.actionResult === "success" ? "bg-emerald-500" :
                        log.actionResult === "skipped" ? "bg-amber-500" : "bg-red-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{log.ruleName}</span>
                          {log.isSimulation && (
                            <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                              <FlaskConical className="w-3 h-3 mr-1" /> Simulação
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {ACTION_LABELS[log.actionType] ?? log.actionType}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Cliente: <span className="font-medium text-foreground">{log.customerName}</span>
                          {log.agentName && <> · Agente: <span className="font-medium text-foreground">{log.agentName}</span></>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Condição: {conditionLabel(log.conditionType, log.conditionValue)}
                        </p>
                        {log.actionDetail && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.actionDetail}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={`text-xs ${
                        log.actionResult === "success" ? "bg-emerald-100 text-emerald-700" :
                        log.actionResult === "skipped" ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {log.actionResult === "success" ? "Disparado" :
                         log.actionResult === "skipped" ? "Ignorado" : "Erro"}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
