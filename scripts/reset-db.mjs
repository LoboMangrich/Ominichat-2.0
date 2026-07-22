import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(url);

const tables = [
  "upsellOpportunities",
  "ghlSettings",
  "agentMetrics",
  "referrals",
  "surveys",
  "conversationLabels",
  "messages",
  "conversations",
  "customers",
];

await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
for (const t of tables) {
  try {
    await conn.execute(`DROP TABLE IF EXISTS \`${t}\``);
    console.log(`Dropped: ${t}`);
  } catch (e) {
    console.log(`Skip ${t}: ${e.message}`);
  }
}
await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
await conn.end();
console.log("Done. Run pnpm db:push now.");
