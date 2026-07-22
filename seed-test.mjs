/**
 * seed-test.mjs — Seed completo para simulação 360°
 * Execute: node seed-test.mjs
 * Para limpar: node cleanup-test.mjs
 */
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

// 1. Owner
console.log("🔍 Buscando owner...");
const [ownerRows] = await connection.execute("SELECT id, name FROM users LIMIT 1");
if (!ownerRows.length) { console.error("Nenhum usuário. Faça login primeiro."); process.exit(1); }
const owner = ownerRows[0];
console.log(`   Owner: ${owner.name} (id=${owner.id})`);

// 2. Team members
console.log("\n👥 Inserindo membros da equipe...");
const TEAM_DATA = [
  ["Carla Guardião Silva","carla.guardiao@reinoeducacao.com","agent"],
  ["Marcos Guardião Pereira","marcos.guardiao@reinoeducacao.com","agent"],
  ["Beatriz Guardião Costa","beatriz.guardiao@reinoeducacao.com","agent"],
  ["Felipe Guardião Ramos","felipe.guardiao@reinoeducacao.com","agent"],
  ["Larissa Guardião Melo","larissa.guardiao@reinoeducacao.com","agent"],
  ["Diego Guardião Nunes","diego.guardiao@reinoeducacao.com","agent"],
  ["Patrícia Guardião Lima","patricia.guardiao@reinoeducacao.com","agent"],
  ["Rafael Guardião Souza","rafael.guardiao@reinoeducacao.com","agent"],
  ["Camila Manager Alves","camila.manager@reinoeducacao.com","manager"],
  ["Thiago Manager Borges","thiago.manager@reinoeducacao.com","manager"],
];
const teamIds = [owner.id];
for (const [name, email, role] of TEAM_DATA) {
  try {
    const [r] = await connection.execute(
      `INSERT INTO users (name, email, role, openId, createdAt, updatedAt) VALUES (?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [name, email, role, `TEST_${email}`]
    );
    teamIds.push(r.insertId || r[0]?.insertId);
  } catch(e) {
    const [rows] = await connection.execute("SELECT id FROM users WHERE email=?", [email]);
    if (rows.length) teamIds.push(rows[0].id);
  }
}
console.log(`   ✅ ${teamIds.length} membros (incluindo owner)`);

// 3. Customers — 60 clientes
console.log("\n🧑‍💼 Inserindo 60 clientes...");
const CUSTOMERS = [
  // Novos (0-7d)
  ["Ana Beatriz Ferreira","ana.beatriz@teste.com","11991001001","Assessoria Premium","New",45,2,365,997,null,997,["novo","assessoria"],"Comprou via indicação"],
  ["Carlos Eduardo Mendes","carlos.mendes@teste.com","11991001002","Commander IA","New",50,3,365,497,null,497,["novo"],"Primeiro contato feito"],
  ["Fernanda Lima Costa","fernanda.lima@teste.com","11991001003","Assessoria Premium","New",40,1,365,997,null,997,["novo","assessoria","high-ticket"],"Cliente high ticket"],
  ["Juliana Martins Pereira","juliana.martins@teste.com","11991001004","Milionário com Milhas","New",60,5,365,297,null,297,["novo"],"Muito animada"],
  ["Ricardo Alves Souza","ricardo.alves@teste.com","11991001005","RCC Premium","New",55,4,365,397,null,397,["novo"],null],
  ["Camila Rodrigues Dias","camila.rodrigues@teste.com","11991001006","Assessoria Premium","New",50,7,365,997,null,997,["novo","assessoria"],null],
  ["Bruno Henrique Neves","bruno.neves@teste.com","11991001007","Profissão Liberdade","New",45,6,365,197,null,197,["novo"],null],
  ["Diego Ferreira Santos","diego.ferreira@teste.com","11991001008","Commander IA","New",55,2,365,497,null,497,["novo"],null],
  // Ativos saudáveis
  ["Leandro Araújo Freitas","leandro.araujo@teste.com","11991001009","RCC Premium","Active",86,90,275,397,9,3573,["ativo","promotor"],null],
  ["Aline Castro Ferreira","aline.castro@teste.com","11991001010","Commander IA","Active",83,120,245,497,8,5964,["ativo"],null],
  ["Vanessa Moreira Campos","vanessa.moreira@teste.com","11991001011","Commander IA","Active",80,60,305,497,8,2982,["ativo"],null],
  ["Rodrigo Lima Monteiro","rodrigo.lima@teste.com","11991001012","Milionário com Milhas","Active",72,150,215,297,7,4455,["ativo"],null],
  ["Eduardo Vieira Cunha","eduardo.vieira@teste.com","11991001013","Profissão Liberdade","Active",78,200,165,197,7,3940,["ativo"],null],
  ["Luciana Barbosa Teixeira","luciana.barbosa@teste.com","11991001014","RCC Premium","Active",91,300,65,397,10,11910,["ativo","promotor","renovação-próxima"],"NPS 10"],
  ["Tatiana Souza Ribeiro","tatiana.souza@teste.com","11991001015","Assessoria Premium","Active",90,280,85,997,10,27916,["ativo","promotor","assessoria"],"VIP 2 anos"],
  ["Priscila Nascimento Lopes","priscila.nascimento@teste.com","11991001016","Assessoria Premium","Active",85,250,115,997,9,24925,["ativo","assessoria"],null],
  ["Thiago Carvalho Melo","thiago.carvalho@teste.com","11991001017","Milionário com Milhas","Active",75,180,185,297,8,5346,["ativo"],null],
  ["Paulo Roberto Gomes","paulo.gomes@teste.com","11991001018","Commander IA","Active",82,220,145,497,8,10934,["ativo"],null],
  ["Mariana Oliveira Pinto","mariana.oliveira@teste.com","11991001019","Assessoria Premium","Active",88,260,105,997,9,25922,["ativo","assessoria","promotor"],"Indicou 3 amigos"],
  ["Gustavo Pereira Almeida","gustavo.pereira@teste.com","11991001020","Profissão Liberdade","Active",76,190,175,197,8,3743,["ativo"],null],
  // Renovação próxima (30-60d)
  ["Simone Teixeira Ramos","simone.teixeira@teste.com","11991001021","Assessoria Premium","Active",79,305,60,997,8,30397,["renovação-próxima","assessoria"],null],
  ["Henrique Moura Faria","henrique.moura@teste.com","11991001022","Milionário com Milhas","Active",68,310,55,297,7,9207,["renovação-próxima"],null],
  ["Isabela Correia Duarte","isabela.correia@teste.com","11991001023","Commander IA","Active",71,315,50,497,7,15655,["renovação-próxima"],null],
  ["Leonardo Prado Vieira","leonardo.prado@teste.com","11991001024","RCC Premium","Active",65,320,45,397,6,12704,["renovação-próxima","risco"],null],
  ["Natália Fonseca Braga","natalia.fonseca@teste.com","11991001025","Profissão Liberdade","Active",62,325,40,197,6,6402,["renovação-próxima","risco"],null],
  ["Roberto Cunha Magalhães","roberto.cunha@teste.com","11991001026","Assessoria Premium","Active",74,330,35,997,7,32901,["renovação-próxima","assessoria"],null],
  ["Viviane Lopes Andrade","viviane.lopes@teste.com","11991001027","Commander IA","Active",70,335,30,497,7,16645,["renovação-próxima"],null],
  ["Alexandre Rocha Pires","alexandre.rocha@teste.com","11991001028","RCC Premium","Active",58,338,27,397,5,13426,["renovação-próxima","risco"],null],
  ["Débora Martins Cavalcanti","debora.martins@teste.com","11991001029","Milionário com Milhas","Active",55,340,25,297,5,10098,["renovação-próxima","risco"],null],
  // Em risco
  ["Cristina Alves Pires","cristina.alves@teste.com","11991001030","Assessoria Premium","At Risk",25,180,185,997,3,17946,["risco","assessoria","detrator"],"Reclamou do suporte"],
  ["Marcelo Dias Ferreira","marcelo.dias@teste.com","11991001031","Commander IA","At Risk",32,200,165,497,4,9940,["risco","detrator"],"Ameaçou cancelar"],
  ["Patrícia Nunes Carvalho","patricia.nunes@teste.com","11991001032","RCC Premium","At Risk",28,150,215,397,3,5955,["risco","detrator"],null],
  ["Sérgio Monteiro Azevedo","sergio.monteiro@teste.com","11991001033","Profissão Liberdade","At Risk",35,160,205,197,4,3152,["risco"],null],
  ["Adriana Campos Nogueira","adriana.campos@teste.com","11991001034","Milionário com Milhas","At Risk",30,170,195,297,3,5049,["risco","detrator"],null],
  ["Flávio Ribeiro Santana","flavio.ribeiro@teste.com","11991001035","Commander IA","At Risk",40,240,125,497,5,11928,["risco"],null],
  ["Cláudia Ferreira Borges","claudia.ferreira@teste.com","11991001036","Assessoria Premium","At Risk",22,290,75,997,2,28913,["risco","assessoria","detrator","renovação-próxima"],"Chargeback tentado"],
  // Sem contato recente
  ["Renata Sousa Freitas","renata.sousa@teste.com","11991001037","RCC Premium","Active",60,90,275,397,6,3573,["sem-contato"],null],
  ["Fábio Almeida Teixeira","fabio.almeida@teste.com","11991001038","Commander IA","Active",65,120,245,497,7,5964,["sem-contato"],null],
  ["Mônica Pereira Gomes","monica.pereira@teste.com","11991001039","Profissão Liberdade","Active",58,60,305,197,6,1182,["sem-contato"],null],
  ["Tiago Barbosa Lemos","tiago.barbosa@teste.com","11991001040","Milionário com Milhas","Active",63,150,215,297,6,4455,["sem-contato"],null],
  // Churned
  ["Vanessa Churn Oliveira","vanessa.churn@teste.com","11991001041","Commander IA","Churned",10,400,0,0,1,4970,["churn"],null],
  ["Pedro Churn Santos","pedro.churn@teste.com","11991001042","RCC Premium","Churned",8,380,0,0,2,3573,["churn"],null],
  ["Lúcia Churn Rodrigues","lucia.churn@teste.com","11991001043","Assessoria Premium","Churned",5,420,0,0,1,9970,["churn","assessoria"],null],
  ["André Churn Melo","andre.churn@teste.com","11991001044","Profissão Liberdade","Churned",12,360,0,0,2,1970,["churn"],null],
  // VIP High Ticket
  ["Beatriz VIP Monteiro","beatriz.vip@teste.com","11991001045","Assessoria Premium","Active",92,350,15,1997,10,69895,["vip","assessoria","high-ticket","renovação-próxima"],"Renovação iminente"],
  ["Guilherme VIP Farias","guilherme.vip@teste.com","11991001046","Assessoria Premium","Active",88,320,45,1997,9,63904,["vip","assessoria","high-ticket","renovação-próxima"],null],
  ["Helena VIP Carvalho","helena.vip@teste.com","11991001047","Assessoria Premium","Active",95,300,65,1997,10,59910,["vip","assessoria","high-ticket","renovação-próxima"],null],
  ["Igor VIP Nascimento","igor.vip@teste.com","11991001048","Assessoria Premium","Active",85,270,95,1997,9,53919,["vip","assessoria","high-ticket"],null],
  ["Juliana VIP Correia","juliana.vip@teste.com","11991001049","Assessoria Premium","Active",90,240,125,1997,10,47928,["vip","assessoria","high-ticket"],null],
  // Passivos
  ["Marcos Passivo Alves","marcos.passivo@teste.com","11991001050","RCC Premium","Active",65,180,185,397,7,7146,["passivo"],null],
  ["Sandra Passiva Lima","sandra.passiva@teste.com","11991001051","Commander IA","Active",68,200,165,497,7,9940,["passivo"],null],
  ["Nelson Passivo Costa","nelson.passivo@teste.com","11991001052","Milionário com Milhas","Active",62,220,145,297,8,6534,["passivo"],null],
  ["Vera Passiva Sousa","vera.passiva@teste.com","11991001053","Profissão Liberdade","Active",70,240,125,197,7,4728,["passivo"],null],
  // Upsell
  ["Cláudio Upsell Braga","claudio.upsell@teste.com","11991001054","Commander IA","Active",87,270,95,497,9,13419,["upsell","promotor"],null],
  ["Elaine Upsell Ferreira","elaine.upsell@teste.com","11991001055","RCC Premium","Active",84,290,75,397,9,11513,["upsell","promotor"],null],
  ["Fábio Upsell Vieira","fabio.upsell@teste.com","11991001056","Milionário com Milhas","Active",81,310,55,297,9,9207,["upsell","promotor","renovação-próxima"],null],
  // Indicados
  ["Gisele Indicada Ramos","gisele.indicada@teste.com","11991001057","Assessoria Premium","New",55,3,365,997,null,997,["novo","indicado","assessoria"],"Indicada por Mariana Oliveira"],
  ["Humberto Indicado Pinto","humberto.indicado@teste.com","11991001058","Commander IA","New",60,5,365,497,null,497,["novo","indicado"],"Indicado por Paulo Roberto"],
  // Engajados
  ["Irene Engajada Matos","irene.engajada@teste.com","11991001059","RCC Premium","Active",89,100,265,397,9,3970,["ativo","promotor"],null],
  ["João Engajado Leal","joao.engajado@teste.com","11991001060","Profissão Liberdade","Active",77,130,235,197,8,2561,["ativo"],null],
];

const customerIds = [];
for (const c of CUSTOMERS) {
  const [name,email,phone,program,status,healthScore,daysAgoVal,renewDays,mrr,nps,ltv,tags,notes] = c;
  const entryDate = daysAgo(daysAgoVal);
  const renewalDate = renewDays > 0 ? daysFromNow(renewDays) : daysAgo(30);
  const lastInteraction = tags.includes("sem-contato") ? daysAgo(randInt(15,30)) : (status === "Churned" ? daysAgo(randInt(60,120)) : daysAgo(randInt(0,10)));
  const agentId = teamIds[randInt(0, teamIds.length-1)];
  const [r] = await connection.execute(
    `INSERT INTO customers (name,email,phone,program,status,healthScore,createdAt,lastInteractionAt,renewalDate,npsScore,lifetimeValue,mrr,tags,notes,assignedAgentId,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [name,email,phone,program,status,healthScore,entryDate,lastInteraction,renewalDate,nps,ltv,mrr,JSON.stringify(tags),notes,agentId]
  );
  customerIds.push(r.insertId);
}
console.log(`   ✅ ${customerIds.length} clientes inseridos`);

// 4. WhatsApp Groups
console.log("\n💬 Inserindo 5 grupos WhatsApp...");
const GROUPS = [
  ["TEST_AP_001@g.us","Assessoria Premium — Turma Janeiro 2025","Turma de janeiro, suporte e networking",18,"community",false],
  ["TEST_AP_002@g.us","Assessoria Premium — VIPs","Grupo exclusivo VIP",8,"vip",true],
  ["TEST_AP_003@g.us","Assessoria Premium — Turma Março 2025","Turma de março",22,"community",false],
  ["TEST_AP_004@g.us","Assessoria Premium — Dúvidas Técnicas","Canal de dúvidas técnicas",35,"support",true],
  ["TEST_AP_005@g.us","Assessoria Premium — Resultados & Cases","Cases e resultados",42,"community",false],
];
const groupIds = [];
for (const [groupId,groupName,description,participantCount,groupType,aiAutoReply] of GROUPS) {
  await connection.execute("DELETE FROM groupMessages WHERE groupId=?", [groupId]);
  await connection.execute("DELETE FROM whatsappGroups WHERE groupId=?", [groupId]);
  const [r] = await connection.execute(
    `INSERT INTO whatsappGroups (groupId,groupName,description,participantCount,isMonitored,groupType,aiAutoReply,lastCustomerMessageAt,lastAgentMessageAt,createdAt,updatedAt) VALUES (?,?,?,?,1,?,?,?,?,NOW(),NOW())`,
    [groupId,groupName,description,participantCount,groupType,aiAutoReply?1:0,daysAgo(randInt(0,3)),daysAgo(randInt(0,1))]
  );
  groupIds.push({id:r.insertId,groupId,aiAutoReply});
}
console.log(`   ✅ ${groupIds.length} grupos inseridos`);

// 5. Group Messages
console.log("\n📨 Inserindo mensagens nos grupos...");
const CUST_MSGS = [
  "Boa tarde! Alguém conseguiu acessar o módulo 3 hoje? Está dando erro aqui.",
  "Pessoal, qual foi o resultado de vocês no mês passado? Eu consegui 2.3x de retorno 🚀",
  "Dúvida: como faço para calcular o ponto de equilíbrio da estratégia?",
  "Obrigado pelo suporte de ontem! Resolveu o problema 👏",
  "Quando vai ter a próxima live ao vivo?",
  "Alguém tem o template de planilha que o professor mencionou?",
  "Consegui meu primeiro resultado! Muito obrigada pela assessoria 🎉",
  "Preciso de ajuda com a configuração da conta. Pode me chamar?",
  "Qual é o prazo para enviar o relatório mensal?",
  "Estou com dificuldade no módulo 4. Alguém pode me ajudar?",
  "Que live incrível de ontem! Aprendi muito 🙌",
  "Minha renovação está chegando. Como funciona o processo?",
];
const AGENT_MSGS = [
  "Olá pessoal! Bom dia a todos 😊 Estamos aqui para apoiar vocês.",
  "Ótima pergunta! Vou te responder no privado com o passo a passo.",
  "Pessoal, lembrando que amanhã às 19h temos nossa live semanal! Não percam 🎯",
  "Parabéns! Que resultado incrível! Continue assim 🏆",
  "O template está na área de membros, pasta Ferramentas. Qualquer dúvida, é só chamar!",
  "Boa notícia: o módulo 6 foi liberado hoje! Aproveitem 🚀",
  "Lembrete: prazo para envio do relatório é até sexta-feira.",
];
const AI_MSGS = [
  "Olá! Sou o assistente de IA do grupo. Posso ajudar com dúvidas básicas enquanto o guardião está offline. Para urgências, marque @guardiao.",
  "Boa pergunta! O módulo 3 está disponível após completar os exercícios do módulo 2. Você já finalizou?",
  "O template está na área de membros > Ferramentas > Templates. Precisa de ajuda?",
  "Para renovação, o processo é automático se o cartão estiver cadastrado. O guardião entrará em contato 30 dias antes.",
];
const MEMBER_NAMES = ["Ana Beatriz","Carlos Eduardo","Fernanda Lima","Juliana Martins","Ricardo Alves","Camila Rodrigues","Bruno Neves","Diego Ferreira","Mariana Oliveira","Tatiana Souza","Priscila Nascimento","Beatriz VIP","Guilherme VIP","Helena VIP"];
let totalMsgs = 0;
for (const g of groupIds) {
  const count = randInt(12,20);
  for (let i=0;i<count;i++) {
    const hoursAgo = randInt(1,72);
    const ts = new Date(); ts.setHours(ts.getHours()-hoursAgo);
    const isAI = g.aiAutoReply && Math.random()<0.25;
    const isAgent = !isAI && Math.random()<0.35;
    const agentId = teamIds[randInt(0,teamIds.length-1)];
    const senderType = isAgent||isAI ? "agent" : "customer";
    const senderName = isAI ? "IA Assistente" : (isAgent ? owner.name : randItem(MEMBER_NAMES));
    const content = isAI ? randItem(AI_MSGS) : (isAgent ? randItem(AGENT_MSGS) : randItem(CUST_MSGS));
    await connection.execute(
      `INSERT INTO groupMessages (groupId,senderId,senderName,senderType,content,timestamp,createdAt) VALUES (?,?,?,?,?,?,NOW())`,
      [g.groupId,isAI?'ai_assistant':(isAgent?`agent_${agentId}`:`customer_${senderName.replace(/ /g,'_')}`),senderName,senderType,content,ts]
    );
    totalMsgs++;
  }
}
console.log(`   ✅ ${totalMsgs} mensagens em ${groupIds.length} grupos`);

// 6. Conversations & Messages
console.log("\n💬 Inserindo conversas...");
const SUBJECTS = ["Dúvida sobre o módulo 3","Problema de acesso","Interesse em upgrade","Feedback","Dúvida sobre renovação","Suporte técnico","Check-in mensal","Solicitação de indicação"];
let convCount = 0;
for (let i=0;i<Math.min(40,customerIds.length);i++) {
  const numConvs = randInt(1,3);
  for (let j=0;j<numConvs;j++) {
    const isAI = Math.random()<0.3;
    const agentId = teamIds[randInt(0,teamIds.length-1)];
    const status = randItem(["Open","Waiting","Closed","Closed","Closed"]);
    const [cr] = await connection.execute(
      `INSERT INTO conversations (customerId,assignedAgentId,channel,status,subject,qualityScore,sentimentScore,handledByAi,handoffMode,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
      [customerIds[i],agentId,randItem(["whatsapp","whatsapp","whatsapp","email"]),status,randItem(SUBJECTS),randInt(60,100),(Math.random()*0.6+0.4).toFixed(2),isAI?1:0,isAI?"ai":"human",daysAgo(randInt(0,30))]
    );
    const convId = cr.insertId; convCount++;
    const msgCount = randInt(3,8);
    for (let k=0;k<msgCount;k++) {
      const isCustomer = k%2===0;
      const senderType = isCustomer?"customer":(isAI&&k>0?"ai":"agent");
      const contents = isCustomer
        ? ["Olá, preciso de ajuda.","Tenho uma dúvida sobre o módulo.","Obrigado pelo suporte!","Consegui resolver o problema."]
        : ["Olá! Como posso ajudar?","Claro, vou verificar isso para você.","Entendido! Vou resolver agora.","Ótimo! Fico feliz em ajudar."];
      await connection.execute(
        `INSERT INTO messages (conversationId,senderType,content,createdAt) VALUES (?,?,?,?)`,
        [convId,senderType,randItem(contents),daysAgo(randInt(0,30))]
      );
    }
  }
}
console.log(`   ✅ ${convCount} conversas inseridas`);

// 7. Journey Tasks
console.log("\n🗺️  Inserindo tarefas de jornada...");
const JOURNEY = [
  ["Boas-vindas — Ligar e apresentar o guardião","onboarding",1,"critical"],
  ["Enviar material de onboarding completo","onboarding",2,"high"],
  ["Check-in de 7 dias — Como está indo?","onboarding",7,"critical"],
  ["Check-in de 30 dias — Primeiro resultado","monthly",30,"high"],
  ["Check-in Mês 2","monthly",60,"normal"],
  ["Check-in Mês 3","monthly",90,"normal"],
  ["Check-in Mês 6 — Revisão semestral","monthly",180,"high"],
  ["Pesquisa NPS — Avaliação do programa","monthly",90,"high"],
  ["Iniciar conversa de renovação (60 dias antes)","renewal",305,"critical"],
  ["Apresentar proposta de renovação (30 dias)","renewal",335,"critical"],
  ["Fechar renovação — prazo iminente (7 dias)","renewal",358,"critical"],
  ["Solicitar indicação de amigos","monthly",120,"normal"],
  ["Oferecer upsell para próximo nível","monthly",150,"high"],
];
let taskCount = 0;
for (let i=0;i<Math.min(30,customerIds.length);i++) {
  const daysAgoVal = CUSTOMERS[i][6];
  for (const [title,phase,dayOffset,priority] of JOURNEY) {
    const dueDate = new Date(daysAgo(daysAgoVal));
    dueDate.setDate(dueDate.getDate()+dayOffset);
    const isPast = dueDate < new Date();
    let status = "pending";
    if (isPast) status = daysAgoVal>100 ? (Math.random()<0.75?"done":(Math.random()<0.5?"skipped":"pending")) : (Math.random()<0.4?"done":"pending");
    const completedAt = status==="done" ? dueDate : null;
    await connection.execute(
      `INSERT INTO customerJourneyTasks (customerId,title,description,phase,dayOffset,dueDate,status,priority,completedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [customerIds[i],title,`Tarefa automática da jornada — ${phase}`,phase,dayOffset,dueDate,status,priority,completedAt]
    );
    taskCount++;
  }
}
console.log(`   ✅ ${taskCount} tarefas de jornada`);

// 8. Customer Notes
console.log("\n📝 Inserindo notas...");
const NOTES = [
  ["call","Ligação de check-in realizada. Cliente satisfeito. Mencionou interesse em indicar amigos."],
  ["note","Cliente reclamou de dificuldade com o módulo 4. Encaminhado para suporte. Acompanhar."],
  ["meeting","Reunião de revisão semestral. Cliente atingiu 80% das metas. Apresentar proposta de upgrade."],
  ["email","Enviado email com material complementar sobre estratégias avançadas."],
  ["whatsapp","Cliente enviou print dos resultados. Muito animado! Candidato a depoimento."],
  ["call","Ligação de renovação. Cliente demonstrou interesse mas pediu para pensar. Retornar em 7 dias."],
  ["note","Atenção: cliente mencionou dificuldades financeiras. Verificar parcelamento na renovação."],
  ["meeting","Onboarding realizado. Cliente entendeu o processo. Próximo contato: check-in de 7 dias."],
  ["whatsapp","Cliente perguntou sobre a live da semana. Confirmado presença."],
  ["email","Enviado relatório de progresso personalizado. Cliente agradeceu."],
];
let noteCount = 0;
for (let i=0;i<Math.min(40,customerIds.length);i++) {
  const numNotes = randInt(1,4);
  for (let j=0;j<numNotes;j++) {
    const [type,content] = randItem(NOTES);
    const agentId = teamIds[randInt(0,teamIds.length-1)];
    const agentName = agentId===owner.id ? owner.name : (TEAM_DATA[teamIds.indexOf(agentId)-1]?.[0] || owner.name);
    await connection.execute(
      `INSERT INTO customerNotes (customerId,content,type,createdByUserId,createdByName,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW())`,
      [customerIds[i],content,type,agentId,agentName,daysAgo(randInt(0,60))]
    );
    noteCount++;
  }
}
console.log(`   ✅ ${noteCount} notas inseridas`);

// 9. NPS Surveys
console.log("\n⭐ Inserindo pesquisas NPS...");
const NPS = [
  [10,"Excelente! Mudou minha vida financeira. Indiquei para 3 amigos.","Promoter"],
  [9,"Muito bom! O suporte é incrível. Recomendo para todos.","Promoter"],
  [9,"Ótimo conteúdo e equipe sempre disponível.","Promoter"],
  [8,"Bom programa, mas poderia ter mais lives ao vivo.","Passive"],
  [7,"Satisfeito, mas esperava mais resultados práticos.","Passive"],
  [7,"Razoável. O conteúdo é bom mas o suporte poderia ser mais rápido.","Passive"],
  [4,"Decepcionado com o suporte. Demora muito para responder.","Detractor"],
  [3,"Não consegui os resultados prometidos. Estou pensando em cancelar.","Detractor"],
  [2,"Péssima experiência. O módulo 4 não funciona e ninguém resolve.","Detractor"],
  [10,"Incrível! Já recuperei o investimento em 2 meses.","Promoter"],
  [9,"Programa completo e equipe dedicada. Vale cada centavo.","Promoter"],
  [8,"Bom custo-benefício. Recomendaria com algumas ressalvas.","Passive"],
  [6,"Mediano. Esperava mais conteúdo prático.","Detractor"],
  [5,"Não atendeu minhas expectativas iniciais.","Detractor"],
  [10,"Transformou minha relação com finanças. Obrigada!","Promoter"],
];
let surveyCount = 0;
for (let i=0;i<Math.min(NPS.length,customerIds.length);i++) {
  const [score,feedback,classification] = NPS[i];
  await connection.execute(
    `INSERT INTO surveys (customerId,type,score,feedback,classification,status,sentAt,completedAt,followUpSent,createdAt) VALUES (?,'NPS',?,?,?,'Completed',?,?,?,NOW())`,
    [customerIds[i],score,feedback,classification,daysAgo(randInt(30,90)),daysAgo(randInt(1,29)),classification==="Promoter"?1:0]
  );
  surveyCount++;
}
console.log(`   ✅ ${surveyCount} pesquisas NPS`);

// 10. Alerts
console.log("\n🚨 Inserindo alertas...");
const ALERTS = [
  ["chargeback","Chargeback — Ana Beatriz Ferreira","Contestação de R$997. Banco: Nubank. Motivo: não reconhece a compra.",0,997],
  ["chargeback","Chargeback — Vanessa Churn Oliveira","Contestação de R$497. Banco: Itaú. Motivo: produto não entregue.",40,497],
  ["reclame_aqui","Reclame Aqui — Cristina Alves Pires","Reclamação sobre dificuldade de cancelamento e falta de suporte.",29,null],
  ["reclame_aqui","Reclame Aqui — Marcelo Dias Ferreira","Reclamação sobre acesso negado após pagamento.",30,null],
  ["chargeback","Chargeback — Pedro Churn Santos","Contestação de R$397. Banco: Bradesco. Motivo: serviço não prestado.",41,397],
  ["dispute","Disputa Pagar.me — Lúcia Churn","Disputa aberta. Valor: R$997. Aguardando documentação.",42,997],
  ["reclame_aqui","Reclame Aqui — Patrícia Nunes","Reclamação sobre promessas de resultado não cumpridas.",31,null],
];
let alertCount = 0;
for (const [type,title,desc,custIdx,amount] of ALERTS) {
  const custId = customerIds[custIdx]||null;
  const custName = custId ? CUSTOMERS[custIdx][0] : "Desconhecido";
  const custEmail = custId ? CUSTOMERS[custIdx][1] : null;
  await connection.execute(
    `INSERT INTO alerts (type,title,description,customerId,customerName,customerEmail,amount,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,'open',NOW(),NOW())`,
    [type,title,desc,custId,custName,custEmail,amount]
  );
  alertCount++;
}
console.log(`   ✅ ${alertCount} alertas`);

// 11. Client Tasks
console.log("\n✅ Inserindo tarefas de clientes...");
const TASK_TMPL = [
  ["Ligar para cliente em risco","urgent","todo"],
  ["Enviar proposta de renovação","high","todo"],
  ["Agendar reunião de revisão","medium","in_progress"],
  ["Enviar material complementar","low","done"],
  ["Registrar feedback do cliente","medium","todo"],
  ["Escalada para gerência — cliente VIP","urgent","todo"],
  ["Confirmar presença na live","low","done"],
  ["Verificar acesso à plataforma","high","in_progress"],
];
let clientTaskCount = 0;
for (let i=0;i<Math.min(20,customerIds.length);i++) {
  const [title,priority,status] = TASK_TMPL[i%TASK_TMPL.length];
  const agentId = teamIds[randInt(0,teamIds.length-1)];
  await connection.execute(
    `INSERT INTO tasks (customerId,title,status,priority,assignedTo,dueDate,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
    [customerIds[i],title,status,priority,agentId,daysFromNow(randInt(1,14)),owner.id]
  );
  clientTaskCount++;
}
console.log(`   ✅ ${clientTaskCount} tarefas de clientes`);

await connection.end();
console.log(`
╔══════════════════════════════════════════════════╗
║          SEED DE TESTE 360° CONCLUÍDO ✅          ║
╠══════════════════════════════════════════════════╣
║  👥 Membros da equipe:   ${String(teamIds.length).padEnd(23)}║
║  🧑‍💼 Clientes:            ${String(customerIds.length).padEnd(23)}║
║  💬 Grupos WhatsApp:     ${String(groupIds.length).padEnd(23)}║
║  📨 Mensagens grupos:    ${String(totalMsgs).padEnd(23)}║
║  🗣️  Conversas:           ${String(convCount).padEnd(23)}║
║  🗺️  Tarefas de jornada:  ${String(taskCount).padEnd(23)}║
║  📝 Notas de clientes:   ${String(noteCount).padEnd(23)}║
║  ⭐ Pesquisas NPS:        ${String(surveyCount).padEnd(23)}║
║  🚨 Alertas:             ${String(alertCount).padEnd(23)}║
║  ✅ Tarefas clientes:    ${String(clientTaskCount).padEnd(23)}║
╚══════════════════════════════════════════════════╝
Para limpar: node cleanup-test.mjs
`);
