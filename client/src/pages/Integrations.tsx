import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Info,
  Mail,
  MessageSquare,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  ShoppingCart,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LayoutTemplate, Plus, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import { SubTabBar } from "@/components/SubTabBar";

// Always use the published domain for webhook URLs so they remain valid regardless of how the app is accessed
const WEBHOOK_BASE = "https://reino-cs.manus.space";

export default function Integrations() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const { data: channelStatus, refetch: refetchStatus } = trpc.channels.getStatus.useQuery();
  const { data: channelHealth } = trpc.channels.getHealthStatus.useQuery();
  const { data: guruData } = trpc.guru.getStats.useQuery();
  const { data: guruSettings } = trpc.guru.getSettings.useQuery();
  const { data: guruEvents } = trpc.guru.getWebhookEvents.useQuery({ limit: 10 });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  if (user?.role === "Agent") {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Settings className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Acesso Restrito</p>
        <p className="text-sm mt-1">Integrações disponíveis apenas para Managers e Admins.</p>
      </div>
    );
  }

  const SETTINGS_TABS = [
    { label: "Usuários",     path: "/settings",      icon: Shield },
    { label: "Integrações", path: "/integrations",  icon: Zap },
  ];

  return (
    <div className="page-bg min-h-screen">
      <SubTabBar tabs={SETTINGS_TABS} />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Zap className="w-6 h-6 text-amber-500" />
          Integrações
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure canais de comunicação, CRM e fontes de dados para a plataforma.
        </p>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "WhatsApp", active: channelStatus?.whatsapp, icon: MessageSquare, color: "text-emerald-600" },
          { label: "E-mail", active: channelStatus?.email, icon: Mail, color: "text-blue-600" },
          { label: "Instagram", active: channelStatus?.instagram, icon: Globe, color: "text-pink-600" },
          { label: "Telegram", active: channelStatus?.telegram, icon: Send, color: "text-sky-600" },
        ].map(({ label, active, icon: Icon, color }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color}`} />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <Badge variant={active ? "default" : "secondary"} className="text-xs mt-0.5">
                  {active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Channel Health Dashboard */}
      {channelHealth && channelHealth.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Wifi className="w-4 h-4" /> Saúde dos Canais
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {channelHealth.map((ch: any) => {
              const icons: Record<string, string> = { whatsapp: '📱', email: '📧', instagram: '📸', telegram: '✈️', chat: '💬' };
              const labels: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', instagram: 'Instagram', telegram: 'Telegram', chat: 'Chat' };
              const alertColors = {
                green: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
                amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500' },
                red: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', dot: 'bg-red-500' },
              };
              const colors = alertColors[ch.alertLevel as keyof typeof alertColors] ?? alertColors.green;
              return (
                <div key={ch.channel} className={`rounded-xl p-3 border ${colors.bg} ${colors.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg">{icons[ch.channel] ?? '💬'}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${colors.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                      {ch.alertLevel === 'red' ? 'Inativo' : ch.alertLevel === 'amber' ? 'Alerta' : 'Ativo'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold">{labels[ch.channel] ?? ch.channel}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ch.messageCount24h} msg nas últimas 24h
                  </p>
                  {ch.lastMessageAt ? (
                    <p className="text-xs text-muted-foreground">
                      Última: {new Date(ch.lastMessageAt).toLocaleDateString('pt-BR')}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem mensagens</p>
                  )}
                  {ch.isActive && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
                        <span>Uptime</span>
                        <span>{ch.uptimePercent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${ch.uptimePercent}%` }} />
                      </div>
                    </div>
                  )}
                  {ch.hasInactivityAlert && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">⚠️ Sem mensagens há +24h</p>
                  )}
                  {ch.isInactiveAlert && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium">🔴 Canal desativado</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Tabs defaultValue="guru">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="guru" className="gap-2">
            <ShoppingCart className="w-4 h-4" /> Digital Manager Guru
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageSquare className="w-4 h-4" /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="w-4 h-4" /> Email
          </TabsTrigger>
          <TabsTrigger value="instagram" className="gap-2">
            <Globe className="w-4 h-4" /> Instagram
          </TabsTrigger>
          <TabsTrigger value="telegram" className="gap-2">
            <Send className="w-4 h-4" /> Telegram
          </TabsTrigger>
          <TabsTrigger value="ghl" className="gap-2">
            <Zap className="w-4 h-4" /> Go High Level
          </TabsTrigger>
        </TabsList>

        {/* Digital Manager Guru */}
        <TabsContent value="guru" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {guruSettings?.isActive ? (
                <Card className="border-0 shadow-sm bg-emerald-50 dark:bg-emerald-900/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-medium text-emerald-800 dark:text-emerald-200 text-sm">Guru conectada e ativa</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {guruData?.approved ?? 0} clientes criados
                        {guruData?.lastEventAt ? ` · Último evento: ${new Date(guruData.lastEventAt).toLocaleString("pt-BR")}` : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-900/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Guru não configurada. Configure o webhook abaixo para importar clientes automaticamente.
                    </p>
                  </CardContent>
                </Card>
              )}

              <GuruConfigCard isAdmin={isAdmin} guruSettings={guruSettings} copyToClipboard={copyToClipboard} />

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total de eventos", value: guruData?.total ?? 0, color: "text-foreground" },
                  { label: "Clientes criados", value: guruData?.approved ?? 0, color: "text-emerald-600" },
                  { label: "Cancelamentos", value: guruData?.canceled ?? 0, color: "text-red-500" },
                ].map(({ label, value, color }) => (
                  <Card key={label} className="border-0 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Events log */}
              {guruEvents && guruEvents.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="w-4 h-4" /> Últimos eventos recebidos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {guruEvents.map(event => (
                        <div key={event.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{event.contactName || event.contactEmail || "—"}</p>
                            <p className="text-muted-foreground truncate">{event.productName || "Produto não identificado"}</p>
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            <p className={`font-semibold capitalize ${event.action === "created" ? "text-emerald-600" : event.action === "churned" ? "text-red-500" : "text-blue-600"}`}>
                              {event.action || event.status}
                            </p>
                            <p className="text-muted-foreground">
                              {event.createdAt ? new Date(event.createdAt).toLocaleDateString("pt-BR") : "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div>
              <Card className="border-0 shadow-sm bg-muted/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Como Configurar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3">
                    {[
                      "Copie a URL do Webhook acima.",
                      "Acesse Guru → Configurações → Webhooks → Vendas.",
                      "Cole a URL e selecione todos os eventos.",
                      "Ative o webhook e salve.",
                      "Toda venda aprovada aparece automaticamente aqui.",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">{i + 1}</span>
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <a href="https://docs.digitalmanager.guru/configuracoes-gerais/webhook" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary mt-4 hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> Documentação oficial da Guru
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* WhatsApp */}
        <TabsContent value="whatsapp" className="mt-4 space-y-6">
          <WhatsAppQRReconnect isActive={channelStatus?.whatsapp ?? false} onConnected={refetchStatus} />
          <WhatsAppConfigCard isAdmin={isAdmin} webhookBase={WEBHOOK_BASE} copyToClipboard={copyToClipboard} />
          <WhatsAppTemplatesManager isAdmin={isAdmin} />
        </TabsContent>

        {/* Email */}
        <TabsContent value="email" className="mt-4">
          <ChannelConfigCard
            channel="email"
            title="Email (Titan / SMTP + IMAP)"
            description="Envie e receba e-mails de suporte pela plataforma. Configurado para Titan por padrão."
            isAdmin={isAdmin}
            testable
            fields={[
              { key: "emailHost", label: "Host SMTP", placeholder: "smtp.titan.email", type: "text" },
              { key: "emailPort", label: "Porta SMTP", placeholder: "465", type: "number" },
              { key: "emailUser", label: "Usuário / Email", placeholder: "suporte@suaempresa.com", type: "email" },
              { key: "emailPassword", label: "Senha da caixa", placeholder: "••••••••", type: "password" },
              { key: "emailFromName", label: "Nome do Remetente", placeholder: "Suporte Reino", type: "text" },
              { key: "emailImapHost", label: "Host IMAP (recebimento)", placeholder: "imap.titan.email", type: "text" },
              { key: "emailImapPort", label: "Porta IMAP", placeholder: "993", type: "number" },
              { key: "slaFirstResponseMinutes", label: "ANS - Primeira Resposta (minutos)", placeholder: "120", type: "number" },
              { key: "slaResolutionHours", label: "ANS - Resolução (horas)", placeholder: "48", type: "number" },
            ]}
            instructions={[
              "Titan (envio): Host smtp.titan.email, Porta 465 (SSL). Usuário = e-mail completo da caixa.",
              "Titan (recebimento): Host imap.titan.email, Porta 993. Mesmo usuário e senha do envio.",
              "A senha é a da própria caixa Titan (não precisa de 'senha de app').",
              "Após salvar, use 'Testar conexão' para validar SMTP e IMAP com a Titan.",
              "O recebimento roda via tarefa agendada chamando /api/scheduled/poll-email.",
            ]}
            copyToClipboard={copyToClipboard}
          />
        </TabsContent>

        {/* Instagram */}
        <TabsContent value="instagram" className="mt-4">
          <ChannelConfigCard
            channel="instagram"
            title="Instagram Direct Messages"
            description="Conecte o Instagram Business via Meta Graph API para receber DMs diretamente na plataforma."
            isAdmin={isAdmin}
            webhookUrl={`${WEBHOOK_BASE}/api/webhooks/instagram`}
            fields={[
              { key: "igPageId", label: "Page ID (Facebook Page vinculada)", placeholder: "123456789", type: "text" },
              { key: "igAccessToken", label: "Page Access Token", placeholder: "EAAxxxxx...", type: "password" },
              { key: "slaFirstResponseMinutes", label: "ANS - Primeira Resposta (minutos)", placeholder: "60", type: "number" },
            ]}
            instructions={[
              "Sua conta Instagram deve ser Business ou Creator e vinculada a uma Página do Facebook.",
              "Acesse developers.facebook.com, crie um App e adicione o produto 'Instagram'.",
              "Gere um Page Access Token com permissões: instagram_manage_messages, pages_messaging.",
              "Configure o webhook com a URL acima para receber mensagens em tempo real.",
            ]}
            copyToClipboard={copyToClipboard}
          />
        </TabsContent>

        {/* Telegram */}
        <TabsContent value="telegram" className="mt-4">
          <ChannelConfigCard
            channel="telegram"
            title="Telegram Bot"
            description="Crie um bot no Telegram para receber mensagens de clientes diretamente na plataforma."
            isAdmin={isAdmin}
            webhookUrl={`${WEBHOOK_BASE}/api/webhooks/telegram`}
            fields={[
              { key: "tgBotToken", label: "Bot Token (@BotFather)", placeholder: "123456:ABCxxxxx", type: "password" },
              { key: "tgWebhookSecret", label: "Webhook Secret (segurança)", placeholder: "meu_secret_aleatorio", type: "text" },
              { key: "slaFirstResponseMinutes", label: "ANS - Primeira Resposta (minutos)", placeholder: "30", type: "number" },
            ]}
            instructions={[
              "Abra o Telegram e inicie uma conversa com @BotFather.",
              "Use /newbot para criar um bot e copie o token gerado.",
              "Defina um Webhook Secret aleatório para validar as requisições.",
              "Após salvar, o sistema configurará o webhook automaticamente.",
            ]}
            copyToClipboard={copyToClipboard}
          />
        </TabsContent>

        {/* Go High Level */}
        <TabsContent value="ghl" className="mt-4">
          <GHLIntegrationTab isAdmin={isAdmin} webhookUrl={`${WEBHOOK_BASE}/api/webhooks/ghl`} copyToClipboard={copyToClipboard} />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

// ─── Guru Config Card ─────────────────────────────────────────────────────────
function GuruConfigCard({ isAdmin, guruSettings, copyToClipboard }: {
  isAdmin: boolean;
  guruSettings: { apiToken: string | null; webhookSecret: string | null; isActive: boolean } | null | undefined;
  copyToClipboard: (text: string) => void;
}) {
  const utils = trpc.useUtils();
  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const webhookUrl = `${WEBHOOK_BASE}/api/webhooks/guru`;

  const saveMutation = trpc.guru.saveSettings.useMutation({
    onSuccess: () => { toast.success("Configurações da Guru salvas!"); utils.guru.getSettings.invalidate(); utils.guru.getStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Digital Manager Guru</CardTitle>
        <p className="text-sm text-muted-foreground">
          Toda venda aprovada na Guru cria automaticamente um cliente nesta plataforma.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL do Webhook (configure na Guru)</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted" />
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>API Token da Guru (opcional)</Label>
          <Input
            type="password"
            placeholder="guru_token_xxxxx"
            defaultValue={guruSettings?.apiToken ?? ""}
            onChange={e => setApiToken(e.target.value)}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted-foreground">Usado para consultas ativas à API da Guru. Opcional se usar apenas webhooks.</p>
        </div>
        <div className="space-y-2">
          <Label>Webhook Secret (segurança)</Label>
          <Input
            type="password"
            placeholder="secret_aleatorio_seguro"
            defaultValue={guruSettings?.webhookSecret ?? ""}
            onChange={e => setWebhookSecret(e.target.value)}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted-foreground">Configure o mesmo valor na Guru para validar a autenticidade dos webhooks.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => saveMutation.mutate({ apiToken: apiToken || undefined, webhookSecret: webhookSecret || undefined, isActive: true })} disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Evolution API QR Code Panel ─────────────────────────────────────────────
function EvolutionQRCodePanel({ instanceName }: { instanceName: string }) {
  const [showQR, setShowQR] = useState(false);
  const [connected, setConnected] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch QR Code (only when panel is open)
  const { data: qrData, refetch: refetchQR, isLoading: qrLoading, error: qrError } = trpc.channels.evolutionGetQrCode.useQuery(
    { instanceName },
    { enabled: showQR && !connected, retry: false }
  );

  // Poll connection status every 3s while QR is shown
  const { data: statusData, refetch: refetchStatus } = trpc.channels.evolutionGetStatus.useQuery(
    { instanceName },
    { enabled: showQR, refetchInterval: showQR && !connected ? 3000 : false }
  );

  // Detect connection
  useEffect(() => {
    if (statusData?.state === 'connected' && showQR) {
      setConnected(true);
      setShowQR(false);
      if (pollingRef.current) clearInterval(pollingRef.current);
      toast.success(`WhatsApp conectado! Instância "${instanceName}" ativa. ✓`);
    }
  }, [statusData?.state, showQR, instanceName]);

  // Auto-refresh QR code every 25s (QR expires after 30s)
  useEffect(() => {
    if (!showQR || connected) return;
    const interval = setInterval(() => { refetchQR(); }, 25000);
    pollingRef.current = interval;
    return () => clearInterval(interval);
  }, [showQR, connected, refetchQR]);

  const handleOpen = () => {
    setConnected(false);
    setShowQR(true);
  };
  const handleClose = () => {
    setShowQR(false);
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  return (
    <>
      <div className="border-t pt-4 mt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Conectar via QR Code</p>
            <p className="text-xs text-muted-foreground mt-0.5">Instância: <span className="font-mono">{instanceName}</span></p>
          </div>
          {connected ? (
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-semibold">Conectado ✓</span>
            </div>
          ) : (
            <Button onClick={handleOpen} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" size="sm">
              <QrCode className="w-4 h-4" />
              Escanear QR Code
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showQR} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              Conectar WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Abra o WhatsApp no celular → <strong>Dispositivos Vinculados</strong> → <strong>Vincular um dispositivo</strong> → escaneie o QR Code.
            </p>
            <div className="flex justify-center">
              {qrLoading ? (
                <div className="w-52 h-52 bg-muted rounded-xl flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
                  <p className="text-xs text-muted-foreground">Gerando QR Code...</p>
                </div>
              ) : qrError ? (
                <div className="w-52 h-52 bg-red-50 dark:bg-red-900/20 rounded-xl flex flex-col items-center justify-center gap-2 p-4">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                  <p className="text-xs text-red-600 dark:text-red-400 text-center">{qrError.message}</p>
                  <Button size="sm" variant="outline" onClick={() => refetchQR()}>Tentar novamente</Button>
                </div>
              ) : qrData?.base64 ? (
                <div className="p-3 bg-white rounded-xl border-2 border-emerald-200 shadow-sm">
                  <img src={qrData.base64} alt="QR Code WhatsApp" className="w-48 h-48" />
                </div>
              ) : (
                <div className="w-52 h-52 bg-muted rounded-xl flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
                  <p className="text-xs text-muted-foreground">Aguardando QR Code...</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Aguardando escaneamento... (atualiza a cada 25s)
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">Cancelar</Button>
              <Button variant="outline" onClick={() => refetchQR()} disabled={qrLoading} className="flex-1 gap-1">
                <RefreshCw className={`w-4 h-4 ${qrLoading ? 'animate-spin' : ''}`} />
                Atualizar QR
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── WhatsApp QR Code Reconnect Card ────────────────────────────────────────────
function WhatsAppQRReconnect({ isActive, onConnected }: { isActive: boolean; onConnected: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const utils = trpc.useUtils();

  const { data: qrData, refetch: refetchQR } = trpc.channels.getWhatsAppQRCode.useQuery(undefined, { enabled: showModal });
  const simulateConnect = trpc.channels.simulateConnect.useMutation({
    onSuccess: () => {
      toast.success('WhatsApp reconectado com sucesso! ✓');
      setShowModal(false);
      setPolling(false);
      if (pollingRef.current) clearInterval(pollingRef.current);
      utils.channels.getStatus.invalidate();
      utils.channels.getHealthStatus.invalidate();
      onConnected();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleOpenModal = () => {
    setShowModal(true);
    setPolling(true);
  };

  const handleSimulateConnect = () => {
    simulateConnect.mutate();
  };

  const handleClose = () => {
    setShowModal(false);
    setPolling(false);
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  // Auto-refresh QR code every 30s
  useEffect(() => {
    if (!showModal) return;
    const interval = setInterval(() => { refetchQR(); }, 30000);
    return () => clearInterval(interval);
  }, [showModal, refetchQR]);

  if (isActive) return null;

  return (
    <>
      <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">WhatsApp desconectado</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Escaneie o QR Code para reconectar o canal WhatsApp.</p>
            </div>
          </div>
          <Button
            onClick={handleOpenModal}
            className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            size="sm"
          >
            <QrCode className="w-4 h-4" />
            Reconectar via QR Code
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              Reconectar WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Abra o WhatsApp no seu celular, vá em <strong>Dispositivos Vinculados</strong> e escaneie o QR Code abaixo.
            </p>
            <div className="flex justify-center">
              {qrData?.qrDataUrl ? (
                <div className="p-3 bg-white rounded-xl border-2 border-emerald-200 shadow-sm">
                  <img src={qrData.qrDataUrl} alt="QR Code WhatsApp" className="w-48 h-48" />
                </div>
              ) : (
                <div className="w-48 h-48 bg-muted rounded-xl flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
            </div>
            <p className="text-xs text-center text-muted-foreground">QR Code atualiza automaticamente a cada 30 segundos</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">Cancelar</Button>
              <Button
                onClick={handleSimulateConnect}
                disabled={simulateConnect.isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {simulateConnect.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {simulateConnect.isPending ? 'Conectando...' : 'Simular Conexão'}
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Em produção com Evolution API, a conexão ocorre automaticamente ao escanear o QR Code real.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── WhatsApp Config Card (Meta Cloud API only) ──────────────────────────────
function WhatsAppConfigCard({ isAdmin, webhookBase, copyToClipboard }: {
  isAdmin: boolean;
  webhookBase: string;
  copyToClipboard: (text: string) => void;
}) {
  const { data: settings, refetch } = trpc.channels.get.useQuery({ channel: "whatsapp" });
  const saveMutation = trpc.channels.save.useMutation({
    onSuccess: () => { toast.success("WhatsApp conectado com sucesso!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<"meta" | "zapi" | "evolution">("evolution");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);
  const webhookUrl = `${webhookBase}/api/webhooks/whatsapp`;

  const handleSave = () => {
    const data: Record<string, unknown> = { channel: "whatsapp", isActive: true, waProvider: provider };
    if (provider === "evolution") {
      if (form.evolutionApiUrl) data.evolutionApiUrl = form.evolutionApiUrl;
      if (form.evolutionApiKey) data.evolutionApiKey = form.evolutionApiKey;
      if (form.evolutionInstanceName) data.evolutionInstanceName = form.evolutionInstanceName;
    } else if (provider === "zapi") {
      if (form.zapiInstanceId) data.zapiInstanceId = form.zapiInstanceId;
      if (form.zapiToken) data.zapiToken = form.zapiToken;
      if (form.zapiClientToken) data.zapiClientToken = form.zapiClientToken;
    } else {
      if (form.waPhoneNumberId) data.waPhoneNumberId = form.waPhoneNumberId;
      if (form.waToken) data.waToken = form.waToken;
      if (form.waVerifyToken) data.waVerifyToken = form.waVerifyToken;
    }
    saveMutation.mutate(data as Parameters<typeof saveMutation.mutate>[0]);
  };

  const handleTest = async () => {
    if (provider === "meta") {
      const phoneId = form.waPhoneNumberId || (settings as any)?.waPhoneNumberId;
      const token = form.waToken || (settings as any)?.waToken;
      if (!phoneId || !token) { toast.error("Preencha Phone Number ID e Access Token antes de testar."); return; }
      setTesting(true); setTestResult(null);
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { setTestResult("ok"); toast.success("Conexão com a Meta verificada! ✓"); }
        else { setTestResult("error"); toast.error("Credenciais inválidas. Verifique Phone Number ID e Access Token."); }
      } catch { setTestResult("error"); toast.error("Erro ao testar conexão."); }
      finally { setTesting(false); }
    } else if (provider === "evolution") {
      const apiUrl = form.evolutionApiUrl || (settings as any)?.evolutionApiUrl;
      const apiKey = form.evolutionApiKey || (settings as any)?.evolutionApiKey;
      const instanceName = form.evolutionInstanceName || (settings as any)?.evolutionInstanceName;
      if (!apiUrl || !apiKey || !instanceName) { toast.error("Preencha URL, API Key e Instance Name antes de testar."); return; }
      setTesting(true); setTestResult(null);
      try {
        const res = await fetch(`${apiUrl.replace(/\/$/, "")}/instance/fetchInstances`, {
          headers: { "apikey": apiKey },
        });
        if (res.ok) { setTestResult("ok"); toast.success("Conexão com a Evolution API verificada! ✓"); }
        else { setTestResult("error"); toast.error("Credenciais inválidas. Verifique a URL e API Key."); }
      } catch { setTestResult("error"); toast.error("Erro ao testar conexão."); }
      finally { setTesting(false); }
    } else {
      toast.info("Teste de conexão não disponível para Z-API nesta versão.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {settings?.isActive ? (
          <Card className="border-0 shadow-sm bg-emerald-50 dark:bg-emerald-900/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-200 text-sm">
                    WhatsApp conectado via {(settings as any)?.waProvider === "evolution" ? "Evolution API" : (settings as any)?.waProvider === "zapi" ? "Z-API" : "Meta Cloud API"}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Mensagens sendo recebidas e enviadas normalmente</p>
                </div>
              </div>
              {isAdmin && (
                <Button size="sm" variant="outline" className="text-red-600 shrink-0"
                  onClick={() => saveMutation.mutate({ channel: "whatsapp", isActive: false })}>
                  Desconectar
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">WhatsApp não conectado. Escolha o provider abaixo e preencha as credenciais para ativar.</p>
            </CardContent>
          </Card>
        )}

        {/* Provider Selector */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              Escolha o Provider WhatsApp
            </CardTitle>
            <p className="text-sm text-muted-foreground">Selecione como o sistema vai se conectar ao WhatsApp.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "evolution" as const, label: "Evolution API", desc: "Open source. Suporta grupos. Recomendado.", badge: "Recomendado" },
                { id: "zapi" as const, label: "Z-API", desc: "Serviço pago. Fácil de configurar.", badge: null },
                { id: "meta" as const, label: "Meta Cloud API", desc: "API oficial. Sem grupos.", badge: null },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${provider === p.id ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : "border-border hover:border-emerald-300"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{p.label}</span>
                    {p.badge && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{p.badge}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Evolution API Fields */}
        {provider === "evolution" && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evolution API — Configuração</CardTitle>
              <p className="text-sm text-muted-foreground">Open source, suporta grupos e mensagens individuais. Hospede no Railway (gratuito) ou em qualquer VPS.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL do Webhook (configure na Evolution API)</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs bg-background" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">URL da Evolution API</Label>
                  <Input placeholder="https://evolution-api-xxx.railway.app" value={form.evolutionApiUrl || ""} onChange={e => setForm(f => ({ ...f, evolutionApiUrl: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">URL base da sua instância da Evolution API (sem barra no final)</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">API Key (Global)</Label>
                  <Input type="password" placeholder="sua-api-key-global" value={form.evolutionApiKey || ""} onChange={e => setForm(f => ({ ...f, evolutionApiKey: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Definida no arquivo .env da Evolution API como AUTHENTICATION_API_KEY</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Nome da Instância</Label>
                  <Input placeholder="milhanario" value={form.evolutionInstanceName || ""} onChange={e => setForm(f => ({ ...f, evolutionInstanceName: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Ex: milhanario, profissao_liberdade, commander_ia</p>
                </div>
              </div>
              {testResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult === "ok" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"}`}>
                  {testResult === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {testResult === "ok" ? "Conexão verificada! Pode salvar e ativar." : "Erro na conexão. Verifique a URL e API Key."}
                </div>
              )}
              {isAdmin && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleTest} disabled={testing} className="flex-1">
                    {testing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                    {testing ? "Testando..." : "Testar Conexão"}
                  </Button>
                  <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1">
                    {saveMutation.isPending ? "Salvando..." : "Salvar e Ativar"}
                  </Button>
                </div>
              )}
              {/* QR Code Panel — shown after Evolution API is saved and active */}
              {(settings as any)?.waProvider === "evolution" && (settings as any)?.evolutionApiUrl && (
                <EvolutionQRCodePanel instanceName={(settings as any)?.evolutionInstanceName || "reino-cs"} />
              )}
            </CardContent>
          </Card>
        )}

        {/* Z-API Fields */}
        {provider === "zapi" && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Z-API — Configuração</CardTitle>
              <p className="text-sm text-muted-foreground">Serviço pago (R$97-300/mês). Suporta grupos. Fácil de configurar em z-api.io.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL do Webhook (configure no painel Z-API)</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs bg-background" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Instance ID</Label>
                  <Input placeholder="Ex: 3D9A1B2C4E5F6G7H" value={form.zapiInstanceId || ""} onChange={e => setForm(f => ({ ...f, zapiInstanceId: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Chave de Acesso</Label>
                  <Input type="password" placeholder="Chave da instância Z-API" value={form.zapiToken || ""} onChange={e => setForm(f => ({ ...f, zapiToken: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Client Token (segurança)</Label>
                  <Input type="password" placeholder="Client Token (opcional)" value={form.zapiClientToken || ""} onChange={e => setForm(f => ({ ...f, zapiClientToken: e.target.value }))} />
                </div>
              </div>
              {isAdmin && (
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
                  {saveMutation.isPending ? "Salvando..." : "Salvar e Ativar Z-API"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Meta Cloud API Fields */}
        {provider === "meta" && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                WhatsApp Business API (Meta)
              </CardTitle>
              <p className="text-sm text-muted-foreground">Conexão direta com a API oficial da Meta. Sem intermediários. Não suporta grupos.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Cole esta URL no painel da Meta (Webhooks)</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs bg-background" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Credenciais do App Meta</Label>
                <div className="space-y-2">
                  <Label className="text-sm">Phone Number ID</Label>
                  <Input placeholder="Ex: 123456789012345" value={form.waPhoneNumberId || ""} onChange={e => setForm(f => ({ ...f, waPhoneNumberId: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Access Token</Label>
                  <Input type="password" placeholder="EAAxxxxx..." value={form.waToken || ""} onChange={e => setForm(f => ({ ...f, waToken: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Verify Token (Webhook)</Label>
                  <Input placeholder="meu_verify_token_seguro" value={form.waVerifyToken || ""} onChange={e => setForm(f => ({ ...f, waVerifyToken: e.target.value }))} />
                </div>
              </div>
              {testResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult === "ok" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"}`}>
                  {testResult === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {testResult === "ok" ? "Credenciais válidas! Pode salvar e ativar." : "Credenciais inválidas. Verifique e tente novamente."}
                </div>
              )}
              {isAdmin && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleTest} disabled={testing} className="flex-1">
                    {testing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                    {testing ? "Testando..." : "Testar Conexão"}
                  </Button>
                  <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1">
                    {saveMutation.isPending ? "Salvando..." : "Salvar e Ativar"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {/* Instructions sidebar */}
      <div className="space-y-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              {provider === "evolution" ? "Como configurar a Evolution API" : provider === "zapi" ? "Como configurar a Z-API" : "Como conectar em 4 passos"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {provider === "evolution" ? (
              <ol className="space-y-3 text-xs text-muted-foreground">
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">1</span><span>Acesse <a href="https://railway.app" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">railway.app</a>, crie uma conta gratuita e clique em <strong>Deploy from template</strong>.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">2</span><span>Busque por <strong>Evolution API</strong> nos templates e faça o deploy. Anote a URL gerada.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">3</span><span>No painel da Evolution API, crie uma instância chamada <strong>reino-cs</strong> e conecte o WhatsApp escaneando o QR Code.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">4</span><span>Cole a URL, API Key e nome da instância ao lado, clique em <strong>Testar Conexão</strong> e depois <strong>Salvar e Ativar</strong>.</span></li>
              </ol>
            ) : provider === "zapi" ? (
              <ol className="space-y-3 text-xs text-muted-foreground">
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">1</span><span>Acesse <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">z-api.io</a> e crie uma conta.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">2</span><span>Crie uma instância e conecte o WhatsApp escaneando o QR Code.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">3</span><span>Copie o <strong>Instance ID</strong> e o <strong>Chave de Acesso</strong> do painel Z-API.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">4</span><span>Configure o webhook no painel Z-API com a URL acima e cole as credenciais ao lado.</span></li>
              </ol>
            ) : (
              <ol className="space-y-3 text-xs text-muted-foreground">
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">1</span><span>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">developers.facebook.com</a>, crie um App <strong>Business</strong> e adicione o produto <strong>WhatsApp</strong>.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">2</span><span>Copie o <strong>Phone Number ID</strong> e o token de teste.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">3</span><span>Em <strong>Webhooks</strong>, cole a URL acima e inscreva o evento <code className="bg-muted px-1 rounded">messages</code>.</span></li>
                <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center shrink-0 font-bold">4</span><span>Cole as credenciais ao lado, teste e salve.</span></li>
              </ol>
            )}
          </CardContent>
        </Card>
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Nota sobre grupos</p>
          <p className="text-xs text-amber-600 dark:text-amber-400">A Meta Cloud API <strong>não suporta grupos</strong>. Para monitorar e responder em grupos de WhatsApp, use a Evolution API ou Z-API.</p>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Templates Manager ─────────────────────────────────────────────
function WhatsAppTemplatesManager({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading, refetch } = trpc.channels.listTemplates.useQuery();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "UTILITY" as "UTILITY" | "MARKETING" | "AUTHENTICATION",
    language: "pt_BR",
    bodyText: "",
    headerText: "",
    footerText: "",
  });

  const createMutation = trpc.channels.createTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template enviado para aprovação da Meta!");
      setIsCreateOpen(false);
      setForm({ name: "", category: "UTILITY", language: "pt_BR", bodyText: "", headerText: "", footerText: "" });
      setTimeout(() => refetch(), 2000);
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteMutation = trpc.channels.deleteTemplate.useMutation({
    onSuccess: () => { toast.success("Template removido!"); refetch(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const statusColors: Record<string, string> = {
    APPROVED: "bg-emerald-100 text-emerald-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    IN_APPEAL: "bg-blue-100 text-blue-700",
    REJECTED: "bg-red-100 text-red-700",
    DISABLED: "bg-slate-100 text-slate-500",
    PAUSED: "bg-orange-100 text-orange-700",
  };

  const categoryLabels: Record<string, string> = {
    UTILITY: "Utilidade",
    MARKETING: "Marketing",
    AUTHENTICATION: "Autenticação",
  };

  const getBodyText = (components: any[]) => {
    const body = components?.find((c: any) => c.type === "BODY");
    return body?.text ?? "";
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-emerald-600" />
            Templates HSM
          </CardTitle>
          {isAdmin && (
            <Button size="sm" className="gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Novo Template
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Templates aprovados pela Meta para iniciar conversas após 24h de inatividade.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <LayoutTemplate className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum template encontrado</p>
            <p className="text-xs mt-1">Crie seu primeiro template ou verifique se o Business Account ID está configurado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t: any) => (
              <div key={t.name} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-semibold text-foreground">{t.name}</span>
                    <Badge className={`text-xs ${statusColors[t.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {t.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{categoryLabels[t.category] ?? t.category}</Badge>
                    <span className="text-xs text-muted-foreground">{t.language}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{getBodyText(t.components as any[])}</p>
                </div>
                {isAdmin && (t.status === "REJECTED" || t.status === "PENDING" || t.status === "PAUSED") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                    onClick={() => deleteMutation.mutate({ name: t.name })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create Template Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-emerald-600" />
              Criar Template HSM
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome *</Label>
                <Input
                  placeholder="boas_vindas_aluno"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">Apenas letras minúsculas, números e _</p>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Idioma</Label>
              <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en_US">English (US)</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cabeçalho (opcional)</Label>
              <Input
                placeholder="Ex: Bem-vindo ao {{1}}!"
                value={form.headerText}
                onChange={e => setForm(f => ({ ...f, headerText: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Corpo da mensagem *</Label>
              <Textarea
                placeholder="Olá {{1}}, seja bem-vindo ao {{2}}! Estamos felizes em ter você conosco."
                value={form.bodyText}
                onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))}
                rows={4}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-0.5">Use {"{{1}}"},  {"{{2}}"} para variáveis dinâmicas (nome, programa, etc.)</p>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rodapé (opcional)</Label>
              <Input
                placeholder="Ex: Equipe de Suporte"
                value={form.footerText}
                onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))}
                className="mt-1"
              />
            </div>
            {/* Preview */}
            {form.bodyText && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2">Pré-visualização</p>
                {form.headerText && <p className="text-sm font-semibold text-foreground mb-1">{form.headerText}</p>}
                <p className="text-sm text-foreground whitespace-pre-wrap">{form.bodyText}</p>
                {form.footerText && <p className="text-xs text-muted-foreground mt-1">{form.footerText}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => createMutation.mutate({
                  name: form.name,
                  category: form.category,
                  language: form.language,
                  bodyText: form.bodyText,
                  headerText: form.headerText || undefined,
                  footerText: form.footerText || undefined,
                })}
                disabled={!form.name || !form.bodyText || createMutation.isPending}
                className="gap-2"
              >
                {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar para Aprovação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Generic Channel Config Card ─────────────────────────────────────────────
function ChannelConfigCard({
  channel,
  title,
  description,
  isAdmin,
  webhookUrl,
  fields,
  instructions,
  extraContent,
  testable,
  copyToClipboard,
}: {
  channel: "whatsapp" | "email" | "instagram" | "telegram";
  title: string;
  description: string;
  isAdmin: boolean;
  webhookUrl?: string;
  fields: { key: string; label: string; placeholder: string; type: string }[];
  instructions: string[];
  extraContent?: React.ReactNode;
  testable?: boolean; // mostra "Testar conexão" (hoje só o canal email tem teste)
  copyToClipboard: (text: string) => void;
}) {
  const { data: settings, refetch } = trpc.channels.get.useQuery({ channel });
  const saveMutation = trpc.channels.save.useMutation({
    onSuccess: () => { toast.success("Configurações salvas!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const testEmailMutation = trpc.channels.testEmailConnection.useMutation();
  const [testing, setTesting] = useState(false);

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      const r = await testEmailMutation.mutateAsync();
      const imapMsg = r.imap === "ok" ? "IMAP ✓" : r.imap === "skipped" ? "IMAP não configurado" : `IMAP falhou: ${r.imap}`;
      toast.success(`SMTP ✓ · ${imapMsg}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao testar conexão.");
    } finally {
      setTesting(false);
    }
  };

  const [form, setForm] = useState<Record<string, string>>({});

  const handleSave = () => {
    const data: Record<string, unknown> = { channel };
    for (const f of fields) {
      const val = form[f.key] ?? "";
      if (val !== "") {
        data[f.key] = f.type === "number" ? Number(val) : val;
      }
    }
    data.isActive = true;
    saveMutation.mutate(data as Parameters<typeof saveMutation.mutate>[0]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {settings?.isActive ? (
          <Card className="border-0 shadow-sm bg-emerald-50 dark:bg-emerald-900/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="font-medium text-emerald-800 dark:text-emerald-200 text-sm">{title} ativo</p>
              </div>
              {isAdmin && (
                <Button size="sm" variant="outline" className="text-red-600"
                  onClick={() => saveMutation.mutate({ channel, isActive: false })}>
                  Desativar
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">Canal não configurado. Configure as credenciais abaixo para ativar.</p>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {webhookUrl && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            {fields.map(f => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <Input
                  type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                  placeholder={f.placeholder}
                  defaultValue={(settings as Record<string, unknown>)?.[f.key]?.toString() ?? ""}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  disabled={!isAdmin}
                />
              </div>
            ))}
            {isAdmin && (
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
                  {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {saveMutation.isPending ? "Salvando..." : "Salvar e Ativar"}
                </Button>
                {testable && (
                  <Button variant="outline" onClick={handleTestEmail} disabled={testing} className="gap-2">
                    {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {testing ? "Testando..." : "Testar conexão"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="border-0 shadow-sm bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" /> Como Configurar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
            {extraContent}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── GHL Integration Tab ──────────────────────────────────────────────────────
function GHLIntegrationTab({ isAdmin, webhookUrl, copyToClipboard }: {
  isAdmin: boolean;
  webhookUrl: string;
  copyToClipboard: (text: string) => void;
}) {
  const { data: ghlSettings, refetch } = trpc.ghl.getSettings.useQuery();
  const syncMutation = trpc.ghl.syncContact.useMutation({
    onSuccess: () => toast.success("Sincronização iniciada!"),
    onError: (e) => toast.error(e.message),
  });
  const saveMutation = trpc.ghl.saveSettings.useMutation({
    onSuccess: () => { toast.success("Configurações GHL salvas!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({ accessToken: "", locationId: "" });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {ghlSettings?.isConnected ? (
          <Card className="border-0 shadow-sm bg-emerald-50 dark:bg-emerald-900/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-200 text-sm">Go High Level conectado</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Sincronização bidirecional ativa</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => syncMutation.mutate({ ghlContactId: "bulk", name: "Sincronização em Massa" })} disabled={syncMutation.isPending}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                Sincronizar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">GHL não configurado. Adicione suas credenciais abaixo.</p>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Go High Level CRM</CardTitle>
            <p className="text-sm text-muted-foreground">
              Sincronize contatos, deals e oportunidades do GHL com a plataforma via OAuth 2.0 e webhooks.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL do Webhook GHL</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted" />
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Access Token (API Key)</Label>
              <Input
                type="password"
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI..."
                defaultValue={ghlSettings?.accessToken ?? ""}
                onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Location ID</Label>
              <Input
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                defaultValue={ghlSettings?.locationId ?? ""}
                onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>
            {isAdmin && (
              <Button onClick={() => saveMutation.mutate({ accessToken: form.accessToken || undefined, locationId: form.locationId || undefined })} disabled={saveMutation.isPending} className="gap-2">
                {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {saveMutation.isPending ? "Salvando..." : "Salvar e Ativar"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="border-0 shadow-sm bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" /> Como Configurar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {[
                "Acesse GHL → Settings → Integrations → API.",
                "Gere um API Key e copie o Location ID.",
                "Cole as credenciais acima e salve.",
                "Configure o webhook GHL com a URL acima para receber eventos em tempo real.",
                "Eventos: ContactCreate, ContactUpdate, OpportunityStatusChange.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">{i + 1}</span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
