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
    expect(composer).toMatch(
      /if \(!isNote && canReply && value\.trim\(\)\) \{[\s\S]*?shouldSendTyping\(lastTypingAt\.current, now\)/,
    );
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

  it("NÃO mostra anexo genérico, template, agendar nem encaminhar (nem desabilitados)", () => {
    for (const icon of ["Paperclip", "LayoutTemplate", "Calendar", "Forward"]) {
      expect(composer).not.toMatch(new RegExp(`\\b${icon}\\b`));
    }
  });

  it("imagem e áudio: só para o dono e só na aba Responder (nunca na nota interna)", () => {
    expect(composer).toContain("const mediaEnabled = !isNote && canReply;");
    // O input de arquivo e os dois botões só existem dentro do bloco mediaEnabled.
    expect(composer).toMatch(/\{mediaEnabled && \(\s*<>\s*<input[\s\S]*?type="file"[\s\S]*?<ImageIcon[\s\S]*?<Mic /);
    expect(composer.match(/type="file"/g)).toHaveLength(1);
    expect(composer).toContain('accept="image/*"'); // qualquer imagem: o que não for JPEG/PNG ≤ 5 MB é convertido
    expect(composer).toContain("file = await prepareSaraImage(picked);");
  });

  it("valida tipo/tamanho no navegador antes da prévia (o servidor valida de novo)", () => {
    expect(composer).toContain('validateSaraMedia("image", file.type, file.size)');
    expect(composer).toContain('validateSaraMedia("audio", blob.type, blob.size)');
  });

  it("\"Enviando…\" e bloqueio de duplo clique", () => {
    expect(composer).toMatch(/function handleSendMedia\(\) \{\s*if \(isSendingMedia\) return;/);
    expect(composer).toContain('{isSendingMedia ? "Enviando…" : "Enviar"}');
    expect(composer).toMatch(/onClick=\{handleSendMedia\} disabled=\{isSendingMedia\}/);
  });

  it("prévia só some quando a Sara aceitou; falha mantém para tentar de novo", () => {
    expect(composer).toContain("onSendMedia(media.kind, media.file).then(media.clear, () => {})");
    expect(detail).toContain("throw error; // composer mantém a prévia para tentar de novo");
    expect(detail).toMatch(/await uploadSaraMedia\(id, kind, file\);[\s\S]*?toast\.success\("Enviado"\);\s*invalidateAll\(\);/);
  });

  it("URL de objeto da prévia é liberada", () => {
    expect(composer).toContain("URL.revokeObjectURL(pendingImage.url)");
    expect(composer).toContain("URL.revokeObjectURL(pendingAudio.url)");
  });

  it("rascunho só é limpo quando o envio dá certo", () => {
    expect(composer).toMatch(/\(isNote \? onAddNote\(text\) : onSend\(text\)\)\.then\(\s*\(\) => setDraft\(""\)/);
    expect(detail).toContain("onSend={text => sendMutation.mutateAsync({ id, text })}");
  });

  it("não loga conteúdo digitado", () => {
    expect(composer).not.toMatch(/console\./);
  });
});

describe("Nota interna — aba no composer e na linha do tempo", () => {
  it("aba \"Nota Interna\" sempre disponível (não depende de ter assumido)", () => {
    expect(composer).toContain("Nota Interna");
    expect(composer).toContain("const inputEnabled = isNote || canReply;");
  });

  it("nota não dispara \"digitando...\" e vai para onAddNote, nunca para onSend", () => {
    expect(composer).toMatch(/if \(!isNote && canReply && value\.trim\(\)\)/);
    expect(composer).toContain("(isNote ? onAddNote(text) : onSend(text))");
    expect(detail).toContain("onAddNote={text => addNoteMutation.mutateAsync({ conversationId: id, text })}");
  });

  it("notas aparecem intercaladas com as mensagens, no estilo âmbar", () => {
    expect(detail).toContain("mergeTimeline(messages, notes)");
    expect(detail).toMatch(/bg-amber-50 dark:bg-amber-900\/20 border border-amber-200/);
  });
});

describe("Opt-out — faixa + confirmação antes de enviar (não bloqueia)", () => {
  it("texto, imagem e áudio passam pela confirmação; nota interna não", () => {
    expect(composer).toMatch(/if \(isNote\) send\(\);\s*else withOptOutConfirm\(send\);/);
    expect(composer).toMatch(/withOptOutConfirm\(\(\) => \{\s*onSendMedia\(/);
  });

  it("Cancelar é o padrão: foco inicial nele", () => {
    expect(composer).toMatch(/onOpenAutoFocus=\{e => \{[\s\S]*?e\.preventDefault\(\);\s*cancelConfirmRef\.current\?\.focus\(\);/);
    expect(composer).toContain("<AlertDialogCancel ref={cancelConfirmRef}>Cancelar</AlertDialogCancel>");
    expect(composer).toContain("Enviar mesmo assim");
  });

  it("tela: faixa visível quando optedOut, aviso discreto quando não deu para verificar", () => {
    expect(detail).toContain("saraOptOutMessage(optOut.data?.optedOutAt ?? null)");
    expect(detail).toContain("Não foi possível verificar opt-out");
    expect(detail).toContain("optOutConfirmText={saraOptOutConfirmText(optOut.data)}");
    expect(detail).toMatch(/staleTime: OPT_OUT_STALE_MS/);
    expect(detail).toContain("const OPT_OUT_STALE_MS = 5 * 60_000;");
  });

  it("sem cor hex nova no composer nem na faixa", () => {
    expect(composer).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(detail).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
