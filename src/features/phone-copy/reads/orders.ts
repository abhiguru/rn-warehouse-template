/**
 * The order reads over the phone copy (WH-328, product/tech/app-offline-orders-payments.md sections 5 and 13.3): the
 * server's `get_orders_list`, `get_order_with_items`, `get_customer_order` and the order screen's customer select, key for
 * key, for an administrator, a supervisor or staff (staff open any order, as the server lets them: contract 13.3). The
 * text is migration 135's list and the baseline's order read, with the stable ordering of the "stable order reads" topic.
 * Nothing is added up that the server stores; the line stock is the lot's, less this phone's unsent work (`netLotStock`).
 */
import type { SqlValue } from '../copyDriver';
import { pgSearchTerms } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { answerFor, netLotStock, numberOf, parseRow, parseRows, pick, textOf, type Row } from './rows';

export interface OrdersListRequest {
  customerId: string | null;
  hasItems: boolean | null;
  search: string | null;
  limit: number;
  offset: number;
}

export interface OrdersListData {
  orders: Row[];
  pagination: { total_count: number; has_more: boolean; limit: number; offset: number };
}

const LINE_KEYS = [
  'id', 'order_id', 'requested_quantity', 'fulfilled_quantity', 'grn_items_id', 'grn_items_item_id', 'grn_items_item_name',
  'grn_items_package_mark', 'grn_items_packaging', 'grn_items_rack', 'grn_items_weight', 'grn_items_image_url', 'grns_id',
  'grns_gr_no', 'grns_date', 'grns_customer_id', 'grns_customer_name', 'available_stock_at_order', 'current_stock',
  'item_status', 'sort_order', 'created_at', 'updated_at',
] as const;

const pickKeys = (from: Row, keys: readonly string[]): Row => Object.fromEntries(keys.map(key => [key, pick(from, key)]));

/** The lines of orders in the server's order (`sort_order`, `created_at`, `id`), a missing value last. */
const LINES_SQL = `SELECT order_id, row FROM order_items WHERE order_id IN (SELECT value FROM json_each(?))
  ORDER BY sort_order IS NULL, sort_order, created_at_us IS NULL, created_at_us, id`;

async function linesByOrder(q: CopyReader, orderIds: readonly string[]): Promise<Map<string, Row[]>> {
  const byOrder = new Map<string, Row[]>();
  if (!orderIds.length) return byOrder;
  const records = await q.all<{ order_id: string; row: string }>(LINES_SQL, [JSON.stringify(orderIds)]);
  for (const record of records) {
    const list = byOrder.get(record.order_id) ?? [];
    list.push(parseRow(record.row));
    byOrder.set(record.order_id, list);
  }
  return byOrder;
}

/** The order's latest dispatch (its own customer's): `created_at DESC, id`. */
async function latestDispatch(q: CopyReader, orderId: string, customerId: unknown): Promise<Row | null> {
  if (typeof customerId !== 'string') return null;
  const found = await q.get<{ row: string }>(
    'SELECT row FROM dispatch WHERE source_order_id = ? AND customer_id = ? ORDER BY created_at_us IS NULL, created_at_us DESC, id LIMIT 1',
    [orderId, customerId]
  );
  return found ? parseRow(found.row) : null;
}

