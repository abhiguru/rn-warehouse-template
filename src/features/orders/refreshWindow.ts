/**
 * The silent refresh of an order list (live updates, pull to refresh) reloads the rows already shown. The server holds a
 * page to 200 rows (backend migration 135: a larger `p_limit` answers 200), so beyond 200 shown rows the refresh can only
 * reload the first 200. The rows beyond them are kept, merged by id, instead of the list shrinking to 200.
 */
import { PAGINATION } from '@/config/cacheConfig';

/** The most rows the server answers in one page of the order list. */
export const ORDER_PAGE_MAX = 200;

/** How many rows a refresh asks for: every row shown, at least a page, never more than the server gives. */
export const refreshLimit = (loadedCount: number): number => Math.min(Math.max(PAGINATION.DEFAULT_LIMIT, loadedCount), ORDER_PAGE_MAX);

/**
 * The list after a refresh that asked for `asked` rows. When the list held no more than `asked` rows the refreshed rows
 * are the whole list. Beyond that, the refreshed rows replace the head and the rows after the last refreshed row that
 * was already shown are kept (an order that moved up into the refreshed rows is not listed twice; one that was
 * deleted inside the window is gone).
 */
export function mergeRefreshedOrders<T extends { id: string }>(current: readonly T[], fresh: readonly T[], loadedBefore: number, asked: number): T[] {
  if (loadedBefore <= asked) return [...fresh];
  const freshIds = new Set(fresh.map(row => row.id));
  let last = -1;
  current.forEach((row, index) => {
    if (freshIds.has(row.id)) last = index;
  });
  const tail = current.slice(last >= 0 ? last + 1 : fresh.length).filter(row => !freshIds.has(row.id));
  return [...fresh, ...tail];
}
