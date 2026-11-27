/**
 * The dispatch form's GRN reads over the phone copy (WH-161, product/tech/app-offline-new-records.md 7 and 17): the number
 * search, the prefix buttons, the customer's GRNs with stock and a GRN's lots, each as the server function or table read
 * answers it (`searchGRNNumbers`, `get_grn_prefixes_with_stock` migration 133, `get_customer_grns_with_stock_dispatch_sorted`
 * migration 119, `get_grn_details`). Stock is the net figure (the copy's less what this phone has not sent). A new GRN this
 * phone has not sent is listed in the picker, disabled; it never gives lots to a dispatch.
 */
import { enCompare, likeUnescaped } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay, netStock, type NewDocRow } from '../unsentOverlay';
import { customerDetails } from './documentParts';
import { IN_LIST, numberOf, parseRow, parseRows, pick, textOf, type Row } from './rows';

/** A GRN of the picker; `unsent` marks one that exists only on this phone (shown disabled). */
export interface PickerGrn {
  id: string;
  gr_no: string;
  date: string;
  customer_name: string;
  unsent?: boolean;
}

export interface PickerGrnWithStock {
  grn_id: string;
  gr_no: string;
  grn_date: string;
  customer_name: string;
  total_stock: number;
  item_count: number;
  last_dispatch_date: string | null;
  unsent?: boolean;
}

export type GrnForDispatch = { kind: 'found'; grn: Row } | { kind: 'not-found' };

const SEARCH_LIMIT = 50;
const SPACES = /^ +| +$/g;

const asRow = (value: unknown): Row => (typeof value === 'object' && value !== null ? (value as Row) : {});

/** This person's new GRNs not yet sent (saved or sending), for a customer; a sent one is the copy's after the next sync. */
function unsentGrns(customerId: string | null | undefined): NewDocRow[] {
  return getUnsentOverlay()
    .newDocuments('grn')
    .filter(doc => doc.refused !== true && (doc.state === 'saved' || doc.state === 'sending'))
    .filter(doc => customerId === null || customerId === undefined || asRow(doc.header).customer_id === customerId);
}

const pickerRowOfUnsent = (doc: NewDocRow): PickerGrn => {
  const header = asRow(doc.header);
  return {
    id: doc.localId as string,
    gr_no: typeof doc.number === 'string' ? doc.number : '',
    date: textOf(header.date) ?? '',
    customer_name: textOf(header.customer_name) ?? '',
    unsent: true,
  };
};

