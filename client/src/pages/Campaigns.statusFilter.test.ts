import { describe, it, expect } from "vitest";
import { customers } from "../../../drizzle/schema";
import {
  ALL_FILTER_SENTINEL,
  clearAllSentinel,
  CUSTOMER_STATUS_FILTER_OPTIONS,
} from "./Campaigns.filters";

// Bug real: o filtro "Status do cliente" da audiência de campanhas usava
// <SelectItem value="Ativo"> / <SelectItem value="Em Risco"> — rótulos em português como VALOR
// do item, enviados para campaigns.getRecipients/preview (server/routers.ts), que filtra com
// eq(customers.status, input.filterStatus as any) contra o enum real customers.status
// (["Active","At Risk","Churned","New"]). Uma campanha filtrada por "Ativo" ou "Em Risco" nunca
// tinha destinatário nenhum, silenciosamente.
//
// Nota: os testes abaixo importam CUSTOMER_STATUS_FILTER_OPTIONS/ALL_FILTER_SENTINEL/
// clearAllSentinel — dados e função reais que a tela usa para montar os <Select> — em vez de ler
// o código-fonte com regex. Isso sobrevive a `pnpm format` (que reformata JSX livremente) e prende
// o valor usado no <SelectItem> ao valor comparado na normalização, porque os dois vêm da mesma
// constante exportada: uma reversão que desalinhar os dois quebra em runtime, não só aqui.
const REAL_STATUS_VALUES = customers.status.enumValues;

describe("Campaigns — filtro de status do cliente usa o enum real, não o rótulo em português", () => {
  it("toda opção do filtro usa um valor presente no enum real do banco", () => {
    expect(CUSTOMER_STATUS_FILTER_OPTIONS.length).toBeGreaterThan(0);
    for (const opt of CUSTOMER_STATUS_FILTER_OPTIONS) {
      expect(REAL_STATUS_VALUES).toContain(opt.value);
    }
  });

  it("Active exibe rótulo Ativo, At Risk exibe rótulo Em Risco", () => {
    expect(
      CUSTOMER_STATUS_FILTER_OPTIONS.find(o => o.value === "Active")?.label
    ).toBe("Ativo");
    expect(
      CUSTOMER_STATUS_FILTER_OPTIONS.find(o => o.value === "At Risk")?.label
    ).toBe("Em Risco");
  });

  it("nenhuma opção usa o rótulo em português como valor", () => {
    const values = CUSTOMER_STATUS_FILTER_OPTIONS.map(o => o.value);
    expect(values).not.toContain("Ativo");
    expect(values).not.toContain("Em Risco");
  });
});

describe("Campaigns — o sentinela '_all' (opção \"Todos\") não vaza como filtro real", () => {
  // Achado do @qa na revisão do PR #21: onValueChange={setFilterStatus} gravava o literal
  // "_all" no estado, e `filterStatus || undefined` não removia esse valor (string não-vazia é
  // truthy). Escolher "Todos" mandava filterStatus: "_all" para campaigns.previewAudience/create,
  // que devolvia audiência zero silenciosamente. Mesmo problema em filterProgram (SelectItem
  // "Todos os programas"). Corrigido normalizando o sentinela para "" via clearAllSentinel, na
  // mesma constante ALL_FILTER_SENTINEL usada como value do <SelectItem>.
  it("clearAllSentinel esvazia o valor do sentinela usado no SelectItem 'Todos'", () => {
    expect(clearAllSentinel(ALL_FILTER_SENTINEL)).toBe("");
  });

  it("clearAllSentinel não mexe em um status real", () => {
    for (const opt of CUSTOMER_STATUS_FILTER_OPTIONS) {
      expect(clearAllSentinel(opt.value)).toBe(opt.value);
    }
  });

  it("regressão direta: o sentinela não é mais um valor de status válido", () => {
    expect(REAL_STATUS_VALUES).not.toContain(ALL_FILTER_SENTINEL);
  });
});
