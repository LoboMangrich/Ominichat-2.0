import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { Bell, Clock, Heart, Moon, Settings as SettingsIcon, Sun, User, Zap, Plus, Trash2, Edit2, Check, X, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { SubTabBar } from "@/components/SubTabBar";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  telegram: "Telegram",
  instagram: "Instagram",
};

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [lowQualityAlerts, setLowQualityAlerts] = useState(true);
  const [surveyAlerts, setSurveyAlerts] = useState(true);

  // Respostas Rápidas state
  const [showAddQR, setShowAddQR] = useState(false);
  const [editingQR, setEditingQR] = useState<number | null>(null);
  const [qrTitle, setQrTitle] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [qrShortcut, setQrShortcut] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editShortcut, setEditShortcut] = useState("");

  // SLA settings state
  const [slaEdits, setSlaEdits] = useState<Record<string, number>>({});

  // Satisfaction settings state
  const [satisfactionEnabled, setSatisfactionEnabled] = useState<boolean | null>(null);
  const [satisfactionMessage, setSatisfactionMessage] = useState<string | null>(null);
  const [satisfactionDelay, setSatisfactionDelay] = useState<number | null>(null);

  const isAdmin = user?.role === "Admin";
  const isAdminOrManager = user?.role === "Admin" || user?.role === "Manager";

  const utils = trpc.useUtils();
  const { data: quickRepliesList = [] } = trpc.quickReplies.list.useQuery();

  // SLA settings query (admin/manager only)
  const { data: slaSettingsData } = trpc.sla.getSettings.useQuery(undefined, {
    enabled: isAdminOrManager,
  });

  const updateSlaMutation = trpc.sla.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Configurações de SLA salvas!");
      utils.sla.getSettings.invalidate();
    },
    onError: () => toast.error("Erro ao salvar configurações de SLA"),
  });

  // Satisfaction settings query (admin only)
  const { data: satisfactionData } = trpc.satisfaction.getSettings.useQuery(undefined, {
    enabled: isAdmin,
  });

  const updateSatisfactionMutation = trpc.satisfaction.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Configurações de satisfação salvas!");
      utils.satisfaction.getSettings.invalidate();
    },
    onError: () => toast.error("Erro ao salvar configurações de satisfação"),
  });

  const createQRMutation = trpc.quickReplies.create.useMutation({
    onSuccess: () => {
      toast.success("Resposta rápida criada!");
      setShowAddQR(false);
      setQrTitle(""); setQrContent(""); setQrShortcut("");
      utils.quickReplies.list.invalidate();
    },
    onError: () => toast.error("Erro ao criar resposta rápida"),
  });

  const updateQRMutation = trpc.quickReplies.update.useMutation({
    onSuccess: () => {
      toast.success("Resposta rápida atualizada!");
      setEditingQR(null);
      utils.quickReplies.list.invalidate();
    },
    onError: () => toast.error("Erro ao atualizar resposta rápida"),
  });

  const deleteQRMutation = trpc.quickReplies.delete.useMutation({
    onSuccess: () => {
      toast.success("Resposta rápida removida!");
      utils.quickReplies.list.invalidate();
    },
    onError: () => toast.error("Erro ao remover resposta rápida"),
  });

  const startEdit = (qr: any) => {
    setEditingQR(qr.id);
    setEditTitle(qr.title);
    setEditContent(qr.content);
    setEditShortcut(qr.shortcut ?? "");
  };

  const getSlaValue = (ch: string) => {
    if (slaEdits[ch] !== undefined) return slaEdits[ch];
    const fromDb = (slaSettingsData as any[])?.find((s: any) => s.channel === ch)?.windowMinutes;
    return fromDb ?? 60;
  };

  type SlaChannel = "whatsapp" | "email" | "instagram" | "telegram" | "all";

  const handleSaveSla = () => {
    const channels: SlaChannel[] = ["whatsapp", "email", "telegram", "instagram"];
    channels.forEach((ch) => {
      const windowMins = getSlaValue(ch);
      const warningMins = Math.round(windowMins * 0.75);
      updateSlaMutation.mutate({ channel: ch, windowMinutes: windowMins, warningMinutes: warningMins, isActive: true });
    });
  };

  const effEnabled = satisfactionEnabled !== null ? satisfactionEnabled : ((satisfactionData as any)?.isActive ?? false);
  const effMessage = satisfactionMessage !== null ? satisfactionMessage : ((satisfactionData as any)?.message ?? "Como você avalia nosso atendimento? Responda: 👍 Ótimo, 😐 Regular ou 👎 Ruim");
  const effDelay = satisfactionDelay !== null ? satisfactionDelay : ((satisfactionData as any)?.delayMinutes ?? 0);

  const handleSaveSatisfaction = () => {
    updateSatisfactionMutation.mutate({
      isActive: effEnabled,
      message: effMessage,
      delayMinutes: effDelay,
      channels: (satisfactionData as any)?.channels ?? ["whatsapp", "telegram"],
    });
  };

  const SETTINGS_TABS = [
    { label: "Usuários",     path: "/settings",      icon: Shield },
    { label: "Integrações", path: "/integrations",  icon: Zap },
  ];

  return (
    <div className="page-bg min-h-screen">
      <SubTabBar tabs={SETTINGS_TABS} />
      <div className="p-6 space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-primary" />
          Configurações
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gerencie sua conta e preferências da plataforma.
        </p>
      </div>

      {/* Perfil */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            Perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-primary">{user?.name?.charAt(0) ?? "?"}</span>
            </div>
            <div>
              <p className="font-semibold">{user?.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
              <Badge className="mt-1 text-xs" variant="secondary">{user?.role}</Badge>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nome de Exibição</Label>
            <Input defaultValue={user?.name ?? ""} placeholder="Seu nome..." disabled />
            <p className="text-xs text-muted-foreground">O nome é gerenciado pela sua conta de login.</p>
          </div>
        </CardContent>
      </Card>

      {/* Respostas Rápidas */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                Respostas Rápidas
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Templates de mensagens para uso rápido nas conversas. Use /<em>atalho</em> para inserir.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAddQR(!showAddQR)}>
              <Plus className="w-3 h-3" /> Nova
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddQR && (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Título</Label>
                  <Input value={qrTitle} onChange={e => setQrTitle(e.target.value)} placeholder="Ex: Saudação inicial" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Atalho (opcional)</Label>
                  <Input value={qrShortcut} onChange={e => setQrShortcut(e.target.value)} placeholder="Ex: ola" className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Conteúdo da mensagem</Label>
                <Textarea value={qrContent} onChange={e => setQrContent(e.target.value)} placeholder="Digite o texto da resposta rápida..." rows={3} className="text-sm" />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setShowAddQR(false); setQrTitle(""); setQrContent(""); setQrShortcut(""); }}>
                  <X className="w-3 h-3 mr-1" /> Cancelar
                </Button>
                <Button size="sm" disabled={!qrTitle.trim() || !qrContent.trim() || createQRMutation.isPending}
                  onClick={() => createQRMutation.mutate({ title: qrTitle.trim(), content: qrContent.trim(), shortcut: qrShortcut.trim() || undefined, isGlobal: true })}>
                  <Check className="w-3 h-3 mr-1" /> Salvar
                </Button>
              </div>
            </div>
          )}
          {(quickRepliesList as any[]).length === 0 && !showAddQR ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma resposta rápida cadastrada. Clique em "Nova" para adicionar.
            </p>
          ) : (
            <div className="space-y-2">
              {(quickRepliesList as any[]).map((qr: any) => (
                <div key={qr.id} className="border rounded-lg p-3">
                  {editingQR === qr.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Título</Label>
                          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Atalho</Label>
                          <Input value={editShortcut} onChange={e => setEditShortcut(e.target.value)} className="h-8 text-sm" />
                        </div>
                      </div>
                      <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} className="text-sm" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingQR(null)}>
                          <X className="w-3 h-3 mr-1" /> Cancelar
                        </Button>
                        <Button size="sm" disabled={!editTitle.trim() || !editContent.trim() || updateQRMutation.isPending}
                          onClick={() => updateQRMutation.mutate({ id: qr.id, title: editTitle.trim(), content: editContent.trim(), shortcut: editShortcut.trim() || undefined })}>
                          <Check className="w-3 h-3 mr-1" /> Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{qr.title}</span>
                          {qr.shortcut && (
                            <Badge variant="secondary" className="text-xs font-mono">/{qr.shortcut}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{qr.content}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(qr)}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          onClick={() => deleteQRMutation.mutate({ id: qr.id })}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SLA por Canal (Admin/Manager only) */}
      {isAdminOrManager && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Configuração de SLA por Canal
            </CardTitle>
            <CardDescription className="text-xs">
              Defina o tempo máximo de resposta (em minutos) para cada canal de atendimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {["whatsapp", "email", "telegram", "instagram"].map((ch) => (
              <div key={ch} className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{CHANNEL_LABELS[ch]}</p>
                  <p className="text-xs text-muted-foreground">Tempo máximo de resposta</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={10080}
                    value={getSlaValue(ch)}
                    onChange={(e) => setSlaEdits((prev) => ({ ...prev, [ch]: parseInt(e.target.value) || 60 }))}
                    className="h-8 w-24 text-sm text-right"
                  />
                  <span className="text-xs text-muted-foreground w-10">min</span>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button size="sm" disabled={updateSlaMutation.isPending} onClick={handleSaveSla}>
                <Check className="w-3 h-3 mr-1" />
                {updateSlaMutation.isPending ? "Salvando..." : "Salvar SLA"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Satisfação Pós-Atendimento (Admin only) */}
      {isAdmin && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Heart className="w-4 h-4 text-muted-foreground" />
              Satisfação Pós-Atendimento
            </CardTitle>
            <CardDescription className="text-xs">
              Configure a pesquisa de satisfação enviada automaticamente ao cliente após o encerramento de um atendimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Ativar pesquisa de satisfação</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, uma mensagem é enviada ao cliente ao finalizar o atendimento.
                </p>
              </div>
              <Switch checked={effEnabled} onCheckedChange={(v) => setSatisfactionEnabled(v)} />
            </div>
            {effEnabled && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mensagem enviada ao cliente</Label>
                  <Textarea
                    value={effMessage}
                    onChange={(e) => setSatisfactionMessage(e.target.value)}
                    rows={3}
                    className="text-sm"
                    placeholder="Ex: Como você avalia o atendimento que recebeu? Responda com uma nota de 1 a 5."
                  />
                  <p className="text-xs text-muted-foreground">
                    Esta mensagem é enviada pelo canal original do atendimento ao ser finalizado.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Atraso após encerramento (minutos)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={effDelay}
                    onChange={(e) => setSatisfactionDelay(parseInt(e.target.value) || 0)}
                    className="h-8 w-24 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">0 = enviar imediatamente ao encerrar</p>
                </div>
              </>
            )}
            <div className="flex justify-end pt-1">
              <Button size="sm" disabled={updateSatisfactionMutation.isPending} onClick={handleSaveSatisfaction}>
                <Check className="w-3 h-3 mr-1" />
                {updateSatisfactionMutation.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aparência */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {theme === "dark" ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Sun className="w-4 h-4 text-muted-foreground" />}
            Aparência
          </CardTitle>
          <CardDescription className="text-xs">Personalize a aparência da plataforma.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Modo Escuro</p>
              <p className="text-xs text-muted-foreground">Alternar entre tema claro e escuro</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
          </div>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            Notificações
          </CardTitle>
          <CardDescription className="text-xs">Configure quais alertas você recebe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "Todas as Notificações", description: "Ativar ou desativar todas as notificações", value: notifications, setter: setNotifications },
            { label: "Alertas de Baixa Qualidade", description: "Alertar quando a nota de qualidade de um atendimento estiver abaixo de 70", value: lowQualityAlerts, setter: setLowQualityAlerts },
            { label: "Respostas de Pesquisas", description: "Notificar quando um cliente responder a pesquisas NPS ou CSAT", value: surveyAlerts, setter: setSurveyAlerts },
          ].map(({ label, description, value, setter }) => (
            <div key={label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={value}
                onCheckedChange={(v) => { setter(v); toast.success(`${label} ${v ? "ativado" : "desativado"}`); }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sobre */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Sobre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Plataforma</span>
            <span className="font-medium text-foreground">Reino Sucesso do Cliente</span>
          </div>
          <div className="flex justify-between">
            <span>Versão</span>
            <span className="font-medium text-foreground">2.3.0</span>
          </div>
          <div className="flex justify-between">
            <span>Sua Função</span>
            <Badge variant="secondary" className="text-xs">{user?.role}</Badge>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
