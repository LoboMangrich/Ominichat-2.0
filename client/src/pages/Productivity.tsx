import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart3, CheckCircle, Clock, MessageSquare, Star, TrendingUp } from "lucide-react";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function formatSeconds(s: number | null | undefined) {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

export default function Productivity() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("7");

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - Number(period) * 86400000).toISOString().split("T")[0];

  const { data: metrics, isLoading } = trpc.productivity.getAgentMetrics.useQuery({ startDate, endDate });
  const { data: summary } = trpc.productivity.getAgentSummary.useQuery({ startDate, endDate });

  const chartData = (metrics ?? []).map(m => ({
    date: m.date,
    conversations: m.conversationsCount ?? 0,
    closed: m.conversationsClosed ?? 0,
    quality: m.qualityScore ?? 0,
  }));

  const kpis = [
    {
      label: "Tempo de Primeira Resposta",
      value: formatSeconds(summary?.avgFirstResponseTime),
      icon: Clock,
      color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
      sub: "Média no período",
    },
    {
      label: "Tempo Médio de Resolução",
      value: formatSeconds(summary?.avgResolutionTime),
      icon: CheckCircle,
      color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30",
      sub: "Média no período",
    },
    {
      label: "Nota CSAT",
      value: summary?.avgCsat != null ? `${summary.avgCsat.toFixed(1)}/5` : "—",
      icon: Star,
      color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
      sub: "Satisfação do cliente",
    },
    {
      label: "Nota de Qualidade",
      value: summary?.avgQuality != null ? `${Math.round(summary.avgQuality)}` : "—",
      icon: TrendingUp,
      color: "text-violet-600 bg-violet-100 dark:bg-violet-900/30",
      sub: "Avaliação de qualidade por IA",
    },
    {
      label: "Atendimentos",
      value: summary?.totalConversations ?? "—",
      icon: MessageSquare,
      color: "text-slate-600 bg-slate-100 dark:bg-slate-800",
      sub: "Total no período",
    },
    {
      label: "Finalizados",
      value: summary?.totalClosed ?? "—",
      icon: BarChart3,
      color: "text-pink-600 bg-pink-100 dark:bg-pink-900/30",
      sub: "Atendimentos resolvidos",
    },
  ];

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Minha Produtividade
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Métricas de desempenho de {user?.name}
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Indicador Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kpi.color}`}>
                  <kpi.icon className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-16" /> : kpi.value}</div>
              <div className="text-sm font-medium mt-0.5">{kpi.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Atendimentos Diários</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : chartData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhum dado para este período ainda.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="conversations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total" />
                <Bar dataKey="closed" fill="hsl(var(--primary) / 0.4)" radius={[4, 4, 0, 0]} name="Finalizados" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Pontuação de Qualidade Chart */}
      {chartData.some(d => d.quality > 0) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Nota de Qualidade Diária</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="quality" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Qualidade" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
