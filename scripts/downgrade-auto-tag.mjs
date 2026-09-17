// Rebaixa a tag "Automático" (slug "auto") de tag de sistema para tag comum
// editável, em bancos que já rodaram seedDefaults.ts antes de "auto" ser
// removida de DEFAULT_TAGS.
//
// O filtro dessa tag sempre retornava lista vazia: dependia de
// conversationTagAssignments (que nada populava) e, mesmo com atribuição
// manual, o client comparava conversations.status === "auto" — valor que o
// enum (Open/Waiting/Closed) nunca produz. Ver CLAUDE.md > Backlog >
// Correções pendentes.
//
// Este script não apaga a tag nem nenhuma atribuição manual que já exista —
// só remove a proteção de tag de sistema (isSystem/isDefault), deixando-a
// como qualquer tag criada por um atendente: editável e excluível pela
// interface. Bancos que nunca rodaram o seed antigo não têm a linha e o
// script não faz nada.
//
// Idempotente: roda de novo sem efeito se já foi rebaixada.
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [result] = await conn.execute(
  "UPDATE conversationTags SET isSystem = 0, isDefault = 0 WHERE slug = 'auto' AND isSystem = 1"
);
console.log(`[downgrade-auto-tag] Linhas atualizadas: ${result.affectedRows}`);

const [rows] = await conn.execute(
  "SELECT id, name, slug, isSystem, isDefault FROM conversationTags WHERE slug = 'auto'"
);
if (rows.length === 0) {
  console.log("[downgrade-auto-tag] Nenhuma tag com slug 'auto' encontrada — nada a fazer.");
} else {
  console.log("[downgrade-auto-tag] Estado atual:", rows[0]);
}

await conn.end();
