import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { TrpcContext } from "./_core/context";

// Nenhum teste chama a Sara: o GET de leitura é mockado.
const getSaraConversationSystemReadOnly = vi.fn();
vi.mock("./saraSupportClient", async importOriginal => ({
  ...(await importOriginal<typeof import("./saraSupportClient")>()),
  getSaraConversationSystemReadOnly: (...args: unknown[]) => getSaraConversationSystemReadOnly(...args),
}));

// Banco falso: a consulta de cursor (sem where) devolve `lastId`; a de notificações
// devolve `rows` e registra o where para inspecionar o SQL.
let lastId: number | null = null;
let rows: Array<{ id: number; eventType: string; saraConversationId: string | null }> = [];
const wheres: unknown[] = [];

const fakeDb = {
  select: () => ({
    from: () => ({
      orderBy: () => ({ limit: async () => (lastId === null ? [] : [{ id: lastId }]) }),
      where: (cond: unknown) => {
        wheres.push(cond);
        return { orderBy: () => ({ limit: async () => rows }) };
      },
    }),
  }),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), upsertUser: vi.fn(), getUserByOpenId: vi.fn() }));

const { pendingSaraNotifications, clearSaraContactLabelCache, SARA_CONTACT_LABEL_TTL_MS } = await import("./saraNotifications");

const dialect = new MySqlDialect();
const detail = (userName: string | null, phoneNumber: string | null) => ({
  conversation: { id: "conv-1", status: "human_takeover", actorId: "7", userName, phoneNumber },
  messages: [],
});

beforeEach(() => {
  lastId = null;
  rows = [];
  wheres.length = 0;
  clearSaraContactLabelCache();
  getSaraConversationSystemReadOnly.mockReset();
});

describe("sara.pendingNotifications", () => {
  it("primeira leitura (sem cursor): devolve o cursor atual e nenhuma notificação", async () => {
    lastId = 41;
    expect(await pendingSaraNotifications(7, null)).toEqual({ cursor: 41, items: [] });
    expect(getSaraConversationSystemReadOnly).not.toHaveBeenCalled();
  });

  it("filtra por usuário (ou para todos), processados, recentes e depois do cursor", async () => {
    await pendingSaraNotifications(7, 10);
    const { sql, params } = dialect.sqlToQuery(wheres[0] as SQL);
    expect(sql).toMatch(/`saraWebhookEvents`\.`id` > \?/);
    expect(sql).toMatch(/`saraWebhookEvents`\.`processedAt` is not null/);
    expect(sql).toMatch(/`saraWebhookEvents`\.`notifyUserId` = \?/);
    expect(sql).toMatch(/`saraWebhookEvents`\.`notifyAll` = \?/);
    expect(params).toContain(10);
    expect(params).toContain(7);
  });

  it("monta o texto com o nome (ou telefone) e avança o cursor só sobre o entregue", async () => {
    rows = [
      { id: 11, eventType: "conversation.message_received", saraConversationId: "conv-1" },
      { id: 12, eventType: "conversation.escalated", saraConversationId: "conv-2" },
    ];
    getSaraConversationSystemReadOnly.mockImplementation(async (id: string) =>
      id === "conv-1" ? detail("Maria", "5548999990000") : detail(null, "5548988887777"),
    );
    const result = await pendingSaraNotifications(7, 10);
    expect(result.cursor).toBe(12);
    expect(result.items).toEqual([
      { id: 11, saraConversationId: "conv-1", title: "Nova mensagem de Maria", body: "Na conversa que você assumiu." },
      { id: 12, saraConversationId: "conv-2", title: "Conversa aguardando atendente", body: "5548988887777 — assumida sem atendente identificado." },
    ]);

    rows = [];
    expect((await pendingSaraNotifications(7, 12)).cursor).toBe(12);
  });

  it("3 usuários lendo a mesma notificação (notifyAll) → 1 GET só na Sara", async () => {
    rows = [{ id: 11, eventType: "conversation.escalated", saraConversationId: "conv-1" }];
    getSaraConversationSystemReadOnly.mockResolvedValue(detail("Maria", null));

    // simultâneos e depois em sequência
    await Promise.all([pendingSaraNotifications(1, 10), pendingSaraNotifications(2, 10), pendingSaraNotifications(3, 10)]);
    await pendingSaraNotifications(4, 10);

    expect(getSaraConversationSystemReadOnly).toHaveBeenCalledTimes(1);
  });

  it("cache expira em ~5 min: depois disso, novo GET", async () => {
    rows = [{ id: 11, eventType: "conversation.escalated", saraConversationId: "conv-1" }];
    getSaraConversationSystemReadOnly.mockResolvedValue(detail("Maria", null));
    const t0 = new Date();
    await pendingSaraNotifications(1, 10, t0);
    await pendingSaraNotifications(2, 10, new Date(t0.getTime() + SARA_CONTACT_LABEL_TTL_MS - 1000));
    expect(getSaraConversationSystemReadOnly).toHaveBeenCalledTimes(1);
    await pendingSaraNotifications(3, 10, new Date(t0.getTime() + SARA_CONTACT_LABEL_TTL_MS + 1000));
    expect(getSaraConversationSystemReadOnly).toHaveBeenCalledTimes(2);
  });

  it("GET falhou: notifica com 'cliente' e não guarda a falha no cache", async () => {
    rows = [{ id: 11, eventType: "conversation.message_received", saraConversationId: "conv-1" }];
    getSaraConversationSystemReadOnly.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(detail("Maria", null));
    expect((await pendingSaraNotifications(7, 10)).items[0].title).toBe("Nova mensagem de cliente");
    expect((await pendingSaraNotifications(7, 10)).items[0].title).toBe("Nova mensagem de Maria");
    expect(getSaraConversationSystemReadOnly).toHaveBeenCalledTimes(2);
  });

  it("procedure usa o id do usuário do contexto", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: { id: 7, role: "Agent", isActive: true, name: "A", email: "a@example.com", openId: "a@example.com" },
      req: { protocol: "https", headers: {} },
      res: { clearCookie: vi.fn(), cookie: vi.fn() },
    } as unknown as TrpcContext);
    await caller.sara.pendingNotifications({ afterId: 10 });
    expect(dialect.sqlToQuery(wheres[0] as SQL).params).toContain(7);
  });
});
