import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Shield, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  Manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Agent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export default function UserManagement() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>("Agent");

  const { data: users, isLoading, refetch } = trpc.users.list.useQuery();
  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => { toast.success("Função atualizada!"); refetch(); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  if (user?.role === "Agent") {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Acesso Restrito</p>
        <p className="text-sm mt-1">Gerenciamento de usuários disponível apenas para Admins.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Gerenciamento de Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie membros da equipe e suas funções.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Convidar Usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar Membro da Equipe</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Compartilhe o link da plataforma com o membro da equipe. Ele pode entrar com sua conta e será atribuído como Agente por padrão. Você pode alterar a função após o acesso.
              </p>
              <div className="space-y-1.5">
                <Label>URL da Plataforma</Label>
                <div className="flex gap-2">
                  <Input readOnly value="https://reino-cs.manus.space" className="bg-muted font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText("https://reino-cs.manus.space"); toast.success("Copiado!"); }}>
                    Copiar
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Membros da Equipe ({users?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : !users?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum usuário ainda</p>
              <p className="text-sm mt-1">Compartilhe o link da plataforma para convidar membros.</p>
            </div>
          ) : (
            <div className="divide-y">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{u.name?.charAt(0) ?? "?"}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{u.name ?? "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{u.email ?? "Sem e-mail"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={ROLE_COLORS[u.role] ?? ""}>{u.role}</Badge>
                    {user?.role === "Admin" && u.id !== user.id && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => { setEditId(u.id); setEditRole(u.role); }}
                          >
                            Alterar Função
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Alterar Função de {u.name}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <div className="space-y-1.5">
                              <Label>Nova Função</Label>
                              <Select value={editRole} onValueChange={setEditRole}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Admin">Administrador</SelectItem>
                                  <SelectItem value="Manager">Gerente</SelectItem>
                                  <SelectItem value="Agent">Atendente</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              className="w-full"
                              disabled={updateRoleMutation.isPending}
                              onClick={() => editId && updateRoleMutation.mutate({ userId: editId, role: editRole as any })}
                            >
                              {updateRoleMutation.isPending ? "Salvando..." : "Salvar Função"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Descriptions */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            Permissões por Função
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { role: "Admin", color: ROLE_COLORS.Admin, perms: ["Acesso total à plataforma", "Gerenciamento de usuários", "Todas as integrações", "Todos os relatórios", "Configurações do sistema"] },
              { role: "Manager", color: ROLE_COLORS.Manager, perms: ["Visão de desempenho da equipe", "Recomendações de coaching", "Todos os dados de clientes", "Configurações de integração", "Gerenciamento de pesquisas"] },
              { role: "Agent", color: ROLE_COLORS.Agent, perms: ["Próprios atendimentos", "Lista de clientes", "Pesquisas NPS/CSAT", "Indicações & upsell", "Métricas de produtividade próprias"] },
            ].map(({ role, color, perms }) => (
              <div key={role} className="p-4 rounded-xl bg-muted/40 border border-border">
                <Badge className={`${color} mb-3`}>{role}</Badge>
                <ul className="space-y-1.5">
                  {perms.map(p => (
                    <li key={p} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/50 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
