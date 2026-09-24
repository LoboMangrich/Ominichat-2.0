import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ASSIGNMENT_TABS,
  DEFAULT_ASSIGNMENT_TAB,
  SARA_STATUS_LABELS,
  formatTabCount,
  readAssignmentTab,
  saraMatchesAssignment,
  writeAssignmentTab,
  conversationHref,
  fromGroup,
  fromLegacy,
  fromSara,
  latestConversationHref,
  legacyQueryInput,
  matchesLocalSearch,
  mergeConversations,
  mergeTimeline,
  originLabel,
  parseDeepLink,
  saraActorLabel,
  saraCanTakeover,
  saraComposerBanner,
  saraMatchesFilter,
  saraSearch,
  saraSource,
  saraStatusParam,
  statusLabel,
  tabFilterFor,
} from "./saraShared";

// /sara é a tela única de Conversas: Sara + canal próprio numa lista só, chat e painel do
// cliente à direita. A Sara está em produção com clientes reais — sendMessage, takeover,
// release e close alteram conversa de verdade —, então nada aqui chama a API: checagem
// estática do código-fonte, mesmo padrão de ConversationDetail.finalizarConversa.test.ts
// (sem harness de teste de componente React neste projeto).
const detail = readFileSync(new URL("./SaraConversationDetail.tsx", import.meta.url), "utf-8");
const list = readFileSync(new URL("./Sara.tsx", import.meta.url), "utf-8");
const shared = readFileSync(new URL("./saraShared.ts", import.meta.url), "utf-8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf-8");

function mutationBlock(name: string): string {
  const start = detail.indexOf(`trpc.sara.${name}.useMutation(`);
  expect(start, `mutation ${name} não encontrada`).toBeGreaterThan(-1);
  const end = detail.indexOf("});", start);
  return detail.slice(start, end);
}

describe("SaraConversationDetail — toda mutation invalida conversa e lista", () => {
  it("invalidateAll invalida sara.getConversation E sara.listConversations", () => {
    const start = detail.indexOf("const invalidateAll = () => {");
    expect(start).toBeGreaterThan(-1);
    const body = detail.slice(start, detail.indexOf("};", start));
    expect(body).toMatch(/utils\.sara\.getConversation\.invalidate\(\{ id \}\)/);
    expect(body).toMatch(/utils\.sara\.listConversations\.invalidate\(\)/);
  });

  it.each(["sendMessage", "takeover", "release", "close"])("%s chama invalidateAll no onSuccess", name => {
    expect(mutationBlock(name)).toMatch(/onSuccess:[\s\S]*invalidateAll\(\)/);
  });
});

