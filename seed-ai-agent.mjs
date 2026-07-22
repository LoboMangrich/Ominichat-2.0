import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);

console.log('🤖 Configurando agente de IA padrão...');

// 1. Create default AI agent
const systemPrompt = `Você é a assistente virtual de Customer Success da empresa. Seu nome é Sofia.

Seu objetivo é ajudar os clientes com dúvidas sobre o programa, acesso à plataforma, suporte técnico básico e orientações gerais.

Diretrizes:
- Seja sempre cordial, empática e profissional
- Responda de forma clara e objetiva
- Use a base de conhecimento para responder perguntas específicas
- Se não souber a resposta, diga que vai verificar com a equipe e que alguém entrará em contato em breve
- Não invente informações que não estão na base de conhecimento
- Mantenha as respostas concisas (máximo 3 parágrafos)
- Use emojis com moderação para deixar a conversa mais amigável

Quando o cliente estiver frustrado: reconheça o sentimento antes de resolver o problema.
Quando o cliente quiser cancelar: ouça o motivo, ofereça ajuda e informe que vai acionar a equipe.`;

const greetingMessage = `Olá, {{nome}}! 👋 Sou a Sofia, assistente virtual do programa {{produto}}.

Estou aqui para te ajudar com qualquer dúvida sobre o programa, acesso à plataforma ou suporte. Como posso te ajudar hoje?`;

const escalationMessage = `Entendo sua situação e quero garantir que você receba o melhor atendimento. Vou transferir você para um especialista da nossa equipe que poderá te ajudar com mais detalhes. Por favor, aguarde um momento. 🙏`;

// Check if agent already exists
const [existing] = await conn.execute('SELECT id FROM aiAgents WHERE name = "Sofia - Assistente CS" LIMIT 1');

