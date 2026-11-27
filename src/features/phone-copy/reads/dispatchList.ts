/**
 * `get_dispatch_list_with_items` over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 5 and
 * 7.2): the server's `data`, key for key, for an administrator, a supervisor or staff (the roles that hold a copy). Its
 * text is migration 125 with the patches of 131, 133, 138 and 191, as installed on temp1.
 */
import { documentNumberSortKey } from '@/utils/documentNumber';
import type { SqlValue } from '../copyDriver';
import { enCompare, likeUnescaped, parseTimestampUs, pgSearchTerms } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay } from '../unsentOverlay';
import { unsentDispatches } from './newDispatches';
import { compareText, IN_LIST, numberOf, parseRow, pick, textOf, type Row } from './rows';

export interface DispatchListRequest {
  customerId: string | null;
  /** The filters under the server's names (`disp_no_from`, `qty_min`, ...). */
  filters: Record<string, unknown>;
  sortBy: string;
  sortOrder: string;
  page: number;
  limit: number;
  includeItems: boolean;
  /** Answer as `get_customer_dispatch_list` does: `total_items`, `supervisor_name`, and `total_weight` cast to bigint. */
  customerShape?: boolean;
}

export interface DispatchListData {
  dispatches: Row[];
  total_count: number;
  current_page: number;
  total_pages: number;
  limit: number;
}

const UNIT_SEPARATOR = String.fromCharCode(31);
const phrase = (word: string): string => `"${word.replace(/"/g, '""')}"`;
/** SQL `trim` and `ltrim(…, '#')`. */
const bareNumber = (text: string): string => text.replace(/^ +| +$/g, '').replace(/^#+/, '');

interface Where {
  sql: string[];
  params: SqlValue[];
}
function add(where: Where, sql: string, ...params: SqlValue[]): void {
  where.sql.push(sql);
  where.params.push(...params);
}
function microsOf(time: unknown): number {
  const value = parseTimestampUs(typeof time === 'string' ? time : null);
  // The server refuses a date it cannot read: so does this read, and the server's answer is shown.
  if (value === null) throw new Error('not a time');
  return value;
}
const stringOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);

function whereOf(request: DispatchListRequest): Where {
  const { filters } = request;
  const w: Where = { sql: [], params: [] };
  const customers = idsOf(filters.customer_ids);
  if (customers.length) add(w, `d.customer_id ${IN_LIST}`, JSON.stringify(customers));
  else if (request.customerId) add(w, 'd.customer_id = ?', request.customerId);

  const items = idsOf(filters.item_ids);
  if (items.length) {
    add(w, `EXISTS (SELECT 1 FROM dispatch_trl i1 JOIN goodsreceived_trl t1 ON t1.id = i1.gr_trl_id WHERE i1.disp_id = d.id AND t1.item_id ${IN_LIST})`, JSON.stringify(items));
  }
  // Every word of the package must be in the package of one line.
  const mark = pgSearchTerms(typeof filters.package_mark === 'string' && filters.package_mark.trim() ? filters.package_mark : null);
  if (mark.length) {
    add(w, `d.id IN (SELECT i2.disp_id FROM dispatch_trl i2 JOIN goodsreceived_trl t2 ON t2.id = i2.gr_trl_id WHERE ${mark.map(() => 'instr(t2.package_mark_lc, ?) > 0').join(' AND ')})`, ...mark);
  }
  // Every word of the search must be on the dispatch or one of its lines.
  const terms = pgSearchTerms(typeof filters.search === 'string' ? filters.search : null);
  for (const term of terms) {
    if (term.includes(UNIT_SEPARATOR)) add(w, '0');
    else if (Array.from(term).length >= 3) add(w, 'd.id IN (SELECT ds.disp_id FROM dispatch_search ds WHERE ds.rowid IN (SELECT rowid FROM dispatch_fts WHERE dispatch_fts MATCH ?))', phrase(term));
    else add(w, 'd.id IN (SELECT ds.disp_id FROM dispatch_search ds WHERE instr(ds.haystack, ?) > 0)', term);
  }
  const prefix = stringOf(filters.disp_no);
  if (prefix) {
    const like = likeUnescaped(`${prefix}%`);
    add(w, `d.disp_no_lc ${like.sql}`, like.param);
  }
  const from = typeof filters.disp_no_from === 'string' ? bareNumber(filters.disp_no_from) : '';
  const to = typeof filters.disp_no_to === 'string' ? bareNumber(filters.disp_no_to) : '';
  if (from) add(w, 'd.disp_no_sk >= ?', documentNumberSortKey(from));
  if (to) add(w, 'd.disp_no_sk <= ?', documentNumberSortKey(to));
  if (stringOf(filters.date_from)) add(w, 'd.disp_date_us >= ?', microsOf(filters.date_from));
  if (stringOf(filters.date_to)) add(w, 'd.disp_date_us <= ?', microsOf(filters.date_to));
  if (stringOf(filters.created_date_from)) add(w, 'd.created_at_us >= ?', microsOf(filters.created_date_from));
  if (stringOf(filters.created_date_to)) add(w, 'd.created_at_us <= ?', microsOf(filters.created_date_to));
  const qtyMin = numberOf(filters.qty_min);
  const qtyMax = numberOf(filters.qty_max);
  if (qtyMin !== null || qtyMax !== null) {
    add(w, 'EXISTS (SELECT 1 FROM dispatch_trl i3 JOIN goodsreceived_trl t3 ON t3.id = i3.gr_trl_id WHERE i3.disp_id = d.id AND t3.qty >= ? AND t3.qty <= ?)', qtyMin ?? 0, qtyMax ?? 999999999);
  }
  const dispMin = numberOf(filters.disp_qty_min);
  const dispMax = numberOf(filters.disp_qty_max);
  if (dispMin !== null || dispMax !== null) {
    add(w, 'EXISTS (SELECT 1 FROM dispatch_trl i4 WHERE i4.disp_id = d.id AND i4.disp_qty >= ? AND i4.disp_qty <= ?)', dispMin ?? 0, dispMax ?? 999999999);
  }
  return w;
}

