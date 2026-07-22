import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertTriangle, Award, BarChart3, Bot, CheckCircle, Clock,
  Download, MessageSquare, Shield, Star, TrendingDown, TrendingUp, Users
} from "lucide-react";
import { useLocation } from "wouter";

function formatSeconds(s: number | null | undefined) {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function ScoreBadge({ value, max = 100 }: { value: number | null | undefined; max?: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const pct = (value / max) * 100;
  const color = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-600";
  return <span className={`font-bold ${color}`}>{value}</span>;
}

function MetricCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TeamPerformance() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: teamData, isLoading } = trpc.productivity.getTeamOverview.useQuery();
  const { data: advanced, isLoading: advLoading } = trpc.productivity.getAdvancedMetrics.useQuery({ days: 7 });
  const { data: aiStats } = trpc.productivity.getAiVsHumanStats.useQuery();
  const { data: lowQualityAlerts } = trpc.ai.getRecentAnalyses.useQuery({ limit: 50 });
  const { data: csvData } = trpc.productivity.exportKpiCsv.useQuery({});

  const alerts = (lowQualityAlerts ?? []).filter(c => (c.qualityScore ?? 100) < 70);

  const handleExportCsv = () => {
    if (!csvData?.csv) return;
    const blob = new Blob([csvData.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kpi-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (user?.role === "Agent") {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Access Restricted</p>
        <p className="text-sm mt-1">Team performance is only available to Managers and Admins.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Desempenho da Equipe
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview de all agents' Indicadores for the last 7 days.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!csvData?.csv}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Shield}
          label="Conformidade SLA"
          value={advLoading ? "..." : `${advanced?.slaCompliance ?? 100}%`}
          sub="Respostas em até 1h"
          color={!advanced || advanced.slaCompliance >= 80 ? "text-emerald-600" : "text-amber-600"}
        />
        <MetricCard
          icon={CheckCircle}
          label="Resolução no Primeiro Contato"
          value={advLoading ? "..." : `${advanced?.fcr ?? 0}%`}
          sub="Fechados sem reabertura"
          color={!advanced || advanced.fcr >= 70 ? "text-emerald-600" : "text-amber-600"}
        />
        <MetricCard
          icon={Clock}
          label="Backlog (>24h)"
          value={advLoading ? "..." : advanced?.backlog.over24h ?? 0}
          sub={`${advanced?.backlog.over48h ?? 0} acima de 48h · ${advanced?.backlog.over72h ?? 0} acima de 72h`}
          color={(advanced?.backlog.over24h ?? 0) === 0 ? "text-emerald-600" : "text-amber-600"}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Alertas de Baixa Qualidade"
          value={alerts.length}
          sub="Atendimentos abaixo de 70 pts"
          color={alerts.length === 0 ? "text-emerald-600" : "text-red-600"}
        />
      </div>

      {/* IA vs Humano Stats */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-500" />
            IA vs Humano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-xl bg-purple-50 dark:bg-purple-900/10">
              <p className="text-2xl font-bold text-purple-600">{aiStats?.aiHandled ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Atendidos pela IA</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10">
              <p className="text-2xl font-bold text-blue-600">{aiStats?.humanHandled ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Atendidos por Humanos</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10">
              <p className="text-2xl font-bold text-emerald-600">{aiStats?.aiResolutionRate ?? 0}%</p>
              <p className="text-xs text-muted-foreground mt-1">Taxa de Resolução IA</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10">
              <p className="text-2xl font-bold text-amber-600">{aiStats?.aiEscalated ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Escalações pela IA</p>
            </div>
          </div>
          {(aiStats?.aiHandled ?? 0) > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>IA</span>
                <span>Humano</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div
                  className="bg-purple-500 h-full transition-all"
                  style={{ width: `${Math.round(((aiStats?.aiHandled ?? 0) / Math.max((aiStats?.aiHandled ?? 0) + (aiStats?.humanHandled ?? 0), 1)) * 100)}%` }}
                />
                <div className="bg-blue-400 h-full flex-1" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Baixa Qualidade Alerts */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {alerts.length} Atendimento{alerts.length > 1 ? "s" : ""} de Baixa Qualidade Detectado{alerts.length > 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 3).map(conv => (
                <div
                  key={conv.id}
                  className="flex items-center justify-between p-2 bg-white dark:bg-amber-900/20 rounded-lg cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                  onClick={() => setLocation(`/conversations/${conv.id}`)}
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">Atendimento #{conv.id}</span>
                    <p className="text-xs text-muted-foreground truncate">{conv.aiRecommendations}</p>
                  </div>
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 ml-3 shrink-0">
                    Score: {conv.qualityScore}
                  </Badge>
                </div>
              ))}
              {alerts.length > 3 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 text-center">+{alerts.length - 3} alertas adicionais</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard */}
      {(advanced?.leaderboard?.length ?? 0) > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Ranking de Agentes — Últimos 7 Dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(advanced?.leaderboard ?? []).map((entry, idx) => (
                <div key={entry.agentId} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    idx === 0 ? "bg-amber-100 text-amber-700" :
                    idx === 1 ? "bg-slate-100 text-slate-600" :
                    idx === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">{entry.conversations} atendimentos</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="text-center">
                      <p className="text-muted-foreground">Qualidade</p>
                      <ScoreBadge value={entry.qualityScore} />
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">CSAT</p>
                      <ScoreBadge value={entry.csatScore} max={5} />
                    </div>
                  </div>
                  {idx === 0 && <Award className="w-4 h-4 text-amber-500 shrink-0" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Agent Indicadores — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : !teamData?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No agent data yet</p>
              <p className="text-sm mt-1">Agents need to have conversations to generate metrics.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Atendente</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <div className="flex items-center justify-center gap-1"><MessageSquare className="w-3 h-3" /> Conversations</div>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <div className="flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> Tempo de Primeira Resposta</div>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <div className="flex items-center justify-center gap-1"><Star className="w-3 h-3" /> CSAT Score</div>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <div className="flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3" /> Pontuação de Qualidade</div>
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {teamData.map(({ agent, qualityScore, csatScore, conversationsCount, firstResponseTime }) => {
                    const isLow = (qualityScore ?? 100) < 70;
                    const isHigh = (qualityScore ?? 0) >= 80;
                    return (
                      <tr key={agent.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isLow ? "bg-red-50/30 dark:bg-red-900/5" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-primary">{agent.name?.charAt(0) ?? "?"}</span>
                            </div>
                            <div>
                              <p className="font-medium">{agent.name}</p>
                              <p className="text-xs text-muted-foreground">{agent.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-medium">{conversationsCount}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{formatSeconds(firstResponseTime)}</td>
                        <td className="px-4 py-3 text-center"><ScoreBadge value={csatScore} max={5} /></td>
                        <td className="px-4 py-3 text-center"><ScoreBadge value={qualityScore} /></td>
                        <td className="px-4 py-3 text-center">
                          {isLow ? (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">
                              <TrendingDown className="w-3 h-3 mr-1" />Needs Coaching
                            </Badge>
                          ) : isHigh ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                              <TrendingUp className="w-3 h-3 mr-1" />Performing Well
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Média</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dicas de Melhoria */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Recomendações de Melhoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(teamData ?? []).filter(a => (a.qualityScore ?? 100) < 70).length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                All agents are performing well. No coaching needed right now.
              </div>
            ) : (
              (teamData ?? [])
                .filter(a => (a.qualityScore ?? 100) < 70)
                .map(({ agent, qualityScore }) => (
                  <div key={agent.id} className="p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <Badge className="bg-amber-100 text-amber-800 text-xs">Quality: {qualityScore ?? "—"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This agent's quality score is below the 70-point threshold. Consider reviewing their recent conversations,
                      providing feedback on empathy and resolution techniques, and scheduling a 1:1 coaching session.
                    </p>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
