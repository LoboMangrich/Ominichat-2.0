import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Express, Request, Response } from "express";
import { messages } from "../drizzle/schema";
import { getDb } from "./db";
import { findOrCreateOpenConversation } from "./conversationLookup";
import { registerWebhooks } from "./webhooks";

// Garante, por comportamento, que os 5 receptores de mensagem delegam a escolha da conversa a
// findOrCreateOpenConversation (com o canal certo) e gravam a mensagem na conversa que ela
// devolve. Se algum receptor voltar a ter uma consulta própria, a função não é chamada e o teste
// quebra — sem depender do texto do código-fonte (regex quebra ao rodar pnpm format).

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./conversationLookup", () => ({
  findOrCreateOpenConversation: vi.fn(),
}));
// Assinatura Meta/Telegram é testada à parte (webhookAuth); aqui o foco é o que vem depois dela.
vi.mock("./_core/webhookAuth", () => ({
  verifyMetaSignature: () => true,
  verifyTelegramSecret: () => true,
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./playbookEngine", () => ({ startJourneyForCustomer: vi.fn() }));
vi.mock("./conversationRouter", () => ({ routeConversationToAgent: vi.fn() }));
vi.mock("./channelSender", () => ({ sendMessageByConversation: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./csvImport", () => ({ registerCsvImport: vi.fn() }));

const CUSTOMER_ID = 42;
const CONVERSATION_ID = 777;

// Fake do Drizzle: todo select devolve [] (cliente ainda não existe), todo insert devolve
// { id: CUSTOMER_ID } e os inserts em `messages` ficam registrados para conferência.
function createFakeDb() {
  const messageInserts: any[] = [];
  const emptySelect: any = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "then"
          ? (resolve: (v: unknown[]) => void) => resolve([])
          : () => emptySelect,
    }
  );
  const db = {
    select: () => emptySelect,
    insert: (table: unknown) => ({
      values: (row: any) => {
        if (table === messages) messageInserts.push(row);
        const done = Promise.resolve();
        return Object.assign(done, {
          $returningId: async () => [{ id: CUSTOMER_ID }],
        });
      },
    }),
  };
  return { db, messageInserts };
}

function captureRoutes() {
  const routes: Record<
    string,
    (req: Request, res: Response) => Promise<unknown>
  > = {};
  const register = (path: string, ...handlers: any[]) => {
    routes[path] = handlers[handlers.length - 1];
  };
  const app = {
    post: register,
    get: () => {},
    use: () => {},
  } as unknown as Express;
  registerWebhooks(app);
  return routes;
}

function fakeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.sendStatus = vi.fn(() => res);
  return res as Response & { status: ReturnType<typeof vi.fn> };
}

const cases = [
  {
    name: "Instagram",
    path: "/api/webhooks/instagram",
    channel: "instagram",
    body: {
      object: "instagram",
      entry: [
        { messaging: [{ sender: { id: "ig-1" }, message: { text: "oi" } }] },
      ],
    },
  },
  {
    name: "Telegram",
    path: "/api/webhooks/telegram",
    channel: "telegram",
    body: {
      message: { chat: { id: 555 }, text: "oi", from: { first_name: "Ana" } },
    },
  },
  {
    name: "WhatsApp Cloud",
    path: "/api/webhooks/whatsapp",
    channel: "whatsapp",
    body: {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ profile: { name: "Ana" } }],
                messages: [
                  {
                    id: "wamid.1",
                    from: "5511999999999",
                    text: { body: "oi" },
                    timestamp: "1700000000",
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  {
    name: "Z-API",
    path: "/api/webhooks/zapi",
    channel: "whatsapp",
    body: {
      phone: "+55 11 99999-9999",
      text: { message: "oi" },
      senderName: "Ana",
    },
  },
  {
    name: "Evolution",
    path: "/api/webhooks/evolution",
    channel: "whatsapp",
    body: {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { conversation: "oi" },
        pushName: "Ana",
      },
    },
  },
] as const;

describe("receptores de webhook — escolha da conversa", () => {
  let fake: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    fake = createFakeDb();
    vi.mocked(getDb).mockResolvedValue(fake.db as any);
    vi.mocked(findOrCreateOpenConversation).mockResolvedValue(CONVERSATION_ID);
  });

  it("todos os 5 receptores estão registrados", () => {
    const routes = captureRoutes();
    for (const c of cases)
      expect(routes[c.path], c.path).toBeTypeOf("function");
  });

  for (const c of cases) {
    it(`${c.name}: usa findOrCreateOpenConversation com canal "${c.channel}" e grava a mensagem na conversa devolvida`, async () => {
      const routes = captureRoutes();
      const res = fakeRes();
      await routes[c.path]({ body: c.body } as Request, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(findOrCreateOpenConversation).toHaveBeenCalledTimes(1);
      expect(findOrCreateOpenConversation).toHaveBeenCalledWith(
        fake.db,
        CUSTOMER_ID,
        c.channel
      );
      expect(fake.messageInserts).toHaveLength(1);
      expect(fake.messageInserts[0]).toMatchObject({
        conversationId: CONVERSATION_ID,
        senderType: "customer",
        content: "oi",
      });
    });
  }
});
