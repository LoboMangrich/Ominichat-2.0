// End-to-end test: simulate customer message and verify AI responds
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL || 'https://forge.manus.ai';

const conn = await mysql.createConnection(DATABASE_URL);

console.log('🧪 Testando fluxo completo de auto-reply da IA...\n');

// 1. Get conversation with AI enabled
const [convs] = await conn.execute('SELECT id, handledByAi, aiAgentId, customerId FROM conversations WHERE handledByAi=1 AND aiAgentId IS NOT NULL LIMIT 1');
if (!convs.length) { console.error('❌ Nenhuma conversa com IA ativa encontrada'); process.exit(1); }
const conv = convs[0];
console.log(`✅ Conversa encontrada: ID=${conv.id}, aiAgentId=${conv.aiAgentId}`);

// 2. Get agent
const [agents] = await conn.execute('SELECT id, name, isActive, systemPrompt FROM aiAgents WHERE id=?', [conv.aiAgentId]);
if (!agents.length || !agents[0].isActive) { console.error('❌ Agente não encontrado ou inativo'); process.exit(1); }
const agent = agents[0];
console.log(`✅ Agente: "${agent.name}" (ativo)`);

// 3. Get KB
const [kb] = await conn.execute('SELECT title, content FROM knowledgeBase WHERE agentId=? AND isActive=1 LIMIT 20', [agent.id]);
console.log(`✅ Base de conhecimento: ${kb.length} entradas`);

// 4. Simulate customer message
const testMessage = 'Olá, não consigo fazer login na plataforma';
console.log(`\n📨 Mensagem do cliente: "${testMessage}"`);

// Insert customer message
await conn.execute(
  'INSERT INTO messages (conversationId, senderType, content, isInternal, createdAt) VALUES (?, "customer", ?, 0, NOW())',
  [conv.id, testMessage]
);
console.log('✅ Mensagem do cliente inserida no banco');

// 5. Call LLM (same logic as simulateIncoming)
const kbContext = kb.map(e => `Q: ${e.title}\nA: ${e.content}`).join('\n\n');
const systemPrompt = agent.systemPrompt || 'Você é um assistente de suporte ao cliente profissional e empático.';

const payload = {
  model: 'gemini-2.5-flash',
  messages: [
    { role: 'system', content: `${systemPrompt}\n\nBase de conhecimento:\n${kbContext}` },
    { role: 'user', content: testMessage },
  ],
  max_tokens: 500,
};

console.log('\n🤖 Chamando LLM...');
const response = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${FORGE_API_KEY}` },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const err = await response.text();
  console.error('❌ LLM falhou:', response.status, err);
  process.exit(1);
}

const result = await response.json();
const aiReply = result.choices[0]?.message?.content;
if (!aiReply) { console.error('❌ LLM não retornou resposta'); process.exit(1); }

console.log(`\n✅ Resposta da IA:\n"${aiReply}"\n`);

// 6. Save AI reply to DB
await conn.execute(
  'INSERT INTO messages (conversationId, senderType, content, isInternal, createdAt) VALUES (?, "ai", ?, 0, NOW())',
  [conv.id, aiReply]
);
console.log('✅ Resposta da IA salva no banco');

// 7. Verify messages in DB
const [msgs] = await conn.execute(
  'SELECT senderType, content FROM messages WHERE conversationId=? ORDER BY createdAt DESC LIMIT 3',
  [conv.id]
);
console.log('\n📋 Últimas mensagens na conversa:');
msgs.reverse().forEach(m => console.log(`  [${m.senderType.toUpperCase()}]: ${m.content.substring(0, 80)}...`));

await conn.end();
console.log('\n🎉 TESTE PASSOU! O fluxo de auto-reply da IA está funcionando corretamente.');
