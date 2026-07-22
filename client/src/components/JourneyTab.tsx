import { useState } from "react";
import { CheckCircle2, Circle, SkipForward, Play, MessageSquare, Zap } from "lucide-react";

interface JourneyTask {
  id: number;
  title: string;
  status: string;
  phase: string;
  priority: string;
  dueDate?: string | Date | null;
  description?: string | null;
}

interface JourneyTabProps {
  customer: any;
  journeyTasks: JourneyTask[];
  completeTask: (id: number) => void;
  skipTask: (id: number) => void;
  initProtocol: () => void;
  isCompleting: boolean;
  isSkipping: boolean;
  isIniting: boolean;
  openChat: () => void;
}

const PHASE_CONFIG = {
  onboarding: { label: "Onboarding", color: "#1d4ed8", bg: "rgba(29,78,216,0.10)", icon: "🚀" },
  monthly: { label: "Acompanhamento", color: "#0d6b4e", bg: "rgba(13,107,78,0.10)", icon: "📅" },
  renewal: { label: "Renovação", color: "#9a6010", bg: "rgba(201,130,39,0.10)", icon: "🔄" },
  manual: { label: "Manual", color: "oklch(0.50 0.05 155)", bg: "rgba(0,0,0,0.06)", icon: "📝" },
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#b91c1c",
  high: "#9a6010",
  normal: "#0d6b4e",
};

