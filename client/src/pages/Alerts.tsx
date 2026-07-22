import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CreditCard, Star, RefreshCw, ShieldAlert, CheckCircle, Clock, X } from "lucide-react";
import { toast } from "sonner";

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  chargeback: { label: "Chargeback", icon: <CreditCard className="w-4 h-4" />, color: "text-red-600 bg-red-50" },
  reclame_aqui: { label: "Reclame Aqui", icon: <Star className="w-4 h-4" />, color: "text-orange-600 bg-orange-50" },
  refund: { label: "Reembolso", icon: <RefreshCw className="w-4 h-4" />, color: "text-yellow-600 bg-yellow-50" },
  dispute: { label: "Disputa", icon: <ShieldAlert className="w-4 h-4" />, color: "text-purple-600 bg-purple-50" },
  system: { label: "Sistema", icon: <AlertTriangle className="w-4 h-4" />, color: "text-slate-600 bg-slate-50" },
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-slate-100 text-slate-500",
};

function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return d.toLocaleDateString("pt-BR");
}

function AlertsContent() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: alertList = [], isLoading } = trpc.alerts.list.useQuery({
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    type: typeFilter !== "all" ? typeFilter as any : undefined,
  });

  const { data: stats } = trpc.alerts.getStats.useQuery();

  const updateStatusMutation = trpc.alerts.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Alerta atualizado");
      utils.alerts.list.invalidate();
      utils.alerts.getStats.invalidate();
    },
    onError: () => toast.error("Erro ao atualizar alerta"),
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Abertos</p>
            <p className="text-3xl font-bold text-red-600">{stats?.open ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Chargebacks</p>
            <p className="text-3xl font-bold text-orange-600">{stats?.chargebacks ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Reclame Aqui</p>
            <p className="text-3xl font-bold text-yellow-600">{stats?.reclameAqui ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-3xl font-bold">{stats?.total ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Setup Info */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800 text-sm">Como receber alertas automaticamente</p>
              <p className="text-xs text-blue-700 mt-1">
                <strong>Chargeback/Reembolso (Pagar.me):</strong> Configure o webhook em Pagar.me → Configurações → Webhooks → URL: <code className="bg-blue-100 px-1 rounded">/api/webhooks/pagarme</code>
              </p>
              <p className="text-xs text-blue-700 mt-1">
                <strong>Reclame Aqui:</strong> Configure o encaminhamento de e-mails de notificação para <code className="bg-blue-100 px-1 rounded">/api/webhooks/reclame-aqui</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="open">🔴 Abertos</SelectItem>
            <SelectItem value="in_progress">🟡 Em Andamento</SelectItem>
            <SelectItem value="resolved">🟢 Resolvidos</SelectItem>
            <SelectItem value="dismissed">⚪ Descartados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="chargeback">Chargeback</SelectItem>
            <SelectItem value="reclame_aqui">Reclame Aqui</SelectItem>
            <SelectItem value="refund">Reembolso</SelectItem>
            <SelectItem value="dispute">Disputa</SelectItem>
            <SelectItem value="system">Sistema</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alert List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : alertList.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {statusFilter === "open" ? "Nenhum alerta aberto! 🎉" : "Nenhum alerta encontrado"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter === "open" ? "Tudo em ordem por aqui." : "Ajuste os filtros para ver outros alertas."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alertList.map(alert => {
            const config = TYPE_CONFIG[alert.type] ?? TYPE_CONFIG.system;
            return (
              <Card key={alert.id} className={`border-l-4 ${
                alert.status === "open" ? "border-l-red-500" :
                alert.status === "in_progress" ? "border-l-yellow-500" :
                alert.status === "resolved" ? "border-l-green-500" : "border-l-slate-300"
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${config.color}`}>
                        {config.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-foreground text-sm">{alert.title}</span>
                          <Badge className={`text-xs ${STATUS_STYLES[alert.status]}`}>
                            {alert.status === "open" ? "Aberto" :
                             alert.status === "in_progress" ? "Em Andamento" :
                             alert.status === "resolved" ? "Resolvido" : "Descartado"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{config.label}</Badge>
                        </div>
                        {alert.description && (
                          <p className="text-sm text-muted-foreground">{alert.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          {alert.customerName && <span>👤 {alert.customerName}</span>}
                          {alert.customerEmail && <span>📧 {alert.customerEmail}</span>}
                          {alert.amount && <span className="text-red-600 font-medium">💰 R$ {alert.amount.toFixed(2)}</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(alert.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {alert.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: alert.id, status: "in_progress" })}
                          className="gap-1 text-xs"
                        >
                          <Clock className="w-3 h-3" />
                          Tratar
                        </Button>
                      )}
                      {(alert.status === "open" || alert.status === "in_progress") && (
                        <Button
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ id: alert.id, status: "resolved" })}
                          className="gap-1 text-xs bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Resolver
                        </Button>
                      )}
                      {alert.status === "open" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateStatusMutation.mutate({ id: alert.id, status: "dismissed" })}
                          className="gap-1 text-xs text-muted-foreground"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
export default function Alerts({ embedded, ..._ }: { embedded?: boolean; [key: string]: any }) {
  if (embedded) return <AlertsContent />;
  return (

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              Alertas
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Chargebacks, Reclame Aqui, reembolsos e disputas
            </p>
          </div>
        </div>
        <AlertsContent />
      </div>

  );
}
