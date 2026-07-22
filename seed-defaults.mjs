/**
 * Seed de configurações padrão da plataforma CS
 * - Respostas rápidas padrão
 * - Satisfação pós-atendimento ativada com delay de 5 minutos
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

async function seed() {
  const conn = await createConnection(process.env.DATABASE_URL);
  console.log("🌱 Configurando dados padrão...\n");

  // ── 1. Respostas Rápidas Padrão ──────────────────────────────────────────
  const quickReplies = [
    { shortcut: "/oi", title: "Boas-vindas", content: "Olá! 👋 Seja bem-vindo(a)! Como posso te ajudar hoje?" },
    { shortcut: "/aguarda", title: "Aguarde um momento", content: "Olá! Só um momento, vou verificar isso para você. 😊" },
    { shortcut: "/acesso", title: "Acesso à plataforma", content: "Para acessar a plataforma, entre em: https://app.seusite.com.br\nUse o e-mail cadastrado no momento da compra. Se tiver dificuldades, me avise!" },
    { shortcut: "/cert", title: "Certificado", content: "Seu certificado fica disponível ao concluir 100% do programa. Você pode baixá-lo diretamente na plataforma, na seção 'Meus Certificados'. 🎓" },
    { shortcut: "/reembolso", title: "Política de reembolso", content: "Nossa política de reembolso segue os termos da compra. Para solicitar, entre em contato com nosso suporte em até 7 dias após a compra pelo e-mail suporte@seusite.com.br" },
    { shortcut: "/suporte", title: "Contato suporte", content: "Para suporte técnico, acesse: https://suporte.seusite.com.br\nOu envie um e-mail para suporte@seusite.com.br\nHorário: Seg-Sex, 9h às 18h 🕘" },
    { shortcut: "/encerra", title: "Encerrar atendimento", content: "Fico feliz em ter ajudado! 😊 Se precisar de mais alguma coisa, é só me chamar. Tenha um ótimo dia! 🌟" },
    { shortcut: "/nao_entendi", title: "Não entendi", content: "Desculpe, não entendi muito bem sua dúvida. Poderia explicar com mais detalhes? Assim posso te ajudar melhor! 😊" },
    { shortcut: "/modulo", title: "Acesso ao módulo", content: "Para acessar o módulo, entre na plataforma e vá em 'Meus Cursos'. O conteúdo fica disponível conforme o cronograma do programa. Alguma dúvida específica?" },
    { shortcut: "/comunidade", title: "Comunidade", content: "Nossa comunidade exclusiva está disponível no grupo do WhatsApp/Telegram para alunos. Você recebeu o link de acesso por e-mail no momento da compra. Se não encontrar, me avise! 💬" },
  ];

  // Buscar ID do admin
  const [adminRows] = await conn.execute("SELECT id FROM users WHERE role='Admin' LIMIT 1");
  const adminId = adminRows[0]?.id || 1;

  // Verificar se já existem respostas rápidas
  const [existing] = await conn.execute("SELECT COUNT(*) as total FROM quickReplies");
  if (existing[0].total > 0) {
    console.log(`⚠️  Já existem ${existing[0].total} respostas rápidas — pulando seed de respostas rápidas`);
  } else {
    for (const qr of quickReplies) {
      await conn.execute(
        "INSERT INTO quickReplies (shortcut, title, content, isGlobal, createdBy) VALUES (?, ?, ?, 1, ?)",
        [qr.shortcut, qr.title, qr.content, adminId]
      );
    }
    console.log(`✅ ${quickReplies.length} respostas rápidas criadas`);
  }

  // ── 2. Ativar Satisfação Pós-Atendimento ─────────────────────────────────
  const [satExisting] = await conn.execute("SELECT id, isActive, delayMinutes FROM satisfactionSettings LIMIT 1");
  if (satExisting.length > 0) {
    await conn.execute(
      "UPDATE satisfactionSettings SET isActive = 1, delayMinutes = 5 WHERE id = ?",
      [satExisting[0].id]
    );
    console.log(`✅ Satisfação pós-atendimento ATIVADA com delay de 5 minutos`);
  } else {
    await conn.execute(
      `INSERT INTO satisfactionSettings (id, isActive, message, channels, delayMinutes, createdAt)
       VALUES (UUID(), 1, 'Como você avalia nosso atendimento? Sua opinião é muito importante para nós! 😊\n👍 Ótimo | 😐 Regular | 👎 Ruim', '["whatsapp","instagram","telegram"]', 5, NOW())`
    );
    console.log(`✅ Satisfação pós-atendimento criada e ATIVADA`);
  }

  // ── 3. Verificar agente de IA ─────────────────────────────────────────────
  const [agents] = await conn.execute("SELECT id, name, isActive FROM aiAgents");
  if (agents.length === 0) {
    console.log("⚠️  Nenhum agente de IA — execute seed-ai-agent.mjs primeiro");
  } else {
    const active = agents.filter(a => a.isActive);
    console.log(`✅ Agente(s) de IA: ${agents.length} total, ${active.length} ativo(s)`);
  }

  // ── 4. Resumo ─────────────────────────────────────────────────────────────
  console.log("\n✨ Configuração padrão concluída! A plataforma está pronta para uso.");
  console.log("\n📋 PRÓXIMOS PASSOS PARA ENTRAR EM PRODUÇÃO:");
  console.log("  1. Configure o WhatsApp em Integrações → WhatsApp (Phone Number ID + Access Token da Meta)");
  console.log("  2. Configure a integração Guru em Integrações → Digital Manager Guru");
  console.log("  3. Personalize o agente 'Sofia' em Agentes de IA (prompt, mensagem de boas-vindas, KB)");
  console.log("  4. Convide sua equipe em Gerenciar Usuários");
  console.log("  5. Publique a plataforma e configure o webhook na Meta");

  await conn.end();
}

seed().catch(console.error);
