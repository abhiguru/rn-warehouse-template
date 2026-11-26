/**
 * `get_recent_dispatched_orders` over the phone copy (WH-328, product/tech/app-offline-orders-payments.md section 5): the
 * server's `data`, key for key. Dispatches made from an order, newest first (`created_at DESC, id`), each with its lines in
 * the order `get_dispatch_details` lists them (the moment in the line's id, then the id). `created_by_name` is the one the
 * feed carries on the dispatch row.
 */
import { uuidTimestampUs } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { compareNullsLast, compareNumbers, compareText, numberOf, parseRow, parseRows, pick, textOf, type Row } from './rows';

export interface RecentOrderDispatchesData {
  dispatches: Row[];
  total_count: number;
  has_more: boolean;
}

export async function readRecentDispatchedOrders(q: CopyReader, limit: number, offset: number): Promise<RecentOrderDispatchesData> {
  const scope = 'source_order_id IS NOT NULL AND deleted_at IS NULL';
  const total = (await q.get<{ n: number }>(`SELECT count(*) AS n FROM dispatch WHERE ${scope}`))?.n ?? 0;
  const page = (
    await q.all<{ row: string }>(
      `SELECT row FROM dispatch WHERE ${scope} ORDER BY created_at_us IS NULL, created_at_us DESC, id LIMIT ? OFFSET ?`,
      [limit, offset]
    )
  ).map(record => parseRow(record.row));
  const ids = page.map(d => String(d.id));
  const lines = ids.length
    ? parseRows(await q.all<{ row: string }>('SELECT row FROM dispatch_trl WHERE disp_id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]))
    : [];
  const lotIds = [...new Set(lines.map(l => textOf(l.gr_trl_id)).filter((id): id is string => id !== null))];
  const grnIds = [...new Set(lines.map(l => textOf(l.gr_id)).filter((id): id is string => id !== null))];
  const byId = async (table: 'goodsreceived_trl' | 'goodsreceived' | 'items', keys: readonly string[]): Promise<Map<string, Row>> =>
    new Map(
      (keys.length
        ? parseRows(await q.all<{ row: string }>(`SELECT row FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(keys)]))
        : []
      ).map(r => [String(r.id), r] as const)
    );
  const lots = await byId('goodsreceived_trl', lotIds);
  const grns = await byId('goodsreceived', grnIds);
  const items = await byId('items', [...new Set([...lots.values()].map(l => textOf(l.item_id)).filter((id): id is string => id !== null))]);

  const dispatches = page.map(d => {
    const own = lines
      .filter(l => l.disp_id === d.id)
      .sort(
        (a, b) =>
          compareNullsLast(uuidTimestampUs(String(a.id)), uuidTimestampUs(String(b.id)), compareNumbers) || compareText(String(a.id), String(b.id))
      );
    return {
      dispatch_id: d.id,
      disp_no: pick(d, 'disp_no'),
      disp_date: pick(d, 'disp_date'),
      customer_id: pick(d, 'customer_id'),
      customer_name: pick(d, 'customer_name'),
      order_id: pick(d, 'source_order_id'),
      order_no: pick(d, 'source_order_no'),
      item_count: own.length,
      total_qty: own.reduce((sum, l) => sum + (numberOf(l.disp_qty) ?? 0), 0),
      registration: pick(d, 'registration'),
      created_at: pick(d, 'created_at'),
      created_by_name: pick(d, 'created_by_name'),
      items: own.flatMap(l => {
        const lot = lots.get(String(l.gr_trl_id));
        const grn = grns.get(String(l.gr_id));
        if (!lot || !grn) return [];
        const item = items.get(String(lot.item_id));
        return [{
          item_name: pick(item, 'name') ?? pick(lot, 'item_name'), disp_qty: pick(l, 'disp_qty'), rack: pick(lot, 'rack'),
          package_mark: pick(lot, 'package_mark'), gr_no: pick(grn, 'gr_no'), weight: pick(lot, 'weight'), grn_qty: pick(lot, 'qty'),
          grn_id: grn.id, packaging: pick(lot, 'packaging') ?? '',
        }];
      }),
    };
  });
  return { dispatches, total_count: total, has_more: offset + limit < total };
}
