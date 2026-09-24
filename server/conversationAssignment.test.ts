import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { appRouter } from "./routers";
import { conversations, weeklyReports } from "../drizzle/schema";

// "Responsável pela conversa" no canal próprio tem uma fonte só: conversations.assignedUserId.
// assignedAgentId continua no schema, mas nenhuma procedure grava nem lê mais esse campo.
// E as duas marcações de "IA ou humano" (handoffMode e handledByAi) nunca podem discordar.
//
// Banco falso: registra cada insert/update (tabela + valores) e cada select (campos + where).
// Os selects devolvem, em ordem, as linhas de `selectRows`.
type Write = { kind: "insert" | "update"; table: unknown; values: Record<string, unknown> };
const writes: Write[] = [];
const selects: Array<{ fields: unknown; where?: unknown }> = [];
let selectRows: Array<Array<Record<string, unknown>>> = [];

function fakeSelect(fields: unknown) {
  const entry: { fields: unknown; where?: unknown } = { fields };
  selects.push(entry);
  const rows = selectRows.shift() ?? [];
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "leftJoin", "innerJoin", "orderBy", "groupBy", "offset"]) chain[method] = () => chain;
  chain.where = (condition: unknown) => {
    entry.where = condition;
    return chain;
  };
  chain.limit = () => chain;
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

const fakeDb = {
  select: (fields?: unknown) => fakeSelect(fields),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      writes.push({ kind: "insert", table, values });
      const result = Promise.resolve([{ insertId: 99 }]) as Promise<unknown> & { $returningId?: () => Promise<unknown> };
      result.$returningId = () => Promise.resolve([{ id: 99 }]);
      return result;
    },
  }),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => {
      writes.push({ kind: "update", table, values });
      return { where: () => Promise.resolve() };
    },
  }),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockImplementation(async () => fakeDb),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

function createContext(role: "Agent" | "Admin" = "Agent"): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "atendente@example.com",
      email: "atendente@example.com",
      name: "Atendente Teste",
      loginMethod: "password",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      isActive: true,
      avatarUrl: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

/** O único insert/update em `conversations` feito pela procedure. */
function conversationWrite(): Write {
  const found = writes.filter(w => w.table === conversations);
  expect(found).toHaveLength(1);
  return found[0];
}

/** handoffMode e handledByAi precisam dizer a mesma coisa. */
function expectAiHumanFlagsAgree(values: Record<string, unknown>) {
  expect(values).toHaveProperty("handoffMode");
  expect(values).toHaveProperty("handledByAi");
  expect(values.handledByAi).toBe(values.handoffMode === "ai");
}

beforeEach(() => {
  writes.length = 0;
  selects.length = 0;
  selectRows = [];
});

describe("atribuição — cada procedure grava só assignedUserId", () => {
  it("conversations.create: responsável = quem criou, humano (handoffMode e handledByAi explícitos)", async () => {
    await appRouter.createCaller(createContext()).conversations.create({ customerId: 3, channel: "whatsapp" });

    const { kind, values } = conversationWrite();
    expect(kind).toBe("insert");
    expect(values.assignedUserId).toBe(7);
    expect(values.handoffMode).toBe("human");
    expect(values.handledByAi).toBe(false);
    expect(values).not.toHaveProperty("assignedAgentId");
    expectAiHumanFlagsAgree(values);
  });

  it("conversations.forward: responsável = atendente de destino, humano", async () => {
    selectRows = [[{ name: "Destino" }]];
    await appRouter.createCaller(createContext()).conversations.forward({ conversationId: 5, agentId: 12 });

    const { kind, values } = conversationWrite();
    expect(kind).toBe("update");
    expect(values.assignedUserId).toBe(12);
    expect(values.handoffMode).toBe("human");
    expect(values.handledByAi).toBe(false);
    expect(values.handoffAt).toBeInstanceOf(Date);
    expect(values).not.toHaveProperty("assignedAgentId");
    expectAiHumanFlagsAgree(values);
  });

  it("conversations.takeOver: responsável = quem assumiu, humano", async () => {
    await appRouter.createCaller(createContext()).conversations.takeOver({ conversationId: 5 });

    const { values } = conversationWrite();
    expect(values.assignedUserId).toBe(7);
    expect(values).not.toHaveProperty("assignedAgentId");
    expectAiHumanFlagsAgree(values);
  });

  it("conversations.returnToAI: sem responsável, IA", async () => {
    await appRouter.createCaller(createContext()).conversations.returnToAI({ conversationId: 5 });

    const { values } = conversationWrite();
    expect(values.assignedUserId).toBeNull();
    expect(values.handoffMode).toBe("ai");
    expect(values).not.toHaveProperty("assignedAgentId");
    expectAiHumanFlagsAgree(values);
  });

  it("aiAgents.escalate: mesmo efeito do takeOver", async () => {
    await appRouter.createCaller(createContext()).aiAgents.escalate({ conversationId: 5 });

    const { values } = conversationWrite();
    expect(values.assignedUserId).toBe(7);
    expect(values.handoffMode).toBe("human");
    expect(values.handoffAt).toBeInstanceOf(Date);
    expect(values).not.toHaveProperty("assignedAgentId");
    expectAiHumanFlagsAgree(values);
  });

  it("aiAgents.returnToAi: sem responsável, IA", async () => {
    selectRows = [[{ id: 5, aiAgentId: null, customerId: null }]];
    await appRouter.createCaller(createContext()).aiAgents.returnToAi({ conversationId: 5 });

    const { values } = conversationWrite();
    expect(values.assignedUserId).toBeNull();
    expect(values.handoffMode).toBe("ai");
    expect(values).not.toHaveProperty("assignedAgentId");
    expectAiHumanFlagsAgree(values);
  });
});

