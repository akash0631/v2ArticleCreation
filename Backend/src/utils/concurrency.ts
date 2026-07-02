/**
 * Run an async mapper over `items` with at most `limit` operations in flight at
 * once (a rolling worker pool — it always keeps `limit` running, not fixed
 * chunks). Results are returned in the original order. A rejecting `fn` rejects
 * the whole call, so callers that need per-item resilience should catch inside fn.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) return results;
  const lanes = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: lanes }, worker));
  return results;
}
