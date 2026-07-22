/**
 * ClientROIPanel — painel de ROI/Retorno e Metas por cliente
 * Usado dentro do perfil do cliente (CustomerDetail)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, Plus, Trash2, Target, DollarSign, BarChart2, Edit2, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  passagem: "✈️ Passagem",
  midia: "📢 Mídia",
  contrato: "📄 Contrato",
  upsell: "🔝 Upsell",
  outro: "📌 Outro",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("pt-BR");
}

// ─── Add ROI Entry Dialog ─────────────────────────────────────────────────────
function AddROIDialog({ customerId, onCreated }: { customerId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    description: "", saleValue: "", profitValue: "",
    category: "outro" as const, saleDate: "", notes: "",
  });

  const createMutation = trpc.clientROI.create.useMutation({
    onSuccess: () => {
      toast.success("Registro de retorno adicionado!");
      setOpen(false);
      setForm({ description: "", saleValue: "", profitValue: "", category: "outro", saleDate: "", notes: "" });
      onCreated();
    },
    onError: () => toast.error("Erro ao adicionar registro"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> Registrar Retorno
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Retorno / Lucro</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Descrição *</Label>
            <Input
              placeholder="Ex: Venda de passagem SP-RJ"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor da Venda (R$)</Label>
              <Input
                type="number" placeholder="0,00" min="0" step="0.01"
                value={form.saleValue}
                onChange={e => setForm(p => ({ ...p, saleValue: e.target.value }))}
              />
            </div>
            <div>
              <Label>Lucro / Retorno (R$)</Label>
              <Input
                type="number" placeholder="0,00" min="0" step="0.01"
                value={form.profitValue}
                onChange={e => setForm(p => ({ ...p, profitValue: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data da Venda</Label>
              <Input
                type="date"
                value={form.saleDate}
                onChange={e => setForm(p => ({ ...p, saleDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              placeholder="Detalhes adicionais..."
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({
                customerId,
                description: form.description,
                saleValue: parseFloat(form.saleValue) || 0,
                profitValue: parseFloat(form.profitValue) || 0,
                category: form.category,
                saleDate: form.saleDate ? new Date(form.saleDate) : undefined,
                notes: form.notes || undefined,
              })}
              disabled={!form.description.trim() || createMutation.isPending}
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Goal Dialog ──────────────────────────────────────────────────────────
function AddGoalDialog({ customerId, onCreated }: { customerId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", targetValue: "", currentValue: "0", unit: "R$", deadline: "",
  });

  const createMutation = trpc.clientGoals.create.useMutation({
    onSuccess: () => {
      toast.success("Meta criada!");
      setOpen(false);
      setForm({ title: "", targetValue: "", currentValue: "0", unit: "R$", deadline: "" });
      onCreated();
    },
    onError: () => toast.error("Erro ao criar meta"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <Target className="w-3.5 h-3.5" /> Nova Meta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Meta para o Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título da Meta *</Label>
            <Input
              placeholder="Ex: Meta anual de retorno"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Valor Alvo *</Label>
              <Input
                type="number" placeholder="0" min="0"
                value={form.targetValue}
                onChange={e => setForm(p => ({ ...p, targetValue: e.target.value }))}
              />
            </div>
            <div>
              <Label>Progresso Atual</Label>
              <Input
                type="number" placeholder="0" min="0"
                value={form.currentValue}
                onChange={e => setForm(p => ({ ...p, currentValue: e.target.value }))}
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input
                placeholder="R$, %, viagens..."
                value={form.unit}
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Prazo (opcional)</Label>
            <Input
              type="date"
              value={form.deadline}
              onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({
                customerId,
                title: form.title,
                targetValue: parseFloat(form.targetValue) || 0,
                currentValue: parseFloat(form.currentValue) || 0,
                unit: form.unit || "R$",
                deadline: form.deadline ? new Date(form.deadline) : undefined,
              })}
              disabled={!form.title.trim() || !form.targetValue || createMutation.isPending}
            >
              Criar Meta
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function ClientROIPanel({ customerId }: { customerId: number }) {
  const utils = trpc.useUtils();

  const { data: roiEntries = [] } = trpc.clientROI.list.useQuery({ customerId });
  const { data: goals = [] } = trpc.clientGoals.list.useQuery({ customerId });
  const { data: summary } = trpc.clientROI.getSummary.useQuery({ customerId });

  const deleteROI = trpc.clientROI.delete.useMutation({
    onSuccess: () => { toast.success("Registro removido"); utils.clientROI.list.invalidate({ customerId }); utils.clientROI.getSummary.invalidate({ customerId }); },
    onError: () => toast.error("Erro ao remover"),
  });

  const deleteGoal = trpc.clientGoals.delete.useMutation({
    onSuccess: () => { toast.success("Meta removida"); utils.clientGoals.list.invalidate({ customerId }); },
    onError: () => toast.error("Erro ao remover meta"),
  });

  const updateGoal = trpc.clientGoals.update.useMutation({
    onSuccess: () => { toast.success("Meta atualizada!"); utils.clientGoals.list.invalidate({ customerId }); },
    onError: () => toast.error("Erro ao atualizar meta"),
  });

  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editGoalValue, setEditGoalValue] = useState("");

  function handleGoalProgressUpdate(goalId: number, currentValue: string) {
    updateGoal.mutate({ id: goalId, currentValue: parseFloat(currentValue) || 0 });
    setEditingGoalId(null);
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Vendas</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(summary.totalSale)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Lucro</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(summary.totalProfit)}</p>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${summary.roiPercent >= 0 ? "border-l-emerald-500" : "border-l-red-500"}`}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">ROI</p>
              <p className={`text-lg font-bold ${summary.roiPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {summary.roiPercent}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Goals Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" /> Metas do Cliente
            </CardTitle>
            <AddGoalDialog customerId={customerId} onCreated={() => utils.clientGoals.list.invalidate({ customerId })} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {goals.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma meta definida ainda.</p>
          ) : (
            goals.map(goal => {
              const progress = goal.targetValue > 0
                ? Math.min(100, Math.round(((goal.currentValue ?? 0) / goal.targetValue) * 100))
                : 0;
              const isComplete = progress >= 100;
              return (
                <div key={goal.id} className="space-y-1.5 p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                      <span className="text-sm font-medium">{goal.title}</span>
                      {goal.deadline && (
                        <span className="text-xs text-muted-foreground">até {formatDate(goal.deadline)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingGoalId(goal.id); setEditGoalValue(String(goal.currentValue ?? 0)); }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Atualizar progresso"
                      >
                        <Edit2 className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button onClick={() => deleteGoal.mutate({ id: goal.id })} className="p-1 rounded hover:bg-muted transition-colors">
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                  {editingGoalId === goal.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" value={editGoalValue} min="0"
                        onChange={e => setEditGoalValue(e.target.value)}
                        className="h-7 text-xs w-28"
                        placeholder="Progresso atual"
                      />
                      <span className="text-xs text-muted-foreground">{goal.unit}</span>
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleGoalProgressUpdate(goal.id, editGoalValue)}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingGoalId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="flex-1 h-2" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {goal.currentValue ?? 0} / {goal.targetValue} {goal.unit} ({progress}%)
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ROI Entries Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Histórico de Retorno
            </CardTitle>
            <AddROIDialog customerId={customerId} onCreated={() => { utils.clientROI.list.invalidate({ customerId }); utils.clientROI.getSummary.invalidate({ customerId }); }} />
          </div>
        </CardHeader>
        <CardContent>
          {roiEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum registro de retorno ainda.</p>
          ) : (
            <div className="space-y-2">
              {roiEntries.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{entry.description}</span>
                      <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[entry.category ?? "outro"]}</Badge>
                      {entry.saleDate && (
                        <span className="text-xs text-muted-foreground">{formatDate(entry.saleDate)}</span>
                      )}
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Venda: {formatCurrency(entry.saleValue ?? 0)}</p>
                    <p className={`text-sm font-semibold ${(entry.profitValue ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      Lucro: {formatCurrency(entry.profitValue ?? 0)}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteROI.mutate({ id: entry.id })}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
