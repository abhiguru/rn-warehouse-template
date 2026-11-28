/**
 * `get_all_grn_items` over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 4 and 7.1): one
 * row per lot, with the server function's filters, search, order, paging by line or by receipt, count and totals,
 * answered in the server's shape. The expected behaviour is the server function's (backend migrations to 207).
 */
import { PAGINATION } from '@/config/cacheConfig';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import type { GRNItem, GRNListParams } from '@/services/grn-service';
import { documentNumberSortKey } from '@/utils/documentNumber';
import type { SqlValue } from '../copyDriver';
import type { RankKind } from '../copySchema';
import { parseTimestampUs, pgSearchTerms } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay } from '../unsentOverlay';
import { sentHeldByCopy, unsentGrnPart } from './newDocuments';

export interface GrnItemsPage {
  success: true;
  data: GRNItem[];
  pagination: { total_count: number; limit: number; offset: number; unit: 'line' | 'receipt' };
  /** `includes_unsent`: the bags of this person's unsent new GRNs the totals count (WH-161); 0 when none. */
  aggregates: { total_qty: number; total_stock: number; total_weight: number; includes_unsent?: number };
}
export type GrnItemsAnswer =
  | { kind: 'page'; page: GrnItemsPage }
  /** The server refuses these list parameters. */
  | { kind: 'invalid' };

type SortField = NonNullable<GRNListParams['p_sort_by']> | 'weight' | 'package_mark';

interface SortSpec {
  sql: string;
  /** The text is ordered by its en_US rank, joined as `rs`. */
  rank?: { kind: RankKind; value: string };
  /** The column can be empty: the server puts those last ascending and first descending. */
  nullable: boolean;
}

const SORTS: Readonly<Record<SortField, SortSpec>> = {
  date: { sql: 'g.date_us', nullable: true },
  gr_no: { sql: 'g.gr_no_sk', nullable: false },
  customer_name: { sql: 'rs.rank', rank: { kind: 'customer_name', value: "json_extract(g.row, '$.customer_name')" }, nullable: true },
  item_name: { sql: 'rs.rank', rank: { kind: 'item_name', value: "json_extract(t.row, '$.item_name')" }, nullable: true },
  qty: { sql: 't.qty', nullable: true },
  stock: { sql: 't.stock', nullable: true },
  weight: { sql: 't.weight', nullable: true },
  package_mark: { sql: 'rs.rank', rank: { kind: 'package_mark', value: "json_extract(t.row, '$.package_mark')" }, nullable: true },
};
const RECEIPT_SORTS: readonly string[] = ['date', 'gr_no', 'customer_name'];
const sortFieldOf = (field: string | undefined): SortField =>
  field !== undefined && Object.prototype.hasOwnProperty.call(SORTS, field) ? (field as SortField) : 'date';

const UNIT_SEPARATOR = String.fromCharCode(31);
/** SQL `trim`: spaces only. */
const trimSpaces = (text: string): string => text.replace(/^ +| +$/g, '');
/** One FTS5 phrase for a word: on the trigram index a phrase is a substring match. */
const phrase = (word: string): string => `"${word.replace(/"/g, '""')}"`;
/** A list of ids as one parameter. */
const IN_LIST = 'IN (SELECT value FROM json_each(?))';

interface Condition {
  sql: string[];
  params: SqlValue[];
}
export interface Conditions {
  /** On the receipt, `g`. */
  grn: Condition;
  /** On the lot, `t` (and its search row, `ls`). */
  lot: Condition;
  searches: boolean;
  /** The lot conditions pick few lots: the receipts are found from them. */
  selective: boolean;
}

function add(to: Condition, sql: string, ...params: SqlValue[]): void {
  to.sql.push(sql);
  to.params.push(...params);
}

function microsOf(time: string): number {
  const value = parseTimestampUs(time);
  // The server refuses a date it cannot read: so does this read, and the server's answer is shown.
  if (value === null) throw new Error('not a time');
  return value;
}

/** Lot id to its overlaid rack (`r`) and mark (`m`), lower-cased as the copy's search columns are; null when there is none. */
export function lotValuesParam(values: ReadonlyMap<string, Record<string, unknown>> | undefined): string | null {
  if (!values || values.size === 0) return null;
  const out: Record<string, { r?: string | null; m?: string | null }> = {};
  const lower = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value.toLowerCase() : null);
  for (const [lotId, fields] of values) {
    const entry: { r?: string | null; m?: string | null } = {};
    if ('rack' in fields) entry.r = lower(fields.rack);
    if ('package_mark' in fields) entry.m = lower(fields.package_mark);
    if ('r' in entry || 'm' in entry) out[lotId] = entry;
  }
  return Object.keys(out).length === 0 ? null : JSON.stringify(out);
}

