/**
 * What this phone's unsent new dispatches add to the dispatch list and details (WH-161, product/tech/app-offline-new-records.md
 * 6 and 17.4): their rows on page 1 above the copy's rows, and their details by local id, read from the copy's lots and the
 * overlay alone. Empty when nothing is unsent, so every answer is then exactly the copy's.
 */
import { parseTimestampUs, pgSearchTerms } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay, type NewDocRow, type UnsentOverlay } from '../unsentOverlay';
import { customerDetails, supervisorDetails } from './documentParts';
import type { DispatchListRequest } from './dispatchList';
import { numberOf, parseRow, textOf, type Row } from './rows';

const asRow = (value: unknown): Row => (typeof value === 'object' && value !== null ? (value as Row) : {});
const overlay = (): Partial<UnsentOverlay> => getUnsentOverlay();
const documents = (): readonly NewDocRow[] => overlay().newDocuments?.('dispatch') ?? [];

/** The unsent dispatch with this local id, or undefined. */
export const unsentDispatchById = (localId: string): NewDocRow | undefined => documents().find(doc => doc.localId === localId);

interface LotLine {
  lot: Row;
  grn: Row;
  qty: number;
}

/** The lines of an unsent dispatch with their lot and GRN as the copy holds them. */
async function linesOf(q: CopyReader, doc: NewDocRow): Promise<LotLine[]> {
  const lines = Array.isArray(doc.lines) ? (doc.lines as unknown[]).map(asRow) : [];
  const out: LotLine[] = [];
  for (const line of lines) {
    const found = await q.get<{ trow: string; grow: string }>(
      'SELECT t.row AS trow, g.row AS grow FROM goodsreceived_trl t JOIN goodsreceived g ON g.id = t.gr_id WHERE t.id = ?',
      [String(line.lot_id)]
    );
    if (found) out.push({ lot: parseRow(found.trow), grn: parseRow(found.grow), qty: numberOf(line.qty) ?? 0 });
  }
  return out;
}

const dayMicros = (day: unknown): number | null =>
  typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? parseTimestampUs(`${day}T00:00:00+05:30`) : null;

/** Whether an unsent dispatch passes the list's filters; a filter it cannot be tested on hides it (Design DQ3). */
function matches(doc: NewDocRow, lines: readonly LotLine[], request: DispatchListRequest): boolean {
  const { filters } = request;
  const header = asRow(doc.header);
  const ids = Array.isArray(filters.customer_ids) ? filters.customer_ids.filter((id): id is string => typeof id === 'string') : [];
  if (ids.length > 0 && !ids.includes(String(header.customer_id))) return false;
  if (ids.length === 0 && request.customerId && request.customerId !== header.customer_id) return false;
  const untestable = ['disp_no', 'disp_no_from', 'disp_no_to', 'created_date_from', 'created_date_to', 'qty_min', 'qty_max', 'disp_qty_min', 'disp_qty_max', 'package_mark'];
  if (untestable.some(key => filters[key] !== undefined && filters[key] !== null && filters[key] !== '')) return false;
  const itemIds = Array.isArray(filters.item_ids) ? filters.item_ids : [];
  if (itemIds.length > 0 && !lines.some(line => itemIds.includes(line.lot.item_id))) return false;
  const day = dayMicros(header.date);
  for (const [bound, test] of [[filters.date_from, (us: number, limit: number) => us >= limit], [filters.date_to, (us: number, limit: number) => us <= limit]] as const) {
    if (typeof bound !== 'string' || bound === '') continue;
    const limit = parseTimestampUs(bound);
    if (day === null || limit === null || !test(day, limit)) return false;
  }
  const haystack = [doc.number, header.customer_name, header.registration, ...lines.map(line => line.lot.item_name)]
    .map(value => (typeof value === 'string' ? value.toLowerCase() : ''))
    .join('\u001f');
  return pgSearchTerms(typeof filters.search === 'string' ? filters.search : null).every(term => haystack.includes(term));
}

