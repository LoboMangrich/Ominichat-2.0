import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Globe,
  LayoutTemplate,
  Mail,
  MessageSquare,
  Send,
  Settings,
  ShoppingCart,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";

const DOMAIN = "https://reino-cs.manus.space";

const steps = [
  {
    id: 1,
    title: "Conectar o WhatsApp (Meta Cloud API)",
    icon: MessageSquare,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
    badge: "Essencial",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    description: "Conecte o número de WhatsApp da empresa via API oficial da Meta para receber e enviar mensagens dos clientes.",
    instructions: [
      {
        step: "Acesse o",
        link: { label: "Meta for Developers", url: "https://developers.facebook.com" },
        detail: "e crie um App do tipo Business.",
      },
      {
        step: "Adicione o produto WhatsApp Business ao seu App. Você receberá um número de teste gratuito para começar.",
      },
      {
        step: "Em WhatsApp → Configuração, copie o Phone Number ID e o Access Token temporário (ou gere um token permanente em System Users).",
      },
      {
        step: "Configure o Webhook da Meta com a URL:",
        code: `${DOMAIN}/api/webhooks/whatsapp`,
        detail: "e o Verify Token: cs_platform_verify_token. Assine o campo messages.",
      },
      {
        step: "Vá em",
        link: { label: "Integrações → WhatsApp", url: "/integrations" },
        detail: "nesta plataforma, cole Phone Number ID, Access Token, Business Account ID e Verify Token. Clique em Salvar e depois em Testar Conexão.",
      },
      {
        step: "Para enviar mensagens a números fora da lista de teste, solicite acesso em produção (Meta Business Verification) em",
        link: { label: "Meta Business Manager", url: "https://business.facebook.com" },
        detail: ".",
      },
    ],
    tip: "O token temporário expira em 24h. Para produção, crie um System User no Meta Business Manager e gere um token permanente com permissão whatsapp_business_messaging.",
  },
  {
    id: 2,
    title: "Configurar a Guru (Digital Manager)",
    icon: ShoppingCart,
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-900/20",
    border: "border-violet-200 dark:border-violet-800",
    badge: "Recomendado",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    description: "Integre com a Guru para que novos clientes sejam criados automaticamente quando uma venda é aprovada.",
    instructions: [
      {
        step: "Copie a URL do Webhook:",
        code: `${DOMAIN}/api/webhooks/guru`,
        detail: "",
      },
      {
        step: "Acesse Guru → Configurações → Webhooks → Vendas.",
      },
      {
        step: "Cole a URL, selecione todos os eventos (aprovação, cancelamento, reembolso) e ative.",
      },
      {
        step: "Volte aqui em",
        link: { label: "Integrações → Guru", url: "/integrations" },
        detail: "para confirmar que a integração está ativa.",
      },
    ],
    tip: "Quando uma venda é aprovada na Guru, o cliente é criado automaticamente e a IA já envia a mensagem de boas-vindas.",
  },
  {
    id: 3,
    title: "Criar e Configurar o Agente de IA",
    icon: Bot,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    badge: "Essencial",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    description: "Configure a IA que vai responder automaticamente os clientes com base no seu produto.",
    instructions: [
      {
        step: "Vá em",
        link: { label: "Agentes de IA", url: "/ai-agents" },
        detail: "e clique em Novo Agente.",
      },
      {
        step: "Defina o nome (ex: Sofia), o canal (WhatsApp) e o programa/produto (ex: Premium).",
      },
      {
        step: "Escreva o Prompt do Sistema descrevendo quem é a IA, o produto e como ela deve se comportar. Exemplo:",
        code: `Você é Sofia, assistente de Customer Success da [SUA EMPRESA]. Você ajuda clientes do programa [PRODUTO] com dúvidas sobre acesso, conteúdo, certificados e suporte. Seja sempre cordial, objetiva e empática.`,
        detail: "",
      },
      {
        step: "Configure a Mensagem de Boas-vindas com variáveis:",
        code: `Olá, {{nome}}! 👋 Bem-vindo(a) ao {{produto}}! Sou a Sofia, sua assistente de CS. Como posso te ajudar hoje?`,
        detail: "",
      },
      {
        step: "Ative o agente e adicione entradas na Base de Conhecimento com as perguntas e respostas mais comuns do seu produto.",
      },
    ],
    tip: "Quanto mais detalhado o Prompt do Sistema e mais entradas na Base de Conhecimento, melhor a IA vai responder.",
  },
  {
    id: 4,
    title: "Popular a Base de Conhecimento",
    icon: BookOpen,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    badge: "Importante",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    description: "Adicione as perguntas e respostas mais frequentes para que a IA responda com precisão.",
    instructions: [
      {
        step: "Abra o agente em",
        link: { label: "Agentes de IA", url: "/ai-agents" },
        detail: "e clique em Adicionar Conhecimento.",
      },
      {
        step: "Adicione entradas para as dúvidas mais comuns: acesso à plataforma, link do grupo, certificado, reembolso, suporte técnico, horários de atendimento.",
      },
      {
        step: "Cada entrada tem um Título (ex: \"Como acessar a plataforma\") e o Conteúdo com a resposta completa.",
      },
      {
        step: "Adicione pelo menos 10-15 entradas para cobrir os casos mais frequentes antes de ativar em produção.",
      },
    ],
    tip: "Copie as perguntas que você já recebe no WhatsApp hoje — elas são a base perfeita para a KB.",
  },
  {
    id: 5,
    title: "Templates HSM para Iniciar Conversas",
    icon: LayoutTemplate,
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-900/20",
    border: "border-teal-200 dark:border-teal-800",
    badge: "WhatsApp Oficial",
    badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    description: "Templates aprovados pela Meta são obrigatórios para enviar a primeira mensagem a um cliente após 24h de inatividade.",
    instructions: [
      {
        step: "Acesse",
        link: { label: "Meta Business Manager → Templates", url: "https://business.facebook.com/wa/manage/message-templates/" },
        detail: "e clique em Criar Template.",
      },
      {
        step: "Escolha a categoria (ex: UTILITY para boas-vindas, MARKETING para promoções), defina o nome e o idioma (pt_BR).",
      },
      {
        step: "Escreva o corpo da mensagem. Use {{1}}, {{2}} para variáveis. Exemplo:",
        code: `Olá, {{1}}! 👋 Bem-vindo(a) ao {{2}}. Sou a Sofia, sua assistente de CS. Como posso te ajudar?`,
        detail: "",
      },
      {
        step: "Submeta para aprovação. O processo leva de alguns minutos a 24h. Templates aprovados aparecem com status APPROVED.",
      },
      {
        step: "Na plataforma, abra qualquer atendimento WhatsApp e clique no ícone de template (⊞) na barra de mensagens para enviar um template aprovado.",
      },
    ],
    tip: "Crie pelo menos um template de boas-vindas e um de reengajamento. Templates com variáveis precisam ter os valores preenchidos antes do envio.",
  },
  {
    id: 6,
    title: "Convidar a Equipe",
    icon: Users,
    color: "text-pink-600",
    bg: "bg-pink-50 dark:bg-pink-900/20",
    border: "border-pink-200 dark:border-pink-800",
    badge: "Opcional",
    badgeColor: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
    description: "Adicione os membros da equipe de CS para que possam assumir atendimentos quando necessário.",
    instructions: [
      {
        step: "Vá em",
        link: { label: "Gerenciar Usuários", url: "/manage-users" },
        detail: "e clique em Convidar Usuário.",
      },
      {
        step: "Informe o e-mail do membro da equipe. Ele receberá um convite para criar a conta.",
      },
      {
        step: "Defina o papel: Agent (atendente) ou Manager (pode ver relatórios e configurações).",
      },
      {
        step: "Quando um atendimento precisar de intervenção humana, o agente clica em Assumir Controle na conversa.",
      },
    ],
    tip: "Comece com apenas 1-2 agentes humanos para monitorar a IA nas primeiras semanas.",
  },
  {
    id: 7,
    title: "Testar o Fluxo Completo",
    icon: Zap,
    color: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-200 dark:border-orange-800",
    badge: "Validação",
    badgeColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    description: "Antes de ir ao ar, teste o fluxo completo para garantir que tudo funciona.",
    instructions: [
      {
        step: "Abra um atendimento existente em",
        link: { label: "Atendimentos", url: "/conversations" },
        detail: "ou crie um cliente de teste.",
      },
      {
        step: "Clique em Devolver para IA — a Sofia deve enviar a mensagem de boas-vindas automaticamente.",
      },
      {
        step: "Use Simular Msg do Cliente (no painel lateral) para enviar uma pergunta e verificar se a IA responde corretamente do lado direito.",
      },
      {
        step: "Se a resposta não for satisfatória, edite o Prompt do Sistema ou adicione mais entradas na Base de Conhecimento.",
      },
      {
        step: "Quando estiver satisfeito, envie uma mensagem real pelo WhatsApp conectado para confirmar o fluxo end-to-end.",
      },
    ],
    tip: "Faça pelo menos 10 perguntas diferentes no simulador antes de ativar para clientes reais.",
  },
];

