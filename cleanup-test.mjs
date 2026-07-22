/**
 * cleanup-test.mjs — Remove todos os dados de teste
 * Limpa apenas registros com emails @teste.com e grupos com groupId TEST_*
 * Execute: node cleanup-test.mjs
 */
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const connection = await mysql.createConnection(DB_URL);

console.log("🧹 Iniciando limpeza dos dados de teste...\n");

// Get test customer IDs first
const [testCustomers] = await connection.execute(
  "SELECT id FROM customers WHERE email LIKE '%@teste.com'"
);
const testCustomerIds = testCustomers.map(r => r.id);
console.log(`   Clientes de teste encontrados: ${testCustomerIds.length}`);

if (testCustomerIds.length === 0) {
  console.log("   Nenhum dado de teste encontrado. Nada a limpar.");
  await connection.end();
  process.exit(0);
}

const idList = testCustomerIds.join(",");

// Delete in dependency order
const steps = [
  ["customerNotes", `DELETE FROM customerNotes WHERE customerId IN (${idList})`],
  ["customerJourneyTasks", `DELETE FROM customerJourneyTasks WHERE customerId IN (${idList})`],
  ["surveys", `DELETE FROM surveys WHERE customerId IN (${idList})`],
  ["tasks", `DELETE FROM tasks WHERE customerId IN (${idList})`],
  ["alerts (test)", `DELETE FROM alerts WHERE customerEmail LIKE '%@teste.com'`],
  ["messages (test convs)", `DELETE FROM messages WHERE conversationId IN (SELECT id FROM conversations WHERE customerId IN (${idList}))`],
  ["conversations", `DELETE FROM conversations WHERE customerId IN (${idList})`],
  ["groupMessages (test)", `DELETE FROM groupMessages WHERE groupId LIKE 'TEST_%'`],
  ["whatsappGroups (test)", `DELETE FROM whatsappGroups WHERE groupId LIKE 'TEST_%'`],
  ["customers (test)", `DELETE FROM customers WHERE email LIKE '%@teste.com'`],
];

for (const [label, sql] of steps) {
  try {
    const [result] = await connection.execute(sql);
    console.log(`   ✅ ${label}: ${result.affectedRows} registros removidos`);
  } catch (err) {
    console.log(`   ⚠️  ${label}: ${err.message}`);
  }
}

console.log("\n🎉 Limpeza concluída! Plataforma pronta para uso real.");
await connection.end();
