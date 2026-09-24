import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// tags.listUnified ganhou excludeGroups para a tela única de Conversas (/sara): sem ele, até
// 50 grupos entram junto com as conversas e ocupam vagas do limit — e a tela deixa de saber
// se "tem mais". O padrão (false) precisa manter /atendimentos exatamente como era.
//
// Banco falso: cada select(...) registra o limit pedido e devolve as linhas já cortadas por
// ele, como o MySQL faria. A 1ª consulta é a de conversas; a 2ª, a de grupos.
const limits: number[] = [];
let tables: Array<Array<Record<string, unknown>>> = [];

function fakeQuery(rows: Array<Record<string, unknown>>) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "leftJoin", "where", "orderBy"]) chain[method] = () => chain;
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