export function JourneyTab({ customer, journeyTasks, completeTask, skipTask, initProtocol, isCompleting, isSkipping, isIniting, openChat }: JourneyTabProps) {
  const [activePhase, setActivePhase] = useState<string>("onboarding");

  const phases = ["onboarding", "monthly", "renewal"] as const;

  // Group tasks by phase
  const tasksByPhase: Record<string, JourneyTask[]> = {};
  for (const phase of phases) {
    tasksByPhase[phase] = journeyTasks.filter(t => t.phase === phase);
  }

  // Calculate phase progress
  const phaseProgress = (phase: string) => {
    const tasks = tasksByPhase[phase] ?? [];
    if (tasks.length === 0) return { done: 0, total: 0, pct: 0 };
    const done = tasks.filter(t => t.status === 'done' || t.status === 'completed' || t.status === 'skipped').length;
    return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100) };
  };

  // Determine current active phase (first with pending tasks)
  const currentPhase = phases.find(p => tasksByPhase[p]?.some(t => t.status === 'pending')) ?? "onboarding";

  // AI suggestion based on next pending task
  const nextPending = journeyTasks.find(t => t.status === 'pending');
  const daysSinceEntry = Math.floor((Date.now() - new Date(customer.createdAt).getTime()) / 86400000);
  const aiSuggestion = nextPending
    ? nextPending.title
    : daysSinceEntry <= 7
      ? "Enviar boas-vindas e apresentar o guardião"
      : "Fazer check-in mensal com o cliente";

  const hasAnyTasks = journeyTasks.length > 0;

  if (!hasAnyTasks) {
    return (
      <div className="space-y-4">
        {/* Empty state */}
        <div
          className="rounded-2xl p-5 text-center space-y-3"
          style={{ background: "rgba(13,107,78,0.06)", border: "1px dashed rgba(13,107,78,0.25)" }}
        >
          <div className="text-3xl">🗺️</div>
          <p className="text-sm font-semibold" style={{ color: "oklch(0.30 0.06 155)" }}>Jornada não iniciada</p>
          <p className="text-xs" style={{ color: "oklch(0.55 0.05 155)" }}>
            Inicie o protocolo de jornada para criar automaticamente as tarefas de onboarding, acompanhamento mensal e renovação para este cliente.
          </p>
          <button
            onClick={initProtocol}
            disabled={isIniting}
            className="w-full py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: "#0d6b4e", color: "white" }}
          >
            {isIniting ? "Iniciando..." : "🚀 Iniciar Protocolo de Jornada"}
          </button>
        </div>

        {/* AI suggestion */}
        <div
          className="rounded-xl p-3 flex items-start gap-2"
          style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.20)" }}
        >
          <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#9a6010" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "#9a6010" }}>Sugestão da IA</p>
            <p className="text-xs" style={{ color: "oklch(0.35 0.05 155)" }}>{aiSuggestion}</p>
            <button
              onClick={openChat}
              className="mt-1.5 text-[10px] font-bold flex items-center gap-1"
              style={{ color: "#0d6b4e" }}
            >
              <MessageSquare className="w-3 h-3" /> Abrir chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayPhase = activePhase || currentPhase;
  const phaseTasks = tasksByPhase[displayPhase] ?? [];
  const pendingTasks = phaseTasks.filter(t => t.status === 'pending');
  const doneTasks = phaseTasks.filter(t => t.status === 'done' || t.status === 'completed');
  const skippedTasks = phaseTasks.filter(t => t.status === 'skipped');

  return (
    <div className="space-y-4">
      {/* Phase selector bar */}
      <div className="flex gap-1">
        {phases.map(phase => {
          const cfg = PHASE_CONFIG[phase];
          const prog = phaseProgress(phase);
          const isActive = displayPhase === phase;
          const isCurrent = currentPhase === phase;
          return (
            <button
              key={phase}
              onClick={() => setActivePhase(phase)}
              className="flex-1 rounded-xl p-2 text-center transition-all"
              style={isActive
                ? { background: cfg.bg, border: `1.5px solid ${cfg.color}` }
                : { background: "rgba(0,0,0,0.03)", border: "1.5px solid transparent" }
              }
            >
              <div className="text-base">{cfg.icon}</div>
              <p className="text-[9px] font-bold mt-0.5 leading-tight" style={{ color: isActive ? cfg.color : "oklch(0.55 0.05 155)" }}>
                {cfg.label}
              </p>
              {prog.total > 0 && (
                <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${prog.pct}%`, background: cfg.color }}
                  />
                </div>
              )}
              {isCurrent && (
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full mx-auto" style={{ background: cfg.color }} />
              )}
            </button>
          );
        })}
      </div>

      {/* AI suggestion banner */}
      {nextPending && (
        <div
          className="rounded-xl p-3 flex items-start gap-2"
          style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.20)" }}
        >
          <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#9a6010" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "#9a6010" }}>Próxima ação sugerida pela IA</p>
            <p className="text-xs font-medium" style={{ color: "oklch(0.30 0.06 155)" }}>{nextPending.title}</p>
            {nextPending.dueDate && (
              <p className="text-[10px] mt-0.5" style={{ color: PRIORITY_COLOR[nextPending.priority] ?? "#0d6b4e" }}>
                Prazo: {new Date(nextPending.dueDate).toLocaleDateString('pt-BR')}
              </p>
            )}
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={openChat}
                className="text-[10px] font-bold flex items-center gap-1"
                style={{ color: "#0d6b4e" }}
              >
                <MessageSquare className="w-3 h-3" /> Abrir chat
              </button>
              <button
                onClick={() => completeTask(nextPending.id)}
                disabled={isCompleting}
                className="text-[10px] font-bold flex items-center gap-1"
                style={{ color: "#1d4ed8" }}
              >
                <CheckCircle2 className="w-3 h-3" /> Marcar feito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase task list */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "oklch(0.45 0.05 155)" }}>
            {PHASE_CONFIG[displayPhase as keyof typeof PHASE_CONFIG]?.label ?? displayPhase} — {phaseProgress(displayPhase).done}/{phaseProgress(displayPhase).total} concluídas
          </p>
        </div>

        {phaseTasks.length === 0 ? (
          <p className="text-xs text-center py-3" style={{ color: "oklch(0.60 0.04 155)" }}>
            Nenhuma tarefa nesta fase
          </p>
        ) : (
          <>
            {/* Pending tasks */}
            {pendingTasks.map(task => (
              <div
                key={task.id}
                className="flex items-start gap-2 p-2.5 rounded-xl"
                style={{ background: "rgba(13,107,78,0.05)", border: "1px solid rgba(13,107,78,0.12)" }}
              >
                <Circle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: PRIORITY_COLOR[task.priority] ?? "#0d6b4e" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "oklch(0.25 0.06 155)" }}>{task.title}</p>
                  {task.dueDate && (
                    <p className="text-[10px] mt-0.5" style={{ color: PRIORITY_COLOR[task.priority] ?? "#0d6b4e" }}>
                      Prazo: {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  <div className="flex gap-1.5 mt-1.5">
                    <button
                      onClick={() => completeTask(task.id)}
                      disabled={isCompleting}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                      style={{ background: "rgba(13,107,78,0.15)", color: "#0d6b4e" }}
                    >
                      <Play className="w-2.5 h-2.5" /> Concluir
                    </button>
                    <button
                      onClick={() => skipTask(task.id)}
                      disabled={isSkipping}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1"
                      style={{ background: "rgba(0,0,0,0.06)", color: "oklch(0.50 0.05 155)" }}
                    >
                      <SkipForward className="w-2.5 h-2.5" /> Pular
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Done tasks (collapsed) */}
            {doneTasks.length > 0 && (
              <div className="space-y-1">
                {doneTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                    style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)" }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#0d6b4e" }} />
                    <p className="text-[11px]" style={{ color: "oklch(0.60 0.04 155)", textDecoration: "line-through" }}>{task.title}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Skipped tasks */}
            {skippedTasks.length > 0 && (
              <div className="space-y-1">
                {skippedTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                    style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)" }}
                  >
                    <SkipForward className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.60 0.04 155)" }} />
                    <p className="text-[11px]" style={{ color: "oklch(0.65 0.03 155)", textDecoration: "line-through" }}>{task.title}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Re-init protocol button */}
      <button
        onClick={initProtocol}
        disabled={isIniting}
        className="w-full py-1.5 rounded-xl text-[10px] font-bold transition-all"
        style={{ background: "rgba(13,107,78,0.08)", color: "#0d6b4e", border: "1px solid rgba(13,107,78,0.15)" }}
      >
        {isIniting ? "Reiniciando..." : "↺ Reiniciar protocolo"}
      </button>
    </div>
  );
}
