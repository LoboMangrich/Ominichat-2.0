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
import { CheckCircle, Plus, Star, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const classColors: Record<string, string> = {
  Promoter: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  Passive: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Detractor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const classLabels: Record<string, string> = {
  Promoter: "Promotor",
  Passive: "Neutro",
  Detractor: "Detrator",
};

const statusLabels: Record<string, string> = {
  Sent: "Enviado",
  Responded: "Respondido",
  Pending: "Pendente",
};

export default function Surveys() {
  const [typeFilter, setTypeFilter] = useState<"NPS" | "CSAT" | "">("");
  const [classFilter, setClassFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showRespond, setShowRespond] = useState<number | null>(null);
  const [newSurvey, setNewSurvey] = useState({ customerId: 0, type: "NPS" as const });
  const [response, setResponse] = useState({ score: 8, feedback: "" });
  const [customerSearch, setCustomerSearch] = useState("");

  const { data, isLoading, refetch } = trpc.surveys.list.useQuery({
    type: typeFilter || undefined,
    classification: classFilter || undefined,
    page,
    limit: 20,
  });
  const { data: stats } = trpc.surveys.getStats.useQuery();
  const { data: customerData } = trpc.customers.list.useQuery({ search: customerSearch, limit: 8 });

  const createMutation = trpc.surveys.create.useMutation({
    onSuccess: () => { toast.success("Pesquisa enviada!"); setShowCreate(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const respondMutation = trpc.surveys.submitResponse.useMutation({
    onSuccess: (data) => {
      toast.success(`Resposta registrada: ${classLabels[data.classification] ?? data.classification}`);
      setShowRespond(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const total = (stats?.promoters ?? 0) + (stats?.passives ?? 0) + (stats?.detractors ?? 0);
  const npsScore = total > 0 ? Math.round(((stats!.promoters - stats!.detractors) / total) * 100) : 0;

  const surveys = data?.surveys ?? [];

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            Pesquisas NPS & CSAT
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Acompanhe a satisfação e lealdade dos seus clientes.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Enviar Pesquisa</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Enviar Pesquisa</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Cliente *</Label>
                <Input placeholder="Buscar cliente..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                {customerData?.customers && customerSearch && (
                  <div className="border rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                    {customerData.customers.map(c => (
                      <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => { setNewSurvey(p => ({ ...p, customerId: c.id })); setCustomerSearch(c.name); }}>
                        {c.name} {c.email && <span className="text-muted-foreground text-xs">· {c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Pesquisa</Label>
                <Select value={newSurvey.type} onValueChange={v => setNewSurvey(p => ({ ...p, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NPS">NPS (Net Promoter Score)</SelectItem>
                    <SelectItem value="CSAT">CSAT (Satisfação do Cliente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button className="flex-1" disabled={!newSurvey.customerId || createMutation.isPending} onClick={() => createMutation.mutate(newSurvey)}>
                  {createMutation.isPending ? "Enviando..." : "Enviar Pesquisa"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm md:col-span-1">
          <CardContent className="p-5 text-center">
            <div className={`text-3xl font-bold ${npsScore >= 50 ? "text-emerald-600" : npsScore >= 0 ? "text-amber-600" : "text-red-600"}`}>
              {npsScore}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Pontuação NPS</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats?.promoters ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> Promotores
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats?.passives ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Users className="w-3 h-3" /> Neutros
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 text-center">
            <div className="text-2xl font-bold text-red-600">{stats?.detractors ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <TrendingDown className="w-3 h-3" /> Detratores
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v === "todos" ? "" : v as any); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="NPS">NPS</SelectItem>
            <SelectItem value="CSAT">CSAT</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={v => { setClassFilter(v === "todos" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Todos os resultados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os resultados</SelectItem>
            <SelectItem value="Promoter">Promotor</SelectItem>
            <SelectItem value="Passive">Neutro</SelectItem>
            <SelectItem value="Detractor">Detrator</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de Pesquisas */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !surveys.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma pesquisa ainda</p>
              <p className="text-sm mt-1">Envie uma pesquisa para começar a coletar feedback.</p>
            </div>
          ) : (
            <div className="divide-y">
              {surveys.map(survey => (
                <div key={survey.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{survey.type}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Cliente #{survey.customerId}</span>
                      {survey.classification && (
                        <Badge className={`text-xs px-2 py-0 ${classColors[survey.classification] ?? ""}`}>
                          {classLabels[survey.classification] ?? survey.classification}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs px-2 py-0">{statusLabels[survey.status] ?? survey.status}</Badge>
                    </div>
                    {survey.feedback && <p className="text-xs text-muted-foreground truncate mt-0.5">{survey.feedback}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {survey.score != null && (
                      <div className="text-center">
                        <div className={`text-lg font-bold ${survey.score >= 9 ? "text-emerald-600" : survey.score >= 7 ? "text-amber-600" : "text-red-600"}`}>
                          {survey.score}
                        </div>
                        <div className="text-xs text-muted-foreground">Nota</div>
                      </div>
                    )}
                    {survey.status === "Sent" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowRespond(survey.id)}>
                        <CheckCircle className="w-3 h-3 mr-1" />Registrar
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">{new Date(survey.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Resposta */}
      <Dialog open={showRespond !== null} onOpenChange={v => !v && setShowRespond(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar Resposta da Pesquisa</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nota (0–10)</Label>
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setResponse(p => ({ ...p, score: i }))}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      response.score === i
                        ? i >= 9 ? "bg-emerald-500 text-white" : i >= 7 ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {response.score >= 9 ? "🟢 Promotor" : response.score >= 7 ? "🟡 Neutro" : "🔴 Detrator"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Feedback (opcional)</Label>
              <Textarea value={response.feedback} onChange={e => setResponse(p => ({ ...p, feedback: e.target.value }))} placeholder="Feedback do cliente..." rows={3} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRespond(null)}>Cancelar</Button>
              <Button className="flex-1" disabled={respondMutation.isPending} onClick={() => showRespond && respondMutation.mutate({ id: showRespond, score: response.score, feedback: response.feedback || undefined })}>
                {respondMutation.isPending ? "Salvando..." : "Salvar Resposta"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
