import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Calendar, AlertTriangle, Clock, TrendingUp, TrendingDown,
  Phone, MessageSquare, RefreshCw, ChevronDown, Sparkles, Users
} from "lucide-react";
import { useLocation } from "wouter";
import { SubTabBar } from "@/components/SubTabBar";
import { Star } from "lucide-react";

type DaysFilter = 7 | 30 | 60 | 90;

const URGENCY_CONFIG = {
  critical: { label: "Crítico", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  high: { label: "Alta", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
  medium: { label: "Média", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-400" },
  low: { label: "Baixa", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
};

function HealthBar({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-xs text-gray-400">Sem dados</span>;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

function RenewalCard({ item }: { item: any }) {
  const [expanded, setExpanded] = useState(false);
  const [, navigate] = useLocation();
  const urg = URGENCY_CONFIG[item.urgency as keyof typeof URGENCY_CONFIG];
  const daysLabel = item.daysUntilRenewal === 0 ? "Hoje!" :
    item.daysUntilRenewal === 1 ? "Amanhã" :
    `${item.daysUntilRenewal} dias`;

  return (
    <div className={`glass-card p-4 border-l-4 ${item.urgency === 'critical' ? 'border-l-red-500' : item.urgency === 'high' ? 'border-l-orange-500' : item.urgency === 'medium' ? 'border-l-amber-400' : 'border-l-emerald-500'}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {item.name.charAt(0).toUpperCase()}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">{item.name}</h3>
              <p className="text-xs text-gray-500">{item.program || "Sem programa"}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${urg.bg} ${urg.border} ${urg.color}`}>
                {daysLabel}
              </span>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${urg.dot}`} />
            </div>
          </div>

          {/* Health + MRR */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Índice de Saúde</p>
              <HealthBar score={item.healthScore} />
            </div>
            <div>
              <p className="text-xs text-gray-400">MRR</p>
              <p className="text-sm font-semibold text-gray-700">
                {item.mrr ? `R$ ${item.mrr.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` : "—"}
              </p>
            </div>
          </div>

          {/* AI Recommendation */}
          <div className="mt-3 bg-emerald-50/80 border border-emerald-100 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <Sparkles size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-800 leading-relaxed">{item.aiRecommendation}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => navigate(`/customers`)}
            >
              <Users size={11} /> Ver Cliente
            </Button>
            {item.phone && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => window.open(`https://wa.me/${item.phone.replace(/\D/g, '')}`, '_blank')}
              >
                <MessageSquare size={11} /> WhatsApp
              </Button>
            )}
            <button
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              onClick={() => setExpanded(!expanded)}
            >
              Detalhes <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">Email:</span>
                <p className="text-gray-700 truncate">{item.email || "—"}</p>
              </div>
              <div>
                <span className="text-gray-400">Telefone:</span>
                <p className="text-gray-700">{item.phone || "—"}</p>
              </div>
              <div>
                <span className="text-gray-400">NPS:</span>
                <p className="text-gray-700">{item.npsScore !== null ? item.npsScore : "—"}</p>
              </div>
              <div>
                <span className="text-gray-400">Última interação:</span>
                <p className="text-gray-700">
                  {item.lastInteractionAt ? new Date(item.lastInteractionAt).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Data de renovação:</span>
                <p className="text-gray-700 font-semibold">
                  {item.renewalDate ? new Date(item.renewalDate).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>
              <div>
                <span className="text-gray-400">LTV:</span>
                <p className="text-gray-700">
                  {item.lifetimeValue ? `R$ ${item.lifetimeValue.toLocaleString("pt-BR")}` : "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RenewalCalendar() {
  const [daysFilter, setDaysFilter] = useState<DaysFilter>(30);
  const { data: renewals, isLoading, refetch } = trpc.renewalCalendar.list.useQuery({ days: daysFilter });
  const { data: stats } = trpc.renewalCalendar.stats.useQuery();

  const criticalCount = renewals?.filter(r => r.urgency === 'critical').length ?? 0;
  const highCount = renewals?.filter(r => r.urgency === 'high').length ?? 0;

  const CUSTOMER_TABS = [
    { label: "Lista de Clientes", path: "/customers",         icon: Users },
    { label: "Por Programa",      path: "/program-dashboard", icon: Star },
    { label: "Renovações",        path: "/renewal-calendar",  icon: Calendar },
  ];

  return (
    <div className="page-bg min-h-screen">
      <SubTabBar tabs={CUSTOMER_TABS} />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Calendário de Renovações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Clientes com renovação próxima — aja antes do churn</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Atualizar
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "7 dias", value: stats?.in7Days ?? 0, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
          { label: "30 dias", value: stats?.in30Days ?? 0, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
          { label: "60 dias", value: stats?.in60Days ?? 0, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
          { label: "90 dias", value: stats?.in90Days ?? 0, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`stat-card p-4 text-center cursor-pointer border ${border} ${bg}`}
            onClick={() => setDaysFilter(parseInt(label) as DaysFilter)}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500">Próx. {label}</p>
          </div>
        ))}
      </div>

      {/* Urgency alert */}
      {(criticalCount > 0 || highCount > 0) && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">
            <strong>{criticalCount + highCount} cliente{criticalCount + highCount > 1 ? "s" : ""}</strong> precisam de atenção urgente —
            {criticalCount > 0 && ` ${criticalCount} crítico${criticalCount > 1 ? "s" : ""},`}
            {highCount > 0 && ` ${highCount} alta prioridade`}.
            A IA já gerou recomendações para cada um.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 mr-1">Mostrar próximos:</span>
        {([7, 30, 60, 90] as DaysFilter[]).map(d => (
          <button
            key={d}
            onClick={() => setDaysFilter(d)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
              daysFilter === d
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"
            }`}
          >
            {d} dias
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400">
          {renewals?.length ?? 0} cliente{(renewals?.length ?? 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Renewal list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                  <div className="h-8 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : renewals && renewals.length > 0 ? (
        <div className="space-y-3">
          {renewals.map(item => <RenewalCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <Calendar size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma renovação nos próximos {daysFilter} dias</p>
          <p className="text-sm text-gray-400 mt-1">Configure a data de renovação nos perfis dos clientes para aparecer aqui</p>
        </div>
      )}
      </div>
    </div>
  );
}