const faq = [
  {
    q: "A IA responde fora do horário comercial?",
    a: "Sim! A IA responde 24/7 automaticamente. Você pode configurar no Prompt do Sistema que ela informe o horário de atendimento humano quando necessário.",
  },
  {
    q: "O que acontece quando a IA não sabe responder?",
    a: "A IA tentará responder com base no Prompt e na Base de Conhecimento. Se a resposta não for encontrada, ela pode ser configurada para escalar para um agente humano (configure o campo Mensagem de Escalada no agente).",
  },
  {
    q: "Posso ter múltiplos agentes de IA para produtos diferentes?",
    a: "Sim! Crie um agente para cada produto/canal. Use o campo Programa/Produto para associar cada agente ao produto correto. Quando um cliente do produto X chega, o sistema busca automaticamente o agente configurado para aquele produto.",
  },
  {
    q: "Precisa de API oficial da Meta para usar WhatsApp?",
    a: "Sim! Esta plataforma usa exclusivamente a Meta Cloud API oficial. Isso garante estabilidade, conformidade com os termos de uso do WhatsApp e acesso a recursos como templates HSM, grupos e métricas. O processo de configuração leva cerca de 30 minutos.",
  },
  {
    q: "Como o agente humano assume o controle?",
    a: "Na tela do atendimento, clique em Assumir Controle. A IA para de responder e o agente humano assume. Para devolver para a IA, clique em Devolver para IA.",
  },
  {
    q: "O que são templates HSM e quando são obrigatórios?",
    a: "Templates HSM (Highly Structured Messages) são mensagens pré-aprovadas pela Meta. São obrigatórios para iniciar uma conversa com um cliente que não enviou mensagem nas últimas 24 horas. Para responder dentro da janela de 24h, você pode enviar mensagens livres normalmente.",
  },
  {
    q: "Como monitorar grupos de WhatsApp?",
    a: "Vá em Grupos WhatsApp no menu lateral. Grupos são detectados automaticamente quando mensagens chegam via webhook. Você também pode adicionar grupos manualmente pelo ID. A IA analisa os grupos periodicamente para alertas de silêncio, pedidos não respondidos e sentimento negativo.",
  },
];