/** The unsent entry of the lot `t` (a JSON object), or null. */
const OWN_VALUES = '(SELECT value FROM json_each(?) WHERE key = t.id)';
/** The lot's lower-cased mark or rack: the phone's unsent value when it has one (even blank), else the copy's. */
const effective = (path: '$.m' | '$.r', column: string): string =>
  `CASE WHEN json_type(${OWN_VALUES}, '${path}') IS NULL THEN ${column} ELSE json_extract(${OWN_VALUES}, '${path}') END`;
/** The search row of a lot with an unsent value, built as the copy builds `lot_search.haystack`. */
const OVERLAID_HAYSTACK = `(SELECT coalesce(g2.gr_no_lc, '') || char(31) || coalesce(g2.customer_name_lc, '') || char(31) || coalesce(t.item_name_lc, '') ||
  char(31) || coalesce(${effective('$.m', 't.package_mark_lc')}, '') || char(31) || coalesce(${effective('$.r', 't.rack_lc')}, '') ||
  char(31) || coalesce(g2.registration_lc, '') FROM goodsreceived g2 WHERE g2.id = t.gr_id)`;

/**
 * `lotValues` (the overlay's `lotValues()`) makes search and the mark filter match what a row shows: a lot with an unsent
 * rack or mark is matched on that value and not the copy's (WH-302, Product PQ1). With none, the conditions are the server's.
 */
export function conditionsOf(params: GRNListParams, lotValues?: ReadonlyMap<string, Record<string, unknown>>): Conditions {
  const grn: Condition = { sql: [], params: [] };
  const lot: Condition = { sql: [], params: [] };
  const filters = params.p_filters ?? {};
  if (params.p_date_from) add(grn, 'g.date_us >= ?', microsOf(params.p_date_from));
  if (params.p_date_to) add(grn, 'g.date_us <= ?', microsOf(params.p_date_to));
  if (filters.customer_ids?.length) add(grn, `g.customer_id ${IN_LIST}`, JSON.stringify(filters.customer_ids));
  if (filters.grn_ids?.length) add(grn, `g.id ${IN_LIST}`, JSON.stringify(filters.grn_ids));
  const from = trimSpaces(filters.gr_no_from ?? '');
  const to = trimSpaces(filters.gr_no_to ?? '');
  if (from) add(grn, 'g.gr_no_sk >= ?', documentNumberSortKey(from));
  if (to) add(grn, 'g.gr_no_sk <= ?', documentNumberSortKey(to));
  if (filters.invoiced !== undefined) {
    const state = filters.invoiced === 'partly_invoiced' ? 'partly_invoiced' : filters.invoiced ? 'invoiced' : 'not_invoiced';
    add(grn, 'EXISTS (SELECT 1 FROM grn_lock il WHERE il.id = g.id AND il.invoice_state = ?)', state);
  }

  if (filters.item_ids?.length) add(lot, `t.item_id ${IN_LIST}`, JSON.stringify(filters.item_ids));
  if (filters.stock_status === 'out_of_stock') add(lot, 't.stock = 0');
  else if (filters.stock_status === 'in_stock') add(lot, 't.stock > 0');
  // Under a fifth of the bags received, in whole numbers so no rounding enters.
  else if (filters.stock_status === 'low_stock') add(lot, 't.stock > 0 AND t.stock * 5 < t.qty');
  if (filters.weight_min !== undefined) add(lot, 't.weight >= ?', filters.weight_min);
  if (filters.weight_max !== undefined) add(lot, 't.weight <= ?', filters.weight_max);
  const own = lotValuesParam(lotValues);
  const mark = trimSpaces(filters.package_mark ?? '');
  if (mark && own === null) add(lot, 'instr(t.package_mark_lc, ?) > 0', mark.toLowerCase());
  else if (mark) add(lot, `instr(${effective('$.m', 't.package_mark_lc')}, ?) > 0`, own, own, mark.toLowerCase());

  const terms = pgSearchTerms(filters.search);
  for (const term of terms) {
    // No column holds the separator, so such a word matches nothing.
    if (term.includes(UNIT_SEPARATOR)) {
      add(lot, '0');
      continue;
    }
    const long = Array.from(term).length >= 3;
    const copySql = long ? 'ls.rowid IN (SELECT rowid FROM lot_fts WHERE lot_fts MATCH ?)' : 'instr(ls.haystack, ?) > 0';
    const copyParam = long ? phrase(term) : term;
    if (own === null) add(lot, copySql, copyParam);
    // A lot with an unsent value is matched on its overlaid search row; every other lot as the copy does.
    else add(lot, `CASE WHEN json_type(${OWN_VALUES}) IS NULL THEN ${copySql} ELSE instr(${OVERLAID_HAYSTACK}, ?) > 0 END`, own, copyParam, own, own, own, own, term);
  }
  return { grn, lot, searches: terms.length > 0, selective: terms.length > 0 || Boolean(filters.item_ids?.length) };
}