/** A LIKE pattern (`%`, `_`, `\` escapes) as a regular expression, for the unsent GRNs' typed numbers. */
function likeAsRegex(pattern: string): RegExp {
  let source = '';
  for (let at = 0; at < pattern.length; at += 1) {
    const char = pattern[at];
    if (char === '\\' && at + 1 < pattern.length) {
      at += 1;
      source += pattern[at].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (char === '%') source += '[\\s\\S]*';
    else if (char === '_') source += '[\\s\\S]';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}

/** The lots of GRNs with stock, each with its net stock (a lot the copy shows at 0 stays out), by GRN id. */
async function netLotsByGrn(q: CopyReader, grnIds: readonly string[]): Promise<Map<string, { id: string; stock: number }[]>> {
  const byGrn = new Map<string, { id: string; stock: number }[]>();
  if (grnIds.length === 0) return byGrn;
  const overlay = getUnsentOverlay();
  const lots = await q.all<{ gr_id: string; id: string; stock: number | null }>(
    `SELECT gr_id, id, stock FROM goodsreceived_trl WHERE gr_id ${IN_LIST} AND stock > 0`,
    [JSON.stringify(grnIds)]
  );
  for (const lot of lots) {
    const stock = netStock(overlay, lot.id, lot.stock ?? 0) ?? 0;
    if (stock <= 0) continue;
    byGrn.set(lot.gr_id, [...(byGrn.get(lot.gr_id) ?? []), { id: lot.id, stock }]);
  }
  return byGrn;
}

/**
 * `searchGRNNumbers`: the customer's GRNs not out of stock whose number matches the LIKE pattern, number descending, 50.
 * An unsent GRN with a typed number that matches is listed too, first.
 */
export async function readGrnNumberSearch(q: CopyReader, pattern: string, customerId: string | undefined): Promise<PickerGrn[]> {
  const like = likeUnescaped(pattern);
  const found = await q.all<{ row: string }>(
    `SELECT row FROM goodsreceived WHERE deleted_at IS NULL AND out_of_stock = 0 AND gr_no_lc ${like.sql}${customerId ? ' AND customer_id = ?' : ''}`,
    customerId ? [like.param, customerId] : [like.param]
  );
  let rows = parseRows(found);
  // A GRN that this phone's unsent dispatches have emptied is no longer on offer.
  if (getUnsentOverlay().deductions().size > 0) {
    const lots = await netLotsByGrn(q, rows.map(row => String(row.id)));
    rows = rows.filter(row => lots.has(String(row.id)));
  }
  rows.sort((a, b) => enCompare(textOf(b.gr_no), textOf(a.gr_no)));
  const matching = likeAsRegex(like.param);
  const unsent = unsentGrns(customerId)
    .filter(doc => typeof doc.number === 'string' && doc.number !== '' && matching.test(doc.number))
    .map(pickerRowOfUnsent);
  const server = rows.map(row => ({
    id: String(row.id),
    gr_no: textOf(row.gr_no) ?? '',
    date: textOf(row.date) ?? '',
    customer_name: textOf(row.customer_name) ?? '',
  }));
  return [...unsent, ...server].slice(0, SEARCH_LIMIT);
}

/** `get_grn_prefixes_with_stock` (migration 133): the run of non-digits at the start of the number, upper-cased, with its GRN count. */
export async function readGrnPrefixes(q: CopyReader, customerId: string | null | undefined): Promise<{ prefix: string; grn_count: number }[]> {
  const grns = await q.all<{ id: string; gr_no: string | null }>(
    `SELECT id, gr_no FROM goodsreceived WHERE deleted_at IS NULL AND gr_no IS NOT NULL${customerId ? ' AND customer_id = ?' : ''}`,
    customerId ? [customerId] : []
  );
  const withStock = await netLotsByGrn(q, grns.map(grn => grn.id));
  const counts = new Map<string, number>();
  for (const grn of grns) {
    const number = (grn.gr_no ?? '').replace(SPACES, '');
    if (number === '' || !withStock.has(grn.id)) continue;
    const run = number.replace(/[0-9][\s\S]*$/, '').replace(SPACES, '').toUpperCase();
    const prefix = run !== '' ? run : number.charAt(0);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return [...counts.entries()].map(([prefix, grn_count]) => ({ prefix, grn_count })).sort((a, b) => enCompare(a.prefix, b.prefix));
}

/**
 * `get_customer_grns_with_stock_dispatch_sorted` (migration 119): the customer's GRNs with stock, most recently dispatched
 * first. This phone's unsent GRNs come first on the first page, disabled.
 */
export async function readCustomerGrnsWithStock(q: CopyReader, customerId: string, limit: number, offset: number): Promise<PickerGrnWithStock[]> {
  const take = limit < 1 ? 20 : Math.min(limit, 100);
  const skip = offset < 0 ? 0 : offset;
  const grns = parseRows(await q.all<{ row: string }>('SELECT row FROM goodsreceived WHERE deleted_at IS NULL AND customer_id = ?', [customerId]));
  const lots = await netLotsByGrn(q, grns.map(grn => String(grn.id)));
  const last = new Map<string, string>();
  const dispatched = await q.all<{ gr_id: string; disp_date: string | null }>(
    `SELECT dt.gr_id AS gr_id, MAX(json_extract(d.row, '$.disp_date')) AS disp_date
       FROM dispatch_trl dt JOIN dispatch d ON d.id = dt.disp_id AND d.deleted_at IS NULL
      WHERE dt.gr_id ${IN_LIST} GROUP BY dt.gr_id`,
    [JSON.stringify([...lots.keys()])]
  );
  for (const line of dispatched) if (line.disp_date) last.set(line.gr_id, line.disp_date);
  const text = (value: unknown): string => textOf(value) ?? '';
  const rows = grns
    .filter(grn => lots.has(String(grn.id)))
    .map(grn => {
      const own = lots.get(String(grn.id)) ?? [];
      return {
        grn_id: String(grn.id),
        gr_no: text(grn.gr_no),
        grn_date: text(grn.date),
        customer_name: text(grn.customer_name),
        total_stock: own.reduce((sum, lot) => sum + lot.stock, 0),
        item_count: own.length,
        last_dispatch_date: last.get(String(grn.id)) ?? null,
      };
    })
    .sort((a, b) => {
      if (a.last_dispatch_date !== b.last_dispatch_date) {
        if (a.last_dispatch_date === null) return 1;
        if (b.last_dispatch_date === null) return -1;
        return a.last_dispatch_date < b.last_dispatch_date ? 1 : -1;
      }
      if (a.grn_date !== b.grn_date) return a.grn_date < b.grn_date ? 1 : -1;
      return enCompare(a.gr_no, b.gr_no) || (a.grn_id < b.grn_id ? -1 : a.grn_id > b.grn_id ? 1 : 0);
    })
    .slice(skip, skip + take);
  if (skip > 0) return rows;
  const unsent = unsentGrns(customerId)
    .sort((a, b) => Number(b.recordedAt ?? 0) - Number(a.recordedAt ?? 0))
    .map(doc => {
      const row = pickerRowOfUnsent(doc);
      const lines = Array.isArray(doc.lines) ? (doc.lines as unknown[]).map(asRow) : [];
      return {
        grn_id: row.id,
        gr_no: row.gr_no,
        grn_date: row.date,
        customer_name: row.customer_name,
        total_stock: lines.reduce((sum, line) => sum + (numberOf(line.qty) ?? 0), 0),
        item_count: lines.length,
        last_dispatch_date: null,
        unsent: true,
      };
    });
  return [...unsent, ...rows];
}

/**
 * `get_grn_details` as the dispatch form's services use it: the receipt, its customer and its lots with the net stock, under
 * the server's key names. A GRN that only exists on this phone has no lots to dispatch from, so it is not found here.
 */
async function readGrnRow(q: CopyReader, record: { row: string } | null): Promise<GrnForDispatch> {
  if (!record) return { kind: 'not-found' };
  const g = parseRow(record.row);
  const grnId = String(g.id);
  const overlay = getUnsentOverlay();
  const gOver = { ...g, ...overlay.grn(grnId) };
  const lotRecords = await q.all<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE gr_id = ? ORDER BY id', [grnId]);
  const lots = parseRows(lotRecords).map((l): Row => ({ ...l, ...overlay.lot(String(l.id)), stock: netStock(overlay, String(l.id), numberOf(l.stock)) }));
  const customer = (await customerDetails(q, g.customer_id)) ?? { id: pick(g, 'customer_id'), name: pick(g, 'customer_name') };
  return {
    kind: 'found',
    grn: {
      id: g.id,
      gr_no: pick(gOver, 'gr_no'),
      date: pick(gOver, 'date'),
      customer_name: pick(g, 'customer_name'),
      customer_details: customer,
      items: lots.map(l => ({
        id: l.id, item_id: pick(l, 'item_id'), item_name: pick(l, 'item_name'), qty: pick(l, 'qty'), stock: l.stock,
        weight: pick(l, 'weight'), rack: pick(l, 'rack'), package_mark: pick(l, 'package_mark'), packaging: pick(l, 'packaging'),
        item_details: null,
      })),
    },
  };
}

/** The GRN with this number (the service's `.single()` lookup): none, or more than one, is not found. */
export async function readGrnForDispatchByNumber(q: CopyReader, grNo: string): Promise<GrnForDispatch> {
  const found = await q.all<{ row: string }>('SELECT row FROM goodsreceived WHERE gr_no = ? AND deleted_at IS NULL', [grNo]);
  return readGrnRow(q, found.length === 1 ? found[0] : null);
}

export async function readGrnForDispatchById(q: CopyReader, grnId: string): Promise<GrnForDispatch> {
  return readGrnRow(q, await q.get<{ row: string }>('SELECT row FROM goodsreceived WHERE id = ? AND deleted_at IS NULL', [grnId]));
}
