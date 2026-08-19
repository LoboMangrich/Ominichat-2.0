// Script de desenvolvimento local: gera um cookie de sessão válido sem depender
// do OAuth do Manus. Uso: pnpm dev:session
import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  console.error(
    "[dev-session] Abortado: NODE_ENV=production. Este script é só para uso local."
  );
  process.exit(1);
}

import { COOKIE_NAME } from "../shared/const";
import * as db from "../server/db";
import { ENV } from "../server/_core/env";
import { sdk } from "../server/_core/sdk";

async function main() {
  if (!ENV.ownerOpenId) {
    console.error(
      "[dev-session] Abortado: OWNER_OPEN_ID não está configurado no .env."
    );
    process.exit(1);
  }

  await db.upsertUser({
    openId: ENV.ownerOpenId,
    name: "Dev Local",
    role: "Admin",
    loginMethod: "dev-local",
  });

  const user = await db.getUserByOpenId(ENV.ownerOpenId);
  if (!user) {
    console.error(
      "[dev-session] Abortado: usuário não foi encontrado após o upsert. " +
        "Verifique se DATABASE_URL está configurado e o MySQL local está rodando."
    );
    process.exit(1);
  }

  const token = await sdk.createSessionToken(ENV.ownerOpenId, {
    name: "Dev Local",
  });

  console.log("\n[dev-session] Usuário sincronizado:");
  console.log(`  openId: ${user.openId}`);
  console.log(`  name:   ${user.name}`);
  console.log(`  role:   ${user.role}`);

  console.log("\n[dev-session] Token gerado:\n");
  console.log(token);

  console.log(`\n[dev-session] Como usar (cookie "${COOKIE_NAME}"):`);
  console.log(
    "  1. Abra o app no navegador em http://localhost:5173 (ou a porta do dev server)"
  );
  console.log("  2. Abra o DevTools > Application > Cookies > localhost");
  console.log(`  3. Crie/edite o cookie "${COOKIE_NAME}" com o valor acima`);
  console.log(
    "     (Path: /, sem HttpOnly marcado se for colar manualmente pelo DevTools)"
  );
  console.log("\n  Ou, pelo console do navegador:");
  console.log(`  document.cookie = "${COOKIE_NAME}=${token}; path=/";\n`);

  process.exit(0);
}

main().catch(error => {
  console.error("[dev-session] Erro inesperado:", error);
  process.exit(1);
});