function listRow(doc: NewDocRow, lines: readonly LotLine[], includeItems: boolean): Row {
  const header = asRow(doc.header);
  return {
    id: doc.localId,
    disp_no: typeof doc.number === 'string' ? doc.number : null,
    imported: false,
    dispatch_date: header.date ?? null,
    customer_id: header.customer_id ?? null,
    customer_name: header.customer_name ?? null,
    registration: header.registration ?? null,
    total_qty: lines.reduce((sum, line) => sum + line.qty, 0),
    total_weight: lines.reduce((sum, line) => sum + line.qty * (numberOf(line.lot.weight) ?? 0), 0),
    item_count: new Set(lines.map(line => textOf(line.lot.item_id))).size,
    items: includeItems
      ? lines.map(line => ({
          item_id: line.lot.item_id ?? null, item_name: line.lot.item_name ?? null, disp_qty: line.qty, weight: line.lot.weight ?? null,
          gr_no: line.grn.gr_no ?? null, grn_qty: line.lot.qty ?? null, grn_item_id: line.lot.id, grn_id: line.grn.id,
          packaging: textOf(line.lot.packaging) ?? '', package_mark: line.lot.package_mark ?? null, rack: line.lot.rack ?? null,
        }))
      : null,
    notes: header.note ?? null,
    created_at: null,
    updated_at: null,
    created_by: null,
    updated_by: null,
  };
}

/** The unsent dispatches that match the list's request, newest first (shown on page 1; counted on every page). */
export async function unsentDispatches(q: CopyReader, request: DispatchListRequest): Promise<Row[]> {
  const docs = [...documents()].filter(doc => doc.refused !== true).sort((a, b) => Number(b.recordedAt ?? 0) - Number(a.recordedAt ?? 0));
  const rows: Row[] = [];
  for (const doc of docs) {
    const lines = await linesOf(q, doc);
    if (matches(doc, lines, request)) rows.push(listRow(doc, lines, request.includeItems));
  }
  return rows;
}

/** `get_dispatch_details` for an unsent dispatch: no server call; invoices and PDFs need one. */
export async function readNewDispatchDetails(q: CopyReader, doc: NewDocRow): Promise<Row> {
  const header = asRow(doc.header);
  const lines = await linesOf(q, doc);
  const supervisorName = typeof header.supervisor_name === 'string' ? header.supervisor_name : undefined;
  return {
    id: doc.localId,
    disp_no: typeof doc.number === 'string' ? doc.number : null,
    imported: false,
    disp_date: header.date ?? null,
    registration: header.registration ?? null,
    note: header.note ?? null,
    disp_image_url: null,
    source_order_id: null,
    source_order_no: null,
    created_at: null,
    updated_at: null,
    images: [],
    customer_details: (await customerDetails(q, header.customer_id)) ?? { id: header.customer_id ?? null, name: header.customer_name ?? null },
    supervisor_details: (await supervisorDetails(q, undefined, supervisorName)) ?? (supervisorName ? { name: supervisorName } : null),
    items: lines.map(line => ({
      id: `${String(doc.localId)}:${String(line.lot.id)}`, disp_qty: line.qty, grn_id: line.grn.id, grn_item_id: line.lot.id,
      grn_item_details: {
        id: line.lot.id, qty: line.lot.qty ?? null, stock: line.lot.stock ?? null, weight: line.lot.weight ?? null, rack: line.lot.rack ?? null,
        package_mark: line.lot.package_mark ?? null, item_name: line.lot.item_name ?? null, packaging: line.lot.packaging ?? null,
        pricing_mode: line.grn.pricing_mode ?? null, trl_img_url: null,
      },
      grn_details: {
        id: line.grn.id, gr_no: line.grn.gr_no ?? null, date: line.grn.date ?? null, registration: line.grn.registration ?? null,
        customer_name: line.grn.customer_name ?? null, supervisor_name: line.grn.supervisor_name ?? null, sender_name: line.grn.sender_name ?? null,
        invoiced: line.grn.invoiced ?? null, out_of_stock: line.grn.out_of_stock ?? null,
      },
      item_details: null,
      invoice_details: null,
    })),
    statistics: {
      total_items: new Set(lines.map(line => textOf(line.lot.id))).size,
      total_dispatched_qty: lines.reduce((sum, line) => sum + line.qty, 0),
      unique_grns: new Set(lines.map(line => textOf(line.grn.id))).size,
      total_invoiced_items: 0,
      avg_duration: 0,
      avg_no_of_days: 0,
    },
    grns_summary: { total_grns: new Set(lines.map(line => textOf(line.grn.id))).size, grn_numbers: [...new Set(lines.map(line => textOf(line.grn.gr_no)).filter((n): n is string => n !== null))] },
    invoices_summary: { total_invoices: 0, invoice_labels: [], invoice_numbers: [] },
  };
}
