import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("respeita o limite e mantém a ordem", async () => {
    let inFlight = 0;
    let max = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise(r => setTimeout(r, 10 - n)); // termina fora de ordem
      inFlight--;
      return n * 10;
    });
    expect(max).toBe(3);
    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it("lista vazia e erro propagado", async () => {
    await expect(mapWithConcurrency([], 5, async () => 1)).resolves.toEqual([]);
    await expect(mapWithConcurrency([1], 5, async () => { throw new Error("x"); })).rejects.toThrow("x");
  });
});
