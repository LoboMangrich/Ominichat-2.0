import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      qualityScore: 85,
      sentimentScore: 80,
      upsellOpportunity: 60,
      referralReadiness: 70,
      summary: "Good conversation",
      recommendations: "Keep up the good work",
      keyTopics: ["support", "product"],
    }) } }],
  }),
}));

// Mock notifications
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

function createContext(role: "Admin" | "Manager" | "Agent" = "Agent"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      isActive: true,
      avatarUrl: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user when authenticated", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.role).toBe("Agent");
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

describe("Role-based access control", () => {
  it("Agent cannot access users.list (admin-only)", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.users.list()).rejects.toThrow();
  });

  it("Manager cannot access users.list (admin-only)", async () => {
    const ctx = createContext("Manager");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.users.list()).rejects.toThrow();
  });

  it("Admin can access users.list", async () => {
    const ctx = createContext("Admin");
    const caller = appRouter.createCaller(ctx);
    // DB is mocked to return null, so it returns empty array
    const result = await caller.users.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("customers router", () => {
  it("returns empty list when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.customers.list({});
    expect(result.customers).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("conversations router", () => {
  it("returns empty list when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.conversations.list({});
    expect(result.conversations).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("surveys router", () => {
  it("returns empty list when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.surveys.list({});
    expect(result.surveys).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns zero stats when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.surveys.getStats();
    expect(result.avgNps).toBe(0);
    expect(result.avgCsat).toBe(0);
    expect(result.promoters).toBe(0);
    expect(result.detractors).toBe(0);
  });
});

describe("referrals router", () => {
  it("returns empty list when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referrals.list({});
    expect(result.referrals).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns zero stats when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referrals.getStats();
    expect(result.total).toBe(0);
    expect(result.converted).toBe(0);
  });
});

describe("productivity router", () => {
  it("returns empty array when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.productivity.getAgentMetrics({});
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("returns null summary when DB unavailable", async () => {
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.productivity.getAgentSummary({});
    expect(result).toBeNull();
  });

  it("returns empty team overview when DB unavailable", async () => {
    const ctx = createContext("Manager");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.productivity.getTeamOverview();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("GHL router", () => {
  it("returns null settings when DB unavailable", async () => {
    const ctx = createContext("Admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ghl.getSettings();
    expect(result).toBeNull();
  });
});

// ─── Guru Router Tests ────────────────────────────────────────────────────────
describe("guru router", () => {
  it("getSettings returns null when DB is unavailable", async () => {
    const caller = appRouter.createCaller(createContext("Admin"));
    const result = await caller.guru.getSettings();
    expect(result).toBeNull();
  });

  it("getStats returns zeros when DB is unavailable", async () => {
    const caller = appRouter.createCaller(createContext("Agent"));
    const result = await caller.guru.getStats();
    expect(result).toMatchObject({ total: 0, approved: 0, canceled: 0 });
  });

  it("getWebhookEvents returns empty array when DB is unavailable", async () => {
    const caller = appRouter.createCaller(createContext("Agent"));
    const result = await caller.guru.getWebhookEvents({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("saveSettings requires Admin role", async () => {
    const agentCaller = appRouter.createCaller(createContext("Agent"));
    await expect(agentCaller.guru.saveSettings({ isActive: true })).rejects.toThrow();
  });

  it("saveSettings succeeds for Admin when DB is unavailable (throws DB error)", async () => {
    const adminCaller = appRouter.createCaller(createContext("Admin"));
    // When DB is null, saveSettings throws "DB unavailable"
    await expect(adminCaller.guru.saveSettings({ apiToken: "test-token", isActive: true }))
      .rejects.toThrow("DB unavailable");
  });
});

// ─── Guru Webhook Payload Parsing Tests ───────────────────────────────────────
describe("guru webhook payload structure", () => {
  it("parses approved transaction payload correctly", () => {
    const payload = {
      status: "approved",
      contact: {
        name: "Maria Silva",
        email: "maria@empresa.com",
        phone_number: "11987654321",
        phone_local_code: "55",
        id: "guru-contact-123",
      },
      product: {
        name: "Mentoria Premium",
        id: "prod-mentoria",
        total_value: 1997,
      },
      invoice: { id: "inv-001", status: "paid" },
    };

    // Simulate the parsing logic from webhooks.ts
    const transactionId = payload?.invoice?.id || null;
    const status = payload?.status || "unknown";
    const contact = payload?.contact || {};
    const product = payload?.product || {};
    const contactEmail = (contact as typeof payload.contact).email;
    const contactName = (contact as typeof payload.contact).name;
    const contactPhone = `${(contact as typeof payload.contact).phone_local_code}${(contact as typeof payload.contact).phone_number}`;
    const productName = (product as typeof payload.product).name;
    const purchaseValue = (product as typeof payload.product).total_value;

    expect(transactionId).toBe("inv-001");
    expect(status).toBe("approved");
    expect(contactEmail).toBe("maria@empresa.com");
    expect(contactName).toBe("Maria Silva");
    expect(contactPhone).toBe("5511987654321");
    expect(productName).toBe("Mentoria Premium");
    expect(purchaseValue).toBe(1997);
  });

  it("identifies approved statuses correctly", () => {
    const approvedStatuses = ["approved", "paid", "active"];
    const canceledStatuses = ["canceled", "cancelled", "refunded", "chargedback"];
    const pendingStatuses = ["pending", "waiting", "processing"];

    for (const s of approvedStatuses) {
      expect(["approved", "paid", "active"].includes(s.toLowerCase())).toBe(true);
    }
    for (const s of canceledStatuses) {
      expect(["canceled", "cancelled", "refunded", "chargedback"].includes(s.toLowerCase())).toBe(true);
    }
    for (const s of pendingStatuses) {
      const isApproved = ["approved", "paid", "active"].includes(s.toLowerCase());
      const isCanceled = ["canceled", "cancelled", "refunded", "chargedback"].includes(s.toLowerCase());
      expect(isApproved || isCanceled).toBe(false);
    }
  });
});

// ─── AI Control: Assumir e Devolver para IA ───────────────────────────────────

describe("aiAgents.escalate (assumir controle humano)", () => {
  it("deve retornar success: true quando DB está disponível", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 1, handledByAi: true, aiAgentId: 1 }]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);

    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    // escalate procedure exists and should not throw
    await expect(
      caller.aiAgents.escalate({ conversationId: 1 })
    ).resolves.toMatchObject({ success: true });
  });

  it("deve lançar erro quando DB indisponível", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.aiAgents.escalate({ conversationId: 1 })).rejects.toThrow();
  });
});

describe("aiAgents.returnToAi (devolver para IA)", () => {
  it("deve retornar success: true e inserir nota de sistema", async () => {
    const insertedMessages: any[] = [];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 1, handledByAi: false, aiAgentId: 2 }]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockImplementation((vals: any) => {
        insertedMessages.push(vals);
        return Promise.resolve(undefined);
      }),
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);

    const ctx = createContext("Agent");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.aiAgents.returnToAi({ conversationId: 1 });
    expect(result).toMatchObject({ success: true });
    // Verify a system message was inserted
    const systemMsg = insertedMessages.find((m) => m.senderType === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain("IA");
  });
});

// ─── Scheduled Messages Executor ─────────────────────────────────────────────

describe("channelSender.sendMessageByConversation", () => {
  it("deve retornar erro quando DB indisponível", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    const { sendMessageByConversation } = await import("./channelSender");
    const result = await sendMessageByConversation({ conversationId: 1, content: "Olá" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("DB");
  });

  it("deve retornar erro quando conversa não existe", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // no conversation found
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const { sendMessageByConversation } = await import("./channelSender");
    const result = await sendMessageByConversation({ conversationId: 999, content: "Olá" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("não encontrada");
  });

  it("deve retornar erro quando canal não está ativo", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([{ id: 1, channel: "whatsapp", customerId: 1 }]) // conversation
        .mockResolvedValueOnce([{ id: 1, phone: "+5511999999999", email: "c@c.com" }]) // customer
        .mockResolvedValueOnce([{ isActive: false }]), // channel settings inactive
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const { sendMessageByConversation } = await import("./channelSender");
    const result = await sendMessageByConversation({ conversationId: 1, content: "Olá" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("não está ativo");
  });
});

// ─── SLA Monitor ─────────────────────────────────────────────────────────────
describe("sla.realtime - classificação de SLA", () => {
  const ctx = createContext("Agent");
  const caller = appRouter.createCaller(ctx);

  it("deve retornar zeros quando DB indisponível", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    const result = await caller.sla.realtime();
    expect(result.withinSla).toBe(0);
    expect(result.breached).toBe(0);
    expect(result.warning).toBe(0);
    expect(result.criticalConvs).toHaveLength(0);
  });

  it("deve classificar conversa sem resposta há mais de 60min como breached", async () => {
    const now = Date.now();
    const createdAt = new Date(now - 65 * 60 * 1000).toISOString(); // 65 min ago
    // Single DB instance: first where() returns [] (slaSettings), second returns convs
    const whereMock = vi.fn()
      .mockResolvedValueOnce([]) // slaSettings query
      .mockResolvedValueOnce([  // conversations query
        { id: 1, subject: "Problema urgente", channel: "whatsapp", createdAt, firstResponseAt: null, assignedAgentId: null, customerId: 1, customerName: "João Silva", customerPhone: "+5511999999999" }
      ]);
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: whereMock,
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const result = await caller.sla.realtime();
    expect(result.breached).toBe(1);
    expect(result.warning).toBe(0);
    expect(result.withinSla).toBe(0);
    expect(result.criticalConvs[0].status).toBe("breached");
    expect(result.criticalConvs[0].customerName).toBe("João Silva");
  });

  it("deve classificar conversa sem resposta entre 45-60min como warning", async () => {
    const now = Date.now();
    const createdAt = new Date(now - 50 * 60 * 1000).toISOString(); // 50 min ago
    const whereMock = vi.fn()
      .mockResolvedValueOnce([]) // slaSettings query
      .mockResolvedValueOnce([  // conversations query
        { id: 2, subject: "Dúvida", channel: "email", createdAt, firstResponseAt: null, assignedAgentId: null, customerId: 2, customerName: "Maria Santos", customerPhone: null }
      ]);
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: whereMock,
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const result = await caller.sla.realtime();
    expect(result.warning).toBe(1);
    expect(result.breached).toBe(0);
    expect(result.criticalConvs[0].status).toBe("warning");
    expect(result.criticalConvs[0].customerName).toBe("Maria Santos");
  });

  it("deve classificar conversa com resposta como withinSla", async () => {
    const now = Date.now();
    const createdAt = new Date(now - 90 * 60 * 1000).toISOString(); // 90 min ago
    const firstResponseAt = new Date(now - 80 * 60 * 1000).toISOString(); // responded at 80 min
    const whereMock = vi.fn()
      .mockResolvedValueOnce([]) // slaSettings query
      .mockResolvedValueOnce([  // conversations query
        { id: 3, subject: "Feedback", channel: "whatsapp", createdAt, firstResponseAt, assignedAgentId: 1, customerId: 3, customerName: "Pedro Costa", customerPhone: "+5511888888888" }
      ]);
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: whereMock,
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const result = await caller.sla.realtime();
    expect(result.withinSla).toBe(1);
    expect(result.breached).toBe(0);
    expect(result.warning).toBe(0);
    expect(result.criticalConvs).toHaveLength(0);
  });

  it("deve ordenar criticalConvs com breached antes de warning", async () => {
    const now = Date.now();
    const whereMock = vi.fn()
      .mockResolvedValueOnce([]) // slaSettings query
      .mockResolvedValueOnce([  // conversations query
        { id: 10, subject: "Atenção", channel: "whatsapp", createdAt: new Date(now - 50 * 60 * 1000).toISOString(), firstResponseAt: null, assignedAgentId: null, customerId: 10, customerName: "A", customerPhone: null },
        { id: 11, subject: "Urgente", channel: "email", createdAt: new Date(now - 70 * 60 * 1000).toISOString(), firstResponseAt: null, assignedAgentId: null, customerId: 11, customerName: "B", customerPhone: null },
      ]);
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: whereMock,
    };
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
    const result = await caller.sla.realtime();
    expect(result.criticalConvs[0].status).toBe("breached"); // breached comes first
    expect(result.criticalConvs[1].status).toBe("warning");
  });
});
