import { describe, it, expect } from "vitest";
import { z } from "zod";
import { conversations } from "../../../drizzle/schema";
import { statusLabels } from "./ConversationDetail";

// Bug real (o mais grave dos 9 encontrados): o <Select> de status desta tela usava
// SelectItem value="Aberto"/"Aguardando"/"Fechado" (português), mas o mutation
// conversations.updateStatus (server/routers.ts) valida o input com
// z.enum(["Open", "Waiting", "Closed"]). Qualquer tentativa de mudar o status de uma
// conversa pela tela quebrava com erro de validação Zod — não falha silenciosa, falha
// visível para o atendente. A correção passou a montar o <Select> a partir do próprio mapa
// `statusLabels` (chave = valor do enum, valor = rótulo em português), então este teste
// trava se `statusLabels` voltar a ter uma chave em português.

// Mesma forma de validação usada por conversations.updateStatus em server/routers.ts —
// reproduzida aqui para provar que todo valor que o Select pode emitir é aceito pelo servidor.
const updateStatusInputSchema = z.object({
  id: z.number(),
  status: z.enum(["Open", "Waiting", "Closed"]),
});

describe("ConversationDetail — statusLabels é a única fonte de verdade do <Select> de status", () => {
  it("as chaves de statusLabels são exatamente o enum real do banco (conversations.status)", () => {
    const REAL_STATUS_VALUES = conversations.status.enumValues;
    expect(Object.keys(statusLabels).sort()).toEqual([...REAL_STATUS_VALUES].sort());
  });

  it("todo valor que o Select pode enviar é aceito pelo schema de conversations.updateStatus", () => {
    for (const value of Object.keys(statusLabels)) {
      const result = updateStatusInputSchema.safeParse({ id: 1, status: value });
      expect(result.success, `status "${value}" deveria ser aceito pelo mutation`).toBe(true);
    }
  });

  it("os rótulos em português continuam sendo exibidos para o atendente", () => {
    expect(statusLabels.Open).toBe("Aberto");
    expect(statusLabels.Waiting).toBe("Aguardando");
    expect(statusLabels.Closed).toBe("Encerrado");
  });

  it("regressão direta: um valor em português não é aceito pelo mutation", () => {
    // Isso é exatamente o que a tela mandava antes da correção — e por isso quebrava.
    const result = updateStatusInputSchema.safeParse({ id: 1, status: "Aberto" });
    expect(result.success).toBe(false);
  });
});
