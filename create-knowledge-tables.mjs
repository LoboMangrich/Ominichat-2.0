import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`knowledgeCaptures\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`question\` text NOT NULL,
    \`normalizedQuestion\` varchar(512) NOT NULL,
    \`category\` enum('acesso_plataforma','conteudo_modulo','financeiro_reembolso','certificado','comunidade','suporte_tecnico','resultado_produto','outros') NOT NULL DEFAULT 'outros',
    \`frequency\` int NOT NULL DEFAULT 1,
    \`lastSeenAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`status\` enum('pending','approved','dismissed') NOT NULL DEFAULT 'pending',
    \`resolution\` text,
    \`sourceConversationIds\` json,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`knowledgeCaptures_id\` PRIMARY KEY(\`id\`)
  )
`);
console.log('knowledgeCaptures: OK');

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`knowledgeFAQ\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`question\` text NOT NULL,
    \`answer\` text NOT NULL,
    \`category\` enum('acesso_plataforma','conteudo_modulo','financeiro_reembolso','certificado','comunidade','suporte_tecnico','resultado_produto','outros') NOT NULL DEFAULT 'outros',
    \`agentIds\` json,
    \`captureId\` int,
    \`isActive\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`knowledgeFAQ_id\` PRIMARY KEY(\`id\`)
  )
`);
console.log('knowledgeFAQ: OK');

await conn.end();
console.log('Done!');