let agentId;
if (existing.length > 0) {
  agentId = existing[0].id;
  await conn.execute(
    `UPDATE aiAgents SET isActive=1, systemPrompt=?, greetingMessage=?, escalationMessage=?, channel='all', escalationThreshold=65, maxAutoReplies=10 WHERE id=?`,
    [systemPrompt, greetingMessage, escalationMessage, agentId]
  );
  console.log(`✅ Agente existente atualizado (ID: ${agentId})`);
} else {
  const [result] = await conn.execute(
    `INSERT INTO aiAgents (name, description, channel, isActive, systemPrompt, greetingMessage, escalationMessage, escalationThreshold, maxAutoReplies, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      'Sofia - Assistente CS',
      'Assistente virtual padrão para atendimento de Customer Success. Responde dúvidas sobre o programa, acesso e suporte.',
      'all',
      1,
      systemPrompt,
      greetingMessage,
      escalationMessage,
      65,
      10
    ]
  );
  agentId = result.insertId;
  console.log(`✅ Agente criado (ID: ${agentId})`);
}

// 2. Add knowledge base entries
const kbEntries = [
  {
    title: 'Como acessar a plataforma',
    content: 'Para acessar a plataforma, entre em app.seusite.com.br e faça login com o e-mail cadastrado no momento da compra. Caso não lembre a senha, clique em "Esqueci minha senha" e você receberá um e-mail de recuperação. Se não receber o e-mail em 5 minutos, verifique a pasta de spam.',
    category: 'Acesso'
  },
  {
    title: 'Não consigo fazer login / senha incorreta',
    content: 'Se estiver com problema de login: 1) Verifique se está usando o e-mail correto (o mesmo da compra). 2) Clique em "Esqueci minha senha" para redefinir. 3) Verifique a pasta de spam. 4) Limpe o cache do navegador. Se o problema persistir, entre em contato com nosso suporte técnico.',
    category: 'Acesso'
  },
  {
    title: 'Como funciona o programa',
    content: 'Nosso programa oferece acesso completo ao conteúdo, suporte da equipe e comunidade exclusiva. Após a compra, você recebe acesso imediato por e-mail. O programa inclui aulas gravadas, materiais complementares e sessões ao vivo (conforme o plano contratado).',
    category: 'Programa'
  },
  {
    title: 'Quando as aulas ficam disponíveis',
    content: 'As aulas são liberadas conforme o cronograma do programa. Você receberá notificações por e-mail quando novos conteúdos forem disponibilizados. O acesso é imediato após a liberação e você pode assistir no seu próprio ritmo.',
    category: 'Conteúdo'
  },
  {
    title: 'Certificado de conclusão',
    content: 'O certificado é emitido automaticamente após a conclusão de todas as aulas e atividades do programa. Você receberá um e-mail com o link para download. O certificado é válido e pode ser compartilhado no LinkedIn.',
    category: 'Certificado'
  },
  {
    title: 'Como cancelar ou solicitar reembolso',
    content: 'Temos garantia de satisfação. Para solicitar cancelamento ou reembolso, entre em contato com nossa equipe de suporte pelo e-mail suporte@empresa.com.br ou pelo WhatsApp. O prazo de reembolso é de até 7 dias úteis após aprovação, conforme política de garantia.',
    category: 'Financeiro'
  },
  {
    title: 'Problemas técnicos com vídeos / conteúdo não carrega',
    content: 'Se os vídeos não estiverem carregando: 1) Verifique sua conexão com a internet. 2) Tente um navegador diferente (Chrome ou Firefox recomendados). 3) Desative extensões do navegador. 4) Limpe o cache. 5) Tente em modo anônimo. Se o problema persistir, nos informe o nome da aula e o erro que aparece.',
    category: 'Suporte Técnico'
  },
  {
    title: 'Como participar da comunidade / grupo',
    content: 'A comunidade exclusiva está disponível na plataforma, na aba "Comunidade". Você também pode ser adicionado ao grupo do WhatsApp ou Telegram — solicite o link de acesso à nossa equipe. A comunidade é um espaço para troca de experiências, dúvidas e networking.',
    category: 'Comunidade'
  },
  {
    title: 'Posso compartilhar meu acesso',
    content: 'O acesso é individual e intransferível, conforme os termos de uso. Compartilhar login pode resultar no bloqueio da conta. Se precisar de acesso para mais pessoas, consulte nossos planos corporativos ou multi-usuário.',
    category: 'Acesso'
  },
  {
    title: 'Quanto tempo tenho acesso ao programa',
    content: 'O tempo de acesso varia conforme o plano contratado. A maioria dos programas oferece acesso vitalício ou por 12 meses. Verifique os detalhes do seu plano na página de confirmação de compra ou entre em contato com nossa equipe.',
    category: 'Programa'
  },
  {
    title: 'Como entrar em contato com a equipe de suporte',
    content: 'Você pode entrar em contato com nossa equipe pelos seguintes canais: WhatsApp (este chat), E-mail: suporte@empresa.com.br, ou abrindo um ticket na plataforma. O horário de atendimento humano é de segunda a sexta, das 9h às 18h. Fora desse horário, nossa assistente virtual está disponível 24h.',
    category: 'Suporte'
  },
  {
    title: 'Não recebi o e-mail de acesso após a compra',
    content: 'Após a confirmação do pagamento, o e-mail de acesso é enviado em até 30 minutos. Verifique: 1) Pasta de spam/lixo eletrônico. 2) Se o e-mail cadastrado está correto. 3) Se o pagamento foi aprovado. Se já passou de 1 hora e não recebeu, entre em contato com nossa equipe informando o nome e e-mail da compra.',
    category: 'Acesso'
  },
];

// Clear existing KB for this agent and re-insert
await conn.execute('DELETE FROM knowledgeBase WHERE agentId = ?', [agentId]);
console.log('🗑️  Base de conhecimento anterior removida');

for (const entry of kbEntries) {
  await conn.execute(
    `INSERT INTO knowledgeBase (agentId, title, content, category, isActive, createdAt) VALUES (?, ?, ?, ?, 1, NOW())`,
    [agentId, entry.title, entry.content, entry.category]
  );
}
console.log(`✅ ${kbEntries.length} entradas adicionadas à base de conhecimento`);

// 3. Update existing conversations with handledByAi=true to use this agent
const [updated] = await conn.execute(
  'UPDATE conversations SET aiAgentId = ? WHERE handledByAi = 1 AND (aiAgentId IS NULL OR aiAgentId = 0)',
  [agentId]
);
console.log(`✅ ${updated.affectedRows} conversa(s) atualizada(s) para usar o agente`);

// 4. Show summary
const [agentCheck] = await conn.execute('SELECT id, name, isActive, channel FROM aiAgents WHERE id = ?', [agentId]);
const [kbCount] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledgeBase WHERE agentId = ?', [agentId]);
console.log('\n📊 Resumo da configuração:');
console.log('Agente:', JSON.stringify(agentCheck[0]));
console.log('Entradas na KB:', kbCount[0].cnt);

await conn.end();
console.log('\n🎉 Configuração concluída! A IA está pronta para responder.');
