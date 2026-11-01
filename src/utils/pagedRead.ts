/**
 * Direct table reads are cut at 2,000 rows by the backend (`PGRST_DB_MAX_ROWS`, backend migrations 137 and 138), whatever
 * `limit` asks for, and the cut is silent. A read that can reach that many rows is paged with `.range()`, 500 rows per
 * request (the size the backend's contract names).
 *
 * `readAllRows` asks page after page until a page comes back short. It first asks without an order (the order the rows
 * always came in); only when a full page comes back, which means a second request would follow, does it start over with
 * a stable order (`ordered` true: the caller adds `.order(...)`), because pages of an unordered query may repeat or skip
 * rows. A request that fails throws; so does a read that gave fewer rows than the server counts (`count: 'exact'`), as
 * a list that is not whole must never pass for the whole one.
 */
export const DIRECT_READ_PAGE = 500;
/** More rows than this is not a list a phone should hold; the read fails rather than loop. */
const MAX_ROWS = 20_000;

export interface PageAnswer<T> {
  data: T[] | null;
  error: unknown;
  count?: number | null;
}

export class IncompleteReadError extends Error {
  constructor(readonly read: number, readonly total: number) {
    super(`Read ${read} of ${total} rows`);
    this.name = 'IncompleteReadError';
  }
}

export async function readAllRows<T>(
  page: (from: number, to: number, ordered: boolean) => PromiseLike<PageAnswer<T>>,
  pageSize: number = DIRECT_READ_PAGE
): Promise<{ rows: T[]; count: number | null }> {
  const run = async (ordered: boolean) => {
    const rows: T[] = [];
    let count: number | null = null;
    for (let from = 0; ; from += pageSize) {
      const { data, error, count: counted } = await page(from, from + pageSize - 1, ordered);
      if (error) throw error;
      if (from === 0 && typeof counted === 'number') count = counted;
      const got = data ?? [];
      rows.push(...got);
      if (got.length < pageSize) break;
      if (!ordered) return null; // a second page is needed: start over in a stable order
      if (rows.length > MAX_ROWS) throw new Error('Too many rows to read');
    }
    return { rows, count };
  };
  const result = (await run(false)) ?? (await run(true))!;
  if (result.count !== null && result.rows.length < result.count) throw new IncompleteReadError(result.rows.length, result.count);
  return result;
}
