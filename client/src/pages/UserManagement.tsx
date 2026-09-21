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
import { MIN_PASSWORD_LENGTH } from "@shared/const";
import { Shield, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  Manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Agent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const DISABLED_BADGE_COLOR = "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400";

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: "Admin" | "Manager" | "Agent";
  isActive: boolean;
  approvedAt: Date | string | null;
  approvedBy: number | null;
  createdAt: Date | string;
  lastSignedIn: Date | string;
};

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

function passwordFieldErrors(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (password !== confirm) {
    return "As senhas não coincidem";
  }
  return null;
}

export default function UserManagement() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"Admin" | "Manager" | "Agent">("Agent");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirmPassword, setCreateConfirmPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [roleDialogUserId, setRoleDialogUserId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>("Agent");

  const [resetDialogUserId, setResetDialogUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const { data: users, isLoading, refetch } = trpc.users.list.useQuery();

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado! Passe o e-mail e a senha inicial para a pessoa.");
      refetch();
      setCreateOpen(false);
      setCreateName(""); setCreateEmail(""); setCreateRole("Agent");
      setCreatePassword(""); setCreateConfirmPassword(""); setCreateError(null);
    },
    onError: (e) => setCreateError(e.message),
  });

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => { toast.success("Função atualizada!"); refetch(); setRoleDialogUserId(null); },
    onError: (e) => toast.error(e.message),
  });

  const resetPasswordMutation = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida! Passe a nova senha para a pessoa — ela vai precisar trocá-la no próximo login.");
      setResetDialogUserId(null);
      setResetPassword(""); setResetConfirmPassword(""); setResetError(null);
    },
    onError: (e) => setResetError(e.message),
  });

  const toggleActiveMutation = trpc.users.toggleActive.useMutation({
    onSuccess: (_data, variables) => {
      refetch();
      if (!variables.isActive) {
        toast.info("Conta desativada. Avise a pessoa diretamente — o login dela agora só mostra \"e-mail ou senha inválidos\", sem indicar o motivo.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const usersById = new Map((users ?? []).map(u => [u.id, u]));

  if (user?.role === "Agent") {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Acesso Restrito</p>
        <p className="text-sm mt-1">Gerenciamento de usuários disponível apenas para Admins.</p>
      </div>
    );
  }

  const handleCreateSubmit = () => {
    setCreateError(null);
    const passwordError = passwordFieldErrors(createPassword, createConfirmPassword);
    if (passwordError) { setCreateError(passwordError); return; }
    if (!createName.trim() || !createEmail.trim()) { setCreateError("Nome e e-mail são obrigatórios"); return; }
    createMutation.mutate({ name: createName, email: createEmail, role: createRole, initialPassword: createPassword });
  };

  const handleResetSubmit = () => {
    setResetError(null);
    const passwordError = passwordFieldErrors(resetPassword, resetConfirmPassword);
    if (passwordError) { setResetError(passwordError); return; }
    if (resetDialogUserId) resetPasswordMutation.mutate({ userId: resetDialogUserId, newPassword: resetPassword });
  };

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
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateError(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Criar Usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Não existe cadastro público — defina uma senha inicial e passe nome, e-mail e senha para a pessoa
                fora daqui. Ela vai precisar trocar a senha no primeiro login.
              </p>
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={createName} onChange={e => setCreateName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Função</Label>
                <Select value={createRole} onValueChange={v => setCreateRole(v as typeof createRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Administrador</SelectItem>
                    <SelectItem value="Manager">Gerente</SelectItem>
                    <SelectItem value="Agent">Atendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Senha inicial</Label>
                <Input type="password" minLength={MIN_PASSWORD_LENGTH} value={createPassword} onChange={e => setCreatePassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar senha inicial</Label>
                <Input type="password" value={createConfirmPassword} onChange={e => setCreateConfirmPassword(e.target.value)} />
              </div>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
              <Button className="w-full" disabled={createMutation.isPending} onClick={handleCreateSubmit}>
                {createMutation.isPending ? "Criando..." : "Criar Usuário"}
              </Button>
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
              <p className="text-sm mt-1">Crie o primeiro membro da equipe.</p>
            </div>
          ) : (
            <div className="divide-y">
              {users.map((u: UserRow) => {
                const isDisabled = !u.isActive;
                const creator = u.approvedBy ? usersById.get(u.approvedBy) : undefined;
                const canManage = user?.role === "Admin" && u.id !== user.id;

                return (
                  <div key={u.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">{u.name?.charAt(0) ?? "?"}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{u.name ?? "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground">{u.email ?? "Sem e-mail"}</p>
                        {u.approvedAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Criado {creator ? `por ${creator.name ?? creator.email ?? "—"} ` : ""}
                            em {formatDate(u.approvedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isDisabled && <Badge className={DISABLED_BADGE_COLOR}>Desativado</Badge>}
                      {!isDisabled && <Badge className={ROLE_COLORS[u.role] ?? ""}>{u.role}</Badge>}

                      {canManage && (
                        <Dialog open={roleDialogUserId === u.id} onOpenChange={(open) => setRoleDialogUserId(open ? u.id : null)}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => setEditRole(u.role)}
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
                                onClick={() => updateRoleMutation.mutate({ userId: u.id, role: editRole as any })}
                              >
                                {updateRoleMutation.isPending ? "Salvando..." : "Salvar Função"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {canManage && (
                        <Dialog
                          open={resetDialogUserId === u.id}
                          onOpenChange={(open) => {
                            setResetDialogUserId(open ? u.id : null);
                            if (!open) { setResetPassword(""); setResetConfirmPassword(""); setResetError(null); }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-xs">
                              Redefinir Senha
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Redefinir Senha de {u.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-2">
                              <p className="text-sm text-muted-foreground">
                                Não existe "esqueci minha senha" — defina uma nova senha e passe para a pessoa fora
                                daqui. Ela vai precisar trocá-la no próximo login.
                              </p>
                              <div className="space-y-1.5">
                                <Label>Nova senha</Label>
                                <Input type="password" minLength={MIN_PASSWORD_LENGTH} value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Confirmar nova senha</Label>
                                <Input type="password" value={resetConfirmPassword} onChange={e => setResetConfirmPassword(e.target.value)} />
                              </div>
                              {resetError && <p className="text-xs text-destructive">{resetError}</p>}
                              <Button className="w-full" disabled={resetPasswordMutation.isPending} onClick={handleResetSubmit}>
                                {resetPasswordMutation.isPending ? "Salvando..." : "Redefinir Senha"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {canManage && !isDisabled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          disabled={toggleActiveMutation.isPending}
                          onClick={() => toggleActiveMutation.mutate({ userId: u.id, isActive: false })}
                        >
                          Desativar
                        </Button>
                      )}

                      {canManage && isDisabled && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={toggleActiveMutation.isPending}
                          onClick={() => toggleActiveMutation.mutate({ userId: u.id, isActive: true })}
                        >
                          Reativar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
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