describe("atribuição — todas as telas leem o mesmo campo", () => {
  const dialect = new MySqlDialect();
  const render = (where: unknown) => dialect.sqlToQuery(where as SQL);

  it("'Minhas' (tags.listUnified) e o filtro por atendente (conversations.list) usam assignedUserId", async () => {
    const caller = appRouter.createCaller(createContext());

    selectRows = [[], []];
    await caller.tags.listUnified({ limit: 3, assignee: "me" });
    const mine = render(selects[0].where);

    selects.length = 0;
    selectRows = [[], [{ total: 0 }]];
    await caller.conversations.list({ agentId: 7 });
    const byAgent = render(selects[0].where);

    for (const query of [mine, byAgent]) {
      expect(query.sql).toMatch(/`conversations`\.`assignedUserId` = \?/);
      expect(query.sql).not.toMatch(/assignedAgentId/);
      expect(query.params).toEqual([7]);
    }
  });

  it("conversations.list: nome do atendente vem de assignedUserId", async () => {
    selectRows = [
      [{ id: 5, customerId: null, assignedUserId: 7, assignedAgentId: 99 }],
      [{ total: 1 }],
      [{ id: 7, name: "Atendente Teste" }], // users
      [], // labels
      [], // última mensagem
    ];
    const result = await appRouter.createCaller(createContext()).conversations.list({});
    expect(result.conversations[0].assignedAgent).toEqual({ id: 7, name: "Atendente Teste" });
    // o nome é buscado pelo id de assignedUserId (7), não pelo legado (99)
    expect(render(selects[2].where).params).toEqual([7]);
  });

  it("reports.generate: ranking de atendentes agrupa por assignedUserId", async () => {
    const now = new Date();
    selectRows = [
      [
        // conversa assumida por "Assumir" (só assignedUserId) — antes não contava
        { id: 1, channel: "whatsapp", createdAt: now, firstResponseAt: null, assignedUserId: 7 },
        // assignedAgentId legado é ignorado
        { id: 2, channel: "whatsapp", createdAt: now, firstResponseAt: null, assignedUserId: null, assignedAgentId: 3 },
      ],
      [{ id: 1 }], // encerradas
      [], [], [], // clientes novos, alertas, alertas resolvidos
      [{ id: 7, name: "Atendente Teste" }, { id: 3, name: "Outra Pessoa" }],
    ];
    await appRouter.createCaller(createContext("Admin")).reports.generate({});

    expect(selects[0].fields).toHaveProperty("assignedUserId");
    expect(selects[0].fields).not.toHaveProperty("assignedAgentId");
    const report = writes.find(w => w.table === weeklyReports);
    expect(report?.values.topAgents).toEqual([
      { agentId: 7, name: "Atendente Teste", closed: 1, avgResponseMinutes: 0 },
    ]);
  });

  it("sla.realtime não depende de atendente (nenhum dos dois campos é lido)", async () => {
    selectRows = [[]];
    await appRouter.createCaller(createContext()).sla.realtime();
    const conversationQuery = selects.find(s => s.fields && typeof s.fields === "object" && "firstResponseAt" in (s.fields as object));
    expect(conversationQuery).toBeDefined();
    expect(conversationQuery!.fields).not.toHaveProperty("assignedAgentId");
    expect(conversationQuery!.fields).not.toHaveProperty("assignedUserId");
  });
});

describe("atribuição — campaigns.send", () => {
  it("conversa nova de campanha: agente de IA em aiAgentId, sem responsável humano", async () => {
    selectRows = [
      [{ id: 1, agentId: 4, message: "Oi", createdBy: 7, filterStatus: null, filterMinHealthScore: null, filterMaxHealthScore: null, filterProgram: null }],
      [{ id: 10 }], // público
      [], // nenhuma conversa aberta do cliente
    ];
    const result = await appRouter.createCaller(createContext()).campaigns.send({ id: 1 });
    expect(result.sent).toBe(1);

    const { kind, values } = conversationWrite();
    expect(kind).toBe("insert");
    expect(values.aiAgentId).toBe(4); // id de aiAgents, nunca num campo de usuário
    expect(values.assignedUserId).toBeNull();
    expect(values).not.toHaveProperty("assignedAgentId");
    expectAiHumanFlagsAgree(values);
  });
});