export default function Tutorial() {
  const { user } = useAuth();
  const [expandedStep, setExpandedStep] = useState<number | null>(1);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-500" />
          Tutorial de Configuração
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Siga os passos abaixo para configurar a plataforma e começar a usar a IA em minutos.
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="w-3.5 h-3.5" />
          <span>Domínio da plataforma:</span>
          <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{DOMAIN}</code>
        </div>
      </div>

      {/* Progress overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {steps.map(s => (
          <button
            key={s.id}
            onClick={() => setExpandedStep(expandedStep === s.id ? null : s.id)}
            className={`text-left p-3 rounded-xl border transition-all ${expandedStep === s.id ? s.bg + " " + s.border : "bg-muted/30 border-border hover:bg-muted/50"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${expandedStep === s.id ? s.color : "text-muted-foreground"}`} />
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${s.badgeColor}`}>{s.badge}</span>
            </div>
            <p className={`text-xs font-medium leading-tight ${expandedStep === s.id ? "text-foreground" : "text-muted-foreground"}`}>
              {s.id}. {s.title}
            </p>
          </button>
        ))}
      </div>

      {/* Step details */}
      <div className="space-y-3">
        {steps.map(s => (
          <Card
            key={s.id}
            className={`border-0 shadow-sm cursor-pointer transition-all ${expandedStep === s.id ? "ring-1 ring-border" : ""}`}
            onClick={() => setExpandedStep(expandedStep === s.id ? null : s.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${s.bg}`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      Passo {s.id}: {s.title}
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${s.badgeColor}`}>{s.badge}</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expandedStep === s.id ? "rotate-90" : ""}`} />
              </div>
            </CardHeader>

            {expandedStep === s.id && (
              <CardContent className="pt-0 space-y-4" onClick={e => e.stopPropagation()}>
                <ol className="space-y-3">
                  {s.instructions.map((inst, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">{i + 1}</span>
                      <div className="flex-1 space-y-1.5">
                        <p className="text-sm text-muted-foreground">
                          {inst.step}{" "}
                          {inst.link && (
                            <a
                              href={inst.link.url}
                              target={inst.link.url.startsWith("http") ? "_blank" : "_self"}
                              rel="noopener noreferrer"
                              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              {inst.link.label}
                              {inst.link.url.startsWith("http") && <ExternalLink className="w-3 h-3" />}
                            </a>
                          )}{" "}
                          {inst.detail}
                        </p>
                        {inst.code && (
                          <div className="bg-muted rounded-lg px-3 py-2 font-mono text-xs text-foreground break-all">
                            {inst.code}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                {s.tip && (
                  <div className={`p-3 rounded-lg ${s.bg} ${s.border} border`}>
                    <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                      <Zap className={`w-3.5 h-3.5 ${s.color}`} /> Dica
                    </p>
                    <p className="text-xs text-muted-foreground">{s.tip}</p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* FAQ */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          Perguntas Frequentes
        </h2>
        {faq.map((item, i) => (
          <Card
            key={i}
            className="border-0 shadow-sm cursor-pointer"
            onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{item.q}</p>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 mt-0.5 ${expandedFaq === i ? "rotate-90" : ""}`} />
              </div>
              {expandedFaq === i && (
                <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">{item.a}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick links */}
      <Card className="border-0 shadow-sm bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Links Rápidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { label: "Agentes de IA", url: "/ai-agents", icon: Bot },
              { label: "Integrações", url: "/integrations", icon: Zap },
              { label: "Atendimentos", url: "/conversations", icon: MessageSquare },
              { label: "Gerenciar Usuários", url: "/manage-users", icon: Users },
              { label: "Configurações", url: "/settings", icon: Settings },
              { label: "Meta for Developers", url: "https://developers.facebook.com", icon: ExternalLink },
              { label: "Meta Business Manager", url: "https://business.facebook.com", icon: ExternalLink },
              { label: "Templates WhatsApp", url: "https://business.facebook.com/wa/manage/message-templates/", icon: LayoutTemplate },
            ].map(link => (
              <a
                key={link.url}
                href={link.url}
                target={link.url.startsWith("http") ? "_blank" : "_self"}
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2.5 rounded-lg bg-background hover:bg-muted transition-colors text-sm font-medium"
              >
                <link.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                {link.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
