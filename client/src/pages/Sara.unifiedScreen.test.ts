import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SARA_STATUS_LABELS,
  SARA_TABS,
  conversationHref,
  fromLegacy,
  fromSara,
  matchesLocalSearch,
  mergeConversations,
  originLabel,
  saraSearch,
  saraStatusForBucket,
  statusLabel,
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

describe("Sara — abas só com buckets ai/human (closed e unknown só em Todos)", () => {
  it("SARA_TABS só filtra por ai e human (Todos = sem filtro)", () => {
    expect(SARA_TABS.map(t => t.bucket)).toEqual([undefined, "ai", "human"]);
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

describe("Rotas — /sara, /sara/:id e /sara/legado/:id renderizam a tela única", () => {
  it("as três rotas usam o componente Sara", () => {
    expect(app).toContain('<Route path="/sara" component={Sara} />');
    expect(app).toContain('<Route path="/sara/:id" component={Sara} />');
    expect(app).toContain('<Route path="/sara/legado/:id" component={Sara} />');
  });

  it("conversationHref: Sara em /sara/:id, canal próprio em /sara/legado/:id", () => {
    expect(conversationHref({ source: "sara", id: "abc" })).toBe("/sara/abc");
    expect(conversationHref({ source: "legacy", id: 42 })).toBe("/sara/legado/42");
  });
});

describe("Sara.tsx — lista unificada consome as duas fontes", () => {
  it("consulta sara.listConversations e tags.listUnified com excludeGroups: true", () => {
    expect(list).toContain("trpc.sara.listConversations.useQuery(");
    expect(list).toContain("trpc.tags.listUnified.useQuery(");
    expect(list).toMatch(/excludeGroups: true/);
  });

  it("polling de 15s nas duas fontes", () => {
    expect(list).toMatch(/LIST_REFETCH_MS = 15000/);
    expect(list.match(/refetchInterval: LIST_REFETCH_MS/g)).toHaveLength(2);
  });

  it("falha de uma fonte mostra a outra + aviso", () => {
    expect(list).toMatch(/saraQuery\.isError && \([\s\S]*?Sara indisponível/);
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

  it("junta as duas fontes, tira grupos e ordena por última atividade desc", () => {
    const merged = mergeConversations(
      [saraConv("s1", "active", "2026-09-02T10:00:00Z"), saraConv("s2", "active", "2026-08-01T10:00:00Z")],
      [legacy(7), { ...legacy(100001), type: "group" }],
    );
    expect(merged.map(i => i.key)).toEqual(["sara:s1", "legacy:7", "sara:s2"]);
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

  it("bucket preparado para crescer: status Sara → bucket via mapa, filtro de API só com 1 status", () => {
    expect(saraStatusForBucket("ai")).toBe("active");
    expect(saraStatusForBucket("human")).toBe("human_takeover");
    expect(saraStatusForBucket(undefined)).toBeUndefined();
    expect(saraStatusForBucket("closed")).toBeUndefined();
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
