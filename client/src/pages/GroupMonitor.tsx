import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users, AlertTriangle, CheckCircle, Clock, MessageSquare,
  Plus, RefreshCw, Zap, Search, Crown, Globe, Settings, Sparkles, Copy, Bell, BellOff
} from "lucide-react";

const GROUP_TYPE_LABELS: Record<string, string> = {
  vip: "VIP (Individual)",
  community: "Comunidade",
  support: "Suporte",
};
const GROUP_TYPE_COLORS: Record<string, string> = {
  vip: "bg-purple-100 text-purple-800",
  community: "bg-blue-100 text-blue-800",
  support: "bg-gray-100 text-gray-800",
};
const GROUP_TYPE_ICONS: Record<string, React.ReactNode> = {
  vip: <Crown className="w-3 h-3" />,
  community: <Globe className="w-3 h-3" />,
  support: <MessageSquare className="w-3 h-3" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  silence: "Silêncio prolongado",
  unanswered_request: "Pedido sem resposta",
  negative_sentiment: "Sentimento negativo",
  high_activity: "Alta atividade",
};

const ALERT_TYPE_ICONS: Record<string, React.ReactNode> = {
  silence: <Clock className="w-4 h-4" />,
  unanswered_request: <MessageSquare className="w-4 h-4" />,
  negative_sentiment: <AlertTriangle className="w-4 h-4" />,
  high_activity: <Zap className="w-4 h-4" />,
};

function formatTimeAgo(date: Date | null | undefined) {
  if (!date) return "Nunca";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d atrás`;
  if (hours > 0) return `${hours}h atrás`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m atrás`;
}

