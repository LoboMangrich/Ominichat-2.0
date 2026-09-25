import { SaraPromptTab } from "@/components/saraPrompt/SaraPromptTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { SARA_ADMIN_ONLY_MESSAGE } from "@shared/sara";
import { Bot, Lock } from "lucide-react";

/**
 * Configurações → Sara (IA). SÓ Admin — checado também no servidor (adminProcedure):
 * aqui só evita montar as queries para quem não pode. Templates e Números bloqueados
 * entram como abas quando existirem (sem aba vazia antes disso).
 */
export default function SaraAdmin() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user?.role !== "Admin") {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3 rounded-md border bg-card px-4 py-6">
          <Lock className="w-5 h-5 text-muted-foreground" />
          <p className="font-medium">{SARA_ADMIN_ONLY_MESSAGE}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Bot className="w-5 h-5 text-primary" />
        Sara (IA)
      </h1>
      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt" className="mt-4">
          <SaraPromptTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
