import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText, RefreshCw, TrendingUp, Users, MessageSquare,
  Clock, AlertTriangle, CheckCircle, BarChart2, ChevronDown, ChevronUp
} from "lucide-react";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function MetricCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
      <div className={`p-2 rounded-lg ${color ?? "bg-primary/10"}`}>
        <Icon className={`w-4 h-4 ${color ? "text-white" : "text-primary"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: any }) {
  const [expanded, setExpanded] = useState(false);
  const topAgents: any[] = Array.isArray(report.topAgents) ? report.topAgents : (typeof report.topAgents === "string" ? JSON.parse(report.topAgents) : []);
  const channelBreakdown: Record<string, number> = typeof report.channelBreakdown === "string" ? JSON.parse(report.channelBreakdown) : (report.channelBreakdown ?? {});

  const channelEmoji: Record<string, string> = { whatsapp: "💬", email: "📧", instagram: "📸", telegram: "✈️" };

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              Semana de {formatDate(report.weekStart)} a {formatDate(report.weekEnd)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Gerado por {report.generatedBy}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetricCard icon={MessageSquare} label="Atendimentos" value={report.totalConversations} />
          <MetricCard icon={CheckCircle} label="Finalizados" value={report.closedConversations} color="bg-emerald-500" />
          <MetricCard icon={Users} label="Novos Clientes" value={report.newCustomers} color="bg-blue-500" />
          <MetricCard icon={AlertTriangle} label="Alertas" value={report.totalAlerts} sub={`${report.resolvedAlerts} resolvidos`} color="bg-amber-500" />
        </div>

        {expanded && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard icon={Clock} label="Tempo Médio de Resposta" value={report.avgResponseMinutes ? `${report.avgResponseMinutes} min` : "—"} />
              <MetricCard icon={TrendingUp} label="Conformidade SLA" value={report.slaCompliancePct != null ? `${report.slaCompliancePct}%` : "—"} />
            </div>

            {Object.keys(channelBreakdown).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Distribuição por Canal</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(channelBreakdown).map(([ch, count]) => (
                    <Badge key={ch} variant="secondary" className="text-xs">
                      {channelEmoji[ch] ?? "📱"} {ch}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {topAgents.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Top Agentes</p>
                <div className="space-y-1">
                  {topAgents.map((agent: any, i: number) => (
                    <div key={agent.agentId} className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-4">{i + 1}.</span>
                        <span className="font-medium">{agent.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{agent.closed} finalizados</span>
                        {agent.avgResponseMinutes > 0 && <span>~{agent.avgResponseMinutes}min resposta</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WeeklyReports() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin" || user?.role === "Manager";
  const { data: reports = [], isLoading, refetch } = trpc.reports.list.useQuery();
  const generateMutation = trpc.reports.generate.useMutation({
    onSuccess: () => {
      toast.success("Relatório gerado com sucesso!");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            Relatórios Semanais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Resumo automático de Indicadores por semana</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateMutation.mutate({ weekOffset: -1 })}
              disabled={generateMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Semana Passada
            </Button>
            <Button
              size="sm"
              onClick={() => generateMutation.mutate({ weekOffset: 0 })}
              disabled={generateMutation.isPending}
            >
              <FileText className="w-4 h-4 mr-1" />
              {generateMutation.isPending ? "Gerando..." : "Gerar Esta Semana"}
            </Button>
          </div>
        )}
      </div>

      {/* Reports list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <BarChart2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum relatório gerado ainda</p>
            {isAdmin && (
              <p className="text-sm text-muted-foreground mt-1">
                Clique em "Gerar Esta Semana" para criar o primeiro relatório
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(reports as any[]).map((report: any) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}