export const where = (sql: readonly string[]): string => (sql.length ? `WHERE ${sql.join(' AND ')}` : '');
const searchJoin = (c: Conditions): string => (c.searches ? 'JOIN lot_search ls ON ls.lot_id = t.id' : '');
/** Every lot line that passes, with its receipt. */
export const linesFrom = (c: Conditions): string =>
  `FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id ${searchJoin(c)}`;

function orderOf(params: GRNListParams): { by: string; joins: string; ranks: RankKind[] } {
  const spec = SORTS[sortFieldOf(params.p_sort_by)];
  const direction = params.p_sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const nulls = spec.nullable ? ` NULLS ${direction === 'ASC' ? 'LAST' : 'FIRST'}` : '';
  const joins = ["LEFT JOIN text_rank rn ON rn.kind = 'gr_no' AND rn.value = g.gr_no"];
  const ranks: RankKind[] = ['gr_no'];
  if (spec.rank) {
    joins.push(`LEFT JOIN text_rank rs ON rs.kind = '${spec.rank.kind}' AND rs.value = ${spec.rank.value}`);
    ranks.push(spec.rank.kind);
  }
  return { by: `${spec.sql} ${direction}${nulls}, rn.rank`, joins: joins.join(' '), ranks };
}

export interface LineRecord {
  grn_row: string;
  lot_row: string;
  lot_id: string;
  invoice_state: string | null;
}
export const LINE_COLUMNS = 'g.row AS grn_row, t.row AS lot_row, t.id AS lot_id, lk.invoice_state AS invoice_state';
export const LOCK_JOIN = 'LEFT JOIN grn_lock lk ON lk.id = g.id';

const parseRow = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>;

/** One row as the server function builds it. */
export function listRow(record: LineRecord): GRNItem {
  const g = parseRow(record.grn_row);
  const t = parseRow(record.lot_row);
  const pick = (from: Record<string, unknown>, key: string) => from[key] ?? null;
  const overlay = getUnsentOverlay();
  const stock = typeof t.stock === 'number' ? t.stock : null;
  // What this phone changed on the lot and has not sent replaces the copy's value (WH-302; Design 2.2).
  const changed = overlay.lot(record.lot_id);
  const lotValue = (key: string): unknown => (changed !== null && key in changed ? changed[key] : pick(t, key));
  return {
    id: g.id,
    gr_no: pick(g, 'gr_no'),
    date: pick(g, 'date'),
    customer_name: pick(g, 'customer_name'),
    supervisor_name: pick(g, 'supervisor_name'),
    registration: pick(g, 'registration'),
    out_of_stock: pick(g, 'out_of_stock'),
    invoiced: pick(g, 'invoiced'),
    invoice_state: record.invoice_state,
    imported: g.import_batch_id !== null && g.import_batch_id !== undefined,
    note: pick(g, 'note'),
    grn_item_id: record.lot_id,
    item_name: pick(t, 'item_name'),
    packaging: pick(t, 'packaging'),
    qty: pick(t, 'qty'),
    stock: typeof t.stock === 'number' ? stock : pick(t, 'stock'),
    weight: pick(t, 'weight'),
    rack: lotValue('rack'),
    package_mark: lotValue('package_mark'),
    trl_img_url: pick(t, 'trl_img_url'),
  } as unknown as GRNItem;
}

async function pageByLine(q: CopyReader, params: GRNListParams, c: Conditions, limit: number, offset: number): Promise<GRNItem[]> {
  const order = orderOf(params);
  await q.rank(order.ranks);
  const records = await q.all<LineRecord>(
    `SELECT ${LINE_COLUMNS} ${linesFrom(c)} ${order.joins} ${LOCK_JOIN} ${where([...c.grn.sql, ...c.lot.sql])}
      ORDER BY ${order.by}, t.id LIMIT ? OFFSET ?`,
    [...c.grn.params, ...c.lot.params, limit, offset]
  );
  return records.map(listRow);
}

