import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// /atendimentos deixou de ser tela separada: a rota só redireciona para a tela única de
// Conversas (/sara), preservando ?customerId= e ?conversationId=. Atendimentos.tsx fica
// no repositório sem rota (ver CLAUDE.md) até ser removido. Checagem estática do fonte.
const srcDir = fileURLToPath(new URL(".", import.meta.url));
const app = readFileSync(join(srcDir, "App.tsx"), "utf-8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

describe("/atendimentos redireciona para a tela única", () => {
  it("a rota /atendimentos usa o redirect, não a página Atendimentos", () => {
    expect(app).toContain('<Route path="/atendimentos" component={AtendimentosRedirect} />');
    expect(app).not.toMatch(/import Atendimentos from/);
  });

  it("o redirect vai para /sara preservando a query (?customerId= / ?conversationId=)", () => {
    expect(app).toContain("<Redirect to={`/sara${window.location.search}`} replace />");
  });

  it("nenhum link restante para \"/atendimentos\" fora do redirect", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const lines = readFileSync(file, "utf-8").split(/\r?\n/);
      lines.forEach((line, i) => {
        // Só literais de caminho ("/atendimentos, '/atendimentos, `/atendimentos) contam —
        // comentários e texto de interface ("atendimentos") não.
        if (!/["'`]\/atendimentos/.test(line)) return;
        const isRedirectRoute = file.endsWith("App.tsx") && line.includes('path="/atendimentos"');
        if (!isRedirectRoute) offenders.push(`${relative(srcDir, file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
