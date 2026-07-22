import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, XCircle, Clock, Sparkles, MessageSquare,
  RefreshCw, Filter, ChevronDown, Eye, AlertTriangle,
  TrendingUp, Bell, Gift, UserCheck, Zap
} from "lucide-react";
import { toast } from "sonner";

const ACTION_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  welcome_message:    { label: "Boas-vindas",       icon: Sparkles,     color: "text-emerald-600", bg: "bg-emerald-50" },
  proactive_outreach: { label: "Contato Proativo",  icon: Zap,          color: "text-blue-600",    bg: "bg-blue-50" },
  nps_survey:         { label: "Pesquisa NPS",       icon: TrendingUp,   color: "text-purple-600",  bg: "bg-purple-50" },
  renewal_reminder:   { label: "Lembrete Renovação", icon: Bell,         color: "text-amber-600",   bg: "bg-amber-50" },
  churn_risk_alert:   { label: "Alerta de Churn",    icon: AlertTriangle,color: "text-red-600",     bg: "bg-red-50" },
  upsell_suggestion:  { label: "Sugestão Upsell",    icon: Gift,         color: "text-pink-600",    bg: "bg-pink-50" },
  auto_reply:         { label: "Resposta Automática",icon: MessageSquare,color: "text-teal-600",    bg: "bg-teal-50" },
  escalation:         { label: "Escalonamento",      icon: UserCheck,    color: "text-orange-600",  bg: "bg-orange-50" },
};

const STATUS_CONFIG = {
  pending:  { label: "Pendente",   color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
  approved: { label: "Aprovado",   color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  rejected: { label: "Rejeitado",  color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200" },
  executed: { label: "Executado",  color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
  failed:   { label: "Falhou",     color: "text-gray-700",    bg: "bg-gray-50",    border: "border-gray-200" },
};

function SupervisionCard({ item, onReview }: { item: any; onReview: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const actionCfg = ACTION_TYPE_CONFIG[item.actionType] || ACTION_TYPE_CONFIG.auto_reply;
  const statusCfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  const Icon = actionCfg.icon;

  const reviewMutation = trpc.aiSupervision.review.useMutation({
    onSuccess: () => {
      toast.success("Ação registrada com sucesso");
      onReview();
    },
    onError: () => toast.error("Erro ao registrar ação"),
  });

  const handleApprove = () => reviewMutation.mutate({ id: item.id, action: "approve" });
  const handleReject = () => {
    if (!rejectNote.trim()) {
      setShowRejectInput(true);
      return;
    }
    reviewMutation.mutate({ id: item.id, action: "reject", note: rejectNote });
    setShowRejectInput(false);
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-start gap-3">
        {/* Action type icon */}
        <div className={`w-10 h-10 rounded-xl ${actionCfg.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={18} className={actionCfg.color} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
                <span className="text-xs text-gray-500">{actionCfg.label}</span>
              </div>
              {item.customer && (
                <p className="text-sm font-semibold text-gray-800 mt-1">{item.customer.name}</p>
              )}
              {item.customer?.program && (
                <p className="text-xs text-gray-500">{item.customer.program}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {new Date(item.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{item.actionDescription}</p>

          {/* Message preview */}
          {item.messageContent && (
            <div className="mt-2 bg-gray-50 border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <MessageSquare size={11} /> Mensagem da IA
              </p>
              <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{item.messageContent}</p>
              {item.messageContent.length > 200 && (
                <button
                  className="text-xs text-emerald-600 mt-1 hover:underline flex items-center gap-1"
                  onClick={() => setExpanded(!expanded)}
                >
                  <Eye size={11} /> {expanded ? "Ver menos" : "Ver completo"}
                </button>
              )}
              {expanded && (
                <p className="text-xs text-gray-700 leading-relaxed mt-2">{item.messageContent}</p>
              )}
            </div>
          )}

          {/* Review note */}
          {item.reviewNote && (
            <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl p-2">
              <p className="text-xs text-amber-700">
                <strong>Nota:</strong> {item.reviewNote}
              </p>
            </div>
          )}

          {/* Actions for pending items */}
          {item.status === "pending" && (
            <div className="mt-3 space-y-2">
              {showRejectInput && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Motivo da rejeição (opcional mas recomendado)..."
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    className="text-xs h-16 resize-none"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApprove}
                  disabled={reviewMutation.isPending}
                >
                  <CheckCircle2 size={13} /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={handleReject}
                  disabled={reviewMutation.isPending}
                >
                  <XCircle size={13} /> {showRejectInput ? "Confirmar Rejeição" : "Rejeitar"}
                </Button>
                {showRejectInput && (
                  <button
                    className="text-xs text-gray-400 hover:text-gray-600"
                    onClick={() => setShowRejectInput(false)}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "executed" | "failed";

export default function AISupervision() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const utils = trpc.useUtils();

  const { data: items, isLoading, refetch } = trpc.aiSupervision.list.useQuery({
    status: statusFilter,
    limit: 100,
  });
  const { data: stats } = trpc.aiSupervision.stats.useQuery();

  const handleReview = () => {
    utils.aiSupervision.list.invalidate();
    utils.aiSupervision.stats.invalidate();
  };

  const filterTabs: { key: StatusFilter; label: string; count?: number }[] = [
    { key: "pending",  label: "Pendentes",  count: stats?.pending },
    { key: "approved", label: "Aprovados",  count: stats?.approved },
    { key: "rejected", label: "Rejeitados", count: stats?.rejected },
    { key: "executed", label: "Executados", count: stats?.executed },
    { key: "all",      label: "Todos" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Supervisão da IA</h1>
          <p className="text-sm text-gray-500 mt-0.5">Revise e aprove o que a IA fez — você observa, a IA age</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Pendentes",  value: stats?.pending ?? 0,  color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200" },
          { label: "Aprovados",  value: stats?.approved ?? 0, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { label: "Rejeitados", value: stats?.rejected ?? 0, color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200" },
          { label: "Executados", value: stats?.executed ?? 0, color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200" },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`stat-card p-4 text-center border ${border} ${bg}`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Pending alert */}
      {(stats?.pending ?? 0) > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <Clock size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{stats?.pending} ação{(stats?.pending ?? 0) > 1 ? "ões" : ""}</strong> da IA aguardando sua revisão.
            Aprove para executar ou rejeite com um motivo.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterTabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
              statusFilter === key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"
            }`}
          >
            {label}
            {count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                statusFilter === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-12 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <div className="space-y-3">
          {items.map(item => (
            <SupervisionCard key={item.id} item={item} onReview={handleReview} />
          ))}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <Sparkles size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {statusFilter === "pending" ? "Nenhuma ação pendente" : "Nenhum item encontrado"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {statusFilter === "pending"
              ? "A IA está em dia — todas as ações foram revisadas"
              : "Tente outro filtro de status"}
          </p>
        </div>
      )}
    </div>
  );
}
