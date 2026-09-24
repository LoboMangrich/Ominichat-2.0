import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { appRouter } from "./routers";

// tags.listUnified ganhou excludeGroups e status para a tela única de Conversas (/sara): sem ele, até
// 50 grupos entram junto com as conversas e ocupam vagas do limit — e a tela deixa de saber
// se "tem mais". O padrão (false) precisa manter /atendimentos exatamente como era.
//
// Banco falso: cada select(...) registra o limit pedido e devolve as linhas já cortadas por
// ele, como o MySQL faria. A 1ª consulta é a de conversas; a 2ª, a de grupos.
const limits: number[] = [];
// where de cada consulta, na ordem (conversas, grupos) — para inspecionar o SQL gerado.
const wheres: unknown[] = [];
let tables: Array<Array<Record<string, unknown>>> = [];

function fakeQuery(rows: Array<Record<string, unknown>>) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "leftJoin", "orderBy"]) chain[method] = () => chain;
  chain.where = (condition: unknown) => {
    wheres.push(condition);
    return chain;
  };
  chain.limit = (n: number) => {
    limits.push(n);
    return Promise.resolve(rows.slice(0, n));
  };
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn().mockImplementation(async () => {
    let call = 0;
    return { select: () => fakeQuery(tables[call++] ?? []) };
  }),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

function createContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "Agent",
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

const conv = (id: number, minutesAgo: number) => ({
  id,
  type: "conversation",
  lastMessageAt: new Date(Date.now() - minutesAgo * 60_000),
  handledByAi: true,
  channel: "whatsapp",
});
const group = (id: number, minutesAgo: number) => ({
  id: id + 100000,
  type: "group",
  lastMessageAt: new Date(Date.now() - minutesAgo * 60_000),
  handledByAi: 0,
  channel: null,
});

describe("tags.listUnified — excludeGroups", () => {
  beforeEach(() => {
    limits.length = 0;
    // 3 conversas mais antigas que 3 grupos: misturados, os grupos tomam as vagas do limit.
    tables = [
      [conv(1, 30), conv(2, 40), conv(3, 50)],
      [group(1, 1), group(2, 2), group(3, 3)],
    ];
  });

  it("padrão (sem excludeGroups): comportamento de /atendimentos intacto — grupos entram e ocupam vagas", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.tags.listUnified({ limit: 3 });

    expect(limits).toEqual([3, 50]);
    expect(result.map(r => r.type)).toEqual(["group", "group", "group"]);
  });

  it("excludeGroups: true — consulta de grupos usa limit 0 e só vêm conversas, resposta cheia", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.tags.listUnified({ limit: 3, excludeGroups: true });

    expect(limits).toEqual([3, 0]);
    expect(result.map(r => r.id)).toEqual([1, 2, 3]);
    expect(result).toHaveLength(3); // cheia = "tem mais" continua valendo na tela
  });

  it("devolve handledByAi e channel das conversas (só leitura)", async () => {
    const caller = appRouter.createCaller(createContext());
    const [first] = await caller.tags.listUnified({ limit: 3, excludeGroups: true });

    expect(first).toMatchObject({ handledByAi: true, channel: "whatsapp" });
  });
});

describe("tags.listUnified — status (filtro por status real, não por conversationTagAssignments)", () => {
  const dialect = new MySqlDialect();
  const conversationsWhereSql = () => {
    const where = wheres[0];
    return where ? dialect.sqlToQuery(where as SQL) : null;
  };

  beforeEach(() => {
    limits.length = 0;
    wheres.length = 0;
    tables = [[], []];
  });

  it("sem status: consulta de conversas sem filtro nenhum (/atendimentos intacto)", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.tags.listUnified({ limit: 3, excludeGroups: true });

    expect(conversationsWhereSql()).toBeNull();
  });

  it.each(["Open", "Waiting", "Closed"] as const)("status %s filtra conversations.status, sem subselect de tags", async status => {
    const caller = appRouter.createCaller(createContext());
    await caller.tags.listUnified({ limit: 3, excludeGroups: true, status });

    const query = conversationsWhereSql();
    expect(query?.sql).toMatch(/`conversations`\.`status` = \?/);
    expect(query?.sql).not.toMatch(/conversationTagAssignments/);
    expect(query?.params).toEqual([status]);
  });

  it("rejeita status fora do enum (rótulo em português)", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.tags.listUnified({ limit: 3, status: "Aberto" as never }),
    ).rejects.toThrow();
  });
});

describe("tags.listUnified — assignee (abas Minhas / Não atribuídas; quem assumiu = assignedUserId)", () => {
  const dialect = new MySqlDialect();
  const conversationsWhere = () => (wheres[0] ? dialect.sqlToQuery(wheres[0] as SQL) : null);

  beforeEach(() => {
    limits.length = 0;
    wheres.length = 0;
    tables = [[], []];
  });

  it("sem assignee: nada muda (sem filtro de atribuição, grupos como antes)", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.tags.listUnified({ limit: 3 });
    expect(conversationsWhere()).toBeNull();
    expect(limits).toEqual([3, 50]);
  });

  it("Minhas: assignedUserId = usuário logado (id vem do contexto, não do client); sem grupos", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.tags.listUnified({ limit: 3, assignee: "me" });

    const query = conversationsWhere();
    expect(query?.sql).toMatch(/`conversations`\.`assignedUserId` = \?/);
    expect(query?.sql).not.toMatch(/assignedAgentId/);
    expect(query?.params).toEqual([1]); // createContext → user.id 1
    expect(limits).toEqual([3, 0]);
  });

  it("Não atribuídas: assignedUserId vazio e conversa não encerrada; sem grupos", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.tags.listUnified({ limit: 3, assignee: "unassigned" });

    const query = conversationsWhere();
    expect(query?.sql).toMatch(/`conversations`\.`assignedUserId` is null/);
    expect(query?.sql).toMatch(/`conversations`\.`status` <> \?/);
    expect(query?.params).toEqual(["Closed"]);
    expect(limits).toEqual([3, 0]);
  });

  it("combina com status (ex.: Minhas + Aguardando)", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.tags.listUnified({ limit: 3, assignee: "me", status: "Waiting", excludeGroups: true });

    const query = conversationsWhere();
    expect(query?.sql).toMatch(/`conversations`\.`status` = \?/);
    expect(query?.sql).toMatch(/`conversations`\.`assignedUserId` = \?/);
    expect(query?.params).toEqual(["Waiting", 1]);
  });

  it("rejeita assignee fora do enum", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.tags.listUnified({ limit: 3, assignee: "todos" as never })).rejects.toThrow();
  });
});
