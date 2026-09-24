import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { statusConfig } from "@/pages/Customers";

type CustomerStatus = keyof typeof statusConfig;
const STATUS_OPTIONS = Object.keys(statusConfig) as CustomerStatus[];

/**
 * "Cadastrar cliente" a partir de uma conversa da Sara. O telefone aparece só para
 * conferência (somente leitura) e NÃO é enviado: o servidor o pega da conversa na
 * Sara (sara.registerCustomer).
 */
export default function SaraRegisterCustomer({
  conversationId,
  phone,
  suggestedName,
}: {
  conversationId: string;
  phone: string | null;
  suggestedName: string | null;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggestedName ?? "");
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState("");
  const [status, setStatus] = useState<CustomerStatus>("New");

  const register = trpc.sara.registerCustomer.useMutation({
    onSuccess: () => {
      toast.success("Cliente cadastrado.");
      setOpen(false);
      utils.sara.customerByPhone.invalidate();
    },
    onError: e => {
      toast.error(e.message);
      // Duplicado: o painel passa a mostrar o cliente que já existe.
      if (e.data?.code === "CONFLICT") {
        setOpen(false);
        utils.sara.customerByPhone.invalidate();
      }
    },
  });

  function submit() {
    if (!name.trim()) return;
    register.mutate({ conversationId, name: name.trim(), email, program, status });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-xs h-8"
        disabled={!phone}
        onClick={() => {
          setName(suggestedName ?? "");
          setOpen(true);
        }}
      >
        <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Cadastrar cliente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cadastrar cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sara-reg-name">Nome</Label>
              <Input id="sara-reg-name" value={name} onChange={e => setName(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sara-reg-phone">Telefone</Label>
              <Input id="sara-reg-phone" value={phone ?? ""} readOnly disabled />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sara-reg-email">E-mail</Label>
              <Input
                id="sara-reg-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                maxLength={320}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sara-reg-program">Programa</Label>
              <Input
                id="sara-reg-program"
                value={program}
                onChange={e => setProgram(e.target.value)}
                maxLength={128}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as CustomerStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>
                      {statusConfig[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={!name.trim() || register.isPending}>
              {register.isPending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
