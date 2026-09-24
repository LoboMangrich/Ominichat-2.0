/**
 * Mapeia `items` com no máximo `limit` chamadas de `fn` em andamento ao mesmo tempo
 * (fila). Mantém a ordem de `items` no resultado. Usado para não disparar dezenas de
 * GETs simultâneos na Sara, que é produção.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit < 1) throw new Error("limit precisa ser >= 1");
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