const whereSql = (w: Where): string => (w.sql.length ? `WHERE ${w.sql.join(' AND ')}` : '');

/** The page's dispatch ids, in the server's order (the document-number sort key is compared as bytes, `COLLATE "C"`). */
async function pageIds(q: CopyReader, request: DispatchListRequest, w: Where, offset: number): Promise<string[]> {
  const direction = request.sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  if (stringOf(request.filters.disp_no)) {
    const found = await q.all<{ id: string }>(
      `SELECT d.id AS id FROM dispatch d ${whereSql(w)} ORDER BY d.disp_no_sk DESC LIMIT ? OFFSET ?`, [...w.params, request.limit, offset]);
    return found.map(r => r.id);
  }
  if (request.sortBy === 'customer_name') {
    // The names are ordered by the server's en_US rule, which SQL here cannot give.
    const all = await q.all<{ id: string; name: string | null; date: number | null; key: string | null }>(
      `SELECT d.id AS id, json_extract(d.row, '$.customer_name') AS name, d.disp_date_us AS date, d.disp_no_sk AS key FROM dispatch d ${whereSql(w)}`, w.params);
    const sign = direction === 'ASC' ? 1 : -1;
    const lastNull = (x: unknown, y: unknown): number | null => (x === null || y === null ? (x === y ? 0 : x === null ? 1 : -1) : null);
    all.sort((a, b) => {
      const byName = lastNull(a.name, b.name);
      const name = byName ?? sign * enCompare(a.name, b.name);
      if (name) return name;
      const byDate = lastNull(a.date, b.date);
      const date = byDate ?? (b.date ?? 0) - (a.date ?? 0);
      if (date) return date;
      return -compareText(a.key ?? '', b.key ?? '') || compareText(a.id, b.id);
    });
    return all.slice(offset, offset + request.limit).map(r => r.id);
  }
  const order =
    request.sortBy === 'disp_no'
      ? `d.disp_no_sk ${direction} NULLS LAST`
      : request.sortBy === 'dispatch_date'
        ? `d.disp_date_us ${direction} NULLS LAST, d.disp_no_sk ${direction}`
        : 'd.disp_date_us DESC NULLS LAST, d.disp_no_sk DESC';
  const found = await q.all<{ id: string }>(`SELECT d.id AS id FROM dispatch d ${whereSql(w)} ORDER BY ${order}, d.id LIMIT ? OFFSET ?`, [...w.params, request.limit, offset]);
  return found.map(r => r.id);
}

interface LineRecord {
  disp_id: string;
  disp_qty: number | null;
  trow: string;
  grow: string;
  lot_id: string;
}

/** A numeric cast to bigint rounds half away from zero. */
const roundHalfAway = (value: number): number => Math.sign(value) * Math.round(Math.abs(value));

