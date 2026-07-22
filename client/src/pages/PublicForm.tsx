/**
 * PublicForm.tsx — Página pública de preenchimento de formulário
 * Acessível via /forms/:slug sem autenticação
 */
import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type FieldDef = {
  id: string;
  label: string;
  type: "text" | "textarea" | "date" | "select" | "number" | "phone" | "email";
  required: boolean;
  options?: string[];
  placeholder?: string;
};

export default function PublicForm() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: form, isLoading, error } = trpc.forms.getBySlug.useQuery({ slug });
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitterName, setSubmitterName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const submitMutation = trpc.forms.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setSubmitting(false);
    },
    onError: (e) => {
      setSubmitError(e.message || "Erro ao enviar formulário. Tente novamente.");
      setSubmitting(false);
    },
  });

  function handleSubmit() {
    if (!form) return;
    const fields = form.fields as FieldDef[];

    // Validate required fields
    for (const field of fields) {
      if (field.required && !values[field.id]?.trim()) {
        setSubmitError(`O campo "${field.label}" é obrigatório.`);
        return;
      }
    }

    setSubmitError("");
    setSubmitting(true);
    submitMutation.mutate({
      formId: form.id,
      submitterName: submitterName || undefined,
      data: values,
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Formulário não encontrado</h2>
            <p className="text-gray-500 text-sm">
              Este formulário não existe ou foi desativado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!form.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Formulário inativo</h2>
            <p className="text-gray-500 text-sm">
              Este formulário está temporariamente desativado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Enviado com sucesso!</h2>
            <p className="text-gray-500 text-sm">
              Sua solicitação foi recebida. Nossa equipe entrará em contato em breve.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fields = form.fields as FieldDef[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">CS</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
          {form.description && (
            <p className="text-gray-500 mt-2 text-sm">{form.description}</p>
          )}
        </div>

        <Card className="shadow-lg">
          <CardContent className="p-6 space-y-4">
            {/* Submitter name */}
            <div>
              <Label className="text-sm font-medium text-gray-700">
                Seu nome <span className="text-gray-400">(opcional)</span>
              </Label>
              <Input
                placeholder="Como podemos te chamar?"
                value={submitterName}
                onChange={e => setSubmitterName(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Dynamic fields */}
            {fields.map(field => (
              <div key={field.id}>
                <Label className="text-sm font-medium text-gray-700">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className="mt-1">
                  {field.type === "textarea" ? (
                    <Textarea
                      placeholder={field.placeholder}
                      value={values[field.id] ?? ""}
                      onChange={e => setValues(p => ({ ...p, [field.id]: e.target.value }))}
                      rows={3}
                    />
                  ) : field.type === "select" ? (
                    <Select
                      value={values[field.id] ?? ""}
                      onValueChange={v => setValues(p => ({ ...p, [field.id]: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={field.placeholder || "Selecione..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.type === "phone" ? "tel" : field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      placeholder={field.placeholder}
                      value={values[field.id] ?? ""}
                      onChange={e => setValues(p => ({ ...p, [field.id]: e.target.value }))}
                    />
                  )}
                </div>
              </div>
            ))}

            {submitError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {submitError}
              </div>
            )}

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by Sistema CS
        </p>
      </div>
    </div>
  );
}