export async function readOrdersList(q: CopyReader, request: OrdersListRequest): Promise<OrdersListData> {
  const limit = Math.min(Math.max(request.limit, 1), 200);
  const offset = Math.max(request.offset, 0);
  const sql: string[] = ['o.deleted_at IS NULL'];
  const params: SqlValue[] = [];
  if (request.customerId) {
    sql.push('o.customer_id = ?');
    params.push(request.customerId);
  }
  if (request.hasItems === true) sql.push('l.pending = 1');
  if (request.hasItems === false) sql.push('l.pending = 0');
  // Every word must be in the customer's name or city, or in a pending line's item, marking or GRN number.
  for (const term of pgSearchTerms(request.search)) {
    sql.push(`(instr(coalesce(c.name_lc, ''), ?) > 0 OR instr(coalesce(c.city_lc, ''), ?) > 0 OR EXISTS (
      SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND lower(oi.item_status) = 'pending'
        AND (instr(coalesce(oi.item_name_lc, ''), ?) > 0 OR instr(coalesce(oi.package_mark_lc, ''), ?) > 0 OR instr(coalesce(oi.gr_no_lc, ''), ?) > 0)))`);
    params.push(term, term, term, term, term);
  }
  const from = `FROM orders o
    JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
    JOIN (SELECT order_id, COALESCE(max(lower(item_status) = 'pending'), 0) AS pending FROM order_items GROUP BY order_id) l ON l.order_id = o.id
    WHERE ${sql.join(' AND ')}`;

  const total = (await q.get<{ n: number }>(`SELECT count(*) AS n ${from}`, params))?.n ?? 0;
  // An order with a pending line sorts by its update, any other by its latest dispatch; none last (SQLite puts NULL lowest).
  const page = await q.all<{ id: string; orow: string; crow: string }>(
    `SELECT o.id AS id, o.row AS orow, c.row AS crow ${from}
      ORDER BY CASE WHEN l.pending = 1 THEN o.updated_at_us ELSE (SELECT d.created_at_us FROM dispatch d
        WHERE d.source_order_id = o.id AND d.customer_id = o.customer_id ORDER BY d.created_at_us IS NULL, d.created_at_us DESC, d.id LIMIT 1) END DESC,
        o.created_at_us DESC, o.id
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const lines = await linesByOrder(q, page.map(p => p.id));
  const orders: Row[] = [];
  for (const record of page) {
    const o = parseRow(record.orow);
    const c = parseRow(record.crow);
    const all = lines.get(record.id) ?? [];
    const pending = all.filter(line => String(line.item_status).toLowerCase() === 'pending');
    const dispatch = await latestDispatch(q, record.id, o.customer_id);
    orders.push({
      id: o.id,
      customer_id: pick(o, 'customer_id'),
      customer: { id: pick(o, 'customer_id'), name: pick(c, 'name'), active: pick(c, 'active'), city: pick(c, 'city'), mobile: pick(c, 'mobile') },
      status: pick(o, 'status'),
      updated_by: pick(o, 'updated_by'),
      updated_by_name: pick(o, 'updated_by_display_name') ?? pick(o, 'updated_by_name'),
      item_count: pending.length,
      quantity_sum: pending.reduce((sum, line) => sum + (numberOf(line.requested_quantity) ?? 0), 0),
      items: all.map(line => pickKeys(line, LINE_KEYS)),
      created_at: pick(o, 'created_at'),
      updated_at: pick(o, 'updated_at'),
      dispatch_id: pick(dispatch, 'id'),
      dispatch_no: pick(dispatch, 'disp_no'),
      dispatch_created_at: pick(dispatch, 'created_at'),
    });
  }
  return { orders: answerFor(q.role, orders), pagination: { total_count: total, has_more: total > offset + limit, limit, offset } };
}

export type OrderWithItemsAnswer = { kind: 'found'; order_data: Row; items: Row[] } | { kind: 'not-found' };

/** `get_order_with_items`: any order, soft-deleted too; its lines with the lot's quantity and net stock. */
export async function readOrderWithItems(q: CopyReader, orderId: string): Promise<OrderWithItemsAnswer> {
  const found = await q.get<{ row: string }>('SELECT row FROM orders WHERE id = ?', [orderId]);
  if (!found) return { kind: 'not-found' };
  const o = parseRow(found.row);
  const lines = (await linesByOrder(q, [orderId])).get(orderId) ?? [];
  const lotIds = [...new Set(lines.map(line => textOf(line.grn_items_id)).filter((id): id is string => id !== null))];
  const lots = new Map<string, Row>(
    lotIds.length
      ? parseRows(await q.all<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(lotIds)]))
          .map(lot => [String(lot.id), lot] as const)
      : []
  );
  const dispatch = await latestDispatch(q, orderId, o.customer_id);
  const order_data: Row = {
    ...pickKeys(o, [
      'id', 'order_no', 'order_date', 'requested_dispatch_date', 'status', 'priority', 'customer_id', 'customer_name', 'customer_email',
      'customer_phone', 'note',
    ]),
    total_requested_qty: lines.reduce((sum, line) => sum + (numberOf(line.requested_quantity) ?? 0), 0),
    total_fulfilled_qty: lines.reduce((sum, line) => sum + (numberOf(line.fulfilled_quantity) ?? 0), 0),
    item_count: lines.length,
    dispatch_id: pick(dispatch, 'id'),
    dispatch_no: pick(dispatch, 'disp_no'),
    dispatch_created_at: pick(dispatch, 'created_at'),
    ...pickKeys(o, [
      'is_ignored', 'ignored_at', 'ignored_by', 'ignored_reason', 'cancelled_at', 'cancelled_by', 'cancellation_reason', 'created_at',
      'updated_at', 'created_by', 'updated_by', 'updated_by_name', 'updated_by_display_name',
    ]),
  };
  const items = lines.map(line => {
    const lotId = textOf(line.grn_items_id);
    const lot = lotId ? (lots.get(lotId) ?? null) : null;
    const stock = numberOf(pick(lot, 'stock')) ?? numberOf(line.current_stock);
    return {
      ...pickKeys(line, LINE_KEYS),
      order_no: pick(line, 'order_no'),
      grn_items_qty: numberOf(pick(lot, 'qty')) ?? 0,
      current_stock: netLotStock(lotId, stock),
    };
  });
  return { kind: 'found', order_data: answerFor(q.role, order_data), items };
}

/** `get_customer_order`'s `data`: the customer's live order, when it has a line. */
export async function readCustomerOrder(q: CopyReader, customerId: string): Promise<Row> {
  const found = await q.get<{ row: string; lines: number }>(
    `SELECT o.row AS row, (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS lines
       FROM orders o WHERE o.customer_id = ? AND o.deleted_at IS NULL ORDER BY o.created_at_us DESC, o.id LIMIT 1`,
    [customerId]
  );
  if (!found || found.lines === 0) return { exists: false, order_id: null, order_no: null, status: null, item_count: 0, updated_at: null };
  const o = parseRow(found.row);
  return { exists: true, order_id: o.id, order_no: pick(o, 'order_no'), status: pick(o, 'status'), item_count: found.lines, updated_at: pick(o, 'updated_at') };
}

/** The order screen's customer select: name, active, deleted_at; null when the copy has no such customer. */
export async function readOrderScreenCustomer(q: CopyReader, customerId: string): Promise<Row | null> {
  const found = await q.get<{ row: string }>('SELECT row FROM customers WHERE id = ?', [customerId]);
  if (!found) return null;
  const c = parseRow(found.row);
  return { id: c.id, name: pick(c, 'name'), active: pick(c, 'active'), deleted_at: pick(c, 'deleted_at') };
}
