import { describe, expect, it, vi } from "vitest";
import {
  findOrCreateOpenConversation,
  pickReusableConversation,
  type ConversationCandidate,
} from "./conversationLookup";

// Regra de reaproveitamento de conversa usada pelos 5 receptores de webhook (Instagram, Telegram,
// WhatsApp Cloud, Z-API, Evolution). Antes cada um fazia um select sem filtro de status nem de
// canal e sem ordenação — pegava uma conversa qualquer do cliente e, se ela estivesse Closed,
// criava uma nova a cada mensagem.

function conv(
  id: number,
  channel: ConversationCandidate["channel"],
  status: ConversationCandidate["status"],
  updatedAt: string
): ConversationCandidate {
  return { id, channel, status, updatedAt: new Date(updatedAt) };
}

describe("pickReusableConversation", () => {
  it("reaproveita a conversa aberta do mesmo canal", () => {
    const picked = pickReusableConversation(
      [conv(1, "whatsapp", "Open", "2026-09-01")],
      "whatsapp"
    );
    expect(picked?.id).toBe(1);
  });

  it("ignora conversa Closed mesmo que seja a única — o bug original", () => {
    expect(
      pickReusableConversation(
        [conv(1, "whatsapp", "Closed", "2026-09-01")],
        "whatsapp"
      )
    ).toBeNull();
  });

  it("acha a aberta mesmo quando uma Closed mais antiga vem primeiro na lista", () => {
    const picked = pickReusableConversation(
      [
        conv(1, "whatsapp", "Closed", "2026-08-01"),
        conv(2, "whatsapp", "Open", "2026-09-01"),
      ],
      "whatsapp"
    );
    expect(picked?.id).toBe(2);
  });

  it("com várias abertas, pega a de updatedAt mais recente, independente da ordem de entrada", () => {
    const picked = pickReusableConversation(
      [
        conv(3, "whatsapp", "Open", "2026-09-10"),
        conv(5, "whatsapp", "Open", "2026-09-20"),
        conv(4, "whatsapp", "Open", "2026-09-15"),
      ],
      "whatsapp"
    );
    expect(picked?.id).toBe(5);
  });

  it("empate de updatedAt desempata pelo id mais alto (a criada por último)", () => {
    const picked = pickReusableConversation(
      [
        conv(7, "whatsapp", "Open", "2026-09-10T12:00:00Z"),
        conv(9, "whatsapp", "Open", "2026-09-10T12:00:00Z"),
      ],
      "whatsapp"
    );
    expect(picked?.id).toBe(9);
  });

  it("não reaproveita conversa aberta de outro canal — WhatsApp não cai em conversa de e-mail", () => {
    expect(
      pickReusableConversation(
        [conv(1, "email", "Open", "2026-09-01")],
        "whatsapp"
      )
    ).toBeNull();
  });

  it("Waiting conta como não finalizada e é reaproveitada", () => {
    expect(
      pickReusableConversation(
        [conv(1, "telegram", "Waiting", "2026-09-01")],
        "telegram"
      )?.id
    ).toBe(1);
  });
});

// Fake mínimo do encadeamento do Drizzle usado por findOrCreateOpenConversation:
// select().from().where() e insert().values().$returningId().
function fakeDb(existing: ConversationCandidate[], newId = 99) {
  const values = vi.fn(() => ({ $returningId: async () => [{ id: newId }] }));
  const db = {
    select: () => ({ from: () => ({ where: async () => existing }) }),
    insert: vi.fn(() => ({ values })),
  };
  return { db: db as any, values };
}

describe("findOrCreateOpenConversation", () => {
  it("devolve a conversa aberta existente sem inserir nada", async () => {
    const { db, values } = fakeDb([
      conv(10, "whatsapp", "Closed", "2026-08-01"),
      conv(11, "whatsapp", "Open", "2026-09-01"),
    ]);
    await expect(
      findOrCreateOpenConversation(db, 42, "whatsapp")
    ).resolves.toBe(11);
    expect(values).not.toHaveBeenCalled();
  });

  it("cria conversa Open no canal pedido quando só há conversa Closed", async () => {
    const { db, values } = fakeDb(
      [conv(10, "whatsapp", "Closed", "2026-08-01")],
      123
    );
    await expect(
      findOrCreateOpenConversation(db, 42, "whatsapp")
    ).resolves.toBe(123);
    expect(values).toHaveBeenCalledWith({
      customerId: 42,
      channel: "whatsapp",
      status: "Open",
    });
  });

  it("cria conversa nova quando a única aberta é de outro canal", async () => {
    const { db, values } = fakeDb(
      [conv(10, "email", "Open", "2026-09-01")],
      124
    );
    await expect(
      findOrCreateOpenConversation(db, 42, "whatsapp")
    ).resolves.toBe(124);
    expect(values).toHaveBeenCalledWith({
      customerId: 42,
      channel: "whatsapp",
      status: "Open",
    });
  });
});
