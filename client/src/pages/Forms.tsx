/**
 * Forms.tsx — Form Builder que cria tarefas automaticamente
 * Equivalente ao recurso de formulários do ClickUp
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { getPublicBaseUrl } from "@/lib/publicUrl";
import {
  FormInput, Plus, Trash2, Copy, ExternalLink, Eye, ClipboardList,
  CheckSquare, GripVertical, Settings, ChevronDown, ChevronUp, X
} from "lucide-react";
import { toast } from "sonner";

const FIELD_TYPES = [
  { value: "text", label: "📝 Texto curto" },
  { value: "textarea", label: "📄 Texto longo" },
  { value: "number", label: "🔢 Número" },
  { value: "date", label: "📅 Data" },
  { value: "select", label: "📋 Seleção" },
  { value: "phone", label: "📱 Telefone" },
  { value: "email", label: "✉️ E-mail" },
];

const CATEGORY_LABELS: Record<string, string> = {
  cliente: "👤 Cliente", contrato: "📄 Contrato", onboarding: "🚀 Onboarding",
  reuniao: "📅 Reunião", passagem: "✈️ Passagem", midia: "📢 Mídia",
  contratacao: "💼 Contratação", outro: "📌 Outro",
};

type FieldDef = {
  id: string;
  label: string;
  type: "text" | "textarea" | "date" | "select" | "number" | "phone" | "email";
  required: boolean;
  options?: string[];
  placeholder?: string;
};

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// ─── Field Editor ─────────────────────────────────────────────────────────────
function FieldEditor({
  field, index, total,
  onChange, onDelete, onMove,
}: {
  field: FieldDef;
  index: number;
  total: number;
  onChange: (f: FieldDef) => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const [optionInput, setOptionInput] = useState("");

  return (
    <Card className="border border-muted">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Input
              placeholder="Rótulo do campo"
              value={field.label}
              onChange={e => onChange({ ...field, label: e.target.value })}
              className="h-8 text-sm"
            />
            <Select value={field.type} onValueChange={v => onChange({ ...field, type: v as any })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onMove("up")} disabled={index === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMove("down")} disabled={index === total - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-muted">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 pl-6">
          <Input
            placeholder="Placeholder (opcional)"
            value={field.placeholder ?? ""}
            onChange={e => onChange({ ...field, placeholder: e.target.value })}
            className="h-7 text-xs flex-1"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <Switch
              checked={field.required}
              onCheckedChange={v => onChange({ ...field, required: v })}
              className="scale-75"
            />
            Obrigatório
          </label>
        </div>
        {field.type === "select" && (
          <div className="pl-6 space-y-1.5">
            <p className="text-xs text-muted-foreground">Opções:</p>
            <div className="flex flex-wrap gap-1">
              {(field.options ?? []).map((opt, i) => (
                <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                  {opt}
                  <button onClick={() => onChange({ ...field, options: field.options?.filter((_, j) => j !== i) })}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                placeholder="Nova opção..."
                value={optionInput}
                onChange={e => setOptionInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && optionInput.trim()) {
                    onChange({ ...field, options: [...(field.options ?? []), optionInput.trim()] });
                    setOptionInput("");
                  }
                }}
                className="h-7 text-xs"
              />
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => {
                  if (optionInput.trim()) {
                    onChange({ ...field, options: [...(field.options ?? []), optionInput.trim()] });
                    setOptionInput("");
                  }
                }}
              >
                Adicionar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Form Dialog ───────────────────────────────────────────────────────
function CreateFormDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"fields" | "task">("fields");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([
    { id: generateId(), label: "Nome completo", type: "text", required: true, placeholder: "Seu nome" },
    { id: generateId(), label: "Telefone", type: "phone", required: true, placeholder: "(11) 99999-9999" },
  ]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategory, setTaskCategory] = useState("outro");
  const [taskTeam, setTaskTeam] = useState("Geral");
  const [taskPriority, setTaskPriority] = useState("medium");

  const createMutation = trpc.forms.create.useMutation({
    onSuccess: () => {
      toast.success("Formulário criado!");
      setOpen(false);
      resetForm();
      onCreated();
    },
    onError: () => toast.error("Erro ao criar formulário"),
  });

  function resetForm() {
    setTitle(""); setDescription(""); setStep("fields");
    setFields([
      { id: generateId(), label: "Nome completo", type: "text", required: true, placeholder: "Seu nome" },
      { id: generateId(), label: "Telefone", type: "phone", required: true, placeholder: "(11) 99999-9999" },
    ]);
    setTaskTitle(""); setTaskCategory("outro"); setTaskTeam("Geral"); setTaskPriority("medium");
  }

  function addField() {
    setFields(prev => [...prev, { id: generateId(), label: "Novo campo", type: "text", required: false }]);
  }

  function updateField(index: number, f: FieldDef) {
    setFields(prev => prev.map((p, i) => i === index ? f : p));
  }

  function deleteField(index: number) {
    setFields(prev => prev.filter((_, i) => i !== index));
  }

  function moveField(index: number, dir: "up" | "down") {
    setFields(prev => {
      const arr = [...prev];
      const target = dir === "up" ? index - 1 : index + 1;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="w-4 h-4" /> Novo Formulário</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Formulário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome do Formulário *</Label>
              <Input
                placeholder="Ex: Solicitação de Passagem Aérea"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label>Descrição (aparece no topo do formulário)</Label>
              <Textarea
                placeholder="Instruções para quem vai preencher..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Step tabs */}
          <div className="flex gap-2 border-b pb-2">
            <button
              onClick={() => setStep("fields")}
              className={`text-sm px-3 py-1 rounded-md transition-colors ${step === "fields" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              1. Campos do Formulário
            </button>
            <button
              onClick={() => setStep("task")}
              className={`text-sm px-3 py-1 rounded-md transition-colors ${step === "task" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              2. Tarefa Gerada
            </button>
          </div>

          {step === "fields" && (
            <div className="space-y-2">
              {fields.map((field, i) => (
                <FieldEditor
                  key={field.id}
                  field={field}
                  index={i}
                  total={fields.length}
                  onChange={f => updateField(i, f)}
                  onDelete={() => deleteField(i)}
                  onMove={dir => moveField(i, dir)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={addField} className="w-full gap-2 border-dashed">
                <Plus className="w-3.5 h-3.5" /> Adicionar Campo
              </Button>
            </div>
          )}

          {step === "task" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Quando alguém preencher este formulário, uma tarefa será criada automaticamente com as configurações abaixo.
              </p>
              <div>
                <Label>Título da Tarefa (use {"{{field_id}}"} para inserir valores)</Label>
                <Input
                  placeholder="Ex: Solicitação de passagem - {{field_0}}"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  IDs dos campos: {fields.map(f => `{{${f.id}}}`).join(", ")}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Equipe</Label>
                  <Select value={taskTeam} onValueChange={setTaskTeam}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IPL">IPL</SelectItem>
                      <SelectItem value="MCM">MCM</SelectItem>
                      <SelectItem value="RCC">RCC</SelectItem>
                      <SelectItem value="Geral">Geral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={taskCategory} onValueChange={setTaskCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <Select value={taskPriority} onValueChange={setTaskPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">⚪ Baixa</SelectItem>
                      <SelectItem value="medium">🔵 Média</SelectItem>
                      <SelectItem value="high">🟠 Alta</SelectItem>
                      <SelectItem value="urgent">🔴 Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <div className="flex gap-2">
              {step === "fields" && (
                <Button onClick={() => setStep("task")} disabled={!title.trim() || fields.length === 0}>
                  Próximo: Configurar Tarefa →
                </Button>
              )}
              {step === "task" && (
                <>
                  <Button variant="outline" onClick={() => setStep("fields")}>← Voltar</Button>
                  <Button
                    onClick={() => createMutation.mutate({
                      title,
                      description: description || undefined,
                      fields,
                      taskTitle: taskTitle || undefined,
                      taskCategory: taskCategory as any,
                      taskTeam: taskTeam as any,
                      taskPriority: taskPriority as any,
                    })}
                    disabled={!title.trim() || createMutation.isPending}
                  >
                    Criar Formulário
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Submissions Dialog ───────────────────────────────────────────────────────
function SubmissionsDialog({ form }: { form: any }) {
  const [open, setOpen] = useState(false);
  const { data: submissions = [] } = trpc.forms.listSubmissions.useQuery(
    { formId: form.id },
    { enabled: open }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Eye className="w-3.5 h-3.5" /> Respostas ({form._submissionCount ?? 0})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Respostas — {form.title}</DialogTitle>
        </DialogHeader>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma resposta ainda.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map(sub => (
              <Card key={sub.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{sub.submitterName ?? "Anônimo"}</span>
                    <div className="flex items-center gap-2">
                      {sub.createdTaskId && (
                        <Badge variant="outline" className="text-xs text-green-600">
                          <CheckSquare className="w-3 h-3 mr-1" /> Tarefa #{sub.createdTaskId}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(sub.submittedAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(sub.data as Record<string, string>).map(([k, v]) => {
                      const field = form.fields?.find((f: any) => f.id === k);
                      return (
                        <div key={k} className="text-xs">
                          <span className="text-muted-foreground">{field?.label ?? k}: </span>
                          <span className="font-medium">{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Forms() {
  const utils = trpc.useUtils();
  const { data: forms = [], isLoading } = trpc.forms.list.useQuery();

  const deleteMutation = trpc.forms.delete.useMutation({
    onSuccess: () => { toast.success("Formulário removido"); utils.forms.list.invalidate(); },
    onError: () => toast.error("Erro ao remover formulário"),
  });

  const toggleActive = trpc.forms.update.useMutation({
    onSuccess: () => utils.forms.list.invalidate(),
    onError: () => toast.error("Erro ao atualizar"),
  });

  function copyFormLink(slug: string) {
    const url = `${getPublicBaseUrl()}/forms/${slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado!"));
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FormInput className="w-6 h-6 text-primary" />
            Formulários
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie formulários que geram tarefas automaticamente ao serem preenchidos
          </p>
        </div>
        <CreateFormDialog onCreated={() => utils.forms.list.invalidate()} />
      </div>

      {/* Info Banner */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ClipboardList className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Como funciona</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crie um formulário, configure quais campos ele terá e qual tarefa deve ser gerada ao ser preenchido.
                Compartilhe o link público com clientes ou equipe — cada resposta cria uma tarefa automaticamente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Forms Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FormInput className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum formulário criado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crie seu primeiro formulário para começar a receber solicitações
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map(form => (
            <Card key={form.id} className={`transition-all ${!form.isActive ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{form.title}</CardTitle>
                    {form.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{form.description}</p>
                    )}
                  </div>
                  <Badge variant={form.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                    {form.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">
                    {(form.fields as any[])?.length ?? 0} campos
                  </Badge>
                  {form.taskTeam && form.taskTeam !== "Geral" && (
                    <Badge variant="outline" className="text-xs">{form.taskTeam}</Badge>
                  )}
                  {form.taskCategory && form.taskCategory !== "outro" && (
                    <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[form.taskCategory]}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <SubmissionsDialog form={form} />
                  {form.publicSlug && (
                    <>
                      <Button
                        variant="ghost" size="sm" className="gap-1.5 text-xs"
                        onClick={() => copyFormLink(form.publicSlug!)}
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar link
                      </Button>
                      <a href={`/forms/${form.publicSlug}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                          <ExternalLink className="w-3.5 h-3.5" /> Abrir
                        </Button>
                      </a>
                    </>
                  )}
                  <Button
                    variant="ghost" size="sm" className="gap-1.5 text-xs ml-auto"
                    onClick={() => toggleActive.mutate({ id: form.id, isActive: !form.isActive })}
                  >
                    {form.isActive ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => deleteMutation.mutate({ id: form.id })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
