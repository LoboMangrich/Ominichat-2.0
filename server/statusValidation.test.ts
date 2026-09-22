import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { customers, referrals } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// Mock the database — as demais rotas (guruSettings, conversations, etc.) não são exercitadas
// aqui, então getDb() sempre resolvendo para null é suficiente (mesmo padrão de platform.test.ts).
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
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
  };
}

// Bug real (issues #22/#23, achado numa investigação de validação de status/filtros): status e
// filterStatus entravam como z.string() solto em customers.list, broadcasts.create,
// campaigns.previewAudience, campaigns.create e referrals.list — um rótulo em português ou um
// typo não dava erro nenhum, só devolvia lista vazia (ou, em campaigns.create, persistia o valor
// inválido em campaigns.filterStatus). Corrigido usando z.enum(<tabela>.<coluna>.enumValues) —
// nunca uma cópia manual dos valores — para que uma mudança de enum no schema quebre pnpm check
// em vez de falhar em silêncio.
describe("validação de status/filtros usa o enum real (não string livre)", () => {
  const caller = appRouter.createCaller(createContext());

  describe("customers.list", () => {
    it("aceita um status do enum real e passa da validação (DB indisponível devolve vazio)", async () => {
      const result = await caller.customers.list({ status: "Active" });
      expect(result).toEqual({ customers: [], total: 0 });
    });

    it("rejeita status fora do enum com erro, não com lista vazia silenciosa", async () => {
      await expect(
        caller.customers.list({ status: "Ativo" as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("broadcasts.create", () => {
    it("aceita filterStatus do enum real (passa da validação; falha depois por DB indisponível)", async () => {
      await expect(
        caller.broadcasts.create({ title: "T", content: "C", filterStatus: "At Risk" })
      ).rejects.toThrow("DB unavailable");
    });

    it("rejeita filterStatus fora do enum antes de tocar no banco", async () => {
      await expect(
        caller.broadcasts.create({ title: "T", content: "C", filterStatus: "Em Risco" as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("campaigns.previewAudience", () => {
    it("aceita filterStatus do enum real e passa da validação", async () => {
      const result = await caller.campaigns.previewAudience({ filterStatus: "New" });
      expect(result).toEqual({ count: 0, customers: [] });
    });

    it("rejeita filterStatus fora do enum com erro, não audiência zerada em silêncio", async () => {
      await expect(
        caller.campaigns.previewAudience({ filterStatus: "Novo" as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("campaigns.create — item mais grave: filterStatus é persistido em campaigns.filterStatus", () => {
    it("aceita filterStatus do enum real (passa da validação; falha depois por DB indisponível)", async () => {
      await expect(
        caller.campaigns.create({ name: "N", message: "M", filterStatus: "Churned" })
      ).rejects.toThrow("DB unavailable");
    });

    it("rejeita filterStatus fora do enum antes de persistir — não entra mais lixo em campaigns.filterStatus", async () => {
      await expect(
        caller.campaigns.create({ name: "N", message: "M", filterStatus: "Cancelado" as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("referrals.list", () => {
    it("aceita status e type do enum real", async () => {
      const result = await caller.referrals.list({ status: "Pending", type: "Upsell" });
      expect(result).toEqual({ referrals: [], total: 0 });
    });

    it("rejeita status fora do enum — 'Pendente' (rótulo em português) não é mais aceito", async () => {
      await expect(
        caller.referrals.list({ status: "Pendente" as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejeita type fora do enum", async () => {
      await expect(
        caller.referrals.list({ type: "Indicação" as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("referrals.updateStatus", () => {
    it("aceita status do enum real (passa da validação; falha depois por DB indisponível)", async () => {
      await expect(
        caller.referrals.updateStatus({ id: 1, status: "Converted" })
      ).rejects.toThrow("DB unavailable");
    });

    it("rejeita status fora do enum", async () => {
      await expect(
        caller.referrals.updateStatus({ id: 1, status: "Convertido" as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });
});

describe("os enums usados na validação vêm de drizzle/schema.ts, não de cópia manual", () => {
  it("customers.status.enumValues é o enum real usado nos testes acima", () => {
    expect(customers.status.enumValues).toEqual(["Active", "At Risk", "Churned", "New"]);
  });

  it("referrals.status.enumValues / referrals.type.enumValues são os enums reais usados acima", () => {
    expect(referrals.status.enumValues).toEqual(["Pending", "Contacted", "Converted", "Lost"]);
    expect(referrals.type.enumValues).toEqual(["Referral", "Upsell"]);
  });
});
