import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { Response } from "express";
import { saraWebhookEvents, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { RawBodyRequest } from "./_core/webhookAuth";

// Nenhum teste chama a Sara: o GET de leitura é mockado.
const getSaraConversationSystemReadOnly = vi.fn();
vi.mock("./saraSupportClient", () => ({
  getSaraConversationSystemReadOnly: (...args: unknown[]) => getSaraConversationSystemReadOnly(...args),
}));

// ─── Banco falso em memória ──────────────────────────────────────────────────
// saraWebhookEvents com UNIQUE de eventId (como o MySQL: ER_DUP_ENTRY embrulhado pelo
// drizzle em .cause) e users. As condições são lidas do SQL gerado pelo drizzle.
type EventRow = typeof saraWebhookEvents.$inferSelect;
let events: EventRow[] = [];
let userRows: Array<{ id: number; isActive: boolean }> = [];
let nextId = 1;
const dialect = new MySqlDialect();
const render = (cond: unknown) => dialect.sqlToQuery(cond as SQL);

function selectFrom(fields: Record<string, unknown> | undefined, table: unknown, cond: unknown) {
  const { sql, params } = render(cond);
  if (table === users) return userRows.filter(u => u.id === params[0] && u.isActive).map(u => ({ id: u.id }));
  if (table !== saraWebhookEvents) throw new Error("tabela inesperada");
  if (!fields) return events.filter(e => e.id === params[0]); // select() por id
  // reprocessamento: processedAt/processingError nulos e receivedAt >= corte
  expect(sql).toMatch(/`processedAt` is null/);
  expect(sql).toMatch(/`processingError` is null/);
  // o drizzle converte o Date do timestamp em "YYYY-MM-DD HH:MM:SS.sss" (UTC) antes de mandar ao MySQL
  const raw = params[0];
  const cutoff = raw instanceof Date ? raw : new Date(`${String(raw).replace(" ", "T")}Z`);
  return events
    .filter(e => e.processedAt === null && e.processingError === null && e.receivedAt >= cutoff)
    .map(e => ({ id: e.id }));
}

const fakeDb = {
  select: (fields?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: (cond: unknown) => {
        const run = () => selectFrom(fields, table, cond);
        return {
          limit: (n: number) => Promise.resolve(run().slice(0, n)),
          then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, ko),
        };
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: (v: { eventId: string; eventType: string; saraConversationId: string | null }) => ({
      $returningId: async () => {
        expect(table).toBe(saraWebhookEvents);
        if (events.some(e => e.eventId === v.eventId)) {
          throw Object.assign(new Error("Failed query"), { cause: { code: "ER_DUP_ENTRY", errno: 1062 } });
        }
        const row: EventRow = {
          id: nextId++,
          eventId: v.eventId,
          eventType: v.eventType,
          saraConversationId: v.saraConversationId,
          receivedAt: new Date(),
          processedAt: null,
          processingError: null,
          notifyUserId: null,
          notifyAll: false,
        };
        events.push(row);
        return [{ id: row.id }];
      },
    }),
  }),
  update: (table: unknown) => ({
    set: (values: Partial<EventRow>) => ({
      where: async (cond: unknown) => {
        expect(table).toBe(saraWebhookEvents);
        const { sql, params } = render(cond);
        // toda escrita de processamento exige processedAt nulo (idempotência)
        expect(sql).toMatch(/`processedAt` is null/);
        for (const e of events) if (e.id === params[0] && e.processedAt === null) Object.assign(e, values);
      },
    }),
  }),
};

vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb) }));

const { handleSaraWebhook, processSaraWebhookEvent, reprocessPendingSaraWebhookEvents } = await import("./saraWebhook");

