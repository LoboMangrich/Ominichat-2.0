import { describe, expect, it } from "vitest";
import { diffStats, lineDiff, toSideBySide } from "./lineDiff";

describe("lineDiff", () => {
  it("textos iguais → só equal", () => {
    const ops = lineDiff("a\nb\nc", "a\nb\nc")!;
    expect(ops.every(o => o.type === "equal")).toBe(true);
    expect(diffStats(ops)).toEqual({ added: 0, removed: 0 });
  });

  it("detecta linha adicionada, removida e alterada", () => {
    const ops = lineDiff("a\nb\nc\nd", "a\nB\nc\nd\ne")!;
    expect(diffStats(ops)).toEqual({ added: 2, removed: 1 });
    expect(ops.find(o => o.type === "removed")).toMatchObject({ left: "b", leftNo: 2 });
    expect(ops.filter(o => o.type === "added").map(o => (o as { right: string }).right)).toEqual(["B", "e"]);
  });

  it("ignora diferença \\r\\n × \\n", () => {
    expect(diffStats(lineDiff("a\r\nb", "a\nb")!)).toEqual({ added: 0, removed: 0 });
  });

  it("devolve null acima do teto de células", () => {
    const big = Array.from({ length: 100 }, (_, i) => `l${i}`).join("\n");
    expect(lineDiff(big, big, 1_000)).toBeNull();
    expect(lineDiff(big, big)).not.toBeNull();
  });

  it("lado a lado pareia removida com adicionada no mesmo bloco", () => {
    const rows = toSideBySide(lineDiff("a\nb\nc", "a\nX\nY\nc")!);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual({ left: { text: "b", no: 2, changed: true }, right: { text: "X", no: 2, changed: true } });
    expect(rows[2]).toEqual({ left: null, right: { text: "Y", no: 3, changed: true } });
    expect(rows[3].left).toMatchObject({ text: "c", changed: false });
  });

  it("aguenta um prompt do tamanho real com folga (2.000 linhas)", () => {
    const a = Array.from({ length: 1_900 }, (_, i) => `linha ${i}`).join("\n");
    const b = a.replace("linha 500", "linha 500 alterada");
    expect(diffStats(lineDiff(a, b)!)).toEqual({ added: 1, removed: 1 });
  });
});