function AddGroupDialog({ onSuccess }: { onSuccess: () => void }) {
  
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    groupId: "",
    groupName: "",
    description: "",
    alertSilenceHours: 48,
  });

  const createMutation = trpc.groups.create.useMutation({
    onSuccess: () => {
      toast.success("Grupo adicionado com sucesso!");
      setOpen(false);
      setForm({ groupId: "", groupName: "", description: "", alertSilenceHours: 48 });
      onSuccess();
    },
    onError: (e) => toast.error("Erro ao adicionar grupo", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-2" />Adicionar Grupo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Grupo para Monitoramento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>ID do Grupo (WhatsApp)</Label>
            <Input
              placeholder="Ex: 5511999999999-1234567890@g.us"
              value={form.groupId}
              onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              O ID do grupo aparece nos logs do webhook da Meta quando uma mensagem é recebida.
            </p>
          </div>
          <div>
            <Label>Nome do Grupo</Label>
            <Input
              placeholder="Ex: Grupo Premium - João Silva"
              value={form.groupName}
              onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))}
            />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              placeholder="Ex: Grupo do programa Premium - turma Jan/2026"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <Label>Alertar após silêncio de (horas)</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={form.alertSilenceHours}
              onChange={e => setForm(f => ({ ...f, alertSilenceHours: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Gera alerta se o cliente enviar mensagem e a equipe não responder neste prazo.
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => createMutation.mutate(form)}
            disabled={createMutation.isPending || !form.groupId || !form.groupName}
          >
            {createMutation.isPending ? "Adicionando..." : "Adicionar Grupo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SuggestReplyDialog({ alert }: { alert: any }) {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const suggestMutation = trpc.groups.suggestReply.useMutation({
    onSuccess: (data) => setSuggestion(data.suggestion),
    onError: (e) => toast.error('Erro ao gerar sugestão', { description: e.message }),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSuggestion(''); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="shrink-0 text-xs text-purple-700 border-purple-200 hover:bg-purple-50">
          <Sparkles className="w-3 h-3 mr-1" />Sugerir Resposta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sugestão de Resposta — IA</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="p-3 bg-muted rounded text-sm">
            <p className="font-medium text-xs text-muted-foreground mb-1">Alerta:</p>
            <p>{alert.message}</p>
          </div>
          {!suggestion ? (
            <Button
              className="w-full"
              onClick={() => suggestMutation.mutate({ groupId: alert.groupId, alertMessage: alert.message, aiSummary: alert.aiSummary || '' })}
              disabled={suggestMutation.isPending}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {suggestMutation.isPending ? 'Gerando sugestão...' : 'Gerar Sugestão com IA'}
            </Button>
          ) : (
            <div className="space-y-3">
              <Label>Sugestão gerada pela IA:</Label>
              <Textarea value={suggestion} onChange={e => setSuggestion(e.target.value)} rows={6} className="text-sm" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(suggestion); toast.success('Copiado!'); }}>
                  <Copy className="w-4 h-4 mr-2" />Copiar
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => suggestMutation.mutate({ groupId: alert.groupId, alertMessage: alert.message, aiSummary: alert.aiSummary || '' })} disabled={suggestMutation.isPending}>
                  <RefreshCw className="w-4 h-4 mr-2" />Regenerar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Edite o texto acima se necessário, depois copie e envie no WhatsApp.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupCard({ group, onAnalyze, onRefresh }: {
  group: any;
  onAnalyze: (groupId: string) => void;
  onRefresh: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const groupType = (group.groupType as string) || 'community';

  const updateMutation = trpc.groups.update.useMutation({
    onSuccess: () => { onRefresh(); },
  });
  const updateSettingsMutation = trpc.groups.updateGroupSettings.useMutation({
    onSuccess: () => { toast.success('Configurações salvas!'); onRefresh(); },
    onError: (e) => toast.error('Erro ao salvar', { description: e.message }),
  });
  const analyzeMutation = trpc.groups.analyze.useMutation({
    onSuccess: (data) => {
      toast.success(`Análise concluída: ${data.analyzed} mensagens analisadas, ${data.alerts.length} alertas gerados.`);
      onRefresh();
    },
    onError: (e) => toast.error('Erro na análise', { description: e.message }),
  });

  return (
    <Card className={`transition-all ${!group.isMonitored ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${groupType === 'vip' ? 'bg-purple-100' : 'bg-green-100'}`}>
              {groupType === 'vip' ? <Crown className="w-5 h-5 text-purple-600" /> : <Users className="w-5 h-5 text-green-600" />}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{group.groupName}</p>
              <p className="text-xs text-muted-foreground truncate">{group.groupId}</p>
              {group.description && (
                <p className="text-xs text-muted-foreground truncate">{group.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`text-xs flex items-center gap-1 ${GROUP_TYPE_COLORS[groupType]}`}>
              {GROUP_TYPE_ICONS[groupType]}
              {GROUP_TYPE_LABELS[groupType]}
            </Badge>
            {group.openAlerts > 0 && (
              <Badge variant="destructive" className="text-xs">
                {group.openAlerts} alerta{group.openAlerts > 1 ? 's' : ''}
              </Badge>
            )}
            <Switch
              checked={group.isMonitored}
              onCheckedChange={(v) => updateMutation.mutate({ groupId: group.groupId, isMonitored: v })}
              title={group.isMonitored ? 'Monitorado' : 'Pausado'}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            <span>Última msg: {formatTimeAgo(group.lastCustomerMessageAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Alerta após: {group.alertSilenceHours}h</span>
          </div>
        </div>

        {group.aiAutoReply && (
          <div className="mt-2 flex items-center gap-1 text-xs text-purple-700 font-medium">
            <Sparkles className="w-3 h-3" />
            <span>IA responde automaticamente</span>
          </div>
        )}

        {group.lastMessage && (
          <div className="mt-2 p-2 bg-muted rounded text-xs truncate">
            <span className="font-medium">{group.lastMessage.senderName || group.lastMessage.senderId}: </span>
            {group.lastMessage.content}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => analyzeMutation.mutate({ groupId: group.groupId })}
            disabled={analyzeMutation.isPending}
          >
            <Zap className="w-3 h-3 mr-1" />
            {analyzeMutation.isPending ? 'Analisando...' : 'Analisar com IA'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setShowSettings(!showSettings)}
            title="Configurações do grupo"
          >
            <Settings className="w-3 h-3" />
          </Button>
        </div>

        {showSettings && (
          <div className="mt-3 p-3 bg-muted rounded-lg space-y-3 text-sm border">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Configurações do Grupo</p>
            <div>
              <Label className="text-xs">Tipo de Grupo</Label>
              <Select
                defaultValue={groupType}
                onValueChange={(v) => updateSettingsMutation.mutate({ groupId: group.groupId, groupType: v as 'vip' | 'community' | 'support' })}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vip">VIP (Individual — IA pode responder)</SelectItem>
                  <SelectItem value="community">Comunidade (IA sugere, humano envia)</SelectItem>
                  <SelectItem value="support">Suporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {groupType === 'vip' && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">IA responde automaticamente</p>
                  <p className="text-xs text-muted-foreground">Apenas para grupos VIP</p>
                </div>
                <Switch
                  checked={!!group.aiAutoReply}
                  onCheckedChange={(v) => updateSettingsMutation.mutate({ groupId: group.groupId, aiAutoReply: v })}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertsList({ onlyOpen = true }: { onlyOpen?: boolean }) {
  
  const { data: alerts, refetch } = trpc.groups.getAlerts.useQuery({ onlyOpen });

  const resolveMutation = trpc.groups.resolveAlert.useMutation({
    onSuccess: () => { refetch(); toast.success("Alerta resolvido!"); },
  });

  if (!alerts || alerts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
        <p className="font-medium">Nenhum alerta {onlyOpen ? "aberto" : ""}</p>
        <p className="text-sm">Todos os grupos estão sendo monitorados normalmente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <Card key={alert.id} className={`border-l-4 ${
          alert.severity === "critical" ? "border-l-red-500" :
          alert.severity === "high" ? "border-l-orange-500" :
          alert.severity === "medium" ? "border-l-yellow-500" : "border-l-blue-500"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 text-muted-foreground">
                  {ALERT_TYPE_ICONS[alert.type]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{alert.groupName}</span>
                    <Badge className={`text-xs ${SEVERITY_COLORS[alert.severity]}`}>
                      {alert.severity === "critical" ? "Crítico" :
                       alert.severity === "high" ? "Alto" :
                       alert.severity === "medium" ? "Médio" : "Baixo"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {ALERT_TYPE_LABELS[alert.type]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                  {alert.aiSummary && (
                    <p className="text-xs text-muted-foreground mt-1 italic">IA: {alert.aiSummary}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTimeAgo(alert.createdAt)}
                  </p>
                </div>
              </div>
              {!alert.isResolved && (
                <div className="flex gap-2 shrink-0">
                  <SuggestReplyDialog alert={alert} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => resolveMutation.mutate({ alertId: alert.id })}
                    disabled={resolveMutation.isPending}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Resolver
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function GroupMonitor() {
  const [search, setSearch] = useState("");
  const { data: groups, refetch: refetchGroups } = trpc.groups.list.useQuery();
  const { data: openAlerts } = trpc.groups.getAlerts.useQuery({ onlyOpen: true });

  const filtered = groups?.filter(g =>
    g.groupName.toLowerCase().includes(search.toLowerCase()) ||
    g.groupId.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const totalAlerts = openAlerts?.length || 0;
  const criticalAlerts = openAlerts?.filter(a => a.severity === "critical" || a.severity === "high").length || 0;

  return (

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Grupos WhatsApp</h1>
            <p className="text-muted-foreground text-sm">
              Monitore grupos de clientes com análise de IA e alertas automáticos
            </p>
          </div>
          <AddGroupDialog onSuccess={refetchGroups} />
        </div>

        {/* Indicador Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{groups?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Grupos monitorados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalAlerts}</p>
                  <p className="text-xs text-muted-foreground">Alertas abertos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{criticalAlerts}</p>
                  <p className="text-xs text-muted-foreground">Alertas críticos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {groups?.filter(g => g.isMonitored && g.openAlerts === 0).length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Grupos saudáveis</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Como funciona */}
        {(!groups || groups.length === 0) && (
          <Card className="border-dashed">
            <CardContent className="p-6">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg">Como funciona o monitoramento de grupos</h3>
                <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground text-left mt-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium text-foreground mb-1">1. Configure o webhook</p>
                    <p>Em Integrações → WhatsApp, configure o webhook da Meta. Mensagens de grupos chegam automaticamente.</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium text-foreground mb-1">2. Adicione grupos</p>
                    <p>Cole o ID do grupo (visível nos logs do webhook) e defina o prazo de alerta por silêncio.</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium text-foreground mb-1">3. IA monitora e alerta</p>
                    <p>A IA analisa as mensagens, detecta pedidos sem resposta e sentimento negativo, e gera alertas automáticos.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs: Grupos / Alertas */}
        <Tabs defaultValue="groups">
          <TabsList>
            <TabsTrigger value="groups">
              Grupos ({groups?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="alerts">
              Alertas Abertos
              {totalAlerts > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{totalAlerts}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="groups" className="mt-4">
            {groups && groups.length > 0 && (
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar grupo..."
                    className="pl-9"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            )}
            {filtered.length === 0 && groups && groups.length > 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum grupo encontrado.</p>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(group => (
                  <GroupCard
                    key={group.groupId}
                    group={group}
                    onAnalyze={() => {}}
                    onRefresh={refetchGroups}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <AlertsList onlyOpen={true} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <AlertsList onlyOpen={false} />
          </TabsContent>
        </Tabs>
      </div>

  );
}
