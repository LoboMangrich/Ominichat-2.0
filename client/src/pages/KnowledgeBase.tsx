import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen, CheckCircle2, XCircle, Clock, TrendingUp,
  MessageSquarePlus, Pencil, Trash2, Plus, RefreshCw, Bot
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORY_LABELS: Record<string, string> = {
  acesso_plataforma: "Acesso à Plataforma",
  conteudo_modulo: "Conteúdo / Módulo",
  financeiro_reembolso: "Financeiro / Reembolso",
  certificado: "Certificado",
  comunidade: "Comunidade",
  suporte_tecnico: "Suporte Técnico",
  resultado_produto: "Resultado do Produto",
  outros: "Outros",
};

const CATEGORY_COLORS: Record<string, string> = {
  acesso_plataforma: "bg-blue-100 text-blue-800",
  conteudo_modulo: "bg-purple-100 text-purple-800",
  financeiro_reembolso: "bg-red-100 text-red-800",
  certificado: "bg-yellow-100 text-yellow-800",
  comunidade: "bg-green-100 text-green-800",
  suporte_tecnico: "bg-orange-100 text-orange-800",
  resultado_produto: "bg-teal-100 text-teal-800",
  outros: "bg-gray-100 text-gray-700",
};

function StatsBar() {
  const { data: stats } = trpc.knowledgeLive.getStats.useQuery();
  if (!stats) return null;
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {[
        { label: "Pendentes", value: stats.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Aprovadas", value: stats.approved, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Dispensadas", value: stats.dismissed, icon: XCircle, color: "text-gray-500", bg: "bg-gray-50" },
        { label: "FAQ Ativo", value: stats.totalFAQ, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
      ].map(({ label, value, icon: Icon, color, bg }) => (
        <Card key={label} className={`${bg} border-0 shadow-sm`}>
          <CardContent className="p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Approve Modal ─────────────────────────────────────────────────────────────
function ApproveModal({
  capture,
  onClose,
}: {
  capture: { id: number; question: string; category: string } | null;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const utils = trpc.useUtils();
  const approve = trpc.knowledgeLive.approveCapture.useMutation({
    onSuccess: () => {
      toast.success("Pergunta aprovada e adicionada ao FAQ!");
      utils.knowledgeLive.listCaptures.invalidate();
      utils.knowledgeLive.listFAQ.invalidate();
      utils.knowledgeLive.getStats.invalidate();
      onClose();
      setAnswer("");
    },
    onError: () => toast.error("Erro ao aprovar pergunta"),
  });

  if (!capture) return null;
  return (
    <Dialog open={!!capture} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Aprovar e Adicionar ao FAQ
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">PERGUNTA CAPTURADA</p>
            <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg p-3">{capture.question}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">RESPOSTA OFICIAL</p>
            <Textarea
              placeholder="Escreva a resposta que a IA vai usar para responder automaticamente..."
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Bot className="w-3 h-3" />
            Esta resposta será adicionada ao FAQ e poderá ser usada pelos Agentes IA.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!answer.trim() || approve.isPending}
            onClick={() => approve.mutate({ captureId: capture.id, answer: answer.trim() })}
          >
            {approve.isPending ? "Salvando..." : "Aprovar e Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create FAQ Modal ──────────────────────────────────────────────────────────
function CreateFAQModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ question: "", answer: "", category: "outros" as const });
  const utils = trpc.useUtils();
  const create = trpc.knowledgeLive.createFAQ.useMutation({
    onSuccess: () => {
      toast.success("Item de FAQ criado com sucesso!");
      utils.knowledgeLive.listFAQ.invalidate();
      utils.knowledgeLive.getStats.invalidate();
      onClose();
      setForm({ question: "", answer: "", category: "outros" });
    },
    onError: () => toast.error("Erro ao criar FAQ"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            Novo Item de FAQ
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">PERGUNTA</p>
            <Input
              placeholder="Ex: Como acesso minha área de membros?"
              value={form.question}
              onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">RESPOSTA</p>
            <Textarea
              placeholder="Escreva a resposta completa..."
              value={form.answer}
              onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
              rows={4}
              className="resize-none"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">CATEGORIA</p>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={!form.question.trim() || !form.answer.trim() || create.isPending}
            onClick={() => create.mutate(form)}
          >
            {create.isPending ? "Criando..." : "Criar FAQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Captures Panel ────────────────────────────────────────────────────────────
function CapturesPanel() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "dismissed" | undefined>("pending");
  const [approving, setApproving] = useState<{ id: number; question: string; category: string } | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.knowledgeLive.listCaptures.useQuery({
    status: statusFilter,
    limit: 50,
    offset: 0,
  });

  const dismiss = trpc.knowledgeLive.dismissCapture.useMutation({
    onSuccess: () => {
      toast.success("Pergunta dispensada");
      utils.knowledgeLive.listCaptures.invalidate();
      utils.knowledgeLive.getStats.invalidate();
    },
  });

  const rows = data?.rows ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(["pending", "approved", "dismissed"] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className={statusFilter === s ? "bg-emerald-700 text-white" : ""}
            >
              {s === "pending" ? "Pendentes" : s === "approved" ? "Aprovadas" : "Dispensadas"}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <MessageSquarePlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma pergunta capturada ainda</p>
          <p className="text-sm mt-1">As perguntas dos clientes aparecerão aqui automaticamente conforme chegarem.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map(capture => (
          <Card key={capture.id} className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[capture.category] ?? CATEGORY_COLORS.outros}`}>
                      {CATEGORY_LABELS[capture.category] ?? capture.category}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-amber-600 font-semibold">
                      <TrendingUp className="w-3 h-3" />
                      {capture.frequency}x
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 leading-snug">{capture.question}</p>
                  {capture.resolution && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      <span className="font-medium">Resposta:</span> {capture.resolution}
                    </p>
                  )}
                </div>
                {capture.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      onClick={() => setApproving({ id: capture.id, question: capture.question, category: capture.category })}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-gray-500 text-xs"
                      onClick={() => dismiss.mutate({ captureId: capture.id })}
                    >
                      <XCircle className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                {capture.status === "approved" && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs shrink-0">Aprovada</Badge>
                )}
                {capture.status === "dismissed" && (
                  <Badge className="bg-gray-100 text-gray-500 text-xs shrink-0">Dispensada</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ApproveModal capture={approving} onClose={() => setApproving(null)} />
    </div>
  );
}

// ─── FAQ Panel ─────────────────────────────────────────────────────────────────
function FAQPanel() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number; question: string; answer: string } | null>(null);
  const [editAnswer, setEditAnswer] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.knowledgeLive.listFAQ.useQuery({ isActive: true, limit: 100 });

  const update = trpc.knowledgeLive.updateFAQ.useMutation({
    onSuccess: () => {
      toast.success("FAQ atualizado!");
      utils.knowledgeLive.listFAQ.invalidate();
      setEditing(null);
    },
  });

  const remove = trpc.knowledgeLive.deleteFAQ.useMutation({
    onSuccess: () => {
      toast.success("Item removido do FAQ");
      utils.knowledgeLive.listFAQ.invalidate();
      utils.knowledgeLive.getStats.invalidate();
    },
  });

  const rows = data?.rows ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{rows.length} itens no FAQ ativo</p>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> Novo Item
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">FAQ vazio</p>
          <p className="text-sm mt-1">Aprove perguntas capturadas ou crie itens manualmente.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map(faq => (
          <Card key={faq.id} className="border border-gray-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[faq.category] ?? CATEGORY_COLORS.outros}`}>
                      {CATEGORY_LABELS[faq.category] ?? faq.category}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{faq.question}</p>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{faq.answer}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-8 h-8 text-gray-400 hover:text-blue-600"
                    onClick={() => { setEditing(faq); setEditAnswer(faq.answer); }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-8 h-8 text-gray-400 hover:text-red-500"
                    onClick={() => remove.mutate({ id: faq.id })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateFAQModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Resposta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-gray-700 bg-gray-50 rounded-lg p-3">{editing?.question}</p>
            <Textarea
              value={editAnswer}
              onChange={e => setEditAnswer(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!editAnswer.trim() || update.isPending}
              onClick={() => editing && update.mutate({ id: editing.id, answer: editAnswer.trim() })}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function KnowledgeBase() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-emerald-600" />
          Base de Conhecimento Viva
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          A IA captura automaticamente as perguntas dos clientes. Aprove as mais frequentes para transformá-las em FAQ e alimentar os Agentes.
        </p>
      </div>

      <StatsBar />

      <Tabs defaultValue="captures" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="captures" className="flex items-center gap-1.5">
            <MessageSquarePlus className="w-4 h-4" />
            Perguntas Capturadas
          </TabsTrigger>
          <TabsTrigger value="faq" className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" />
            FAQ Oficial
          </TabsTrigger>
        </TabsList>
        <TabsContent value="captures">
          <CapturesPanel />
        </TabsContent>
        <TabsContent value="faq">
          <FAQPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
