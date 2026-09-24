import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { filterQuickReplies, shouldSendTyping, SARA_TYPING_INTERVAL_MS } from "@/pages/saraShared";

// Composer da Sara: emoji, respostas rápidas (botão e "/") e "digitando..." — só o que a
// API da Sara permite. Nada aqui chama a Sara (typing é chamada real ao cliente).
const composer = readFileSync(new URL("./SaraComposer.tsx", import.meta.url), "utf-8");
const detail = readFileSync(new URL("../../pages/SaraConversationDetail.tsx", import.meta.url), "utf-8");

describe("\"Digitando...\" — no máximo 1 a cada ~5s", () => {
  it("intervalo é de 5s", () => {
    expect(SARA_TYPING_INTERVAL_MS).toBe(5000);
  });

  it("primeira tecla envia; dentro de 5s não; a partir de 5s envia de novo", () => {
    expect(shouldSendTyping(null, 1_000)).toBe(true);
    expect(shouldSendTyping(1_000, 3_000)).toBe(false);
    expect(shouldSendTyping(1_000, 5_999)).toBe(false);
    expect(shouldSendTyping(1_000, 6_000)).toBe(true);
  });

  it("composer só dispara typing quando pode responder (canReply = canSend do servidor)", () => {
    expect(composer).toMatch(/if \(canReply && value\.trim\(\)\) \{[\s\S]*?shouldSendTyping\(lastTypingAt\.current, now\)/);
    expect(detail).toContain("onTyping={() => typingMutation.mutate({ id })}");
  });
});

describe("Respostas rápidas — mesmo filtro do \"/\" do ConversationDetail", () => {
  const list = [
    { id: 1, title: "Boas-vindas", content: "Olá! Como posso ajudar?", shortcut: "oi" },
    { id: 2, title: "Reembolso", content: "Seu pedido de reembolso foi aberto.", shortcut: "reemb" },
    { id: 3, title: "Sem atalho", content: "Texto qualquer", shortcut: null },
  ];

  it("vazio devolve tudo", () => expect(filterQuickReplies(list, "")).toHaveLength(3));
  it("atalho: começa com", () => expect(filterQuickReplies(list, "re").map(q => q.id)).toEqual([2]));
  it("título ou conteúdo: contém", () => {
    expect(filterQuickReplies(list, "atalho").map(q => q.id)).toEqual([3]);
    expect(filterQuickReplies(list, "ajudar").map(q => q.id)).toEqual([1]);
  });

  it("composer usa quickReplies.list, o botão Rápidas e o gatilho \"/\"", () => {
    expect(composer).toContain("trpc.quickReplies.list.useQuery()");
    expect(composer).toContain("Rápidas");
    expect(composer).toContain("const SLASH_TRIGGER = /(^|\\s)\\/(\\S*)$/;");
  });
});

describe("Composer — só o que a API da Sara permite", () => {
  it("tem emoji (mesmo seletor do ConversationDetail)", () => {
    expect(composer).toContain('import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";');
  });

  it("NÃO mostra anexo, imagem, áudio, template, agendar nem encaminhar (nem desabilitados)", () => {
    for (const icon of ["Paperclip", "Image", "Mic", "LayoutTemplate", "Calendar", "Forward"]) {
      expect(composer).not.toMatch(new RegExp(`\\b${icon}\\b`));
    }
    expect(composer).not.toMatch(/type="file"/);
  });

  it("rascunho só é limpo quando o envio dá certo", () => {
    expect(composer).toMatch(/onSend\(text\)\.then\(\s*\(\) => setDraft\(""\)/);
    expect(detail).toContain("onSend={text => sendMutation.mutateAsync({ id, text })}");
  });

  it("não loga conteúdo digitado", () => {
    expect(composer).not.toMatch(/console\./);
  });
});
