import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trophy, AlertTriangle, Flag, MessageSquare, Plus, Trash2, X } from "lucide-react";

const TYPE_CONFIG = {
  victory: {
    label: "Vitória",
    icon: Trophy,
    color: "#0d6b4e",
    bg: "rgba(13,107,78,0.10)",
    border: "rgba(13,107,78,0.20)",
    emoji: "🏆",
  },
  challenge: {
    label: "Desafio",
    icon: AlertTriangle,
    color: "#9a6010",
    bg: "rgba(201,130,39,0.10)",
    border: "rgba(201,130,39,0.22)",
    emoji: "⚠️",
  },
  milestone: {
    label: "Marco",
    icon: Flag,
    color: "#1d4ed8",
    bg: "rgba(29,78,216,0.10)",
    border: "rgba(29,78,216,0.20)",
    emoji: "🚩",
  },
  complaint: {
    label: "Reclamação",
    icon: MessageSquare,
    color: "#b91c1c",
    bg: "rgba(220,38,38,0.10)",
    border: "rgba(220,38,38,0.20)",
    emoji: "🔴",
  },
} as const;

type MilestoneType = keyof typeof TYPE_CONFIG;

interface Props {
  customerId: number;
}

export function CustomerMilestonesTab({ customerId }: Props) {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<MilestoneType>("victory");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [activeFilter, setActiveFilter] = useState<MilestoneType | "all">("all");

  const { data: milestones = [], isLoading } = trpc.customerMilestones.listByCustomer.useQuery({ customerId });

  const createMutation = trpc.customerMilestones.create.useMutation({
    onSuccess: () => {
      setNewTitle("");
      setNewDesc("");
      setShowForm(false);
      utils.customerMilestones.listByCustomer.invalidate({ customerId });
    },
  });

  const deleteMutation = trpc.customerMilestones.delete.useMutation({
    onSuccess: () => utils.customerMilestones.listByCustomer.invalidate({ customerId }),
  });

  const filtered = activeFilter === "all" ? milestones : milestones.filter((m: any) => m.type === activeFilter);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "oklch(0.45 0.05 155)" }}>
          Vitórias, Desafios & Marcos
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showForm ? "Cancelar" : "Registrar"}
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl p-3 space-y-2.5" style={{ background: "rgba(13,107,78,0.05)", border: "1px solid rgba(13,107,78,0.15)" }}>
          {/* Type selector */}
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(TYPE_CONFIG) as MilestoneType[]).map(t => {
              const cfg = TYPE_CONFIG[t];
              return (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg text-[10px] font-medium transition-all"
                  style={{
                    background: newType === t ? cfg.bg : "transparent",
                    border: `1px solid ${newType === t ? cfg.border : "rgba(0,0,0,0.08)"}`,
                    color: newType === t ? cfg.color : "oklch(0.55 0.03 155)",
                  }}
                >
                  <span>{cfg.emoji}</span>
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <Input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder={`Título da ${TYPE_CONFIG[newType].label.toLowerCase()}...`}
            className="h-8 text-xs"
          />
          <Textarea
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Descrição opcional..."
            className="text-xs resize-none"
            rows={2}
          />
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => newTitle.trim() && createMutation.mutate({ customerId, type: newType, title: newTitle.trim(), description: newDesc || undefined })}
            disabled={!newTitle.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Salvando..." : `Registrar ${TYPE_CONFIG[newType].label}`}
          </Button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {(["all", ...Object.keys(TYPE_CONFIG)] as (MilestoneType | "all")[]).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-all"
            style={{
              background: activeFilter === f ? "rgba(13,107,78,0.12)" : "rgba(0,0,0,0.04)",
              color: activeFilter === f ? "oklch(0.35 0.08 155)" : "oklch(0.55 0.03 155)",
              border: `1px solid ${activeFilter === f ? "rgba(13,107,78,0.25)" : "transparent"}`,
            }}
          >
            {f === "all" ? "Todos" : TYPE_CONFIG[f as MilestoneType].emoji + " " + TYPE_CONFIG[f as MilestoneType].label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading && <p className="text-xs" style={{ color: "oklch(0.55 0.05 155)" }}>Carregando...</p>}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-6">
          <p className="text-xs" style={{ color: "oklch(0.65 0.03 155)" }}>
            {activeFilter === "all" ? "Nenhum registro ainda." : `Nenhuma ${TYPE_CONFIG[activeFilter as MilestoneType]?.label.toLowerCase()} registrada.`}
          </p>
          <p className="text-[10px] mt-1" style={{ color: "oklch(0.70 0.03 155)" }}>
            Clique em "Registrar" para adicionar.
          </p>
        </div>
      )}
      <div className="space-y-2">
        {filtered.map((m: any) => {
          const cfg = TYPE_CONFIG[m.type as MilestoneType] ?? TYPE_CONFIG.milestone;
          return (
            <div
              key={m.id}
              className="flex items-start gap-2 p-2.5 rounded-xl group"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <span className="text-base leading-none mt-0.5">{cfg.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold leading-snug" style={{ color: cfg.color }}>{m.title}</p>
                {m.description && (
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "oklch(0.50 0.04 155)" }}>{m.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px]" style={{ color: "oklch(0.65 0.03 155)" }}>
                    {new Date(m.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  {m.createdByName && (
                    <span className="text-[10px]" style={{ color: "oklch(0.70 0.03 155)" }}>· {m.createdByName}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate({ id: m.id })}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                title="Remover"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