// ─── Requisição / resposta falsas ────────────────────────────────────────────
const SECRET = "sara-test-secret";
const sign = (raw: Buffer, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("hex");

function payload(eventType: string, eventId = `evt-${Math.random()}`, conversationId = "conv-1") {
  return { eventId, eventType, timestamp: new Date().toISOString(), data: { conversationId, phoneNumber: "5548999990000" } };
}

function fakeReq(body: unknown, headers: Record<string, string> = {}, raw?: Buffer): RawBodyRequest {
  const rawBody = raw ?? Buffer.from(JSON.stringify(body));
  return { headers, rawBody, body: JSON.parse(rawBody.toString()) } as unknown as RawBodyRequest;
}

function signedReq(body: unknown) {
  const raw = Buffer.from(JSON.stringify(body));
  return fakeReq(body, { "x-sara-signature": sign(raw) }, raw);
}

function fakeRes() {
  const res = { statusCode: 0, body: undefined as unknown, headersSent: false } as {
    statusCode: number; body: unknown; headersSent: boolean;
  } & Record<string, unknown>;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (b: unknown) => { res.body = b; res.headersSent = true; return res; };
  res.end = () => { res.headersSent = true; return res; };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

const conversation = (status: string, actorId: string | null) => ({
  conversation: { id: "conv-1", status, actorId, userName: "Cliente", phoneNumber: "5548999990000" },
  messages: [],
});

const logSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  events = [];
  userRows = [{ id: 7, isActive: true }, { id: 8, isActive: false }];
  nextId = 1;
  ENV.supportOutboundWebhookSecret = SECRET;
  getSaraConversationSystemReadOnly.mockReset();
  logSpies.push(vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"));
  for (const spy of logSpies) spy.mockImplementation(() => {});
});

afterEach(() => {
  // LGPD: nenhum log com telefone ou nome do cliente
  for (const spy of logSpies) {
    for (const call of spy.mock.calls) {
      const line = call.map(String).join(" ");
      expect(line).not.toContain("5548999990000");
      expect(line).not.toContain("Cliente");
    }
    spy.mockRestore();
  }
  logSpies.length = 0;
});

describe("POST /api/webhooks/sara — assinatura", () => {
  it("assinatura válida → 200 e grava o evento", async () => {
    const res = fakeRes();
    await handleSaraWebhook(signedReq(payload("conversation.closed", "e-ok")), res);
    expect(res.statusCode).toBe(200);
    expect(events.map(e => e.eventId)).toEqual(["e-ok"]);
  });

  it("assinatura inválida → 401 sem corpo, nada gravado", async () => {
    const res = fakeRes();
    await handleSaraWebhook(fakeReq(payload("conversation.closed"), { "x-sara-signature": "deadbeef" }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it("assinatura ausente → 401", async () => {
    const res = fakeRes();
    await handleSaraWebhook(fakeReq(payload("conversation.closed")), res);
    expect(res.statusCode).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("secret ausente → sempre nega, mesmo com assinatura 'válida' para secret vazio", async () => {
    ENV.supportOutboundWebhookSecret = "";
    const body = payload("conversation.closed");
    const raw = Buffer.from(JSON.stringify(body));
    const res = fakeRes();
    await handleSaraWebhook(fakeReq(body, { "x-sara-signature": sign(raw, "") }, raw), res);
    expect(res.statusCode).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("raw body alterado depois de assinado → 401", async () => {
    const body = payload("conversation.closed");
    const raw = Buffer.from(JSON.stringify(body));
    const tampered = Buffer.from(JSON.stringify({ ...body, eventType: "conversation.escalated" }));
    const res = fakeRes();
    await handleSaraWebhook(fakeReq(body, { "x-sara-signature": sign(raw) }, tampered), res);
    expect(res.statusCode).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("assinado mas fora do formato → 400", async () => {
    const res = fakeRes();
    await handleSaraWebhook(signedReq({ eventType: "conversation.closed" }), res);
    expect(res.statusCode).toBe(400);
    expect(events).toHaveLength(0);
  });
});

describe("POST /api/webhooks/sara — dedup e processamento", () => {
  it("eventId repetido → 200 sem processar de novo", async () => {
    getSaraConversationSystemReadOnly.mockResolvedValue(conversation("human_takeover", "7"));
    const body = payload("conversation.message_received", "e-dup");

    await handleSaraWebhook(signedReq(body), fakeRes());
    await vi.waitFor(() => expect(events[0].processedAt).not.toBeNull());

    const res = fakeRes();
    await handleSaraWebhook(signedReq(body), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, duplicate: true });
    await new Promise(r => setImmediate(r));
    expect(events).toHaveLength(1);
    expect(getSaraConversationSystemReadOnly).toHaveBeenCalledTimes(1);
  });

  it("evento desconhecido → 200, registrado, sem efeito e sem GET na Sara", async () => {
    const res = fakeRes();
    await handleSaraWebhook(signedReq(payload("conversation.something_new", "e-new")), res);
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(events[0].processedAt).not.toBeNull());
    expect(events[0]).toMatchObject({ eventType: "conversation.something_new", notifyUserId: null, notifyAll: false });
    expect(getSaraConversationSystemReadOnly).not.toHaveBeenCalled();
  });

  it("a resposta sai antes do processamento", async () => {
    let releaseGet!: (v: unknown) => void;
    getSaraConversationSystemReadOnly.mockReturnValue(new Promise(r => { releaseGet = r; }));

    const res = fakeRes();
    await handleSaraWebhook(signedReq(payload("conversation.message_received", "e-slow")), res);
    // 200 já saiu; o processamento está parado esperando o GET
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(getSaraConversationSystemReadOnly).toHaveBeenCalled());
    expect(events[0].processedAt).toBeNull();

    releaseGet(conversation("human_takeover", "7"));
    await vi.waitFor(() => expect(events[0].processedAt).not.toBeNull());
    expect(events[0].notifyUserId).toBe(7);
  });

  it("closed → só registra, sem GET", async () => {
    await handleSaraWebhook(signedReq(payload("conversation.closed", "e-closed")), fakeRes());
    await vi.waitFor(() => expect(events[0].processedAt).not.toBeNull());
    expect(events[0]).toMatchObject({ notifyUserId: null, notifyAll: false });
    expect(getSaraConversationSystemReadOnly).not.toHaveBeenCalled();
  });
});

describe("efeito de cada evento", () => {
  async function receive(eventType: string) {
    await handleSaraWebhook(signedReq(payload(eventType)), fakeRes());
    await vi.waitFor(() => expect(events.at(-1)!.processedAt ?? events.at(-1)!.processingError).not.toBeNull());
    return events.at(-1)!;
  }

  it("message_received em human_takeover com atendente nosso ativo → notifica esse atendente", async () => {
    getSaraConversationSystemReadOnly.mockResolvedValue(conversation("human_takeover", "7"));
    expect(await receive("conversation.message_received")).toMatchObject({ notifyUserId: 7, notifyAll: false });
  });

  it("message_received com a IA, sem actorId, ou atendente inativo/desconhecido → ninguém", async () => {
    for (const conv of [conversation("active", "7"), conversation("human_takeover", null), conversation("human_takeover", "8"), conversation("human_takeover", "999")]) {
      getSaraConversationSystemReadOnly.mockResolvedValueOnce(conv);
      expect(await receive("conversation.message_received")).toMatchObject({ notifyUserId: null, notifyAll: false });
    }
  });

  it("escalated com actorId nulo → todos; com actorId preenchido → ninguém", async () => {
    getSaraConversationSystemReadOnly.mockResolvedValueOnce(conversation("human_takeover", null));
    expect(await receive("conversation.escalated")).toMatchObject({ notifyUserId: null, notifyAll: true });
    getSaraConversationSystemReadOnly.mockResolvedValueOnce(conversation("human_takeover", "7"));
    expect(await receive("conversation.escalated")).toMatchObject({ notifyUserId: null, notifyAll: false });
  });

  it("GET na Sara falhou → processingError curto, processedAt nulo", async () => {
    getSaraConversationSystemReadOnly.mockRejectedValue(Object.assign(new Error("x"), { status: 503 }));
    const row = await receive("conversation.message_received");
    expect(row.processedAt).toBeNull();
    expect(row.processingError).toBe("sara_get_failed:503");
  });
});

describe("reprocessamento na inicialização", () => {
  function seed(overrides: Partial<EventRow>): EventRow {
    const row: EventRow = {
      id: nextId++, eventId: `seed-${nextId}`, eventType: "conversation.escalated", saraConversationId: "conv-1",
      receivedAt: new Date(), processedAt: null, processingError: null, notifyUserId: null, notifyAll: false,
      ...overrides,
    };
    events.push(row);
    return row;
  }

  it("retoma só pendentes da última 1h que não falharam", async () => {
    getSaraConversationSystemReadOnly.mockResolvedValue(conversation("human_takeover", null));
    const now = new Date();
    const pending = seed({});
    const old = seed({ receivedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) });
    const failed = seed({ processingError: "sara_get_failed:500" });
    const done = seed({ processedAt: new Date() });

    expect(await reprocessPendingSaraWebhookEvents(now)).toBe(1);
    expect(pending).toMatchObject({ notifyAll: true });
    expect(pending.processedAt).not.toBeNull();
    expect(old.processedAt).toBeNull();
    expect(failed.processedAt).toBeNull();
    expect(done.notifyAll).toBe(false);
  });

  it("idempotente: processar duas vezes não refaz nada (uma linha = uma notificação)", async () => {
    getSaraConversationSystemReadOnly.mockResolvedValue(conversation("human_takeover", null));
    const row = seed({});

    await processSaraWebhookEvent(row.id);
    const firstProcessedAt = row.processedAt;
    await processSaraWebhookEvent(row.id);
    expect(await reprocessPendingSaraWebhookEvents()).toBe(0);

    expect(row.processedAt).toBe(firstProcessedAt);
    expect(getSaraConversationSystemReadOnly).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });
});
