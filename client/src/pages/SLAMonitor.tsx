import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, Clock, RefreshCw,
  MessageSquare, Wifi, WifiOff, ExternalLink
} from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
  telegram: "Telegram",
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  email: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  telegram: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

function formatAge(minutes: number) {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function SLAMonitor() {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLive, setIsLive] = useState(true);
  const [countdown, setCountdown] = useState(60);

  const { data, isLoading, refetch } = trpc.sla.realtime.useQuery(undefined, {
    refetchInterval: isLive ? 60000 : false,
    staleTime: 0,
  });

  // Countdown timer
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setLastUpdated(new Date());
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  const handleRefresh = () => {
    refetch();
    setLastUpdated(new Date());
    setCountdown(60);
  };

  const total = data?.total ?? 0;
  const withinSla = data?.withinSla ?? 0;
  const slaPercent = total > 0 ? Math.round((withinSla / total) * 100) : 100;

  const slaColor = slaPercent >= 90 ? "text-emerald-600" : slaPercent >= 70 ? "text-amber-500" : "text-red-600";
  const slaBarColor = slaPercent >= 90 ? "bg-emerald-500" : slaPercent >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-emerald-600" />
            Monitor de SLA em Tempo Real
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Atendimentos abertos sem primeira resposta dentro do prazo de 1 hora
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {isLive ? (
              <Wifi className="w-4 h-4 text-emerald-500 animate-pulse" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            <span>{isLive ? `Ao vivo · atualiza em ${countdown}s` : "Pausado"}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLive(v => !v)}
            className={isLive ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : ""}
          >
            {isLive ? "Pausar" : "Retomar"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Indicador Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* SLA % */}
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground font-medium">Conformidade SLA</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className={`text-3xl font-bold ${slaColor}`}>{slaPercent}%</div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${slaBarColor}`}
                style={{ width: `${slaPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {withinSla} de {total} atendimentos
            </p>
          </CardContent>
        </Card>

        {/* Within SLA */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground font-medium">Dentro do SLA</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-3xl font-bold text-emerald-600">{data?.withinSla ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Respondidos ou dentro de 1h</p>
          </CardContent>
        </Card>

        {/* Warning */}
        <Card className={data?.warning ? "border-amber-300 dark:border-amber-700" : ""}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground font-medium">Atenção (45–60min)</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-3xl font-bold text-amber-500">{data?.warning ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Prestes a vencer o SLA</p>
          </CardContent>
        </Card>

        {/* Breached */}
        <Card className={data?.breached ? "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/10" : ""}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground font-medium">ANS Violado</span>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-600">{data?.breached ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Sem resposta há mais de 1h</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Conversations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Atendimentos Críticos
            {(data?.criticalConvs?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">
                {data!.criticalConvs.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : !data?.criticalConvs?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
              <p className="font-medium text-emerald-700 dark:text-emerald-400">Todos os atendimentos estão dentro do SLA!</p>
              <p className="text-sm text-muted-foreground mt-1">Nenhum atendimento crítico no momento.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.criticalConvs.map((conv: any) => (
                <div
                  key={conv.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    conv.status === "breached"
                      ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                      : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      conv.status === "breached" ? "bg-red-500 animate-pulse" : "bg-amber-500 animate-pulse"
                    }`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {conv.customerName || conv.subject || `Atendimento #${conv.id}`}
                        </span>
                        {conv.customerName && conv.subject && (
                          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{conv.subject}</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          CHANNEL_COLORS[conv.channel] ?? "bg-muted text-muted-foreground"
                        }`}>
                          {CHANNEL_LABELS[conv.channel] ?? conv.channel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className={`text-xs font-medium ${
                          conv.status === "breached" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                        }`}>
                          {formatAge(conv.ageMinutes)} sem resposta
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            conv.status === "breached"
                              ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                              : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {conv.status === "breached" ? "🔴 SLA Violado" : "🟡 Atenção"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Link href={`/conversations/${conv.id}`}>
                    <Button size="sm" variant="outline" className="shrink-0 gap-1 text-xs">
                      <MessageSquare className="w-3 h-3" />
                      Abrir
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>ANS configurado: {data?.slaWindowMinutes ?? 60} minutos · Alerta: {data?.warningWindowMinutes ?? 45} minutos</span>
        <span>Última atualização: {lastUpdated.toLocaleTimeString("pt-BR")}</span>
      </div>
    </div>
  );
}
