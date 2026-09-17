/**
 * AccessPending.tsx — Página pública exibida após o login com Google quando o
 * usuário não recebe sessão: cadastro pendente de aprovação de um Admin, ou
 * conta desativada. Acessível via /acesso-pendente sem autenticação (não há
 * cookie de sessão nesse momento).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, ShieldOff } from "lucide-react";
import { useSearch } from "wouter";

export default function AccessPending() {
  const searchStr = useSearch();
  const status = new URLSearchParams(searchStr).get("status");
  const isDisabled = status === "desativado";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="max-w-md w-full border-0 shadow-sm">
        <CardHeader className="text-center">
          {isDisabled ? (
            <ShieldOff className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
          ) : (
            <Clock className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
          )}
          <CardTitle className="text-lg">
            {isDisabled ? "Acesso desativado" : "Cadastro pendente de aprovação"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground space-y-1">
          {isDisabled ? (
            <p>Sua conta foi desativada por um administrador. Fale com um Admin do time se isso for um engano.</p>
          ) : (
            <p>Seu login com o Google foi identificado, mas seu acesso ainda precisa ser aprovado por um Admin do time.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
