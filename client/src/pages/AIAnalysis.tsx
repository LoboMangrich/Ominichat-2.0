import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Bot, CheckCircle, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function AIAnalysis() {
  const [, setLocation] = useLocation();
  const { data: analyses, isLoading, refetch } = trpc.ai.getRecentAnalyses.useQuery({ limit: 20 });

  const avgQuality = analyses?.length
    ? Math.round(analyses.reduce((a, c) => a + (c.qualityScore ?? 0), 0) / analyses.length)
    : null;
  const avgUpsell = analyses?.length
    ? Math.round(analyses.reduce((a, c) => a + (c.upsellOpportunity ?? 0), 0) / analyses.length)
    : null;
  const lowQuality = analyses?.filter(c => (c.qualityScore ?? 100) < 70).length ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Análise de IA
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automated quality scoring and insights for all conversations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{avgQuality ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Avg Pontuação de Qualidade</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{avgUpsell != null ? `${avgUpsell}%` : "—"}</div>
              <div className="text-xs text-muted-foreground">Avg Pontuação de Venda Adicional</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{lowQuality}</div>
              <div className="text-xs text-muted-foreground">Baixa Qualidade Alerts</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Analyses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : !analyses?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No analyses yet</p>
              <p className="text-sm mt-1">Open a conversation and click "AI Analyze" to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {analyses.map(conv => {
                const q = conv.qualityScore ?? 0;
                const scoreColor = q >= 80
                  ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
                  : q >= 60
                  ? "text-amber-600 bg-amber-50 dark:bg-amber-900/20"
                  : "text-red-600 bg-red-50 dark:bg-red-900/20";
                return (
                  <div
                    key={conv.id}
                    className="flex items-start gap-4 p-4 rounded-xl border border-border hover:border-primary/30 cursor-pointer transition-all"
                    onClick={() => setLocation(`/conversations/${conv.id}`)}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${scoreColor}`}>
                      {q}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">Conversation #{conv.id}</span>
                        {q < 70 && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />Baixa Qualidade
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{conv.aiSummary}</p>
                      {conv.aiRecommendations && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 bg-amber-50 dark:bg-amber-900/10 rounded px-2 py-1 line-clamp-1">
                          {conv.aiRecommendations}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 text-xs text-muted-foreground text-right">
                      <span>Upsell: <strong className="text-foreground">{Math.round(conv.upsellOpportunity ?? 0)}%</strong></span>
                      <span>Referral: <strong className="text-foreground">{Math.round(conv.referralReadiness ?? 0)}%</strong></span>
                      <span className="text-muted-foreground/60">{conv.aiAnalyzedAt ? new Date(conv.aiAnalyzedAt).toLocaleDateString() : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
