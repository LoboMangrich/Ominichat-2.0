import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload, FileText, Trash2, ChevronDown, ChevronUp,
  Brain, CheckCircle, AlertCircle, Clock, TrendingUp, TrendingDown
} from "lucide-react";

interface TranscriptsTabProps {
  customerId: number;
}

export function TranscriptsTab({ customerId }: TranscriptsTabProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: transcripts = [], refetch } = trpc.transcripts.list.useQuery({ customerId });
  const uploadMutation = trpc.transcripts.upload.useMutation({
    onSuccess: () => {
      toast.success("Transcrição enviada", { description: "A IA está analisando o conteúdo em segundo plano." });
      setShowUpload(false);
      setTitle("");
      setContent("");
      setTimeout(() => refetch(), 3000); // refetch after LLM analysis
    },
    onError: (err) => {
      toast.error("Erro ao enviar", { description: err.message });
    },
  });
  const deleteMutation = trpc.transcripts.delete.useMutation({
    onSuccess: () => {
      toast.success("Transcrição removida");
      refetch();
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTitle(file.name.replace(/\.[^/.]+$/, ""));
    // Read as text (works for .txt files; for PDF the user pastes text)
    const text = await file.text();
    setContent(text);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Preencha o título e o conteúdo");
      return;
    }
    setIsUploading(true);
    try {
      await uploadMutation.mutateAsync({ customerId, title: title.trim(), content: content.trim() });
    } finally {
      setIsUploading(false);
    }
  };

  const sentimentColor = (delta: number | null) => {
    if (!delta) return "text-gray-400";
    if (delta > 0) return "text-emerald-400";
    if (delta < 0) return "text-red-400";
    return "text-gray-400";
  };

  const sentimentIcon = (delta: number | null) => {
    if (!delta || delta === 0) return <Clock className="w-3 h-3" />;
    if (delta > 0) return <TrendingUp className="w-3 h-3" />;
    return <TrendingDown className="w-3 h-3" />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Transcrições de Reuniões</h3>
          <p className="text-xs text-gray-400 mt-0.5">A IA analisa cada transcrição e atualiza o health score automaticamente</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowUpload(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          Enviar Transcrição
        </Button>
      </div>

      {/* Empty state */}
      {transcripts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <FileText className="w-10 h-10 text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">Nenhuma transcrição ainda</p>
          <p className="text-xs text-gray-500 mt-1">
            Grave suas reuniões, exporte a transcrição em PDF ou TXT e envie aqui.
            A IA vai resumir, identificar dúvidas e atualizar o health score do cliente.
          </p>
        </div>
      )}

      {/* Transcripts list */}
      <div className="space-y-2">
        {transcripts.map((t) => (
          <Card key={t.id} className="bg-[#1a2332] border-[#2a3a4a]">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <FileText className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">
                        {new Date(t.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      {t.analyzedAt ? (
                        <Badge className="bg-emerald-900/50 text-emerald-400 border-emerald-700/50 text-xs px-1.5 py-0 gap-1">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Analisado
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-900/50 text-yellow-400 border-yellow-700/50 text-xs px-1.5 py-0 gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          Analisando...
                        </Badge>
                      )}
                      {t.healthScoreDelta !== null && t.healthScoreDelta !== 0 && (
                        <span className={`flex items-center gap-0.5 text-xs font-medium ${sentimentColor(t.healthScoreDelta)}`}>
                          {sentimentIcon(t.healthScoreDelta)}
                          {t.healthScoreDelta > 0 ? "+" : ""}{t.healthScoreDelta} pts
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  >
                    {expandedId === t.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-400"
                    onClick={() => deleteMutation.mutate({ id: t.id })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expanded analysis */}
              {expandedId === t.id && (
                <div className="mt-3 pt-3 border-t border-[#2a3a4a] space-y-3">
                  {t.summary ? (
                    <>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Brain className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-xs font-semibold text-purple-400">Resumo da IA</span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">{t.summary}</p>
                      </div>

                      {t.keyPoints && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 mb-1">Pontos principais</p>
                          <ul className="space-y-1">
                            {t.keyPoints.split("\n").filter(Boolean).map((pt, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                                <span className="text-emerald-400 mt-0.5">•</span>
                                {pt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {t.actionItems && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 mb-1">Itens de ação</p>
                          <ul className="space-y-1">
                            {t.actionItems.split("\n").filter(Boolean).map((item, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                                <CheckCircle className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />
                      Análise da IA ainda não disponível. Aguarde alguns instantes e recarregue.
                    </div>
                  )}

                  {/* Raw content preview */}
                  <details className="group">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 list-none flex items-center gap-1">
                      <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                      Ver transcrição completa
                    </summary>
                    <pre className="mt-2 text-xs text-gray-400 bg-[#0f1923] rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                      {t.content}
                    </pre>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="bg-[#1a2332] border-[#2a3a4a] text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Enviar Transcrição de Reunião</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Título da reunião</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Check-in Mensal — Abril 2025"
                className="bg-[#0f1923] border-[#2a3a4a] text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Transcrição (texto)</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Cole aqui o texto da transcrição da reunião..."
                className="bg-[#0f1923] border-[#2a3a4a] text-white placeholder:text-gray-500 min-h-[160px] font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-[#2a3a4a]" />
              <span className="text-xs text-gray-500">ou</span>
              <div className="flex-1 h-px bg-[#2a3a4a]" />
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                className="w-full border-dashed border-[#2a3a4a] text-gray-400 hover:text-white hover:border-emerald-600 bg-transparent gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                Importar arquivo .txt
              </Button>
              <p className="text-xs text-gray-500 mt-1 text-center">
                Para PDF: exporte como texto no seu app de reunião (Zoom, Meet, Teams) e cole acima
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUpload(false)} className="text-gray-400">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isUploading || !title.trim() || !content.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Enviar e Analisar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
