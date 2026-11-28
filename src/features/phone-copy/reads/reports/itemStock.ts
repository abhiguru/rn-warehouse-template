/**
 * `get_item_wise_stock_list` over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 4 and 8;
 * backend baseline): the items in stock, one row each, with totals of the whole filtered list. The search is the
 * server's unescaped `ILIKE` on the lot's item name (`%` and `_` are wildcards).
 */
import { enCompare, likeUnescaped } from '@/features/phone-copy/pgCompat';
import type { CopyReader } from '@/features/phone-copy/readRoute';
import { compareIds, type Row } from './reportParts';

export interface ItemStockRequest {
  customerId: string | null;
  searchQuery: string | null;
  limit: number;
  offset: number;
  sortBy: string | undefined;
  sortOrder: string | undefined;
}

const SORTS = ['item_name', 'total_stock', 'total_qty', 'grn_count'] as const;
type SortKey = (typeof SORTS)[number];

interface ItemTotals {
  item_id: string;
  total_qty: number;
  total_stock: number;
  grn_count: number;
}

const maxText = (values: (string | null)[]): string | null =>
  values.reduce<string | null>((best, value) => (value === null ? best : best === null || enCompare(value, best) > 0 ? value : best), null);

export async function readItemStock(q: CopyReader, request: ItemStockRequest): Promise<Row> {
  const sortBy: SortKey = (SORTS as readonly string[]).includes((request.sortBy ?? '').toLowerCase())
    ? ((request.sortBy ?? '').toLowerCase() as SortKey)
    : 'item_name';
  const sign = (request.sortOrder ?? '').toLowerCase() === 'desc' ? -1 : 1;

  const where = ['g.deleted_at IS NULL', 't.stock > 0'];
  const params: (string | number)[] = [];
  if (request.customerId) {
    where.push('g.customer_id = ?');
    params.push(request.customerId);
  } else {
    where.push('EXISTS (SELECT 1 FROM customers c WHERE c.id = g.customer_id AND c.deleted_at IS NULL)');
  }
  if (request.searchQuery !== null && request.searchQuery !== '') {
    const like = likeUnescaped(`%${request.searchQuery}%`);
    where.push(`t.item_name_lc ${like.sql}`);
    params.push(like.param);
  } else if (request.searchQuery === '') {
    // An empty search is `ILIKE '%%'`: every lot with a name.
    where.push('t.item_name_lc IS NOT NULL');
  }
  const from = `FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id WHERE ${where.join(' AND ')}`;

  const totals = await q.all<ItemTotals>(
    `SELECT t.item_id AS item_id, SUM(t.qty) AS total_qty, SUM(t.stock) AS total_stock, COUNT(DISTINCT t.gr_id) AS grn_count
       ${from} GROUP BY t.item_id HAVING SUM(t.stock) > 0`,
    params
  );
  const named = await q.all<{ item_id: string; name: string | null; packaging: string | null }>(
    `SELECT DISTINCT t.item_id AS item_id, json_extract(t.row, '$.item_name') AS name, json_extract(t.row, '$.packaging') AS packaging ${from}`,
    params
  );
  const names = new Map<string, { names: (string | null)[]; packagings: (string | null)[] }>();
  for (const record of named) {
    const entry = names.get(record.item_id) ?? { names: [], packagings: [] };
    entry.names.push(record.name);
    entry.packagings.push(record.packaging);
    names.set(record.item_id, entry);
  }

  const rows = totals.map(total => ({
    ...total,
    name: maxText(names.get(total.item_id)?.names ?? []),
    packaging: maxText(names.get(total.item_id)?.packagings ?? []),
  }));
  rows.sort((a, b) => {
    if (sortBy === 'item_name') {
      return sign * enCompare(a.name, b.name) || compareIds(a.item_id, b.item_id);
    }
    const key = sortBy === 'total_stock' ? 'total_stock' : sortBy === 'total_qty' ? 'total_qty' : 'grn_count';
    return sign * (a[key] - b[key]) || enCompare(a.name, b.name) || compareIds(a.item_id, b.item_id);
  });

  const page = rows.slice(request.offset, request.offset + request.limit);
  return {
    success: true,
    data: {
      items: page.map(row => ({
        item_id: row.item_id,
        item_name: row.name,
        packaging: row.packaging,
        total_qty: row.total_qty,
        total_stock: row.total_stock,
        grn_count: row.grn_count,
      })),
      total_count: rows.length,
      summary: {
        total_stock: rows.reduce((sum, row) => sum + row.total_stock, 0),
        total_qty: rows.reduce((sum, row) => sum + row.total_qty, 0),
        item_count: rows.length,
      },
    },
  };
}
