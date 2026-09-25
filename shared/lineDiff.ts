/**
 * Diff por linha (LCS), para a comparação lado a lado antes de ativar uma versão
 * do prompt da Sara. Sem dependência: só precisamos de granularidade por linha.
 *
 * A tabela de LCS custa linhas(a) × linhas(b) células. Acima de LINE_DIFF_MAX_CELLS
 * devolve null — a tela mostra os dois textos sem destaque em vez de travar o
 * navegador.
 */

export const LINE_DIFF_MAX_CELLS = 4_000_000;

export type LineDiffOp =
  | { type: "equal"; left: string; right: string; leftNo: number; rightNo: number }
  | { type: "removed"; left: string; leftNo: number }
  | { type: "added"; right: string; rightNo: number };

export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

export function lineDiff(before: string, after: string, maxCells = LINE_DIFF_MAX_CELLS): LineDiffOp[] | null {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > maxCells) return null;

  // lcs[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..]
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const ops: LineDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", left: a[i], right: b[j], leftNo: i + 1, rightNo: j + 1 });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      ops.push({ type: "removed", left: a[i], leftNo: i + 1 });
      i++;
    } else {
      ops.push({ type: "added", right: b[j], rightNo: j + 1 });
      j++;
    }
  }
  for (; i < n; i++) ops.push({ type: "removed", left: a[i], leftNo: i + 1 });
  for (; j < m; j++) ops.push({ type: "added", right: b[j], rightNo: j + 1 });
  return ops;
}

/** Linha da visão lado a lado: removida à esquerda e adicionada à direita ficam pareadas. */
export interface SideBySideRow {
  left: { text: string; no: number; changed: boolean } | null;
  right: { text: string; no: number; changed: boolean } | null;
}

export function toSideBySide(ops: LineDiffOp[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.type === "equal") {
      rows.push({
        left: { text: op.left, no: op.leftNo, changed: false },
        right: { text: op.right, no: op.rightNo, changed: false },
      });
      k++;
      continue;
    }
    // Bloco de mudanças: junta removidas e adicionadas consecutivas e pareia.
    const removed: Array<Extract<LineDiffOp, { type: "removed" }>> = [];
    const added: Array<Extract<LineDiffOp, { type: "added" }>> = [];
    while (k < ops.length && ops[k].type !== "equal") {
      const cur = ops[k];
      if (cur.type === "removed") removed.push(cur);
      else if (cur.type === "added") added.push(cur);
      k++;
    }
    for (let r = 0; r < Math.max(removed.length, added.length); r++) {
      rows.push({
        left: removed[r] ? { text: removed[r].left, no: removed[r].leftNo, changed: true } : null,
        right: added[r] ? { text: added[r].right, no: added[r].rightNo, changed: true } : null,
      });
    }
  }
  return rows;
}

export function diffStats(ops: LineDiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "added") added++;
    else if (op.type === "removed") removed++;
  }
  return { added, removed };
}