function itemsOf(lines: readonly LineRecord[], includeItems: boolean) {
  const totalQty = lines.reduce((sum, l) => sum + (l.disp_qty ?? 0), 0);
  const parsed = lines.map(l => ({ l, t: parseRow(l.trow), g: parseRow(l.grow) }));
  const totalWeight = parsed.reduce((sum, { l, t }) => sum + (l.disp_qty ?? 0) * (numberOf(t.weight) ?? 0), 0);
  const itemCount = new Set(parsed.map(({ t }) => textOf(t.item_id)).filter(id => id !== null)).size;
  const items = includeItems
    ? [...parsed]
        .sort((a, b) => enCompare(textOf(a.t.item_name), textOf(b.t.item_name)) || compareText(a.l.lot_id, b.l.lot_id))
        .map(({ l, t, g }) => ({
          item_id: pick(t, 'item_id'), item_name: pick(t, 'item_name'), disp_qty: l.disp_qty, weight: pick(t, 'weight'), gr_no: pick(g, 'gr_no'),
          grn_qty: pick(t, 'qty'), grn_item_id: l.lot_id, grn_id: pick(g, 'id'), packaging: textOf(t.packaging) ?? '',
          package_mark: pick(t, 'package_mark'), rack: pick(t, 'rack'),
        }))
    : null;
  return { totalQty, totalWeight, itemCount, totalItems: lines.length, items };
}

export async function readDispatchList(q: CopyReader, raw: DispatchListRequest): Promise<DispatchListData> {
  const request = { ...raw, limit: Math.min(Math.max(raw.limit, 1), 200), page: Math.max(raw.page, 1) };
  const offset = (request.page - 1) * request.limit;
  const w = whereOf(request);
  const ids = await pageIds(q, request, w, offset);
  const total = (await q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM dispatch d ${whereSql(w)}`, w.params))?.n ?? 0;
  const rows = ids.length
    ? await q.all<{ id: string; row: string }>(`SELECT id, row FROM dispatch WHERE id ${IN_LIST}`, [JSON.stringify(ids)])
    : [];
  const lines = ids.length
    ? await q.all<LineRecord>(
        `SELECT dt.disp_id AS disp_id, dt.disp_qty AS disp_qty, t.row AS trow, g.row AS grow, t.id AS lot_id
           FROM dispatch_trl dt JOIN goodsreceived_trl t ON t.id = dt.gr_trl_id JOIN goodsreceived g ON g.id = t.gr_id
          WHERE dt.disp_id ${IN_LIST}`,
        [JSON.stringify(ids)]
      )
    : [];
  const byId = new Map(rows.map(r => [r.id, parseRow(r.row)]));
  const linesOf = new Map<string, LineRecord[]>();
  for (const line of lines) linesOf.set(line.disp_id, [...(linesOf.get(line.disp_id) ?? []), line]);
  const overlay = getUnsentOverlay();
  const dispatches = ids.flatMap(id => {
    const row = byId.get(id);
    if (!row) return [];
    const own = itemsOf(linesOf.get(id) ?? [], request.includeItems);
    return [{
      id, disp_no: pick(row, 'disp_no'), imported: row.import_batch_id !== null && row.import_batch_id !== undefined,
      dispatch_date: pick(row, 'disp_date'), customer_id: pick(row, 'customer_id'), customer_name: pick(row, 'customer_name'),
      registration: pick(row, 'registration'), total_qty: own.totalQty,
      total_weight: request.customerShape ? roundHalfAway(own.totalWeight) : own.totalWeight, item_count: own.itemCount,
      ...(request.customerShape ? { total_items: own.totalItems, supervisor_name: pick(row, 'supervisor_name') } : {}),
      items: own.items, notes: pick(row, 'note'), created_at: pick(row, 'created_at'), updated_at: pick(row, 'updated_at'),
      created_by: pick(row, 'created_by'), updated_by: pick(row, 'updated_by'), ...overlay.dispatch(id),
    }];
  });
  // This person's unsent new dispatches (WH-161): on page 1 above the copy's rows, in the count of every page.
  const unsent = await unsentDispatches(q, request);
  const count = total + unsent.length;
  return {
    dispatches: request.page === 1 ? [...unsent, ...dispatches] : dispatches,
    total_count: count,
    current_page: request.page,
    total_pages: Math.ceil(count / request.limit),
    limit: request.limit,
  };
}
