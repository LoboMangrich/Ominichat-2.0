import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HeartPulse, TrendingDown, TrendingUp, AlertTriangle, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold w-8 text-right">{value}</span>
    </div>
  );
}

export default function HealthIndicators() {
  const { data: listData, isLoading } = trpc.customers.list.useQuery({ limit: 1000 });
  const customers = listData?.customers ?? [];
  const recalcAll = trpc.healthScore.recalculateAll.useMutation({
    onSuccess: (r) => toast.success(`Índice de Saúde recalculado para ${(r as any)?.updated ?? "todos"} clientes`),
    onError: () => toast.error("Erro ao recalcular"),
  });

  const active = (customers as any[]).filter((c) => c.status === "Ativo");
  // Only count clients with a calculated score (score > 0 and not null)
  const activeWithScore = active.filter((c) => c.healthScore !== null && c.healthScore !== undefined && c.healthScore > 0);
  const total = activeWithScore.length;

  const excellent = activeWithScore.filter((c) => c.healthScore >= 80).length;
  const good      = activeWithScore.filter((c) => c.healthScore >= 60 && c.healthScore < 80).length;
  const warning   = activeWithScore.filter((c) => c.healthScore >= 40 && c.healthScore < 60).length;
  const critical  = activeWithScore.filter((c) => c.healthScore < 40).length;

  const avg = total > 0
    ? Math.round(activeWithScore.reduce((s, c) => s + c.healthScore, 0) / total)
    : 0;

  // Only show clients with a real score below 50 (excludes unscored clients)
  const atRisk = activeWithScore
    .filter((c) => c.healthScore < 50)
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 10);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">Carregando indicadores...</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Saúde dos Clientes</h2>
          <p className="text-sm text-muted-foreground">{total} clientes ativos monitorados</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => recalcAll.mutate()} disabled={recalcAll.isPending}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${recalcAll.isPending ? "animate-spin" : ""}`} />
          Recalcular Todos
        </Button>
      </div>

      {/* Indicador Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <HeartPulse className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Score Médio</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{avg}</p>
            <p className="text-xs text-muted-foreground mt-1">de 100 pontos</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Saudáveis</span>
            </div>
            <p className="text-3xl font-bold text-emerald-600">{excellent + good}</p>
            <p className="text-xs text-muted-foreground mt-1">score ≥ 60</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Em Atenção</span>
            </div>
            <p className="text-3xl font-bold text-amber-600">{warning}</p>
            <p className="text-xs text-muted-foreground mt-1">score 40–59</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Em Risco</span>
            </div>
            <p className="text-3xl font-bold text-red-600">{critical}</p>
            <p className="text-xs text-muted-foreground mt-1">score &lt; 40</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution */}
      <Card className="glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Distribuição por Faixa de Score
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Excelente (80–100)</span>
              <span>{total > 0 ? Math.round((excellent / total) * 100) : 0}%</span>
            </div>
            <ScoreBar value={excellent} max={total} color="bg-emerald-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Bom (60–79)</span>
              <span>{total > 0 ? Math.round((good / total) * 100) : 0}%</span>
            </div>
            <ScoreBar value={good} max={total} color="bg-blue-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Atenção (40–59)</span>
              <span>{total > 0 ? Math.round((warning / total) * 100) : 0}%</span>
            </div>
            <ScoreBar value={warning} max={total} color="bg-amber-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Crítico (&lt;40)</span>
              <span>{total > 0 ? Math.round((critical / total) * 100) : 0}%</span>
            </div>
            <ScoreBar value={critical} max={total} color="bg-red-500" />
          </div>
        </CardContent>
      </Card>

      {/* At-risk list */}
      {atRisk.length > 0 && (
        <Card className="glass-card border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Clientes que Precisam de Atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {atRisk.map((c: any) => (
              <Link key={c.id} href="/customers">
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.program ?? "Sem programa"}</p>
                  </div>
                  <Badge
                    className={`text-xs font-bold ${
                      (c.healthScore ?? 0) < 40
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {Math.round(c.healthScore ?? 0)}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {total === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhum cliente ativo encontrado. Importe clientes para ver os indicadores de saúde.
        </div>
      )}
    </div>
  );
}
