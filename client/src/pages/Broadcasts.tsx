import { useState, lazy, Suspense } from "react";
const Alerts = lazy(() => import("./Alerts"));
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Megaphone, Plus, Send, Clock, Users, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-100 text-blue-700",
  sending: "bg-yellow-100 text-yellow-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "📱 WhatsApp",
  email: "📧 Email",
  instagram: "📸 Instagram",
  telegram: "✈️ Telegram",
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleString("pt-BR");
}

export default function Broadcasts() {
  const [activeTab, setActiveTab] = useState<"broadcasts" | "alerts">("broadcasts");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBroadcast, setNewBroadcast] = useState({
    title: "",
    content: "",
    channel: "whatsapp" as const,
    scheduledAt: "",
    filterProgram: "",
    filterStatus: "",
  });
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: broadcastList = [], isLoading } = trpc.broadcasts.list.useQuery();

  const createMutation = trpc.broadcasts.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Broadcast criado! ${data.totalRecipients} destinatários estimados.`);
      setIsCreateOpen(false);
      setNewBroadcast({ title: "", content: "", channel: "whatsapp", scheduledAt: "", filterProgram: "", filterStatus: "" });
      setPreviewCount(null);
      utils.broadcasts.list.invalidate();
    },
    onError: () => toast.error("Erro ao criar broadcast"),
  });

  const updateStatusMutation = trpc.broadcasts.updateStatus.useMutation({
    onSuccess: () => utils.broadcasts.list.invalidate(),
  });

  const sentCount = broadcastList.filter(b => b.status === "sent").length;
  const scheduledCount = broadcastList.filter(b => b.status === "scheduled").length;
  const totalReached = broadcastList.filter(b => b.status === "sent").reduce((sum, b) => sum + (b.sentCount ?? 0), 0);

  return (

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
            <button
              onClick={() => setActiveTab("broadcasts")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "broadcasts"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Megaphone className="w-4 h-4" />
              Campanhas
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "alerts"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Alertas
            </button>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Broadcast
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar Broadcast</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Título *</Label>
                  <Input
                    placeholder="Ex: Aviso de manutenção - Turma Março"
                    value={newBroadcast.title}
                    onChange={e => setNewBroadcast(p => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Mensagem *</Label>
                  <Textarea
                    placeholder="Digite a mensagem que será enviada para todos os destinatários..."
                    value={newBroadcast.content}
                    onChange={e => setNewBroadcast(p => ({ ...p, content: e.target.value }))}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{newBroadcast.content.length} caracteres</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Canal</Label>
                    <Select value={newBroadcast.channel} onValueChange={v => setNewBroadcast(p => ({ ...p, channel: v as any }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
                        <SelectItem value="email">📧 Email</SelectItem>
                        <SelectItem value="instagram">📸 Instagram</SelectItem>
                        <SelectItem value="telegram">✈️ Telegram</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Agendar para</Label>
                    <Input
                      type="datetime-local"
                      value={newBroadcast.scheduledAt}
                      onChange={e => setNewBroadcast(p => ({ ...p, scheduledAt: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <p className="text-sm font-medium">Filtrar destinatários (opcional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Programa</Label>
                      <Input
                        placeholder="Ex: Mentoria Premium"
                        value={newBroadcast.filterProgram}
                        onChange={e => setNewBroadcast(p => ({ ...p, filterProgram: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Situação</Label>
                      <Select value={newBroadcast.filterStatus || "all"} onValueChange={v => setNewBroadcast(p => ({ ...p, filterStatus: v === "all" ? "" : v }))}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* value = enum real de customers.status (drizzle/schema.ts); rótulo em português só na label */}
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="Active">Ativos</SelectItem>
                          <SelectItem value="At Risk">Em Risco</SelectItem>
                          <SelectItem value="New">Novos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                  <Button
                    onClick={() => createMutation.mutate({
                      title: newBroadcast.title,
                      content: newBroadcast.content,
                      channel: newBroadcast.channel,
                      scheduledAt: newBroadcast.scheduledAt ? new Date(newBroadcast.scheduledAt) : undefined,
                      filterProgram: newBroadcast.filterProgram || undefined,
                      filterStatus: newBroadcast.filterStatus || undefined,
                    })}
                    disabled={!newBroadcast.title.trim() || !newBroadcast.content.trim() || createMutation.isPending}
                    className="gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {newBroadcast.scheduledAt ? "Agendar" : "Criar Rascunho"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Alerts tab */}
        {activeTab === "alerts" && (
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>}>
            <Alerts />
          </Suspense>
        )}

        {activeTab === "broadcasts" && <>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Enviados</p>
                <p className="text-2xl font-bold text-green-600">{sentCount}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Agendados</p>
                <p className="text-2xl font-bold text-blue-600">{scheduledCount}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-400" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Alcançados</p>
                <p className="text-2xl font-bold text-purple-600">{totalReached.toLocaleString("pt-BR")}</p>
              </div>
              <Users className="w-8 h-8 text-purple-400" />
            </CardContent>
          </Card>
        </div>

        {/* Broadcast List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : broadcastList.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Nenhum broadcast criado</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie seu primeiro broadcast para comunicar com grupos de clientes
              </p>
              <Button className="mt-4 gap-2" onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4" /> Criar Broadcast
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {broadcastList.map(broadcast => (
              <Card key={broadcast.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-foreground">{broadcast.title}</span>
                        <Badge className={`text-xs ${STATUS_STYLES[broadcast.status]}`}>
                          {broadcast.status === "draft" ? "Rascunho" :
                           broadcast.status === "scheduled" ? "Agendado" :
                           broadcast.status === "sending" ? "Enviando..." :
                           broadcast.status === "sent" ? "Enviado" : "Falhou"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {CHANNEL_LABELS[broadcast.channel]}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{broadcast.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {broadcast.totalRecipients} destinatários
                        </span>
                        {broadcast.scheduledAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(broadcast.scheduledAt)}
                          </span>
                        )}
                        {broadcast.sentAt && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3 h-3" />
                            Enviado em {formatDate(broadcast.sentAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    {broadcast.status === "draft" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: broadcast.id, status: "scheduled" })}
                          className="gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          Agendar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            toast.info("Para envio real, configure a API do canal em Integrações");
                            updateStatusMutation.mutate({ id: broadcast.id, status: "sent" });
                          }}
                          className="gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Enviar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </> }
      </div>

  );
}
