/**
 * Bootstrap do primeiro Admin em um banco novo. Uso: pnpm create-admin
 *
 * Sem cadastro público e só Admin cria conta (ver CLAUDE.md), um banco
 * recém-provisionado não tem ninguém pra criar o primeiro Admin — problema
 * do ovo e da galinha. Este script resolve isso rodando uma vez, direto no
 * banco, fora de qualquer rota HTTP.
 *
 * Nunca vira endpoint: rota que emite/cria conta de Admin é backdoor, e
 * backdoor de bootstrap tende a sobreviver até produção (mesma regra de
 * scripts/dev-session.ts, que é o script de bootstrap LOCAL — este aqui é o
 * de produção).
 */
import "dotenv/config";

import { MIN_PASSWORD_LENGTH } from "../shared/const";
import * as db from "../server/db";
import { getDb } from "../server/db";
import { normalizeEmail } from "../server/_core/passwordAuth";
import { hashPassword } from "../server/_core/passwordHash";
import { users } from "../drizzle/schema";

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(
      `[create-admin] Abortado: ${name} não está definido. Defina ADMIN_NAME, ADMIN_EMAIL e ` +
        `ADMIN_PASSWORD (ex.: ADMIN_NAME="Fulano" ADMIN_EMAIL=fulano@empresa.com ADMIN_PASSWORD=... pnpm create-admin).`
    );
    process.exit(1);
  }
  return value.trim();
}

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const name = readRequiredEnv("ADMIN_NAME");
  const rawEmail = readRequiredEnv("ADMIN_EMAIL");
  const password = readRequiredEnv("ADMIN_PASSWORD");

  if (!SIMPLE_EMAIL_PATTERN.test(rawEmail)) {
    console.error(`[create-admin] Abortado: ADMIN_EMAIL "${rawEmail}" não parece um e-mail válido.`);
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `[create-admin] Abortado: ADMIN_PASSWORD precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
    );
    process.exit(1);
  }

  const dbConn = await getDb();
  if (!dbConn) {
    console.error(
      "[create-admin] Abortado: banco indisponível. Verifique DATABASE_URL e se o MySQL está no ar."
    );
    process.exit(1);
  }

  const openId = normalizeEmail(rawEmail);
  const existing = await db.getUserByOpenId(openId);
  if (existing) {
    console.error(
      `[create-admin] Abortado: já existe um usuário com o e-mail ${rawEmail}. ` +
        "Se a intenção é redefinir a senha dele, use a tela de Usuários (como outro Admin) " +
        "em vez deste script."
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  await dbConn.insert(users).values({
    openId,
    name,
    email: rawEmail,
    role: "Admin",
    loginMethod: "password",
    passwordHash,
    mustChangePassword: true,
    isActive: true,
    approvedAt: now,
    // null: bootstrap sem Admin humano por trás — mesma semântica que o
    // schema já documenta para esse caso (ver drizzle/schema.ts).
    approvedBy: null,
  });

  console.log(`\n[create-admin] Admin criado: ${rawEmail}`);
  console.log("[create-admin] A senha informada é temporária — o login vai forçar a troca dela.");
  console.log("[create-admin] Passe e-mail e senha para a pessoa por um canal seguro.\n");
  process.exit(0);
}

main().catch(error => {
  console.error("[create-admin] Erro inesperado:", error);
  process.exit(1);
});