describe("Sara — abas por etiqueta filtram pelo STATUS REAL (não por conversationTagAssignments)", () => {
  const OPEN_TAG = { id: 11, slug: "open" };
  const WAITING_TAG = { id: 12, slug: "waiting" };
  const GROUP_TAG = { id: 13, slug: "group" };
  const CUSTOM_TAG = { id: 99, slug: null };

  it("Todos: Sara sem filtro (inclui error); canal próprio sem status (inclui Closed), sem grupos", () => {
    const f = tabFilterFor(undefined);
    expect(saraSource(f)).toBe("list");
    expect(saraStatusParam(f)).toBeUndefined();
    for (const s of ["active", "human_takeover", "awaiting_response", "error"]) {
      expect(saraMatchesFilter(s, f)).toBe(true);
    }
    expect(legacyQueryInput(f, "", 20)).toEqual({ search: undefined, limit: 20, excludeGroups: true });
  });

  it("Em Aberto: Sara active + human_takeover (separado no client); canal próprio status Open, sem tagId", () => {
    const f = tabFilterFor(OPEN_TAG);
    expect(saraStatusParam(f)).toBeUndefined(); // dois status → sem filtro na API
    expect(saraMatchesFilter("active", f)).toBe(true);
    expect(saraMatchesFilter("human_takeover", f)).toBe(true);
    expect(saraMatchesFilter("awaiting_response", f)).toBe(false);
    expect(saraMatchesFilter("error", f)).toBe(false);
    const input = legacyQueryInput(f, "", 20);
    expect(input).toEqual({ search: undefined, limit: 20, excludeGroups: true, status: "Open" });
    expect(input).not.toHaveProperty("tagId");
  });

  it("Aguardando: Sara awaiting_response direto na API; canal próprio status Waiting, sem tagId", () => {
    const f = tabFilterFor(WAITING_TAG);
    expect(saraStatusParam(f)).toBe("awaiting_response");
    expect(saraMatchesFilter("awaiting_response", f)).toBe(true);
    expect(saraMatchesFilter("active", f)).toBe(false);
    const input = legacyQueryInput(f, "", 20);
    expect(input).toEqual({ search: undefined, limit: 20, excludeGroups: true, status: "Waiting" });
    expect(input).not.toHaveProperty("tagId");
  });

  it("\"error\" só aparece em Todos entre as abas de status (etiqueta personalizada mostra o que foi etiquetado)", () => {
    for (const tag of [OPEN_TAG, WAITING_TAG, GROUP_TAG]) {
      expect(saraMatchesFilter("error", tabFilterFor(tag))).toBe(false);
    }
    // Conversa etiquetada de propósito aparece na aba da etiqueta, qualquer que seja o status.
    expect(saraMatchesFilter("error", tabFilterFor(CUSTOM_TAG))).toBe(true);
  });

  it("Grupos: busca grupos pela tag group (sem excludeGroups) e não consulta a Sara", () => {
    const f = tabFilterFor(GROUP_TAG);
    expect(saraSource(f)).toBe("none");
    expect(legacyQueryInput(f, "", 20)).toEqual({ search: undefined, limit: 20, tagId: 13 });
  });

  it("etiqueta personalizada: canal próprio via tagId (excludeGroups) E Sara via listTaggedConversations", () => {
    const f = tabFilterFor(CUSTOM_TAG);
    expect(saraSource(f)).toBe("tag");
    // qualquer status da Sara entra quando está etiquetada
    for (const st of ["active", "human_takeover", "awaiting_response", "error"]) {
      expect(saraMatchesFilter(st, f)).toBe(true);
    }
    expect(legacyQueryInput(f, "", 20)).toEqual({ search: undefined, limit: 20, excludeGroups: true, tagId: 99 });
  });

  it("Sara.tsx: chips vêm de tags.list, com engrenagem do TagManagerModal; aviso \"Sara não tem etiquetas\" saiu", () => {
    expect(list).toContain("trpc.tags.list.useQuery()");
    expect(list).toContain("<TagManagerModal");
    expect(list).not.toContain("Conversas da Sara não têm etiquetas");
    expect(list).toContain("enabled: saraEnabled");
  });

  it("etiqueta personalizada: consulta sem polling e com staleTime de 60s (a Sara é produção)", () => {
    expect(list).toContain("const TAGGED_STALE_MS = 60_000;");
    expect(list).toMatch(
      /trpc\.sara\.listTaggedConversations\.useQuery\([\s\S]*?enabled: taggedEnabled, staleTime: TAGGED_STALE_MS, refetchInterval: false/,
    );
  });

  it("status da doc nova da Sara: awaiting_response → \"Aguardando resposta\", error → \"Erro\"", () => {
    const waiting = fromSara({ id: "w", status: "awaiting_response", userName: null, phoneNumber: null, lastMessageAt: null, createdAt: "" });
    const error = fromSara({ id: "e", status: "error", userName: null, phoneNumber: null, lastMessageAt: null, createdAt: "" });
    expect(waiting.bucket).toBe("waiting");
    expect(statusLabel(waiting)).toBe("Aguardando resposta");
    expect(error.bucket).toBe("error");
    expect(statusLabel(error)).toBe("Erro");
    expect(SARA_STATUS_LABELS.awaiting_response).toBe("Aguardando resposta");
    expect(SARA_STATUS_LABELS.error).toBe("Erro");
  });

  it("status fora do enum documentado continua cru (sem rótulo inventado)", () => {
    const other = fromSara({ id: "x", status: "closed", userName: null, phoneNumber: null, lastMessageAt: null, createdAt: "" });
    expect(other.bucket).toBe("unknown");
    expect(statusLabel(other)).toBe("closed");
  });
});

describe("SaraConversationDetail — Encerrar e remetentes", () => {
  it("Encerrar pede confirmação (AlertDialog) antes de chamar close", () => {
    expect(detail).toMatch(/<AlertDialogAction[\s\S]*?closeMutation\.mutate\(\{ id \}\)/);
    expect(detail).toMatch(/O cliente deixa de ser atendido por aqui\./);
  });

  it("senderType desconhecido não é descartado — mostra o valor cru", () => {
    expect(detail).toMatch(/const isUnknown = !isCustomer && !isSara && !isAdmin/);
    expect(detail).toMatch(/\{isUnknown && \([\s\S]*?\{message\.senderType\}/);
  });

  it("cores: Sara bg-brand-600, atendente bg-emerald-700 (AA com texto branco)", () => {
    expect(detail).toMatch(/bg-emerald-700 text-white/);
    expect(detail).toMatch(/bg-brand-600 text-white/);
    expect(detail).not.toMatch(/bg-emerald-600 text-white/);
  });

  it("não cria cor hex nova", () => {
    for (const source of [detail, list, shared]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("Rotas — /sara, /sara/:id, /sara/legado/:id e /sara/grupo/:id renderizam a tela única", () => {
  it("as quatro rotas usam o componente Sara", () => {
    expect(app).toContain('<Route path="/sara" component={Sara} />');
    expect(app).toContain('<Route path="/sara/:id" component={Sara} />');
    expect(app).toContain('<Route path="/sara/legado/:id" component={Sara} />');
    expect(app).toContain('<Route path="/sara/grupo/:id" component={Sara} />');
  });

  it("conversationHref: Sara /sara/:id, canal próprio /sara/legado/:id, grupo /sara/grupo/:id", () => {
    expect(conversationHref({ source: "sara", id: "abc" })).toBe("/sara/abc");
    expect(conversationHref({ source: "legacy", id: 42 })).toBe("/sara/legado/42");
    expect(conversationHref({ source: "group", id: 5 })).toBe("/sara/grupo/5");
  });
});

describe("Sara.tsx — lista unificada consome as duas fontes", () => {
  it("consulta sara.listConversations e tags.listUnified (input montado por legacyQueryInput)", () => {
    expect(list).toContain("trpc.sara.listConversations.useQuery(");
    // Uma consulta por aba de atribuição (para os contadores), todas via legacyQueryInput.
    for (const tab of ["mine", "unassigned", "all"]) {
      expect(list).toContain(`trpc.tags.listUnified.useQuery(legacyQueryInput(filter, search, limit, "${tab}")`);
    }
  });

  it("grupo abre o GroupConversationPanel", () => {
    expect(list).toMatch(/<GroupConversationPanel[\s\S]*?groupId: selectedGroup\.id/);
  });

  it("polling de 15s nas duas fontes", () => {
    expect(list).toMatch(/LIST_REFETCH_MS = 15000/);
    expect(list.match(/refetchInterval: LIST_REFETCH_MS/g)).toHaveLength(2);
  });

  it("falha de uma fonte mostra a outra + aviso", () => {
    // saraFailed cobre as duas consultas da Sara (lista e etiqueta personalizada).
    expect(list).toContain("const saraFailed = saraActive && activeSaraQuery.isError;");
    expect(list).toMatch(/\{saraFailed && \([\s\S]*?Sara indisponível/);
    expect(list).toMatch(/legacyQuery\.isError && \([\s\S]*?Canal próprio indisponível/);
  });

  it("painel: Sara → SaraConversationDetail; legado → ConversationDetail embutido", () => {
    expect(list).toContain("<SaraConversationDetail id={selection.id} />");
    expect(list).toMatch(/<ConversationDetail[\s\S]*?embeddedConvId=\{selection\.id\}/);
  });

  it("chave do React vem do item unificado (prefixada pela origem)", () => {
    expect(list).toContain("key={item.key}");
  });
});

describe("saraShared — normalização e junção", () => {
  const saraConv = (id: string, status: string, lastMessageAt: string | null) => ({
    id, status, userName: "Maria Souza", phoneNumber: "+5548984053595", lastMessageAt, createdAt: "2026-01-01T00:00:00Z",
  });
  const legacy = (id: number, extra: Partial<Parameters<typeof fromLegacy>[0]> = {}) => ({
    id, type: "conversation", name: "João", phone: "48999990000", lastMessageAt: new Date("2026-09-01T10:00:00Z"),
    status: "Open", handledByAi: false, channel: "whatsapp", ...extra,
  });

  it("Sara: active → ai, human_takeover → human, outro → unknown com valor cru", () => {
    expect(fromSara(saraConv("a", "active", null)).bucket).toBe("ai");
    expect(fromSara(saraConv("b", "human_takeover", null)).bucket).toBe("human");
    const unknown = fromSara(saraConv("c", "closed", null));
    expect(unknown.bucket).toBe("unknown");
    expect(statusLabel(unknown)).toBe("closed");
  });

  it("legado: Closed → closed (\"Encerrada\"); senão handledByAi decide (aceita 0/1 do MySQL)", () => {
    const closed = fromLegacy(legacy(1, { status: "Closed", handledByAi: true }));
    expect(closed.bucket).toBe("closed");
    expect(statusLabel(closed)).toBe("Encerrada");
    expect(fromLegacy(legacy(2, { handledByAi: 1 })).bucket).toBe("ai");
    expect(fromLegacy(legacy(3, { handledByAi: 0 })).bucket).toBe("human");
  });

  it("junta as duas fontes, tira grupos (fora da aba Grupos) e ordena por última atividade desc", () => {
    const merged = mergeConversations(
      [saraConv("s1", "active", "2026-09-02T10:00:00Z"), saraConv("s2", "active", "2026-08-01T10:00:00Z")],
      [legacy(7), { ...legacy(100001), type: "group", groupId: 1 }],
    );
    expect(merged.map(i => i.key)).toEqual(["sara:s1", "legacy:7", "sara:s2"]);
  });

  it("aba Grupos: grupo vira item com id = whatsappGroups.id (groupId), sem rótulo de status", () => {
    const merged = mergeConversations([], [{ ...legacy(100005), type: "group", groupId: 5, name: "VIP" }], {
      includeGroups: true,
    });
    expect(merged.map(i => i.key)).toEqual(["group:5"]);
    expect(merged[0]).toMatchObject({ source: "group", id: 5 });
    expect(originLabel(merged[0])).toBe("Grupo");
    expect(statusLabel(merged[0])).toBe("");
    expect(fromGroup({ ...legacy(1), type: "group", groupId: null })).toBeNull();
  });

  it("chaves prefixadas não colidem entre origens com o mesmo id", () => {
    const merged = mergeConversations([saraConv("7", "active", null)], [legacy(7)]);
    expect(new Set(merged.map(i => i.key)).size).toBe(2);
  });

  it("selo de origem: Sara ou o canal legado (cru se desconhecido)", () => {
    expect(originLabel(fromSara(saraConv("a", "active", null)))).toBe("Sara");
    expect(originLabel(fromLegacy(legacy(1)))).toBe("WhatsApp");
    expect(originLabel(fromLegacy(legacy(2, { channel: "chat" })))).toBe("chat");
  });

  it("legado em Waiting mantém rótulo por handledByAi (regra combinada)", () => {
    expect(statusLabel(fromLegacy(legacy(1, { status: "Waiting", handledByAi: true })))).toBe("Com a IA");
    expect(statusLabel(fromLegacy(legacy(2, { status: "Waiting", handledByAi: false })))).toBe("Atendimento humano");
  });
});

describe("saraShared — busca", () => {
  it("telefone completo vai para a Sara em E.164, sem filtro local", () => {
    expect(saraSearch("(48) 98405-3595")).toEqual({ phone: "+5548984053595", localFilter: null });
  });

  it("nome ou número parcial NÃO vai para a Sara — filtra no client", () => {
    expect(saraSearch("Maria")).toEqual({ phone: undefined, localFilter: "Maria" });
    expect(saraSearch("98405")).toEqual({ phone: undefined, localFilter: "98405" });
    expect(saraSearch("  ")).toEqual({ phone: undefined, localFilter: null });
  });

  it("filtro local: nome case-insensitive, telefone só por dígitos", () => {
    const conv = { id: "x", status: "active", userName: "Maria Souza", phoneNumber: "+5548984053595", lastMessageAt: null, createdAt: "" };
    expect(matchesLocalSearch(conv, "maria")).toBe(true);
    expect(matchesLocalSearch(conv, "984-05")).toBe(true);
    expect(matchesLocalSearch(conv, "joão")).toBe(false);
    expect(matchesLocalSearch({ ...conv, phoneNumber: null }, "98405")).toBe(false);
  });
});

describe("Links diretos — ?conversationId= e ?customerId=", () => {
  const sara = (id: string, lastMessageAt: string) => ({
    id, status: "active", userName: null, phoneNumber: "+5548984053595", lastMessageAt, createdAt: "2026-01-01T00:00:00Z",
  });

  it("parseDeepLink: conversationId tem prioridade; valores inválidos são ignorados", () => {
    expect(parseDeepLink("?conversationId=12")).toEqual({ kind: "conversation", id: 12 });
    expect(parseDeepLink("?customerId=7")).toEqual({ kind: "customer", id: 7 });
    expect(parseDeepLink("?customerId=7&conversationId=12")).toEqual({ kind: "conversation", id: 12 });
    expect(parseDeepLink("?customerId=abc")).toBeNull();
    expect(parseDeepLink("?conversationId=0")).toBeNull();
    expect(parseDeepLink("")).toBeNull();
  });

  it("latestConversationHref: a mais recente entre canal próprio e Sara (com e sem o 9)", () => {
    const legacy = { id: 3, updatedAt: new Date("2026-09-10T10:00:00Z") };
    expect(latestConversationHref(legacy, [[sara("old", "2026-09-01T10:00:00Z")], []])).toBe("/sara/legado/3");
    expect(
      latestConversationHref(legacy, [[sara("a", "2026-09-01T10:00:00Z")], [sara("b", "2026-09-20T10:00:00Z")]]),
    ).toBe("/sara/b");
    expect(latestConversationHref(undefined, [[sara("s", "2026-09-01T10:00:00Z")]])).toBe("/sara/s");
    expect(latestConversationHref(undefined, [[], []])).toBeNull();
  });

  it("Sara.tsx: ?customerId consulta a Sara só com listConversations por telefone (e164Candidates)", () => {
    expect(list).toContain("parseDeepLink(window.location.search)");
    expect(list).toMatch(/e164Candidates\(customer\.data\.phone\)/);
    expect(list).toMatch(/trpc\.useQueries\(t =>\s*phoneForms\.map\(phone => t\.sara\.listConversations\(/);
    // Nenhuma ação que altera conversa real da Sara na tela de lista.
    expect(list).not.toMatch(/sara\.(sendMessage|takeover|release|close|sendTyping)/);
  });
});

describe("Quem assumiu (actorId) — lista e painel", () => {
  const base = { id: "c", userName: null, phoneNumber: null, lastMessageAt: null, createdAt: "" };

  it("lista: human_takeover mostra \"Assumido por <nome>\", \"você\" ou \"outro atendente\"", () => {
    expect(statusLabel(fromSara({ ...base, status: "human_takeover", actorId: "9", actorName: "Beatriz" }))).toBe(
      "Assumido por Beatriz",
    );
    expect(statusLabel(fromSara({ ...base, status: "human_takeover", actorId: "7", assignedToMe: true }))).toBe(
      "Assumido por você",
    );
    expect(statusLabel(fromSara({ ...base, status: "human_takeover", actorId: "123", actorName: null }))).toBe(
      "Assumido por outro atendente",
    );
    // Sem actorId: rótulo normal de humano.
    expect(statusLabel(fromSara({ ...base, status: "human_takeover", actorId: null }))).toBe("Atendimento humano");
  });

  it("saraActorLabel: null sem actorId", () => {
    expect(saraActorLabel({ actorId: null })).toBeNull();
    expect(saraActorLabel({})).toBeNull();
  });

  it("painel: campo de resposta só com canSend; Devolver/Encerrar desabilitados sem canReleaseOrClose", () => {
    expect(detail).toContain("const canSend = isHuman && conversation.canSend;");
    // Campo de resposta vive no SaraComposer, que só mostra o campo com canReply.
    expect(detail).toContain("canReply={canSend}");
    expect(detail).toMatch(/releaseMutation\.isPending \|\| !canReleaseOrClose/);
    expect(detail).toMatch(/closeMutation\.isPending \|\| !canReleaseOrClose/);
  });

  it("painel: faixa acima do composer vem de saraComposerBanner; topo mostra quem assumiu", () => {
    expect(detail).toContain("const banner = saraComposerBanner(conversation);");
    expect(detail).toMatch(/Assumido por \$\{actorLabel\}/);
  });
});

describe("Faixa acima do composer — aviso com a ação que resolve (sem regra nova)", () => {
  const base = { actorId: null, actorName: null, canSend: false, canReleaseOrClose: true };

  it("com a IA → \"A Sara está atendendo\" + Assumir", () => {
    expect(saraComposerBanner({ ...base, status: "active" })).toEqual({
      text: "A Sara está atendendo",
      action: "takeover",
    });
  });

  it("awaiting_response → \"A Sara aguarda resposta do cliente\" + Assumir", () => {
    expect(saraComposerBanner({ ...base, status: "awaiting_response" })).toEqual({
      text: "A Sara aguarda resposta do cliente",
      action: "takeover",
    });
  });

  it("error → \"Conversa com erro na Sara\", sem botão", () => {
    expect(saraComposerBanner({ ...base, status: "error" })).toEqual({ text: "Conversa com erro na Sara", action: null });
  });

  it("assumida por mim → sem faixa (composer normal)", () => {
    expect(saraComposerBanner({ ...base, status: "human_takeover", actorId: "7", canSend: true })).toBeNull();
  });

  it("assumida por outro → \"Assumida por <nome>\"; Devolver só se canReleaseOrClose (Admin)", () => {
    const other = { ...base, status: "human_takeover", actorId: "9", actorName: "Beatriz" };
    expect(saraComposerBanner({ ...other, canReleaseOrClose: false })).toEqual({
      text: "Assumida por Beatriz",
      action: null,
    });
    expect(saraComposerBanner({ ...other, canReleaseOrClose: true })).toEqual({
      text: "Assumida por Beatriz",
      action: "release",
    });
    expect(saraComposerBanner({ ...other, actorName: null, canReleaseOrClose: false })?.text).toBe(
      "Assumida por outro atendente",
    );
  });

  it("sem identificação → o aviso de sempre + Devolver para IA", () => {
    expect(saraComposerBanner({ ...base, status: "human_takeover" })).toEqual({
      text: "Assumida sem identificação de atendente. Se ninguém da equipe está nela, devolva para a IA e assuma de novo.",
      action: "release",
    });
  });

  it("\"Assumir\" aparece em active e awaiting_response, não em human_takeover/error", () => {
    expect(["active", "awaiting_response", "human_takeover", "error"].map(saraCanTakeover)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("painel liga os botões da faixa às mutations que já existem", () => {
    expect(detail).toMatch(/banner\.action === "takeover"[\s\S]*?takeoverMutation\.mutate\(\{ id \}\)/);
    expect(detail).toMatch(/banner\.action === "release"[\s\S]*?releaseMutation\.mutate\(\{ id \}\)/);
  });
});

describe("mergeTimeline — mensagens e notas intercaladas por horário", () => {
  const msg = (id: string, createdAt: string) => ({ id, createdAt });
  const note = (id: number, createdAt: string | Date) => ({ id, createdAt });

  it("ordena por horário (asc) juntando as duas listas", () => {
    const entries = mergeTimeline(
      [msg("m1", "2026-09-24T10:00:00Z"), msg("m2", "2026-09-24T10:10:00Z")],
      [note(1, new Date("2026-09-24T10:05:00Z")), note(2, "2026-09-24T10:20:00Z")],
    );
    expect(entries.map(e => e.key)).toEqual(["msg:m1", "note:1", "msg:m2", "note:2"]);
  });

  it("empate: mensagem antes da nota; chaves não colidem entre tipos", () => {
    const entries = mergeTimeline([msg("1", "2026-09-24T10:00:00Z")], [note(1, "2026-09-24T10:00:00Z")]);
    expect(entries.map(e => e.key)).toEqual(["msg:1", "note:1"]);
  });
});

describe("Painel do cliente (Sara) — mesmo conteúdo do ConversationDetail, sem NPS/CSAT", () => {
  it("mostra saúde, MRR, renovação (destaque em até 30 dias), LTV, tarefas e Ver perfil", () => {
    expect(detail).toContain("Índice de Saúde");
    expect(detail).toMatch(/>MRR</);
    expect(detail).toContain("Renovação próxima");
    expect(detail).toContain("const RENEWAL_SOON_MS = 30 * 24 * 60 * 60 * 1000;");
    expect(detail).toMatch(/>LTV</);
    expect(detail).toContain("Próximas Tarefas");
    expect(detail).toContain("Ver perfil completo");
  });

  it("NPS/CSAT não entram (saem pelo canal próprio, outro número)", () => {
    expect(detail).not.toMatch(/trpc\.(surveys|satisfaction)\./);
    expect(detail).not.toMatch(/type: "(NPS|CSAT)"/);
  });
});

describe("Abas de atribuição — Minhas / Não atribuídas / Todas", () => {
  const OPEN = tabFilterFor({ id: 11, slug: "open" });
  const WAITING = tabFilterFor({ id: 12, slug: "waiting" });
  const GROUPS = tabFilterFor({ id: 13, slug: "group" });

  it("ordem das abas e default Todas", () => {
    expect(ASSIGNMENT_TABS.map(t => t.label)).toEqual(["Minhas", "Não atribuídas", "Todas"]);
    expect(DEFAULT_ASSIGNMENT_TAB).toBe("all");
  });

  it("Sara: Minhas = assumida por mim; Não atribuídas = active ou awaiting_response", () => {
    expect(saraMatchesAssignment({ status: "human_takeover", assignedToMe: true }, "mine")).toBe(true);
    expect(saraMatchesAssignment({ status: "human_takeover", assignedToMe: false }, "mine")).toBe(false);
    expect(saraMatchesAssignment({ status: "active" }, "unassigned")).toBe(true);
    expect(saraMatchesAssignment({ status: "awaiting_response" }, "unassigned")).toBe(true);
    expect(saraMatchesAssignment({ status: "human_takeover" }, "unassigned")).toBe(false);
    expect(saraMatchesAssignment({ status: "error" }, "all")).toBe(true);
  });

  it("canal próprio: assignee no servidor, combinado com a etiqueta (Minhas + Aguardando)", () => {
    expect(legacyQueryInput(WAITING, "", 20, "mine")).toEqual({
      search: undefined, limit: 20, excludeGroups: true, status: "Waiting", assignee: "me",
    });
    expect(legacyQueryInput(OPEN, "", 20, "unassigned")).toMatchObject({ status: "Open", assignee: "unassigned" });
    // Todas = sem assignee (mesmo input de antes).
    expect(legacyQueryInput(OPEN, "", 20, "all")).not.toHaveProperty("assignee");
  });

  it("Grupos não têm atribuição: a aba não se aplica", () => {
    expect(legacyQueryInput(GROUPS, "", 20, "mine")).toEqual({ search: undefined, limit: 20, tagId: 13 });
    expect(list).toContain('const appliesAssignment = filter.kind !== "groups";');
  });

  it("contador é da página carregada: \"20+\" quando pode haver mais", () => {
    expect(formatTabCount(3, false)).toBe("3");
    expect(formatTabCount(20, true)).toBe("20+");
    expect(list).toContain("Contagem do que está carregado nesta página");
  });

  it("última escolha lembrada por usuário no localStorage, com try/catch", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeAssignmentTab(storage, 7, "mine");
    expect(store.get("conversas.atribuicao.7")).toBe("mine");
    expect(readAssignmentTab(storage, 7)).toBe("mine");
    expect(readAssignmentTab(storage, 8)).toBe("all"); // outro usuário → default
    store.set("conversas.atribuicao.7", "lixo");
    expect(readAssignmentTab(storage, 7)).toBe("all"); // valor inválido → default

    const broken = {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
    };
    expect(readAssignmentTab(broken, 7)).toBe("all");
    expect(() => writeAssignmentTab(broken, 7, "mine")).not.toThrow();
    expect(readAssignmentTab(undefined, 7)).toBe("all");
  });

  it("linha de atribuição fica ACIMA das etiquetas, que continuam como estão", () => {
    expect(list.indexOf('aria-label="Atribuição"')).toBeGreaterThan(-1);
    expect(list.indexOf('aria-label="Atribuição"')).toBeLessThan(list.indexOf("Chips — mesmo visual de Atendimentos.tsx"));
  });
});
