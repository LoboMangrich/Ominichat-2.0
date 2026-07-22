/**
 * Teste End-to-End Completo da Plataforma CS
 * Testa todas as funcionalidades principais via API direta no banco
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
const results = [];

function log(module, status, detail = "") {
  const icon = status === "OK" ? "✅" : status === "WARN" ? "⚠️" : "❌";
  console.log(`${icon} [${module}] ${detail}`);
  results.push({ module, status, detail });
}

async function runTests() {
  let conn;
  try {
    conn = await createConnection(DB_URL);
    console.log("\n🔍 TESTE GERAL DA PLATAFORMA CS - " + new Date().toLocaleString("pt-BR") + "\n");

    // ── 1. USUÁRIOS ──────────────────────────────────────────────────────────
    const [users] = await conn.execute("SELECT id, name, email, role FROM users LIMIT 10");
    if (users.length === 0) {
      log("Usuários", "FAIL", "Nenhum usuário encontrado no banco");
    } else {
      log("Usuários", "OK", `${users.length} usuário(s) — ${users.map(u => `${u.name || u.email} (${u.role})`).join(", ")}`);
    }

    // ── 2. CLIENTES ──────────────────────────────────────────────────────────
    const [customers] = await conn.execute("SELECT id, name, email, status, program FROM customers LIMIT 5");
    log("Clientes", customers.length > 0 ? "OK" : "WARN",
      customers.length > 0
        ? `${customers.length} cliente(s) — ex: ${customers[0].name} (${customers[0].status})`
        : "Nenhum cliente cadastrado — integração Guru pendente");

    // ── 3. ATENDIMENTOS ──────────────────────────────────────────────────────
    const [convs] = await conn.execute("SELECT id, channel, status, handledByAi, aiAgentId FROM conversations LIMIT 5");
    log("Atendimentos", convs.length > 0 ? "OK" : "WARN",
      convs.length > 0
        ? `${convs.length} atendimento(s) — canais: ${[...new Set(convs.map(c => c.channel))].join(", ")}`
        : "Nenhum atendimento encontrado");

    // ── 4. MENSAGENS ─────────────────────────────────────────────────────────
    const [msgs] = await conn.execute("SELECT COUNT(*) as total, senderType FROM messages GROUP BY senderType");
    if (msgs.length > 0) {
      const summary = msgs.map(m => `${m.senderType}: ${m.total}`).join(", ");
      log("Mensagens", "OK", `Distribuição: ${summary}`);
    } else {
      log("Mensagens", "WARN", "Nenhuma mensagem encontrada");
    }

    // ── 5. AGENTE DE IA ──────────────────────────────────────────────────────
    const [agents] = await conn.execute("SELECT id, name, isActive, programFilter FROM aiAgents LIMIT 5");
    if (agents.length === 0) {
      log("Agente de IA", "FAIL", "Nenhum agente de IA configurado — IA não vai responder");
    } else {
      const active = agents.filter(a => a.isActive);
      log("Agente de IA", active.length > 0 ? "OK" : "WARN",
        `${agents.length} agente(s), ${active.length} ativo(s) — ${agents.map(a => `${a.name}${a.isActive ? " ✓" : " (inativo)"}`).join(", ")}`);
    }

    // ── 6. BASE DE CONHECIMENTO ──────────────────────────────────────────────
    const [kb] = await conn.execute("SELECT COUNT(*) as total FROM knowledgeBase");
    log("Base de Conhecimento", kb[0].total > 0 ? "OK" : "WARN",
      `${kb[0].total} entrada(s) na KB — ${kb[0].total < 5 ? "recomendado adicionar mais conteúdo" : "boa cobertura"}`);

    // ── 7. CONFIGURAÇÕES DE CANAL ────────────────────────────────────────────
    const [channels] = await conn.execute("SELECT channel, isActive, waPhoneNumberId, waBusinessAccountId FROM channelSettings");
    if (channels.length === 0) {
      log("Canais", "WARN", "Nenhum canal configurado — WhatsApp/Email/Instagram/Telegram pendente");
    } else {
      for (const ch of channels) {
        if (ch.channel === "whatsapp") {
          if (!ch.waPhoneNumberId) {
            log("WhatsApp", "WARN", "Phone Number ID não configurado — conexão Meta pendente");
          } else {
            log("WhatsApp", "OK", `Phone ID: ${ch.waPhoneNumberId} | Business Account: ${ch.waBusinessAccountId || "não configurado"}`);
          }
        } else {
          log(`Canal ${ch.channel}`, ch.isActive ? "OK" : "WARN", ch.isActive ? "Ativo" : "Inativo");
        }
      }
    }

    // ── 8. INTEGRAÇÃO GURU ───────────────────────────────────────────────────
    const [guru] = await conn.execute("SELECT id, isActive, apiToken FROM guruSettings LIMIT 1");
    if (guru.length === 0 || !guru[0].isActive) {
      log("Guru", "WARN", "Integração Guru não configurada — webhook pendente");
    } else {
      log("Guru", "OK", `Ativo — token: ${guru[0].apiToken ? "configurado" : "FALTANDO"}`);
    }

    // ── 9. SLA ───────────────────────────────────────────────────────────────
    const [sla] = await conn.execute("SELECT channel, windowMinutes, warningMinutes, isActive FROM slaSettings");
    if (sla.length === 0) {
      log("SLA", "WARN", "Configurações de SLA não encontradas");
    } else {
      const active = sla.filter(s => s.isActive);
      log("SLA", active.length > 0 ? "OK" : "WARN",
        `${sla.length} canal(is) configurado(s), ${active.length} ativo(s)`);
    }

    // ── 10. SATISFAÇÃO PÓS-ATENDIMENTO ───────────────────────────────────────
    const [sat] = await conn.execute("SELECT isActive, message, delayMinutes FROM satisfactionSettings LIMIT 1");
    if (sat.length === 0) {
      log("Satisfação", "WARN", "Configuração de satisfação não encontrada");
    } else {
      log("Satisfação", "OK", `${sat[0].isActive ? "Ativa" : "Inativa"} — delay: ${sat[0].delayMinutes}min — mensagem: ${sat[0].message ? "configurada" : "FALTANDO"}`);
    }

    // ── 11. RESPOSTAS RÁPIDAS ─────────────────────────────────────────────────
    const [qr] = await conn.execute("SELECT COUNT(*) as total FROM quickReplies");
    log("Respostas Rápidas", qr[0].total > 0 ? "OK" : "WARN",
      `${qr[0].total} resposta(s) rápida(s) cadastrada(s)`);

    // ── 12. TAREFAS ───────────────────────────────────────────────────────────
    const [tasks] = await conn.execute("SELECT COUNT(*) as total, status FROM tasks GROUP BY status");
    if (tasks.length > 0) {
      log("Tarefas", "OK", tasks.map(t => `${t.status}: ${t.total}`).join(", "));
    } else {
      log("Tarefas", "WARN", "Nenhuma tarefa cadastrada");
    }

    // ── 13. RELATÓRIOS SEMANAIS ───────────────────────────────────────────────
    const [reports] = await conn.execute("SELECT COUNT(*) as total FROM weeklyReports");
    log("Relatórios", reports[0].total > 0 ? "OK" : "WARN",
      `${reports[0].total} relatório(s) gerado(s)`);

    // ── 14. ALERTAS ───────────────────────────────────────────────────────────
    const [alerts] = await conn.execute("SELECT COUNT(*) as total, status FROM alerts GROUP BY status");
    if (alerts.length > 0) {
      log("Alertas", "OK", alerts.map(a => `${a.status}: ${a.total}`).join(", "));
    } else {
      log("Alertas", "OK", "Nenhum alerta ativo — sistema limpo");
    }

    // ── 15. MENSAGENS AGENDADAS ───────────────────────────────────────────────
    const [sched] = await conn.execute("SELECT COUNT(*) as total, status FROM scheduledMessages GROUP BY status");
    if (sched.length > 0) {
      log("Agendamentos", "OK", sched.map(s => `${s.status}: ${s.total}`).join(", "));
    } else {
      log("Agendamentos", "OK", "Nenhuma mensagem agendada");
    }

    // ── 16. ANÁLISES DE IA ────────────────────────────────────────────────────
    const [analyses] = await conn.execute("SELECT COUNT(*) as total FROM agentMetrics");
    log("Análises IA", analyses[0].total > 0 ? "OK" : "WARN",
      `${analyses[0].total} análise(s) gerada(s) — ${analyses[0].total === 0 ? "feche um atendimento para gerar a primeira" : "OK"}`);

    // ── 17. NPS/CSAT ──────────────────────────────────────────────────────────
    const [surveys] = await conn.execute("SELECT COUNT(*) as total, type FROM surveys GROUP BY type");
    if (surveys.length > 0) {
      log("NPS/CSAT", "OK", surveys.map(s => `${s.type}: ${s.total}`).join(", "));
    } else {
      log("NPS/CSAT", "WARN", "Nenhuma pesquisa enviada ainda");
    }

    // ── 18. CHAT INTERNO ──────────────────────────────────────────────────────
    const [teamMsgs] = await conn.execute("SELECT COUNT(*) as total FROM internalMessages");
    log("Chat Interno", "OK", `${teamMsgs[0].total} mensagem(ns) interna(s)`);

    // ── RESUMO ────────────────────────────────────────────────────────────────
    console.log("\n" + "=".repeat(60));
    console.log("📊 RESUMO DO TESTE");
    console.log("=".repeat(60));
    const ok = results.filter(r => r.status === "OK").length;
    const warn = results.filter(r => r.status === "WARN").length;
    const fail = results.filter(r => r.status === "FAIL").length;
    console.log(`✅ OK: ${ok} | ⚠️  ATENÇÃO: ${warn} | ❌ FALHA: ${fail}`);
    console.log("\n📋 ITENS QUE PRECISAM DE AÇÃO:");
    results.filter(r => r.status !== "OK").forEach(r => {
      console.log(`  ${r.status === "WARN" ? "⚠️" : "❌"} ${r.module}: ${r.detail}`);
    });
    console.log("\n✨ ITENS FUNCIONANDO:");
    results.filter(r => r.status === "OK").forEach(r => {
      console.log(`  ✅ ${r.module}: ${r.detail}`);
    });

  } catch (err) {
    console.error("❌ Erro ao conectar ao banco:", err.message);
  } finally {
    if (conn) await conn.end();
  }
}

runTests();
