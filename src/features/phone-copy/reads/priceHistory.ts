/**
 * `get_item_price_history` over the phone copy (WH-348, product/tech/app-offline-read-more.md section 0): the server's
 * `data` and `pagination`, key for key, for an administrator or a supervisor. Its text is the baseline function, as
 * installed on temp1. Staff are refused online (migration 48), so for them this read does not answer and the server's
 * refusal is shown as today (contract section 2, roles).
 */
import type { CopyReader } from '../readRoute';
import { parseRow, pick, textOf, type Row } from './rows';

export interface PriceHistoryRequest {
  customerId: string | null;
  itemId: string | null;
  limit: number;
  offset: number;
}

export interface PriceHistoryData {
  data: Row[];
  pagination: { total: number; limit: number; offset: number; has_more: boolean };
}

/** The history rows order by their bigint id, which the copy keeps as text. */
const byIdDescending = (a: Row, b: Row): number => {
  const x = BigInt(textOf(a.id) ?? '0');
  const y = BigInt(textOf(b.id) ?? '0');
  return x === y ? 0 : x < y ? 1 : -1;
};

export async function readPriceHistory(q: CopyReader, request: PriceHistoryRequest): Promise<PriceHistoryData> {
  if (q.role === 'staff') throw new Error('price history is refused to staff');
  // The page is 1 to 200 rows, from a start of 0 or more (capped where start + page still fits an integer).
  const limit = Math.min(Math.max(request.limit, 1), 200);
  const offset = Math.min(Math.max(request.offset, 0), 2147483647 - 200);
  const found = await q.all<{ row: string }>('SELECT row FROM item_price_history');
  // A truncation entry belongs to every filter.
  const rows = found
    .map(record => parseRow(record.row))
    .filter(row => (request.customerId === null || row.customer_id === request.customerId || row.action === 'truncate')
      && (request.itemId === null || row.item_id === request.itemId || row.action === 'truncate'))
    .sort(byIdDescending);
  const names = new Map((await q.all<{ id: string; name: string | null }>("SELECT id, json_extract(row, '$.name') AS name FROM user_profiles")).map(p => [p.id, p.name]));
  const page = rows.slice(offset, offset + limit).map(row => ({
    id: pick(row, 'id'), changed_at: pick(row, 'changed_at'), action: pick(row, 'action'), price_id: pick(row, 'price_id'),
    item_id: pick(row, 'item_id'), item_name: pick(row, 'item_name'), customer_id: pick(row, 'customer_id'),
    customer_name: pick(row, 'customer_name'), old_values: pick(row, 'old_values'), new_values: pick(row, 'new_values'),
    changed_by: pick(row, 'changed_by'), changed_by_name: row.changed_by_name ?? names.get(String(row.changed_by)) ?? null,
    changed_by_role: pick(row, 'changed_by_role'),
  }));
  return { data: page, pagination: { total: rows.length, limit, offset, has_more: offset + limit < rows.length } };
}
