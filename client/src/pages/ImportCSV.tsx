/**
 * ImportCSV — Bulk customer data import via CSV file
 * Supports: upload, preview, column mapping, import results
 */
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload, FileText, Download, CheckCircle2, XCircle,
  AlertTriangle, ArrowRight, RefreshCw, Table2, Info
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImportResult {
  ok: boolean;
  message: string;
  results: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; email: string; reason: string }[];
  };
}

// ─── Field info ───────────────────────────────────────────────────────────────
const FIELD_INFO = [
  { field: "email", label: "Email", required: true, description: "Chave de correspondência — obrigatório" },
  { field: "nome", label: "Nome", required: false, description: "Nome completo do cliente" },
  { field: "telefone", label: "Telefone", required: false, description: "Número com DDD (ex: 11999990000)" },
  { field: "programa", label: "Programa", required: false, description: "Nome do produto/programa" },
  { field: "status", label: "Status", required: false, description: "Active, Em Risco, Churned ou New" },
  { field: "renovacao", label: "Data de Renovação", required: false, description: "Formato: YYYY-MM-DD ou DD/MM/YYYY" },
  { field: "nps", label: "NPS", required: false, description: "Nota de 0 a 10" },
  { field: "ultima_interacao", label: "Última Interação", required: false, description: "Data da última interação" },
  { field: "progresso", label: "Progresso (%)", required: false, description: "Porcentagem de conclusão do programa (0-100)" },
  { field: "mrr", label: "MRR (R$)", required: false, description: "Receita mensal recorrente" },
  { field: "empresa", label: "Empresa", required: false, description: "Nome da empresa do cliente" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImportCSV() {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) {
      toast.error("Apenas arquivos .csv são aceitos");
      return;
    }
    setFile(f);
    // Parse preview
    Papa.parse<Record<string, string>>(f, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      complete: (res) => {
        setPreviewHeaders(res.meta.fields ?? []);
        setPreviewRows(res.data);
        setStep("preview");
      },
      error: () => toast.error("Erro ao ler o arquivo CSV"),
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setProgress(10);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setProgress(40);
      const res = await fetch("/api/import/customers-csv", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      setProgress(80);
      const data: ImportResult = await res.json();
      setProgress(100);
      setResult(data);
      setStep("result");
      if (data.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.message || "Erro na importação");
      }
    } catch (err: any) {
      toast.error("Erro ao enviar arquivo: " + (err?.message ?? ""));
    } finally {
      setImporting(false);
    }
  };

  // ── Download template ───────────────────────────────────────────────────────
  const downloadTemplate = () => {
    window.open("/api/import/template", "_blank");
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreviewRows([]);
    setPreviewHeaders([]);
    setResult(null);
    setProgress(0);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Importar Clientes via CSV</h1>
          <p className="text-muted-foreground mt-1">
            Atualize dados em massa — renewalDate, NPS, última interação e mais.
            O Índice de Saúde é recalculado automaticamente após a importação.
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate} className="gap-2">
          <Download className="w-4 h-4" />
          Baixar Template
        </Button>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "result"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${step === s ? "bg-primary text-primary-foreground" :
                (["upload", "preview", "result"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-muted text-muted-foreground")}`}>
              {["upload", "preview", "result"].indexOf(step) > i ? "✓" : i + 1}
            </div>
            <span className={step === s ? "font-medium text-foreground" : "text-muted-foreground"}>
              {s === "upload" ? "Selecionar arquivo" : s === "preview" ? "Pré-visualizar" : "Resultado"}
            </span>
            {i < 2 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Drop zone */}
          <div className="lg:col-span-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
                ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">Arraste seu CSV aqui</p>
              <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-3">Tamanho máximo: 10 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          </div>

          {/* Field guide */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4" />
                Campos suportados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {FIELD_INFO.map((f) => (
                <div key={f.field} className="flex items-start gap-2">
                  <code className="text-xs bg-muted px-1 py-0.5 rounded shrink-0">{f.field}</code>
                  {f.required && <Badge variant="destructive" className="text-[10px] px-1 py-0 shrink-0">obrigatório</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === "preview" && file && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {file.name}
                  </CardTitle>
                  <CardDescription>
                    Pré-visualização das primeiras 5 linhas · {previewHeaders.length} colunas detectadas
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={reset}>Trocar arquivo</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      {previewHeaders.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t hover:bg-muted/20">
                        {previewHeaders.map((h) => (
                          <td key={h} className="px-3 py-2 text-foreground max-w-[200px] truncate">
                            {row[h] || <span className="text-muted-foreground italic">vazio</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Column mapping info */}
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="pt-4">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium">Mapeamento automático de colunas</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    O sistema reconhece automaticamente variações como "e-mail", "nome", "telefone", "renovacao", "nps", etc.
                    Colunas não reconhecidas são ignoradas. O campo <strong>email</strong> é obrigatório.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Importando...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleImport} disabled={importing} className="gap-2">
              {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? "Importando..." : "Importar agora"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={importing}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === "result" && result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.results.total}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Total processado</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{result.results.updated}</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Atualizados</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{result.results.created}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Criados</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{result.results.skipped}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Ignorados</p>
              </CardContent>
            </Card>
          </div>

          {/* Status banner */}
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${
            result.ok ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
          }`}>
            {result.ok
              ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              : <XCircle className="w-5 h-5 text-red-600 shrink-0" />
            }
            <div>
              <p className={`font-medium ${result.ok ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}`}>
                {result.message}
              </p>
              {result.ok && result.results.updated + result.results.created > 0 && (
                <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
                  Índice de Saúde recalculado automaticamente para todos os clientes importados.
                </p>
              )}
            </div>
          </div>

          {/* Error table */}
          {result.results.errors.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  {result.results.errors.length} linha(s) com erro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Linha</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">E-mail</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.errors.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground">{e.row}</td>
                          <td className="px-3 py-2 font-mono">{e.email || "—"}</td>
                          <td className="px-3 py-2 text-red-600 dark:text-red-400">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button onClick={reset} className="gap-2">
              <Upload className="w-4 h-4" />
              Nova importação
            </Button>
            <Button variant="outline" onClick={() => window.location.href = "/customers"} className="gap-2">
              <Table2 className="w-4 h-4" />
              Ver clientes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