/** `limit` and `offset` count receipts; a page holds every passing line of its receipts, in line order. */
async function pageByReceipt(q: CopyReader, params: GRNListParams, c: Conditions, limit: number, offset: number): Promise<GRNItem[]> {
  const order = orderOf(params);
  await q.rank(order.ranks);
  const lotsOf = `FROM goodsreceived_trl t ${searchJoin(c)}`;
  const hasLine = c.selective
    ? `g.id IN (SELECT t.gr_id ${lotsOf} ${where(c.lot.sql)})`
    : `EXISTS (SELECT 1 ${lotsOf} ${where(['t.gr_id = g.id', ...c.lot.sql])})`;
  const receipts = await q.all<{ id: string }>(
    `SELECT g.id AS id FROM goodsreceived g ${order.joins} ${where([...c.grn.sql, hasLine])}
      ORDER BY ${order.by}, g.id LIMIT ? OFFSET ?`,
    [...c.grn.params, ...c.lot.params, limit, offset]
  );
  if (!receipts.length) return [];
  const position = new Map(receipts.map((receipt, index) => [receipt.id, index]));
  const records = await q.all<LineRecord & { gr_id: string }>(
    `SELECT ${LINE_COLUMNS}, g.id AS gr_id ${linesFrom(c)} ${LOCK_JOIN} ${where([`g.id ${IN_LIST}`, ...c.lot.sql])}
      ORDER BY t.id`,
    [JSON.stringify(receipts.map(r => r.id)), ...c.lot.params]
  );
  // A stable sort: the lines of one receipt stay in line order.
  return records.sort((a, b) => (position.get(a.gr_id) ?? 0) - (position.get(b.gr_id) ?? 0)).map(listRow);
}

export interface Totals {
  lines: number;
  receipts: number;
  total_qty: number;
  total_stock: number;
  total_weight: number;
}
const MAX_KEPT_TOTALS = 4;
/** The count and totals of a first page, for the later pages of the same request over the same records. */
const keptTotals = new Map<string, Totals>();
registerSessionScoped('copy-grn-totals', () => keptTotals.clear());

export async function totalsOf(q: CopyReader, params: GRNListParams, c: Conditions, offset: number): Promise<Totals> {
  const written = (await q.get<{ n: number }>('SELECT total_changes() AS n'))?.n ?? 0;
  // The same request whatever its page (JSON leaves the undefined ones out).
  const request: GRNListParams = { ...params, p_limit: undefined, p_offset: undefined };
  const key = JSON.stringify([q.copyId, q.asOf, written, request, c.lot.params]);
  const kept = offset > 0 ? keptTotals.get(key) : undefined;
  if (kept) return kept;
  const totals = await q.get<Totals>(
    `SELECT COUNT(*) AS lines, COUNT(DISTINCT g.id) AS receipts, COALESCE(SUM(t.qty), 0) AS total_qty,
            COALESCE(SUM(t.stock), 0) AS total_stock, COALESCE(SUM(t.weight), 0) AS total_weight
       ${linesFrom(c)} ${where([...c.grn.sql, ...c.lot.sql])}`,
    [...c.grn.params, ...c.lot.params]
  );
  if (!totals) throw new Error('no totals');
  keptTotals.delete(key);
  keptTotals.set(key, totals);
  for (const oldest of keptTotals.keys()) {
    if (keptTotals.size <= MAX_KEPT_TOTALS) break;
    keptTotals.delete(oldest);
  }
  return totals;
}

/** `params` are the request's, as the server would be sent them. */
export async function readGrnItems(q: CopyReader, params: GRNListParams): Promise<GrnItemsAnswer> {
  const byReceipt = params.p_filters?.page_by === 'receipt';
  if (byReceipt && params.p_sort_by !== undefined && !RECEIPT_SORTS.includes(params.p_sort_by)) return { kind: 'invalid' };
  const limit = params.p_limit ?? PAGINATION.DEFAULT_LIMIT;
  const offset = params.p_offset ?? 0;
  const c = conditionsOf(params, getUnsentOverlay().lotValues?.());
  const rows = await (byReceipt ? pageByReceipt : pageByLine)(q, params, c, limit, offset);
  // After the ranks are up to date, so writing them does not make a first page's totals look old.
  const totals = await totalsOf(q, params, c, offset);
  // This person's unsent new GRNs: rows on top of page 0, and in the count and the totals of every page (WH-161).
  const unsent = unsentGrnPart(params, await sentHeldByCopy(q));
  const shown = offset === 0 ? unsent.rows : [];
  return {
    kind: 'page',
    page: {
      success: true,
      data: [...shown, ...rows],
      pagination: { total_count: (byReceipt ? totals.receipts + unsent.receipts : totals.lines + unsent.rows.length), limit, offset, unit: byReceipt ? 'receipt' : 'line' },
      aggregates: {
        total_qty: totals.total_qty + unsent.qty,
        total_stock: totals.total_stock + unsent.stock,
        total_weight: totals.total_weight + unsent.weight,
        // Only when it counts some, so with nothing unsent the answer is the server's own.
        ...(unsent.stock > 0 ? { includes_unsent: unsent.stock } : {}),
      },
    },
  };
}
