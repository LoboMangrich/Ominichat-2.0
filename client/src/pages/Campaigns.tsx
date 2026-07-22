import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Megaphone, Plus, Send, Trash2, Users, Bot, CheckCircle, Clock, AlertCircle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Enviando",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  running: "bg-yellow-100 text-yellow-700 border-yellow-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <AlertCircle className="w-3 h-3" />,
  scheduled: <Clock className="w-3 h-3" />,
  running: <Send className="w-3 h-3" />,
  completed: <CheckCircle className="w-3 h-3" />,
  cancelled: <AlertCircle className="w-3 h-3" />,
};

export default function Campaigns() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [filterProgram, setFilterProgram] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [healthRange, setHealthRange] = useState<[number, number]>([0, 100]);

  // Stable filter input for preview (avoid infinite re-renders)
  const [previewFilters, setPreviewFilters] = useState<{
    filterMinHealthScore?: number;
    filterMaxHealthScore?: number;
    filterProgram?: string;
    filterStatus?: string;
  }>({});

  const { data: campaignsList = [] } = trpc.campaigns.list.useQuery();
  const { data: agents = [] } = trpc.aiAgents.list.useQuery();
  const { data: programs = [] } = trpc.customers.getPrograms.useQuery();
  const { data: audience } = trpc.campaigns.previewAudience.useQuery(previewFilters);

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campanha criada!");
      utils.campaigns.list.invalidate();
      setOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendMutation = trpc.campaigns.send.useMutation({
    onSuccess: (data) => {
      toast.success(`Campanha disparada! ${data.sent} mensagens agendadas.`);
      utils.campaigns.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      toast.success("Campanha removida.");
      utils.campaigns.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setName("");
    setMessage("");
    setSelectedAgentId("");
    setFilterProgram("");
    setFilterStatus("");
    setHealthRange([0, 100]);
    setPreviewFilters({});
  }

  function applyPreview() {
    setPreviewFilters({
      filterMinHealthScore: healthRange[0] > 0 ? healthRange[0] : undefined,
      filterMaxHealthScore: healthRange[1] < 100 ? healthRange[1] : undefined,
      filterProgram: filterProgram || undefined,
      filterStatus: filterStatus || undefined,
    });
  }

  function handleCreate() {
    if (!name.trim()) { toast.error("Nome da campanha é obrigatório"); return; }
    if (!message.trim()) { toast.error("Mensagem é obrigatória"); return; }
    createMutation.mutate({
      name,
      message,
      agentId: selectedAgentId ? parseInt(selectedAgentId) : undefined,
      filterMinHealthScore: healthRange[0] > 0 ? healthRange[0] : undefined,
      filterMaxHealthScore: healthRange[1] < 100 ? healthRange[1] : undefined,
      filterProgram: filterProgram || undefined,
      filterStatus: filterStatus || undefined,
    });
  }

  const healthColor = (score: number | null) => {
    if (score === null || score === undefined) return "text-muted-foreground";
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Campanhas</h1>
            <p className="text-sm text-muted-foreground">Disparos em massa segmentados por Índice de Saúde, programa e status</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova Campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label>Nome da campanha</Label>
                <Input
                  placeholder="Ex: Reengajamento clientes em risco"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Agent */}
              <div className="space-y-1.5">
                <Label>Agente responsável</Label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar agente (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.filter((a: any) => a.isActive).map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        <div className="flex items-center gap-2">
                          <Bot className="w-3.5 h-3.5 text-purple-500" />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label>Mensagem</Label>
                <Textarea
                  placeholder="Olá {nome}, tudo bem? Notei que..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Use {"{nome}"} para personalizar com o nome do cliente</p>
              </div>

              {/* Filters */}
              <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                <p className="text-sm font-medium">Filtros de audiência</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Programa</Label>
                    <Select value={filterProgram} onValueChange={setFilterProgram}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">Todos os programas</SelectItem>
                        {programs.map((p: any) => p.program && (
                          <SelectItem key={p.program} value={p.program}>{p.program}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status do cliente</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">Todos</SelectItem>
                        <SelectItem value="Ativo">Ativo</SelectItem>
                        <SelectItem value="Em Risco">Em Risco</SelectItem>
                        <SelectItem value="New">Novo</SelectItem>
                        <SelectItem value="Churned">Churned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Índice de Saúde</Label>
                    <span className="text-xs text-muted-foreground font-medium">
                      {healthRange[0]} — {healthRange[1]}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={healthRange}
                    onValueChange={(v) => setHealthRange(v as [number, number])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0 (crítico)</span>
                    <span>100 (saudável)</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={applyPreview}
                >
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  Ver audiência estimada
                </Button>

                {audience && (
                  <div className="rounded-md bg-background border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{audience.count} clientes selecionados</span>
                      <Badge variant="outline" className="text-xs">{audience.count} destinatários</Badge>
                    </div>
                    {audience.customers.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {audience.customers.slice(0, 8).map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-foreground">{c.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{c.program || "—"}</span>
                              <span className={`font-medium ${healthColor(c.healthScore)}`}>
                                {c.healthScore ?? "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                        {audience.count > 8 && (
                          <p className="text-xs text-muted-foreground text-center pt-1">
                            +{audience.count - 8} outros clientes
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Campanha"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaigns list */}
      {campaignsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-full bg-muted mb-4">
            <Megaphone className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-1">Nenhuma campanha criada</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Crie campanhas para disparar mensagens em massa para clientes segmentados por Índice de Saúde, programa ou status.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaignsList.map((campaign: any) => (
            <Card key={campaign.id} className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{campaign.name}</span>
                      <Badge className={`text-xs px-2 py-0 border flex items-center gap-1 ${STATUS_COLORS[campaign.status] ?? ""}`}>
                        {STATUS_ICONS[campaign.status]}
                        {STATUS_LABELS[campaign.status] ?? campaign.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{campaign.message}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {campaign.totalTargeted ?? 0} destinatários
                      </span>
                      {campaign.totalSent > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          {campaign.totalSent} enviados
                        </span>
                      )}
                      {campaign.filterProgram && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {campaign.filterProgram}
                        </Badge>
                      )}
                      {(campaign.filterMinHealthScore !== null || campaign.filterMaxHealthScore !== null) && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          HS {campaign.filterMinHealthScore ?? 0}–{campaign.filterMaxHealthScore ?? 100}
                        </Badge>
                      )}
                      {campaign.filterStatus && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {campaign.filterStatus}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(campaign.status === "draft" || campaign.status === "scheduled") && (
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => sendMutation.mutate({ id: campaign.id })}
                        disabled={sendMutation.isPending}
                      >
                        <Send className="w-3.5 h-3.5" />
                        {sendMutation.isPending ? "Disparando..." : "Disparar"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate({ id: campaign.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
