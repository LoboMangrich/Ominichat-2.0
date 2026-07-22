import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Users, TrendingUp, AlertTriangle, Calendar,
  RefreshCw, ChevronRight, Activity, Star, Clock,
  CheckCircle, XCircle, MessageSquare, ChevronDown, ChevronUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { SubTabBar } from "@/components/SubTabBar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function HealthBar({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-xs" style={{ color: "oklch(0.65 0.04 155)" }}>—</span>;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── ProgramCard ──────────────────────────────────────────────────────────────

function ProgramCard({
  prog,
  isSelected,
  onSelect,
}: {
  prog: any;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const urgencyCount = (prog.renewingIn7 ?? 0) + (prog.atRisk ?? 0);

  return (
    <div
      className="cursor-pointer transition-all duration-200"
      onClick={onSelect}
      style={{
        background: isSelected
          ? "linear-gradient(135deg, rgba(0,180,100,0.10), rgba(0,160,90,0.06))"
          : "#fff",
        border: isSelected
          ? "1.5px solid oklch(0.55 0.18 155)"
          : "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        padding: "18px 20px",
        boxShadow: isSelected ? "0 4px 16px rgba(0,180,100,0.12)" : "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-base leading-tight" style={{ color: "oklch(0.20 0.08 155)" }}>
            {prog.program}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "oklch(0.55 0.04 155)" }}>
            {prog.total} cliente{prog.total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {urgencyCount > 0 && (
            <span
              className="flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5"
              style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.18)" }}
            >
              <AlertTriangle size={10} />
              {urgencyCount}
            </span>
          )}
          {isSelected
            ? <ChevronUp size={14} style={{ color: "oklch(0.55 0.18 155)" }} />
            : <ChevronRight size={14} style={{ color: "oklch(0.65 0.04 155)" }} />
          }
        </div>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "Ativos", value: prog.active, color: "#10b981", bg: "rgba(16,185,129,0.08)" },
          { label: "Em Risco", value: prog.atRisk, color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
          { label: "Novos", value: prog.newClients, color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
          { label: "Churn", value: prog.churned, color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-xl p-2 text-center" style={{ background: bg }}>
            <p className="text-base font-bold" style={{ color }}>{value}</p>
            <p className="text-[10px]" style={{ color: "oklch(0.55 0.04 155)" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Índice de Saúde */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium flex items-center gap-1" style={{ color: "oklch(0.55 0.04 155)" }}>
            <Activity size={10} /> Índice de Saúde Médio
          </span>
          <span className="text-[10px]" style={{ color: "oklch(0.65 0.04 155)" }}>
            {prog.avgHealthScore !== null ? `${prog.avgHealthScore}/100` : "—"}
          </span>
        </div>
        <HealthBar score={prog.avgHealthScore} />
      </div>

      {/* Renovações */}
      <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        {[
          { label: "7 dias", value: prog.renewingIn7, urgent: true },
          { label: "30 dias", value: prog.renewingIn30 },
          { label: "60 dias", value: prog.renewingIn60 },
        ].map(({ label, value, urgent }) => (
          <div key={label} className="text-center">
            <p
              className="text-sm font-bold"
              style={{ color: urgent && value > 0 ? "#dc2626" : "oklch(0.30 0.06 155)" }}
            >
              {value}
            </p>
            <p className="text-[10px]" style={{ color: "oklch(0.65 0.04 155)" }}>Renov. {label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ClientRow ────────────────────────────────────────────────────────────────

function ClientRow({ client }: { client: any }) {
  const [, navigate] = useLocation();
  const daysSinceEntry = daysSince(client.createdAt);
  const daysSinceContact = daysSince(client.lastInteractionAt);
  const neverContacted = !client.lastInteractionAt;
  const pendingContact = neverContacted || (daysSinceContact !== null && daysSinceContact > 7);

  const statusLabel: Record<string, string> = {
    Active: "Ativo", "Em Risco": "Em Risco", Churned: "Churn", New: "Novo",
  };
  const statusStyle: Record<string, { bg: string; color: string }> = {
    Active: { bg: "rgba(16,185,129,0.08)", color: "#10b981" },
    "Em Risco": { bg: "rgba(245,158,11,0.08)", color: "#f59e0b" },
    Churned: { bg: "rgba(239,68,68,0.08)", color: "#ef4444" },
    New: { bg: "rgba(59,130,246,0.08)", color: "#3b82f6" },
  };
  const ss = statusStyle[client.status] || { bg: "rgba(0,0,0,0.05)", color: "oklch(0.50 0.04 155)" };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors rounded-xl"
      style={{
        background: pendingContact ? "rgba(245,158,11,0.04)" : "transparent",
        border: pendingContact ? "1px solid rgba(245,158,11,0.12)" : "1px solid transparent",
      }}
      onClick={() => navigate(`/customers?selectedId=${client.id}`)}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
        style={{
          background: "linear-gradient(135deg, oklch(0.55 0.18 155), oklch(0.45 0.16 155))",
          color: "#fff",
        }}
      >
        {client.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm truncate" style={{ color: "oklch(0.20 0.08 155)" }}>
            {client.name}
          </p>
          {pendingContact && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: "rgba(245,158,11,0.12)", color: "#d97706" }}
            >
              {neverContacted ? "Sem contato" : `${daysSinceContact}d sem contato`}
            </span>
          )}
        </div>
        <p className="text-xs truncate" style={{ color: "oklch(0.60 0.04 155)" }}>
          {client.program || "Sem programa"}
          {daysSinceEntry !== null && (
            <span className="ml-2" style={{ color: "oklch(0.70 0.04 155)" }}>
              · Entrou há {daysSinceEntry}d
            </span>
          )}
        </p>
      </div>

      {/* Status + contact indicator */}
      <div className="flex items-center gap-2 shrink-0">
        {neverContacted ? (
          <span title="Nunca foi contactado"><XCircle className="w-4 h-4" style={{ color: "#ef4444" }} /></span>
        ) : pendingContact ? (
          <span title="Aguardando contato"><Clock className="w-4 h-4" style={{ color: "#f59e0b" }} /></span>
        ) : (
          <span title="Em dia"><CheckCircle className="w-4 h-4" style={{ color: "#10b981" }} /></span>
        )}
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: ss.bg, color: ss.color }}
        >
          {statusLabel[client.status] || client.status}
        </span>
        <HealthBar score={client.healthScore} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProgramDashboard() {
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [filterPending, setFilterPending] = useState(false);
  const clientListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to client list when a program is selected
  useEffect(() => {
    if (selectedProgram && clientListRef.current) {
      setTimeout(() => {
        clientListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedProgram]);

  const { data: programs, isLoading, refetch } = trpc.programDashboard.summary.useQuery();
  const { data: allClients } = trpc.programDashboard.recentEntries.useQuery({
    program: selectedProgram || "all",
    limit: 100,
  });

  const totalClients = programs?.reduce((s, p) => s + p.total, 0) ?? 0;
  const totalAtRisk = programs?.reduce((s, p) => s + p.atRisk, 0) ?? 0;
  const totalRenewing7 = programs?.reduce((s, p) => s + p.renewingIn7, 0) ?? 0;
  const totalNew = programs?.reduce((s, p) => s + p.newClients, 0) ?? 0;

  const clients = allClients ?? [];
  const pendingClients = clients.filter(c => !c.lastInteractionAt || daysSince(c.lastInteractionAt)! > 7);
  const displayClients = filterPending ? pendingClients : clients;

  const CUSTOMER_TABS = [
    { label: "Lista de Clientes", path: "/customers",         icon: Users },
    { label: "Por Programa",      path: "/program-dashboard", icon: Star },
    { label: "Renovações",        path: "/renewal-calendar",  icon: Calendar },
  ];

  return (
    <div className="page-bg min-h-screen">
      <SubTabBar tabs={CUSTOMER_TABS} />
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.20 0.08 155)" }}>
            Visão por Programa
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "oklch(0.55 0.04 155)" }}>
            Acompanhe cada produto e saiba quem precisa de atenção agora
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Atualizar
        </Button>
      </div>

      {/* Indicador Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de Clientes", value: totalClients, icon: Users, color: "#10b981", bg: "rgba(16,185,129,0.08)" },
          { label: "Novos (últimos 30d)", value: totalNew, icon: TrendingUp, color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
          { label: "Em Risco", value: totalAtRisk, icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
          { label: "Renovam em 7 dias", value: totalRenewing7, icon: Clock, color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="p-4 rounded-2xl"
            style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: "oklch(0.20 0.08 155)" }}>{value}</p>
                <p className="text-xs" style={{ color: "oklch(0.55 0.04 155)" }}>{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Program Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)" }}>
              <div className="h-5 rounded w-2/3 mb-3" style={{ background: "rgba(0,0,0,0.06)" }} />
              <div className="h-3 rounded w-1/3 mb-4" style={{ background: "rgba(0,0,0,0.04)" }} />
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[1, 2, 3, 4].map(j => <div key={j} className="h-12 rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }} />)}
              </div>
            </div>
          ))}
        </div>
      ) : programs && programs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {programs.map(prog => (
            <ProgramCard
              key={prog.program}
              prog={prog}
              isSelected={selectedProgram === prog.program}
              onSelect={() => setSelectedProgram(selectedProgram === prog.program ? null : prog.program)}
            />
          ))}
        </div>
      ) : (
        <div
          className="p-12 text-center rounded-2xl"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)" }}
        >
          <Users size={40} className="mx-auto mb-3" style={{ color: "oklch(0.75 0.04 155)" }} />
          <p className="font-medium" style={{ color: "oklch(0.55 0.04 155)" }}>Nenhum programa encontrado</p>
          <p className="text-sm mt-1" style={{ color: "oklch(0.65 0.04 155)" }}>
            Os programas aparecem automaticamente quando clientes são cadastrados com um produto
          </p>
        </div>
      )}

      {/* Client list */}
      <div
        ref={clientListRef}
        className="rounded-2xl overflow-hidden"
        style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
      >
        {/* List header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
        >
          <div>
            <h2 className="font-bold" style={{ color: "oklch(0.20 0.08 155)" }}>
              {selectedProgram ? `Clientes — ${selectedProgram}` : "Todos os Clientes"}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "oklch(0.60 0.04 155)" }}>
              {displayClients.length} cliente{displayClients.length !== 1 ? "s" : ""}
              {filterPending && ` aguardando contato`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterPending(!filterPending)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
              style={{
                background: filterPending ? "rgba(245,158,11,0.12)" : "rgba(0,0,0,0.05)",
                color: filterPending ? "#d97706" : "oklch(0.50 0.04 155)",
                border: filterPending ? "1px solid rgba(245,158,11,0.25)" : "1px solid transparent",
              }}
            >
              <Clock size={11} />
              {filterPending ? `${pendingClients.length} pendentes` : "Ver pendentes"}
            </button>
            {selectedProgram && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedProgram(null)} className="text-xs">
                Ver todos
              </Button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div
          className="flex items-center gap-4 px-5 py-2 text-[10px]"
          style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.04)" }}
        >
          <span className="flex items-center gap-1" style={{ color: "#10b981" }}>
            <CheckCircle size={10} /> Em dia
          </span>
          <span className="flex items-center gap-1" style={{ color: "#f59e0b" }}>
            <Clock size={10} /> Aguardando contato (+7 dias)
          </span>
          <span className="flex items-center gap-1" style={{ color: "#ef4444" }}>
            <XCircle size={10} /> Nunca contactado
          </span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-black/[0.04] px-1">
          {displayClients.length > 0 ? (
            displayClients.map(client => <ClientRow key={client.id} client={client} />)
          ) : (
            <div className="py-10 text-center">
              <MessageSquare size={28} className="mx-auto mb-2" style={{ color: "oklch(0.75 0.04 155)" }} />
              <p className="text-sm" style={{ color: "oklch(0.60 0.04 155)" }}>
                {filterPending ? "Todos os clientes estão em dia!" : "Nenhum cliente encontrado"}
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
