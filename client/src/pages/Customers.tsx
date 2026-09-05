import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  Download,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Star,
  Tag,
  TrendingUp,
  User,
  UserPlus,
  Activity,
  ChevronDown,
  ChevronUp,
  Users,
  DollarSign,
  ShoppingBag,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { SubTabBar } from "@/components/SubTabBar";
import { JourneyTab } from "@/components/JourneyTab";
import { TranscriptsTab } from "@/components/TranscriptsTab";
import { CustomerMilestonesTab } from "@/components/CustomerMilestonesTab";
import { ClientROIPanel } from "@/components/ClientROIPanel";
import { Calendar } from "lucide-react";
const NewClients = lazy(() => import("./NewClients"));

// conv.status vem do banco em inglês (enum conversations.status, drizzle/schema.ts) — comparar
// sempre contra "Open"/"Waiting", nunca contra o rótulo em português.
export function getConversationStatusDisplay(status: string | null | undefined): { color: string; label: string } {
  if (status === "Open") return { color: "#0d6b4e", label: "Aberto" };
  if (status === "Waiting") return { color: "#9a6010", label: "Aguardando" };
  return { color: "oklch(0.55 0.05 155)", label: "Fechado" };
}

// ─── CustomerTasksTab ─────────────────────────────────────────────────────────
function CustomerTasksTab({ customerId }: { customerId: number }) {
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const utils = trpc.useUtils();
  const { data: taskList = [], isLoading } = trpc.tasks.list.useQuery({ customerId });
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => { setNewTitle(""); utils.tasks.list.invalidate({ customerId }); }
  });
  const updateStatus = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => utils.tasks.list.invalidate({ customerId })
  });

  const priorityColors: Record<string, string> = {
    low: '#22c55e', medium: '#f59e0b', high: '#f97316', urgent: '#ef4444'
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold" style={{ color: 'oklch(0.45 0.05 155)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tarefas do Cliente</p>
      {/* New task form */}
      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && newTitle.trim() && createTask.mutate({ customerId, title: newTitle.trim(), priority: newPriority })}
          placeholder="Nova tarefa..."
          className="flex-1 text-xs px-3 py-2 rounded-lg border outline-none"
          style={{ background: 'rgba(13,107,78,0.06)', borderColor: 'rgba(13,107,78,0.15)', color: 'oklch(0.35 0.05 155)' }}
        />
        <select
          value={newPriority}
          onChange={e => setNewPriority(e.target.value as any)}
          className="text-xs px-2 py-2 rounded-lg border outline-none"
          style={{ background: 'rgba(13,107,78,0.06)', borderColor: 'rgba(13,107,78,0.15)', color: 'oklch(0.35 0.05 155)' }}
        >
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>
      </div>
      {/* Task list */}
      {isLoading && <p className="text-xs" style={{ color: 'oklch(0.55 0.05 155)' }}>Carregando...</p>}
      {!isLoading && taskList.length === 0 && (
        <p className="text-xs" style={{ color: 'oklch(0.55 0.05 155)' }}>Nenhuma tarefa ainda. Adicione acima.</p>
      )}
      {taskList.map((task: any) => (
        <div key={task.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(13,107,78,0.04)', border: '1px solid rgba(13,107,78,0.10)' }}>
          <button
            onClick={() => updateStatus.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' })}
            className="mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center"
            style={{ borderColor: priorityColors[task.priority] ?? '#6366f1', background: task.status === 'done' ? (priorityColors[task.priority] ?? '#6366f1') : 'transparent' }}
          >
            {task.status === 'done' && <span style={{ color: 'white', fontSize: 9 }}>✓</span>}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs" style={{ color: task.status === 'done' ? 'oklch(0.65 0.03 155)' : 'oklch(0.35 0.05 155)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-medium" style={{ color: priorityColors[task.priority] ?? '#6366f1' }}>{task.priority}</span>
              <span className="text-[10px]" style={{ color: 'oklch(0.65 0.05 155)' }}>{task.status}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Chaves = valores reais do enum customers.status (drizzle/schema.ts). Antes, a chave do status
// "At Risk" estava escrita como "Em Risco" (o rótulo, não o valor do enum) — statusConfig[c.status]
// nunca casava para clientes em risco, e o badge de status simplesmente não aparecia para eles.
export const statusConfig: Record<string, { bg: string; color: string; border: string; label: string }> = {
  Active:     { bg: "rgba(13,107,78,0.10)",  color: "#0d6b4e", border: "rgba(13,107,78,0.20)",  label: "Ativo" },
  "At Risk":  { bg: "rgba(201,130,39,0.12)", color: "#9a6010", border: "rgba(201,130,39,0.22)", label: "Em Risco" },
  Churned:    { bg: "rgba(220,38,38,0.10)",  color: "#b91c1c", border: "rgba(220,38,38,0.20)",  label: "Cancelado" },
  New:        { bg: "rgba(52,130,246,0.10)", color: "#1d4ed8", border: "rgba(52,130,246,0.20)", label: "Novo" },
};

export default function Customers() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"all" | "new">("all");
  // Read selectedId from URL to auto-open customer panel (e.g. from Dashboard)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const selectedIdFromUrl = urlParams.get('selectedId') ? parseInt(urlParams.get('selectedId')!) : urlParams.get('id') ? parseInt(urlParams.get('id')!) : null;
  const [panelTab, setPanelTab] = useState<'profile' | 'journey' | 'notes' | 'transcripts' | 'roi'>('profile');
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [programFilter, setProgramFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showHsBreakdown, setShowHsBreakdown] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", program: "", status: "New" as const, company: "", notes: "" });

  // Debounce search to avoid excessive queries on large datasets (10k+ customers)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      if (search !== debouncedSearch) setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, refetch } = trpc.customers.list.useQuery({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    program: programFilter || undefined,
    page,
    limit: 20,
  });

  const { data: programs } = trpc.customers.getPrograms.useQuery();

  const createMutation = trpc.customers.create.useMutation({
    onSuccess: () => { toast.success("Cliente criado!"); setShowCreate(false); setNewCustomer({ name: "", email: "", phone: "", program: "", status: "New", company: "", notes: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.customers.update.useMutation({
    onSuccess: () => { toast.success("Cliente atualizado!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: hsPreview, refetch: refetchHs } = trpc.healthScore.preview.useQuery(
    { customerId: selectedCustomer?.id ?? 0 },
    { enabled: !!selectedCustomer && showHsBreakdown }
  );

  const { data: hsHistory } = trpc.healthScore.getHistory.useQuery(
    { customerId: selectedCustomer?.id ?? 0, limit: 10 },
    { enabled: !!selectedCustomer && showHsBreakdown }
  );

  const [showChannelHistory, setShowChannelHistory] = useState(false);
  const [showJourney, setShowJourney] = useState(true); // auto-open journey tab
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<'note' | 'call' | 'meeting' | 'email' | 'whatsapp'>('note');
  const { data: channelHistory } = trpc.customers.getChannelHistory.useQuery(
    { customerId: selectedCustomer?.id ?? 0 },
    { enabled: !!selectedCustomer && showChannelHistory }
  );
  const { data: lastInteractions } = trpc.customers.getLastInteractions.useQuery(
    { customerId: selectedCustomer?.id ?? 0, limit: 5 },
    { enabled: !!selectedCustomer }
  );

  const { data: journeyTasks, refetch: refetchJourney } = trpc.journeyTasks.listByCustomer.useQuery(
    { customerId: selectedCustomer?.id ?? 0 },
    { enabled: !!selectedCustomer }
  );
  const initProtocolMutation = trpc.journeyTasks.initProtocol.useMutation({
    onSuccess: () => { toast.success('Protocolo de jornada iniciado!'); refetchJourney(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: customerNotes, refetch: refetchNotes } = trpc.customerNotes.listByCustomer.useQuery(
    { customerId: selectedCustomer?.id ?? 0 },
    { enabled: !!selectedCustomer && showNotes }
  );

  const completeTaskMutation = trpc.journeyTasks.complete.useMutation({
    onSuccess: () => { toast.success("Tarefa concluída!"); refetchJourney(); },
    onError: (e: any) => toast.error(e.message),
  });

  const skipTaskMutation = trpc.journeyTasks.skip.useMutation({
    onSuccess: () => { toast.success("Tarefa pulada!"); refetchJourney(); },
    onError: (e: any) => toast.error(e.message),
  });

  const addNoteMutation = trpc.customerNotes.create.useMutation({
    onSuccess: () => { toast.success("Nota adicionada!"); setNewNote(""); refetchNotes(); },
    onError: (e: any) => toast.error(e.message),
  });

  const hsChartData = useMemo(() => {
    if (!hsHistory || hsHistory.length < 2) return [];
    return [...hsHistory].reverse().map((h: any) => ({
      date: new Date(h.calculatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      score: Math.round(h.score),
    }));
  }, [hsHistory]);

  const recalcSingleMutation = trpc.healthScore.recalculate.useMutation({
    onSuccess: () => { toast.success("Índice de Saúde recalculado!"); refetch(); refetchHs(); },
    onError: (e) => toast.error(e.message),
  });

  const computeAllHealthMutation = trpc.customers.computeAllHealthScores.useMutation({
    onSuccess: (data) => { toast.success(`Índice de Saúde recalculado para ${data.updated} clientes!`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;

  // Fetch customer by ID from URL param (works regardless of pagination)
  const { data: customerFromUrl } = trpc.customers.getById.useQuery(
    { id: selectedIdFromUrl! },
    { enabled: !!selectedIdFromUrl }
  );

  // Auto-open customer panel when navigated from Dashboard with ?selectedId=X
  useEffect(() => {
    if (customerFromUrl && !selectedCustomer) {
      setSelectedCustomer(customerFromUrl);
    }
  }, [customerFromUrl]);

  // Fetch full customer detail with purchase history when panel is open
  const { data: customerDetail } = trpc.customers.getById.useQuery(
    { id: selectedCustomer?.id ?? 0 },
    { enabled: !!selectedCustomer }
  );
  const customerPurchases: any[] = (customerDetail as any)?.purchases ?? [];

  const CUSTOMER_TABS = [
    { label: "Lista de Clientes", path: "/customers", icon: Users as any },
    { label: "Por Programa",      path: "/program-dashboard", icon: Star as any },
    { label: "Renovações",        path: "/renewal-calendar", icon: Calendar as any },
  ];

  return (
    <div className="page-bg min-h-screen">
      <SubTabBar tabs={CUSTOMER_TABS} />
      <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.65)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.05), 0 1px 0 rgba(255,255,255,1) inset",
            backdropFilter: "blur(16px)",
          }}
        >
          <button
            onClick={() => setActiveTab("all")}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={activeTab === "all" ? {
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,1) inset",
              color: "oklch(0.20 0.08 155)",
              fontWeight: 700,
            } : { color: "oklch(0.50 0.05 155)" }}
          >
            <User className="w-4 h-4" />
            Todos os Clientes
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: "rgba(13,107,78,0.12)", color: "#0d6b4e" }}
            >{total}</span>
          </button>
          <button
            onClick={() => setActiveTab("new")}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={activeTab === "new" ? {
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,1) inset",
              color: "oklch(0.20 0.08 155)",
              fontWeight: 700,
            } : { color: "oklch(0.50 0.05 155)" }}
          >
            <UserPlus className="w-4 h-4" />
            Novos Clientes
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => computeAllHealthMutation.mutate()}
            disabled={computeAllHealthMutation.isPending}
            title="Recalcular Índice de Saúde de todos os clientes"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${computeAllHealthMutation.isPending ? "animate-spin" : ""}`} />
            {computeAllHealthMutation.isPending ? "Calculando..." : "Índice de Saúde"}
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Novo Cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <Input value={newCustomer.name} onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} placeholder="Nome completo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Input value={newCustomer.company} onChange={e => setNewCustomer(p => ({ ...p, company: e.target.value }))} placeholder="Nome da empresa" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={newCustomer.email} onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" type="email" />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={newCustomer.phone} onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} placeholder="+55 11 99999-9999" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Programa</Label>
                  <Input value={newCustomer.program} onChange={e => setNewCustomer(p => ({ ...p, program: e.target.value }))} placeholder="Nome do programa" />
                </div>
                <div className="space-y-1.5">
                  <Label>Situação</Label>
                  <Select value={newCustomer.status} onValueChange={v => setNewCustomer(p => ({ ...p, status: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([value, cfg]) => (
                        <SelectItem key={value} value={value}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Textarea value={newCustomer.notes} onChange={e => setNewCustomer(p => ({ ...p, notes: e.target.value }))} placeholder="Observações internas..." rows={3} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={() => createMutation.mutate(newCustomer)} disabled={!newCustomer.name || createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Cliente"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "new" && (
        <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>}>
          <NewClients />
        </Suspense>
      )}

      {activeTab === "all" && <div className="space-y-5">
      {/* Filters */}
      <div
        className="flex gap-3 flex-wrap p-3 rounded-2xl"
        style={{
          background: "rgba(255,255,255,0.60)",
          border: "1px solid rgba(255,255,255,0.80)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04), 0 1px 0 rgba(255,255,255,1) inset",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "oklch(0.55 0.05 155)" }} />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 input-glass"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(statusConfig).map(([value, cfg]) => (
              <SelectItem key={value} value={value}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={programFilter} onValueChange={v => { setProgramFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todos os programas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os programas</SelectItem>
            {(programs ?? []).map(p => <SelectItem key={p!} value={p!}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-5">
        {/* Customer List */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum cliente encontrado</p>
              <p className="text-sm mt-1">Tente ajustar os filtros ou adicione um novo cliente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {customers.map((c) => {
                const cfg = statusConfig[c.status];
                const isSelected = selectedCustomer?.id === c.id;
                const hs = (c as any).healthScore;
                const hsColor = hs >= 70 ? "#0d6b4e" : hs >= 40 ? "#9a6010" : "#b91c1c";
                const hsBg = hs >= 70 ? "rgba(13,107,78,0.10)" : hs >= 40 ? "rgba(201,130,39,0.12)" : "rgba(220,38,38,0.10)";
                const hsBorder = hs >= 70 ? "rgba(13,107,78,0.20)" : hs >= 40 ? "rgba(201,130,39,0.22)" : "rgba(220,38,38,0.20)";
                return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
                  style={isSelected ? {
                    background: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(255,255,255,1)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,1) inset, 2px 0 0 oklch(0.49 0.19 155) inset",
                    transform: "translateX(2px)",
                  } : {
                    background: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(255,255,255,0.75)",
                    boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = "rgba(255,255,255,0.80)";
                      el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,1) inset";
                      el.style.transform = "translateX(2px)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = "rgba(255,255,255,0.55)";
                      el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.04)";
                      el.style.transform = "";
                    }
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "rgba(13,107,78,0.12)", border: "1px solid rgba(13,107,78,0.20)" }}
                  >
                    <span className="text-sm font-black" style={{ color: "#0d6b4e" }}>{c.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate" style={{ color: "oklch(0.20 0.08 155)" }}>{c.name}</p>
                      {cfg && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                        >
                          {cfg.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "oklch(0.50 0.05 155)" }}>
                      {c.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.email}</span>}
                      {c.program && (
                        <span className="flex items-center gap-1 flex-wrap">
                          <Tag className="w-3 h-3 shrink-0" />
                          {c.program.split(',').map((p: string) => p.trim()).filter(Boolean).map((prog: string, i: number) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(13,107,78,0.10)', color: '#0d6b4e' }}>{prog}</span>
                          ))}
                        </span>
                      )}
                      {c.createdAt && (() => {
                        const days = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86400000);
                        return <span className="flex items-center gap-1" title={`Entrou em ${new Date(c.createdAt).toLocaleDateString('pt-BR')}`}><Calendar className="w-3 h-3" />{days === 0 ? 'Hoje' : days === 1 ? '1 dia' : `${days} dias`}</span>;
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hs != null && (
                      <div
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold"
                        style={{ background: hsBg, color: hsColor, border: `1px solid ${hsBorder}` }}
                        title="Índice de Saúde"
                      >
                        <TrendingUp className="w-3 h-3" />
                        {Math.round(hs)}
                      </div>
                    )}
                    {c.npsScore != null && (
                      <div className="flex items-center gap-1 text-xs" style={{ color: "#C9A227" }}>
                        <Star className="w-3 h-3" />
                        <span className="font-bold">{c.npsScore}</span>
                      </div>
                    )}
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-lg transition-all"
                      style={{ color: "oklch(0.50 0.05 155)" }}
                      onClick={e => { e.stopPropagation(); setLocation(`/atendimentos?customerId=${c.id}`); }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(13,107,78,0.12)"; (e.currentTarget as HTMLElement).style.color = "#0d6b4e"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "oklch(0.50 0.05 155)"; }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>Exibindo {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Próximo</Button>
              </div>
            </div>
          )}
        </div>

        {/* Customer Detail Panel */}
        {selectedCustomer && (
          <div className="w-96 shrink-0">
            <div
              className="sticky top-6 rounded-2xl overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(255,255,255,1)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 0 rgba(255,255,255,1) inset",
                backdropFilter: "blur(24px)",
              }}
            >
              {/* Reflexo de luz */}
              <div
                className="absolute inset-0 pointer-events-none rounded-2xl"
                style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.70) 0%, transparent 45%)" }}
              />
              {/* Header do painel */}
              <div className="p-5 pb-0 relative z-10">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(13,107,78,0.14)", border: "2px solid rgba(13,107,78,0.25)" }}
                    >
                      <span className="text-lg font-black" style={{ color: "#0d6b4e" }}>{selectedCustomer.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-base font-bold" style={{ color: "oklch(0.18 0.08 155)", fontFamily: "'Space Grotesk', sans-serif" }}>{selectedCustomer.name}</p>
                      {statusConfig[selectedCustomer.status] && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
                          style={{
                            background: statusConfig[selectedCustomer.status].bg,
                            color: statusConfig[selectedCustomer.status].color,
                            border: `1px solid ${statusConfig[selectedCustomer.status].border}`,
                          }}
                        >
                          {statusConfig[selectedCustomer.status].label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all"
                          style={{ color: "oklch(0.55 0.05 155)" }}
                          title="Exportar histórico"
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.06)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => window.open(`/api/export/customer/${selectedCustomer.id}/conversations?format=csv`, '_blank')}>
                          📄 Exportar CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(`/api/export/customer/${selectedCustomer.id}/conversations?format=pdf`, '_blank')}>
                          📅 Exportar PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-lg leading-none transition-all"
                      style={{ color: "oklch(0.55 0.05 155)" }}
                      onClick={() => setSelectedCustomer(null)}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.06)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    >×</button>
                  </div>
                </div>
              </div>

              <div
                className="mx-5 mt-4"
                style={{ height: "1px", background: "linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)" }}
              />

              {/* Tab navigation */}
              <div className="flex px-5 pt-3 gap-0 relative z-10">
                {([
                  { id: 'profile', label: 'Perfil' },
                  { id: 'journey', label: 'Jornada & Tarefas' },
                  { id: 'notes', label: 'Notas & Marcos' },
                  { id: 'transcripts', label: 'Reuniões' },
                  { id: 'roi', label: 'ROI & Metas' },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setPanelTab(tab.id as 'profile' | 'journey' | 'notes' | 'transcripts' | 'roi'); if (tab.id === 'journey') setShowJourney(true); if (tab.id === 'notes') setShowNotes(true); }}
                    className="flex-1 text-xs font-semibold py-2 transition-all border-b-2"
                    style={panelTab === tab.id
                      ? { color: '#0d6b4e', borderColor: '#0d6b4e' }
                      : { color: 'oklch(0.55 0.05 155)', borderColor: 'transparent' }
                    }
                  >{tab.label}</button>
                ))}
              </div>

              <div className="p-5 pt-4 space-y-4 relative z-10 max-h-[70vh] overflow-y-auto">
              {/* ── PERFIL TAB ── */}
              {panelTab === 'profile' && <>
                <div className="space-y-2 text-sm">
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-2" style={{ color: "oklch(0.45 0.05 155)" }}>
                      <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.55 0.10 155)" }} />
                      <span className="truncate">{selectedCustomer.email}</span>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2" style={{ color: "oklch(0.45 0.05 155)" }}>
                      <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.55 0.10 155)" }} />
                      <span>{selectedCustomer.phone}</span>
                    </div>
                  )}
                  {selectedCustomer.company && (
                    <div className="flex items-center gap-2" style={{ color: "oklch(0.45 0.05 155)" }}>
                      <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.55 0.10 155)" }} />
                      <span>{selectedCustomer.company}</span>
                    </div>
                  )}
                  {selectedCustomer.program && (
                    <div className="flex items-center gap-2" style={{ color: "oklch(0.45 0.05 155)" }}>
                      <Tag className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.55 0.10 155)" }} />
                      <span>{selectedCustomer.program}</span>
                    </div>
                  )}
                </div>

                {(selectedCustomer.npsScore != null || selectedCustomer.csatScore != null) && (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedCustomer.npsScore != null && (
                      <div
                        className="rounded-xl p-3 text-center"
                        style={{ background: "rgba(13,107,78,0.08)", border: "1px solid rgba(13,107,78,0.15)" }}
                      >
                        <div className="text-lg font-black" style={{ color: "#0d6b4e" }}>{selectedCustomer.npsScore}</div>
                        <div className="text-xs" style={{ color: "oklch(0.50 0.05 155)" }}>Nota NPS</div>
                      </div>
                    )}
                    {selectedCustomer.csatScore != null && (
                      <div
                        className="rounded-xl p-3 text-center"
                        style={{ background: "rgba(52,130,246,0.08)", border: "1px solid rgba(52,130,246,0.15)" }}
                      >
                        <div className="text-lg font-black" style={{ color: "#1d4ed8" }}>{selectedCustomer.csatScore}</div>
                        <div className="text-xs" style={{ color: "oklch(0.50 0.05 155)" }}>Nota CSAT</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Índice de Saúde Breakdown */}
                {(selectedCustomer as any).healthScore != null && (
                  <div>
                    <button
                      className="w-full flex items-center justify-between text-xs font-bold py-1"
                      style={{ color: "oklch(0.45 0.05 155)", textTransform: "uppercase", letterSpacing: "0.08em" }}
                      onClick={() => setShowHsBreakdown(v => !v)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-3 h-3" />
                        Índice de Saúde — {Math.round((selectedCustomer as any).healthScore)}
                      </span>
                      {showHsBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {showHsBreakdown && (
                      <div className="mt-2 rounded-xl p-3 space-y-2" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                        {hsPreview ? (
                          <>
                            {([
                              { key: "inactivity", label: "Inatividade", weight: "30%" },
                              { key: "nps", label: "NPS", weight: "25%" },
                              { key: "openTickets", label: "Tickets Abertos", weight: "20%" },
                              { key: "renewalProximity", label: "Renovação", weight: "15%" },
                              { key: "programProgress", label: "Progresso", weight: "10%" },
                            ] as const).map(({ key, label, weight }) => {
                              const val = (hsPreview.breakdown as any)[key] as number;
                              const color = val >= 70 ? "#0d6b4e" : val >= 40 ? "#9a6010" : "#b91c1c";
                              const barBg = val >= 70 ? "rgba(13,107,78,0.15)" : val >= 40 ? "rgba(201,130,39,0.15)" : "rgba(220,38,38,0.15)";
                              return (
                                <div key={key}>
                                  <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "oklch(0.50 0.05 155)" }}>
                                    <span>{label} <span className="opacity-60">({weight})</span></span>
                                    <span className="font-bold" style={{ color }}>{val}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${val}%`, background: color, opacity: 0.8 }} />
                                  </div>
                                </div>
                              );
                            })}
                            {/* Índice de Saúde History Chart */}
                            {hsChartData.length >= 2 && (
                              <div className="pt-2 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                                <p className="text-[9px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: "oklch(0.55 0.05 155)" }}>Histórico</p>
                                <ResponsiveContainer width="100%" height={60}>
                                  <LineChart data={hsChartData} margin={{ top: 2, right: 4, bottom: 2, left: -28 }}>
                                    <XAxis dataKey="date" tick={{ fontSize: 8, fill: "oklch(0.60 0.04 155)" }} axisLine={false} tickLine={false} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: "oklch(0.60 0.04 155)" }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                      contentStyle={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, fontSize: 10, padding: "4px 8px" }}
                                      formatter={(v: any) => [`${v}`, "Score"]}
                                    />
                                    <Line type="monotone" dataKey="score" stroke="oklch(0.49 0.19 155)" strokeWidth={1.5} dot={{ r: 2, fill: "oklch(0.49 0.19 155)" }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                            <div className="pt-1 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                              <button
                                className="text-[10px] font-medium w-full text-center py-0.5 rounded"
                                style={{ color: "oklch(0.45 0.10 155)" }}
                                onClick={() => recalcSingleMutation.mutate({ customerId: selectedCustomer.id })}
                              >
                                {recalcSingleMutation.isPending ? "Recalculando..." : "↺ Recalcular agora"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-[10px] text-center" style={{ color: "oklch(0.55 0.05 155)" }}>Carregando breakdown...</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Purchase History Section */}
                {customerPurchases.length > 0 && (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(13,107,78,0.05)", border: "1px solid rgba(13,107,78,0.12)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "oklch(0.45 0.05 155)" }}>
                      <ShoppingBag className="w-3 h-3" />
                      Compras
                    </p>
                    {customerPurchases.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="flex items-start justify-between gap-2 pb-2 border-b last:border-0 last:pb-0" style={{ borderColor: "rgba(13,107,78,0.10)" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold truncate" style={{ color: "oklch(0.28 0.08 155)" }}>{p.productName ?? 'Produto'}</p>
                          <p className="text-[10px]" style={{ color: "oklch(0.55 0.05 155)" }}>
                            {new Date(p.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {p.status && <span className="ml-1 opacity-70">· {p.status}</span>}
                          </p>
                        </div>
                        {p.value != null && (
                          <div className="flex items-center gap-0.5 shrink-0" style={{ color: "#0d6b4e" }}>
                            <DollarSign className="w-3 h-3" />
                            <span className="text-[11px] font-bold">{Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {customerPurchases.length > 5 && (
                      <p className="text-[10px] text-center" style={{ color: "oklch(0.55 0.05 155)" }}>+{customerPurchases.length - 5} compra(s) anterior(es)</p>
                    )}
                  </div>
                )}

                {/* Channel History Section */}
                <div>
                  <p className="text-xs font-bold" style={{ color: "oklch(0.45 0.05 155)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Últimas Interações</p>
                  <div className="mt-2 rounded-xl p-3 space-y-2" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                    {!lastInteractions || lastInteractions.length === 0 ? (
                      <p className="text-[11px] text-center py-2" style={{ color: "oklch(0.55 0.05 155)" }}>Nenhuma interação registrada</p>
                    ) : (
                      lastInteractions.map((conv: any) => {
                        const channelIcon = conv.channel === 'whatsapp' ? '📱' : conv.channel === 'email' ? '📧' : conv.channel === 'instagram' ? '📸' : conv.channel === 'telegram' ? '✈️' : '💬';
                        const { color: statusColor, label: statusLabel } = getConversationStatusDisplay(conv.status);
                        const timeAgo = (() => {
                          const d = conv.updatedAt ? new Date(conv.updatedAt) : new Date(conv.createdAt);
                          const mins = Math.floor((Date.now() - d.getTime()) / 60000);
                          if (mins < 60) return `${mins}min atrás`;
                          const hrs = Math.floor(mins / 60);
                          if (hrs < 24) return `${hrs}h atrás`;
                          return `${Math.floor(hrs / 24)}d atrás`;
                        })();
                        return (
                          <div
                            key={conv.id}
                            className="flex items-start gap-2 pb-2 border-b last:border-0 last:pb-0 cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ borderColor: "rgba(0,0,0,0.06)" }}
                            onClick={() => setLocation(`/atendimentos?conversationId=${conv.id}`)}
                          >
                            <span className="text-base mt-0.5">{channelIcon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
                                {conv.handledByAi && <span className="text-[9px] px-1 rounded" style={{ background: 'rgba(13,107,78,0.10)', color: '#0d6b4e' }}>IA</span>}
                              </div>
                              <p className="text-[10px]" style={{ color: "oklch(0.55 0.05 155)" }}>{timeAgo}</p>
                              {conv.subject && <p className="text-[10px] truncate" style={{ color: "oklch(0.40 0.05 155)" }}>{conv.subject}</p>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </> /* end profile tab */}

              {/* ── JOURNEY & TASKS TAB ── */}
              {panelTab === 'journey' && <div className="space-y-4">
                <JourneyTab
                  customer={selectedCustomer}
                  journeyTasks={journeyTasks ?? []}
                  completeTask={(id: number) => completeTaskMutation.mutate({ id })}
                  skipTask={(id: number) => skipTaskMutation.mutate({ id })}
                  initProtocol={() => initProtocolMutation.mutate({ customerId: selectedCustomer.id })}
                  isCompleting={completeTaskMutation.isPending}
                  isSkipping={skipTaskMutation.isPending}
                  isIniting={initProtocolMutation.isPending}
                  openChat={() => setLocation(`/atendimentos?customerId=${selectedCustomer.id}`)}
                />
                <div className="border-t pt-3" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'oklch(0.45 0.05 155)' }}>Tarefas Avulsas</p>
                  <CustomerTasksTab customerId={selectedCustomer.id} />
                </div>
              </div>}

              {/* ── NOTES TAB ── */}
              {panelTab === 'notes' && <>
                {/* Customer Notes Section */}
                <div>
                  <button
                    className="flex items-center gap-1.5 w-full text-left"
                    onClick={() => setShowNotes(v => !v)}
                  >
                    <p className="text-xs font-bold flex-1" style={{ color: "oklch(0.45 0.05 155)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Notas do Time</p>
                    {showNotes ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.05 155)" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.05 155)" }} />}
                  </button>
                  {showNotes && (
                    <div className="mt-2 space-y-2">
                      <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                        {!customerNotes || customerNotes.length === 0 ? (
                          <p className="text-[11px] text-center py-1" style={{ color: "oklch(0.55 0.05 155)" }}>Nenhuma nota registrada</p>
                        ) : (
                          customerNotes.map((note: any) => {
                            const typeIcon = note.type === 'call' ? '📞' : note.type === 'meeting' ? '🤝' : note.type === 'email' ? '📧' : note.type === 'whatsapp' ? '📱' : '📝';
                            return (
                              <div key={note.id} className="pb-2 border-b last:border-0 last:pb-0" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                                <div className="flex items-start gap-1.5">
                                  <span className="text-sm mt-0.5 flex-shrink-0">{typeIcon}</span>
                                  <p className="text-[11px]" style={{ color: "oklch(0.30 0.06 155)" }}>{note.content}</p>
                                </div>
                                <p className="text-[10px] mt-0.5 ml-5" style={{ color: "oklch(0.55 0.05 155)" }}>
                                  {note.createdByName} · {new Date(note.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex gap-1 flex-wrap">
                          {([
                            { value: 'note', label: '📝 Nota', },
                            { value: 'call', label: '📞 Ligação', },
                            { value: 'meeting', label: '🤝 Reunião', },
                            { value: 'email', label: '📧 Email', },
                            { value: 'whatsapp', label: '📱 WhatsApp', },
                          ] as const).map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setNoteType(opt.value)}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full transition-all"
                              style={noteType === opt.value
                                ? { background: "rgba(13,107,78,0.18)", color: "#0d6b4e", border: "1px solid rgba(13,107,78,0.30)" }
                                : { background: "rgba(0,0,0,0.05)", color: "oklch(0.50 0.05 155)", border: "1px solid transparent" }
                              }
                            >{opt.label}</button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                            placeholder={`Adicionar ${noteType === 'note' ? 'nota' : noteType === 'call' ? 'registro de ligação' : noteType === 'meeting' ? 'resumo da reunião' : noteType === 'email' ? 'conteúdo do email' : 'mensagem WhatsApp'}...`}
                            rows={2}
                            className="text-xs flex-1 resize-none"
                            style={{ minHeight: 0 }}
                          />
                          <Button
                            size="sm"
                            className="self-end"
                            onClick={() => {
                              if (!newNote.trim()) return;
                              addNoteMutation.mutate({ customerId: selectedCustomer.id, content: newNote.trim(), type: noteType });
                            }}
                            disabled={addNoteMutation.isPending || !newNote.trim()}
                          >+</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-3" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
                  <CustomerMilestonesTab customerId={selectedCustomer.id} />
                </div>
              </> /* end notes tab */}

              {panelTab === 'transcripts' && <TranscriptsTab customerId={selectedCustomer.id} />}

              {panelTab === 'roi' && <ClientROIPanel customerId={selectedCustomer.id} />}

              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      }
      </div>
    </div>
  );
}
