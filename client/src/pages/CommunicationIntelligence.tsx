import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Brain,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PERIOD_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

const CATEGORY_COLORS: Record<string, string> = {
  produto: "#3b82f6",
  processo: "#f59e0b",
  comunicação: "#8b5cf6",
  suporte: "#ef4444",
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  alta:  { color: "#b91c1c", bg: "rgba(220,38,38,0.10)",   label: "Alta" },
  média: { color: "#9a6010", bg: "rgba(201,130,39,0.12)",  label: "Média" },
  baixa: { color: "#0d6b4e", bg: "rgba(13,107,78,0.10)",   label: "Baixa" },
};

function SentimentDonut({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  const data = [
    { name: "Positivo", value: positive, color: "#0d6b4e" },
    { name: "Neutro",   value: neutral,  color: "#9ca3af" },
    { name: "Negativo", value: negative, color: "#ef4444" },
  ];
  return (
    <div className="flex flex-col items-center">
      <PieChart width={160} height={160}>
        <Pie data={data} cx={75} cy={75} innerRadius={50} outerRadius={72} dataKey="value" strokeWidth={0}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
      </PieChart>
      <div className="flex gap-4 mt-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
            <span style={{ color: "oklch(0.45 0.05 155)" }}>{d.name} <span className="font-bold" style={{ color: d.color }}>{d.value}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-red-500" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

export default function CommunicationIntelligence() {
  const [period, setPeriod] = useState(30);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: latest, refetch, isLoading } = trpc.intelligence.getLatest.useQuery({ periodDays: period });
  const { data: history } = trpc.intelligence.getHistory.useQuery({ limit: 8, periodDays: period });

  const analyzeMutation = trpc.intelligence.analyze.useMutation({
    onMutate: () => setIsAnalyzing(true),
    onSuccess: () => {
      toast.success("Análise concluída com sucesso!");
      refetch();
      setIsAnalyzing(false);
    },
    onError: (e) => {
      toast.error(`Erro na análise: ${e.message}`);
      setIsAnalyzing(false);
    },
  });

  const sentimentTrend = history?.map((h: any) => ({
    date: new Date(h.analyzedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    positivo: h.sentimentPositive,
    neutro: h.sentimentNeutral,
    negativo: h.sentimentNegative,
  })).reverse() || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto page-bg min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "oklch(0.18 0.08 155)", fontFamily: "'Space Grotesk', sans-serif" }}>
            Inteligência de Comunicação
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "oklch(0.50 0.05 155)" }}>
            IA analisa as mensagens dos seus clientes e gera insights acionáveis
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.65)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={period === opt.value ? {
                  background: "oklch(0.49 0.19 155)",
                  color: "white",
                  boxShadow: "0 2px 8px rgba(13,107,78,0.30)",
                } : { color: "oklch(0.45 0.05 155)" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            onClick={() => analyzeMutation.mutate({ periodDays: period })}
            disabled={isAnalyzing}
            className="btn-gold"
            size="sm"
          >
            {isAnalyzing ? (
              <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analisando...</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Analisar Agora</>
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : !latest ? (
        /* Empty state */
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            background: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(255,255,255,0.90)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <Brain className="w-14 h-14 mx-auto mb-4 opacity-20" style={{ color: "oklch(0.49 0.19 155)" }} />
          <h3 className="text-lg font-bold mb-2" style={{ color: "oklch(0.25 0.08 155)" }}>Nenhuma análise ainda</h3>
          <p className="text-sm mb-6" style={{ color: "oklch(0.50 0.05 155)" }}>
            Clique em "Analisar Agora" para a IA processar as mensagens dos últimos {period} dias e gerar insights sobre os seus clientes.
          </p>
          <Button onClick={() => analyzeMutation.mutate({ periodDays: period })} disabled={isAnalyzing} className="btn-gold">
            {isAnalyzing ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Analisando...</> : <><Sparkles className="w-4 h-4 mr-2" />Gerar Primeira Análise</>}
          </Button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div
            className="rounded-2xl p-4 flex items-center gap-6"
            style={{
              background: "linear-gradient(135deg, rgba(13,107,78,0.08) 0%, rgba(255,255,255,0.80) 100%)",
              border: "1px solid rgba(13,107,78,0.15)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}
          >
            <Brain className="w-8 h-8 shrink-0" style={{ color: "oklch(0.49 0.19 155)" }} />
            <p className="text-sm flex-1" style={{ color: "oklch(0.30 0.08 155)" }}>{latest.rawSummary}</p>
            <div className="flex gap-6 shrink-0 text-center">
              <div>
                <div className="text-xl font-black" style={{ color: "oklch(0.18 0.08 155)" }}>{latest.totalMessages}</div>
                <div className="text-[10px]" style={{ color: "oklch(0.55 0.05 155)" }}>Mensagens</div>
              </div>
              <div>
                <div className="text-xl font-black" style={{ color: "oklch(0.18 0.08 155)" }}>{latest.totalConversations}</div>
                <div className="text-[10px]" style={{ color: "oklch(0.55 0.05 155)" }}>Conversas</div>
              </div>
              <div>
                <div className="text-[10px] mb-0.5" style={{ color: "oklch(0.55 0.05 155)" }}>Última análise</div>
                <div className="text-xs font-semibold" style={{ color: "oklch(0.35 0.08 155)" }}>
                  {new Date(latest.analyzedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-3 gap-4">
            {/* Sentiment donut */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "rgba(255,255,255,0.80)",
                border: "1px solid rgba(255,255,255,0.95)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
              }}
            >
              <h3 className="text-sm font-bold mb-4" style={{ color: "oklch(0.25 0.08 155)" }}>Sentimento Geral</h3>
              <SentimentDonut
                positive={latest.sentimentPositive}
                neutral={latest.sentimentNeutral}
                negative={latest.sentimentNegative}
              />
            </div>

            {/* Topics */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "rgba(255,255,255,0.80)",
                border: "1px solid rgba(255,255,255,0.95)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
              }}
            >
              <h3 className="text-sm font-bold mb-4" style={{ color: "oklch(0.25 0.08 155)" }}>Temas Recorrentes</h3>
              <div className="space-y-2.5">
                {(latest.topics as any[] || []).map((topic: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-black w-4 text-right shrink-0" style={{ color: "oklch(0.55 0.05 155)" }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold truncate" style={{ color: "oklch(0.25 0.08 155)" }}>{topic.topic}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <TrendIcon trend={topic.trend} />
                          <span className="text-[10px] font-bold" style={{ color: "oklch(0.50 0.05 155)" }}>{topic.count}x</span>
                        </div>
                      </div>
                      <div className="h-1 rounded-full mt-1" style={{ background: "rgba(0,0,0,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (topic.count / ((latest.topics as any[])[0]?.count || 1)) * 100)}%`,
                            background: "oklch(0.49 0.19 155)",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {(!latest.topics || (latest.topics as any[]).length === 0) && (
                  <p className="text-xs text-center py-4" style={{ color: "oklch(0.60 0.05 155)" }}>Nenhum tema identificado</p>
                )}
              </div>
            </div>

            {/* Suggestions */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "rgba(255,255,255,0.80)",
                border: "1px solid rgba(255,255,255,0.95)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
              }}
            >
              <h3 className="text-sm font-bold mb-4 flex items-center gap-1.5" style={{ color: "oklch(0.25 0.08 155)" }}>
                <Lightbulb className="w-4 h-4" style={{ color: "#f59e0b" }} />
                Sugestões da IA
              </h3>
              <div className="space-y-2.5">
                {(latest.suggestions as any[] || []).map((s: any, i: number) => {
                  const pCfg = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG["baixa"];
                  const catColor = CATEGORY_COLORS[s.category] || "#6b7280";
                  return (
                    <div
                      key={i}
                      className="rounded-xl p-3"
                      style={{ background: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                          style={{ background: pCfg.bg, color: pCfg.color }}
                        >{pCfg.label}</span>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                          style={{ background: `${catColor}18`, color: catColor }}
                        >{s.category}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: "oklch(0.30 0.06 155)" }}>{s.text}</p>
                    </div>
                  );
                })}
                {(!latest.suggestions || (latest.suggestions as any[]).length === 0) && (
                  <p className="text-xs text-center py-4" style={{ color: "oklch(0.60 0.05 155)" }}>Nenhuma sugestão disponível</p>
                )}
              </div>
            </div>
          </div>

          {/* Sentiment trend chart */}
          {sentimentTrend.length > 1 && (
            <div
              className="rounded-2xl p-5"
              style={{
                background: "rgba(255,255,255,0.80)",
                border: "1px solid rgba(255,255,255,0.95)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
              }}
            >
              <h3 className="text-sm font-bold mb-4" style={{ color: "oklch(0.25 0.08 155)" }}>Evolução do Sentimento</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={sentimentTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.55 0.05 155)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "oklch(0.55 0.05 155)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any, name: string) => [`${v}%`, name.charAt(0).toUpperCase() + name.slice(1)]}
                  />
                  <Line type="monotone" dataKey="positivo" stroke="#0d6b4e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="neutro"   stroke="#9ca3af" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="negativo" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center mt-2">
                {[{ label: "Positivo", color: "#0d6b4e" }, { label: "Neutro", color: "#9ca3af" }, { label: "Negativo", color: "#ef4444" }].map(l => (
                  <div key={l.label} className="flex items-center gap-1 text-xs" style={{ color: "oklch(0.50 0.05 155)" }}>
                    <div className="w-3 h-0.5 rounded" style={{ background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
