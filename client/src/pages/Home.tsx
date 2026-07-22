import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

// ─── Urgency score ring ────────────────────────────────────────────────────────
function UrgencyRing({ score }: { score: number }) {
  const color = score >= 90 ? "#ef4444"
    : score >= 75 ? "#f97316"
    : score >= 55 ? "#eab308"
    : "#3b82f6";
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div
      className="relative flex items-center justify-center w-10 h-10 shrink-0 cursor-help"
      title={`Score de Urgência: ${score}/100\n\nQuanto maior, mais atenção esse cliente precisa agora.\n• 90-100 = Crítico (vermelho)\n• 75-89 = Alto (laranja)\n• 55-74 = Médio (amarelo)\n• 0-54 = Normal (azul)\n\nCalculado com base em: health score, dias sem contato, renovação próxima e status do cliente.`}
    >
      <svg className="absolute inset-0 -rotate-90" width="40" height="40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#ffffff10" strokeWidth="3" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="text-[10px] font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── Badge chip ────────────────────────────────────────────────────────────────
const BADGE_STYLE: Record<string, string> = {
  "Em Risco":    "bg-red-500/20 text-red-400 border-red-500/30",
  "Novo Cliente":"bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Renovação":   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Urgente":     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Sem Contato": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function BadgeChip({ label }: { label: string }) {
  const cls = BADGE_STYLE[label] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Priority item card ────────────────────────────────────────────────────────
type PQItem = {
  id: number;
  name: string;
  program: string | null;
  healthScore: number;
  urgencyScore: number;
  badges: string[];
  reason: string;
  aiSuggestion: string;
  daysSinceContact: number;
  daysToRenewal?: number;
  action: "chat" | "view" | "renewal";
};

function PriorityCard({ item, onChat, onView }: {
  item: PQItem;
  onChat: (id: number) => void;
  onView: (id: number) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
      <UrgencyRing score={item.urgencyScore} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-foreground truncate">{item.name}</span>
          {item.program && (
            <span className="text-xs text-muted-foreground truncate">{item.program}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap mb-1">
          {item.badges.map(b => <BadgeChip key={b} label={b} />)}
          <span className="text-xs text-muted-foreground">{item.reason}</span>
        </div>
        <p className="text-xs text-emerald-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 shrink-0" />
          {item.aiSuggestion}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[10px] text-muted-foreground"
            title="Índice de Saúde: mede o engajamento e satisfação do cliente (0-100). Atualizado automaticamente pela IA ao encerrar conversas."
          >
            HS: <span className={item.healthScore >= 70 ? 'text-emerald-400' : item.healthScore >= 40 ? 'text-yellow-400' : 'text-red-400'}>{item.healthScore}</span>
          </span>
          {item.daysSinceContact > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Último contato: <span className="text-foreground">{item.daysSinceContact}d atrás</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button size="sm" variant="outline"
          className="h-7 text-xs px-2 bg-emerald-600/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/40"
          onClick={() => onChat(item.id)}>
          <MessageSquare className="w-3 h-3 mr-1" />
          {item.action === "renewal" ? "Renovar" : "Chat"}
        </Button>
        <Button size="sm" variant="ghost"
          className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
          onClick={() => onView(item.id)}>
          Ver
        </Button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<string>("Todos");
  const PAGE_SIZE = 8;

  const { data: pq, isLoading: pqLoading, refetch: refetchPQ } = trpc.commandPanel.getPriorityQueue.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
  });
  const { data: customerStats } = trpc.customers.getStats.useQuery();
  const { data: convStats } = trpc.conversations.getStats.useQuery();

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  const allItems = pq?.items ?? [];

  const FILTERS = ["Todos", "Em Risco", "Novo Cliente", "Renovação", "Sem Contato"];

  const filtered = filter === "Todos"
    ? allItems
    : allItems.filter(i => i.badges.includes(filter));

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const openChat = (id: number) => setLocation(`/atendimentos?customerId=${id}`);
  const openView = (id: number) => setLocation(`/customers?selectedId=${id}`);

  // Indicador counts from the full list
  const riskCount = allItems.filter(i => i.badges.includes("Em Risco")).length;
  const newCount = allItems.filter(i => i.badges.includes("Novo Cliente")).length;
  const renewalCount = allItems.filter(i => i.badges.includes("Renovação")).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto page-bg min-h-screen">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting()}, {user?.name?.split(" ")[0] ?? "Guardião"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pqLoading ? "Calculando prioridades..." : allItems.length > 0
              ? `${allItems.length} cliente${allItems.length > 1 ? "s" : ""} precisam de atenção hoje`
              : "Tudo em dia — nenhuma ação urgente no momento"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchPQ(); }} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </Button>
      </div>

      {/* ── Indicador Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="card-bg border-border cursor-pointer hover:ring-2 hover:ring-red-400/40 transition-all"
          onClick={() => { setFilter("Em Risco"); setPage(0); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="w-4 h-4 text-red-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Em Risco</p>
              <p className="text-xl font-bold text-foreground">{riskCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-bg border-border cursor-pointer hover:ring-2 hover:ring-blue-400/40 transition-all"
          onClick={() => { setFilter("Novo Cliente"); setPage(0); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><UserPlus className="w-4 h-4 text-blue-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Novos (7d)</p>
              <p className="text-xl font-bold text-foreground">{newCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-bg border-border cursor-pointer hover:ring-2 hover:ring-amber-400/40 transition-all"
          onClick={() => { setFilter("Renovação"); setPage(0); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><Calendar className="w-4 h-4 text-amber-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Renovações (60d)</p>
              <p className="text-xl font-bold text-foreground">{renewalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-bg border-border cursor-pointer hover:ring-2 hover:ring-emerald-400/40 transition-all"
          onClick={() => setLocation('/customers')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><Users className="w-4 h-4 text-emerald-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Clientes</p>
              <p className="text-xl font-bold text-foreground">{customerStats?.total ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Priority Queue ── */}
      <Card className="card-bg border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="w-4 h-4 text-orange-400" />
              Fila de Prioridade
              {allItems.length > 0 && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs ml-1">
                  {allItems.length}
                </Badge>
              )}
            </CardTitle>
            {/* Filter pills */}
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(0); }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filter === f
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "border-white/10 text-muted-foreground hover:border-white/30 hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Ordenado por score de urgência — clientes mais críticos primeiro
          </p>
        </CardHeader>
        <CardContent>
          {pqLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400 py-6 justify-center">
              <CheckCircle2 className="w-4 h-4" />
              {filter === "Todos" ? "Nenhuma ação urgente no momento" : `Nenhum cliente em "${filter}"`}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map(item => (
                <PriorityCard key={item.id} item={item} onChat={openChat} onView={openView} />
              ))}
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                  <span className="text-xs text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                      <Button key={i} size="sm" variant={i === page ? "default" : "ghost"} className="h-7 w-7 p-0 text-xs" onClick={() => setPage(i)}>
                        {i + 1}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="card-bg border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10"><MessageSquare className="w-4 h-4 text-violet-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Atendimentos Abertos</p>
              <p className="text-xl font-bold text-foreground">{convStats?.open ?? 0}</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setLocation("/atendimentos")}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
        <Card className="card-bg border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><TrendingUp className="w-4 h-4 text-emerald-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Clientes Saudáveis</p>
              <p className="text-xl font-bold text-foreground">
                {customerStats ? customerStats.total - customerStats.atRisk - customerStats.churned : 0}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setLocation("/customers")}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
        <Card className="card-bg border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><Bot className="w-4 h-4 text-blue-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Agentes IA Ativos</p>
              <p className="text-xl font-bold text-foreground">—</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setLocation("/ia-automation")}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Ações Rápidas ── */}
      <Card className="card-bg border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-yellow-400" />
            Ações Rápidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation("/atendimentos")}>
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Ver Atendimentos
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/customers")}>
              <Users className="w-3.5 h-3.5 mr-1.5" /> Ver Clientes
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/program-dashboard")}>
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" /> Visão por Programa
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/groups")}>
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Grupos WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/indicators/health")}>
              <TrendingDown className="w-3.5 h-3.5 mr-1.5" /> Saúde dos Clientes
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
