import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, Mail, Phone, Tag, TrendingUp, User, UserX } from "lucide-react";
import { e164Candidates } from "@shared/phone";
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { statusConfig } from "@/pages/Customers";
import {
  PANEL_SECTIONS,
  initials,
  previousConversations,
  readClosedSections,
  safeLocalStorage,
  writeClosedSections,
  type PanelSectionKey,
} from "@/pages/saraShared";
import SaraRegisterCustomer from "./SaraRegisterCustomer";

// Painel do cliente na conversa da Sara, em seções que abrem e fecham (estado salvo no
// localStorage). Sara é dona da conversa; o Cashmiles é dono do cliente — tudo aqui é
// leitura local, exceto "Conversas anteriores" (até 2 GETs de leitura na Sara, sem
// polling) e "Notas do cliente" (grava em customerNotes, nunca na Sara).

/** Renovação em até 30 dias fica destacada (mesma regra de ConversationDetail.tsx). */
const RENEWAL_SOON_MS = 30 * 24 * 60 * 60 * 1000;
/** Conversas anteriores: sem polling na Sara (produção). */
const PREVIOUS_STALE_MS = 60_000;
const NOTES_SHOWN = 3;

function formatBRL(value: number | null): string {
  return `R$ ${Number(value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

const SECTION_TITLES = Object.fromEntries(PANEL_SECTIONS.map(s => [s.key, s.title])) as Record<PanelSectionKey, string>;

function useClosedSections() {
  const [closed, setClosed] = useState<PanelSectionKey[]>(() => readClosedSections(safeLocalStorage()));
  function toggle(key: PanelSectionKey) {
    setClosed(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      writeClosedSections(safeLocalStorage(), next);
      return next;
    });
  }
  return { isOpen: (key: PanelSectionKey) => !closed.includes(key), toggle };
}

function PanelSection({
  sectionKey,
  isOpen,
  onToggle,
  children,
}: {
  sectionKey: PanelSectionKey;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b last:border-b-0">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/40"
      >
        {SECTION_TITLES[sectionKey]}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-2.5">{children}</div>}
    </section>
  );
}

// ─── Conversas anteriores ────────────────────────────────────────────────────
function PreviousConversations({
  customerId,
  phone,
  currentKey,
}: {
  customerId: number;
  phone: string | null;
  currentKey: string;
}) {
  const [, setLocation] = useLocation();
  const phoneForms = phone ? e164Candidates(phone) : [];
  const saraQueries = trpc.useQueries(t =>
    phoneForms.map(p =>
      t.sara.listConversations(
        { phone: p, limit: 10, offset: 0 },
        { staleTime: PREVIOUS_STALE_MS, refetchInterval: false, refetchOnWindowFocus: false },
      ),
    ),
  );
  const legacy = trpc.customers.getLastInteractions.useQuery({ customerId, limit: 10 });

  const list = previousConversations(
    saraQueries.map(q => q.data?.data ?? []),
    legacy.data ?? [],
    currentKey,
  );
  const loading = legacy.isLoading || saraQueries.some(q => q.isLoading);

  if (loading) return <Skeleton className="h-16 w-full" />;
  if (list.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma outra conversa.</p>;
  return (
    <div className="space-y-1">
      {list.map(c => (
        <button
          key={c.key}
          onClick={() => setLocation(c.href)}
          className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Badge variant={c.origin === "Sara" ? "default" : "secondary"} className="text-[9px] h-4 px-1.5 shrink-0">
              {c.origin}
            </Badge>
            <span className="text-xs text-foreground truncate">{c.status}</span>
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.at)}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Notas do cliente (customerNotes — não é a "Nota interna" da conversa) ─────
function CustomerNotes({ customerId }: { customerId: number }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState("");
  const { data: notes = [] } = trpc.customerNotes.listByCustomer.useQuery({ customerId });
  const create = trpc.customerNotes.create.useMutation({
    onSuccess: () => {
      setDraft("");
      utils.customerNotes.listByCustomer.invalidate({ customerId });
    },
    onError: e => toast.error(e.message),
  });

  function add() {
    const content = draft.trim();
    if (!content || create.isPending) return;
    create.mutate({ customerId, content, type: "note" });
  }

  return (
    <>
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma nota ainda.</p>
      ) : (
        notes.slice(0, NOTES_SHOWN).map(n => (
          <div key={n.id} className="bg-muted/40 rounded-xl px-2.5 py-2">
            <p className="text-xs text-foreground whitespace-pre-wrap break-words">{n.content}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {n.createdByName ?? "Atendente"} · {timeAgo(n.createdAt)}
            </p>
          </div>
        ))
      )}
      <div className="flex items-end gap-1.5">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Adicionar nota do cliente..."
          className="min-h-[36px] text-xs resize-none"
          rows={1}
          disabled={create.isPending}
        />
        <Button size="sm" className="h-8 text-xs shrink-0" onClick={add} disabled={!draft.trim() || create.isPending}>
          Adicionar
        </Button>
      </div>
    </>
  );
}

// ─── Painel ──────────────────────────────────────────────────────────────────
export default function SaraCustomerPanel({
  conversationId,
  phone,
  userName,
}: {
  conversationId: string;
  phone: string | null;
  userName: string | null;
}) {
  const [, setLocation] = useLocation();
  const { isOpen, toggle } = useClosedSections();
  const { data, isLoading } = trpc.sara.customerByPhone.useQuery(
    { phone: phone ?? "" },
    { enabled: !!phone },
  );
  const customer = data?.customer;

  const { data: journeyTasks = [] } = trpc.journeyTasks.listByCustomer.useQuery(
    { customerId: customer?.id ?? 0 },
    { enabled: !!customer },
  );
  const allPending = journeyTasks.filter(t => t.status === "pending");
  const pendingTasks = allPending.slice(0, 3);

  if (phone && isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Sem cliente cadastrado: só a seção Cliente, com o botão Cadastrar.
  if (!customer) {
    return (
      <PanelSection sectionKey="cliente" isOpen={isOpen("cliente")} onToggle={() => toggle("cliente")}>
        <div className="flex flex-col items-center gap-2 py-2 text-center text-xs text-muted-foreground">
          <UserX className="w-6 h-6 opacity-40" />
          Cliente não cadastrado
          <SaraRegisterCustomer conversationId={conversationId} phone={phone} suggestedName={userName} />
        </div>
      </PanelSection>
    );
  }

  const score = customer.healthScore;
  const hasMrr = (customer.mrr ?? 0) > 0;
  const renewal = customer.renewalDate ? new Date(customer.renewalDate) : null;
  const renewalSoon = renewal !== null && renewal.getTime() <= Date.now() + RENEWAL_SOON_MS;
  const hasLtv = (customer.lifetimeValue ?? 0) > 0;
  const hasFinance = score != null || hasMrr || renewal !== null || hasLtv;

  return (
    <div>
      <PanelSection sectionKey="cliente" isOpen={isOpen("cliente")} onToggle={() => toggle("cliente")}>
        {data.ambiguous && (
          <div className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            Mais de um cliente com este telefone — mostrando o atualizado mais recentemente.
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {initials(customer.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{customer.name}</p>
            <Badge variant="outline" className="text-xs px-1.5 py-0 mt-0.5">
              {statusConfig[customer.status].label}
            </Badge>
          </div>
        </div>
        {customer.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate">{customer.email}</span>
          </div>
        )}
        {customer.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
            <span>{customer.phone}</span>
          </div>
        )}
        {customer.program && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
            <span>{customer.program}</span>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs justify-start h-8"
          onClick={() => setLocation(`/customers?id=${customer.id}`)}
        >
          <User className="w-3.5 h-3.5 mr-2" />
          Ver perfil completo
        </Button>
      </PanelSection>

      <PanelSection sectionKey="saude" isOpen={isOpen("saude")} onToggle={() => toggle("saude")}>
        {!hasFinance && <p className="text-xs text-muted-foreground">Sem dados de saúde ou financeiro.</p>}
        {/* Índice de Saúde — mesmas faixas de ConversationDetail.tsx */}
        {score != null && (
          <div className="bg-muted/40 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Índice de Saúde
              </span>
              <span className="text-sm font-bold text-foreground">{Math.round(score)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  score >= 70 ? "bg-brand-500" : score >= 40 ? "bg-brand-300" : "bg-destructive",
                )}
                style={{ width: `${Math.min(100, score)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {score >= 70 ? "Cliente saudável" : score >= 40 ? "Atenção necessária" : "Em risco de churn"}
            </p>
          </div>
        )}
        {/* MRR & Renovação — renovação em até 30 dias fica destacada. NPS/CSAT não entram
            (hoje saem pelo canal próprio). */}
        {(hasMrr || renewal) && (
          <div className="grid grid-cols-2 gap-2">
            {hasMrr && (
              <div className="bg-muted/40 rounded-xl p-2.5">
                <p className="text-sm font-bold text-foreground">{formatBRL(customer.mrr)}</p>
                <p className="text-[10px] text-muted-foreground">MRR</p>
              </div>
            )}
            {renewal && (
              <div className={cn("rounded-xl p-2.5", renewalSoon ? "bg-destructive/10" : "bg-muted/40")}>
                <p className={cn("text-sm font-bold", renewalSoon ? "text-destructive" : "text-foreground")}>
                  {renewal.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {renewalSoon ? "Renovação próxima" : "Renovação"}
                </p>
              </div>
            )}
          </div>
        )}
        {hasLtv && (
          <div className="bg-muted/40 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">LTV</span>
            <span className="text-sm font-bold text-foreground">{formatBRL(customer.lifetimeValue)}</span>
          </div>
        )}
      </PanelSection>

      <PanelSection sectionKey="tarefas" isOpen={isOpen("tarefas")} onToggle={() => toggle("tarefas")}>
        {pendingTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tarefa pendente.</p>
        ) : (
          <>
            {pendingTasks.map(t => (
              <div key={t.id} className="bg-muted/40 rounded-xl px-2.5 py-2">
                <p className="text-xs font-medium text-foreground leading-snug truncate">{t.title}</p>
                {t.dueDate && (
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(t.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </p>
                )}
              </div>
            ))}
            {allPending.length > 3 && (
              <p className="text-[10px] text-muted-foreground text-center">+{allPending.length - 3} mais tarefas</p>
            )}
          </>
        )}
      </PanelSection>

      <PanelSection sectionKey="anteriores" isOpen={isOpen("anteriores")} onToggle={() => toggle("anteriores")}>
        <PreviousConversations customerId={customer.id} phone={phone} currentKey={`sara:${conversationId}`} />
      </PanelSection>

      <PanelSection sectionKey="notas" isOpen={isOpen("notas")} onToggle={() => toggle("notas")}>
        <CustomerNotes customerId={customer.id} />
      </PanelSection>
    </div>
  );
}
