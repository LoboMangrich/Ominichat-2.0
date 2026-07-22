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
import { ArrowRight, CheckCircle, Gift, Plus, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Contacted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  Lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function Referrals() {
  const [typeFilter, setTypeFilter] = useState<"Referral" | "Upsell" | "">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [newRef, setNewRef] = useState({ customerId: 0, type: "Referral" as const, referredName: "", referredEmail: "", referredPhone: "", program: "", notes: "" });

  const { data, isLoading, refetch } = trpc.referrals.list.useQuery({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    page,
    limit: 20,
  });
  const { data: stats } = trpc.referrals.getStats.useQuery();
  const { data: customerData } = trpc.customers.list.useQuery({ search: customerSearch, limit: 8 });

  const createMutation = trpc.referrals.create.useMutation({
    onSuccess: () => { toast.success("Indicação registrada!"); setShowCreate(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.referrals.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const referrals = data?.referrals ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Indicações & Upsell
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Acompanhe indicações e oportunidades de upsell dos seus clientes.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Registrar Indicação</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Registrar Indicação / Upsell</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Cliente Indicador *</Label>
                <Input placeholder="Buscar cliente..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                {customerData?.customers && customerSearch && (
                  <div className="border rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                    {customerData.customers.map(c => (
                      <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => { setNewRef(p => ({ ...p, customerId: c.id })); setCustomerSearch(c.name); }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={newRef.type} onValueChange={v => setNewRef(p => ({ ...p, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Referral">Indicação (novo cliente)</SelectItem>
                    <SelectItem value="Upsell">Upsell (cliente existente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newRef.type === "Referral" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nome do Indicado</Label>
                    <Input value={newRef.referredName} onChange={e => setNewRef(p => ({ ...p, referredName: e.target.value }))} placeholder="Nome" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone do Indicado</Label>
                    <Input value={newRef.referredPhone} onChange={e => setNewRef(p => ({ ...p, referredPhone: e.target.value }))} placeholder="Telefone" />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Programa</Label>
                <Input value={newRef.program} onChange={e => setNewRef(p => ({ ...p, program: e.target.value }))} placeholder="Nome do programa" />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea value={newRef.notes} onChange={e => setNewRef(p => ({ ...p, notes: e.target.value }))} placeholder="Observações adicionais..." rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button className="flex-1" disabled={!newRef.customerId || createMutation.isPending} onClick={() => createMutation.mutate(newRef)}>
                  {createMutation.isPending ? "Salvando..." : "Registrar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de Indicações", value: stats?.total ?? 0, icon: Gift, color: "text-violet-600 bg-violet-100 dark:bg-violet-900/30" },
          { label: "Convertidos", value: stats?.converted ?? 0, icon: CheckCircle, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
          { label: "Pendentes", value: stats?.pending ?? 0, icon: Users, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30" },
          { label: "Taxa de Conversão", value: stats?.total ? `${Math.round((stats.converted / stats.total) * 100)}%` : "0%", icon: TrendingUp, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
        ].map(stat => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-5 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v === "all" ? "" : v as any); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="Referral">Indicação</SelectItem>
            <SelectItem value="Upsell">Venda Adicional</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Todos os status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {["Pendente", "Contacted", "Converted", "Lost"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !referrals.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Gift className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma indicação registrada ainda</p>
              <p className="text-sm mt-1">Registre uma indicação ou oportunidade de upsell para acompanhar seu pipeline.</p>
            </div>
          ) : (
            <div className="divide-y">
              {referrals.map(ref => (
                <div key={ref.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ref.type === "Referral" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                    {ref.type === "Referral" ? <Users className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {ref.type === "Referral" ? (ref.referredName || "Indicação sem nome") : `Upsell → ${ref.program || "programa"}`}
                      </span>
                      <Badge className={`text-xs px-2 py-0 ${statusColors[ref.status] ?? ""}`}>{ref.status}</Badge>
                      <Badge variant="outline" className="text-xs px-2 py-0">{ref.type}</Badge>
                    </div>
                    {ref.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{ref.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ref.status !== "Converted" && ref.status !== "Lost" && (
                      <Select value={ref.status} onValueChange={v => updateStatusMutation.mutate({ id: ref.id, status: v as any })}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Pendente", "Contacted", "Converted", "Lost"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <span className="text-xs text-muted-foreground">{new Date(ref.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {total > 20 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Exibindo {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Próximo</Button>
          </div>
        </div>
      )}
    </div>
  );
}
