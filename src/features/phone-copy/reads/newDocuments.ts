/**
 * What this phone's unsent new GRNs add to the copy's answers (WH-161, product/tech/app-offline-new-records.md 6, 7a, 17.4):
 * their rows on page 0 of the GRN list, their details by local id, and their bags in the stock totals. All of it is empty when
 * nothing is unsent, so every answer is then exactly the copy's (parity with the server).
 */
import type { GRNItem, GRNListParams } from '@/services/grn-service';
import { documentNumberSortKey } from '@/utils/documentNumber';
import { parseTimestampUs, pgSearchTerms } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay, type NewDocRow, type NewLotRow, type UnsentOverlay } from '../unsentOverlay';
import { customerDetails, supervisorDetails } from './documentParts';
import { numberOf, textOf, type Row } from './rows';

/** The overlay's new documents and lots; none from a stand-in overlay that does not have them. */
const overlay = (): Partial<UnsentOverlay> => getUnsentOverlay();
const documentsOf = (): readonly NewDocRow[] => overlay().newDocuments?.('grn') ?? [];
const lotsOfOverlay = (): readonly NewLotRow[] => overlay().newLots?.() ?? [];

const asRow = (value: unknown): Row => (typeof value === 'object' && value !== null ? (value as Row) : {});
const linesOf = (doc: NewDocRow): Row[] => (Array.isArray(doc.lines) ? (doc.lines as unknown[]).map(asRow) : []);

/** Local ids of sent GRNs the copy already holds (by server id, else by number); they add no row, lot or total (WH-404). */
export type HeldBySync = ReadonlySet<string>;
const NONE_HELD: HeldBySync = new Set();

/**
 * The sent new GRNs whose record the copy already has: matched by the server's id first, by the number as a fallback.
 * Until a sync run ends after the send the overlay still lists such a GRN, so the list would show it twice (WH-404).
 */
export async function sentHeldByCopy(q: CopyReader): Promise<HeldBySync> {
  const sent = documentsOf().filter(doc => doc.state === 'sent');
  if (sent.length === 0) return NONE_HELD;
  const held = new Set<string>();
  for (const doc of sent) {
    const id = typeof doc.serverId === 'string' && doc.serverId !== '' ? doc.serverId : null;
    const number = typeof doc.number === 'string' && doc.number !== '' ? doc.number : null;
    const byId = id === null ? null : await q.get<{ id: string }>('SELECT id FROM goodsreceived WHERE id = ?', [id]);
    const found = byId ?? (number === null ? null : await q.get<{ id: string }>('SELECT id FROM goodsreceived WHERE gr_no = ?', [number]));
    if (found) held.add(String(doc.localId));
  }
  return held;
}

/** The unsent GRNs that give rows to a list: not refused (a refused one adds nothing to totals; Product PQ3), and not held by the copy. */
const liveDocuments = (held: HeldBySync): NewDocRow[] => documentsOf().filter(doc => doc.refused !== true && !held.has(String(doc.localId)));

/** The start of a document's day in India, as the copy keeps dates; null when it is not a day. */
function dayMicros(day: unknown): number | null {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? parseTimestampUs(`${day}T00:00:00+05:30`) : null;
}

/** Whether a line of an unsent GRN passes the list's search and filters; a filter it cannot be tested on hides it (DQ3). */
function matches(doc: NewDocRow, line: Row, params: GRNListParams): boolean {
  const filters = params.p_filters ?? {};
  const header = asRow(doc.header);
  const stock = numberOf(line.stock) ?? 0;
  const day = dayMicros(header.date);
  for (const [bound, test] of [[params.p_date_from, (us: number, limit: number) => us >= limit], [params.p_date_to, (us: number, limit: number) => us <= limit]] as const) {
    if (!bound) continue;
    const limit = parseTimestampUs(bound);
    if (day === null || limit === null || !test(day, limit)) return false;
  }
  if (filters.customer_ids?.length && !filters.customer_ids.includes(String(header.customer_id))) return false;
  // Filters that need a number, an id or an invoice the document does not have yet.
  if (filters.grn_ids?.length || filters.invoiced !== undefined) return false;
  const number = typeof doc.number === 'string' ? doc.number : null;
  const from = (filters.gr_no_from ?? '').trim();
  const to = (filters.gr_no_to ?? '').trim();
  if (from || to) {
    if (number === null) return false;
    if (from && documentNumberSortKey(number) < documentNumberSortKey(from)) return false;
    if (to && documentNumberSortKey(number) > documentNumberSortKey(to)) return false;
  }
  if (filters.item_ids?.length && !filters.item_ids.includes(String(line.item_id))) return false;
  if (filters.stock_status === 'out_of_stock') return false;
  if (filters.stock_status === 'low_stock' && !(stock > 0 && stock * 5 < (numberOf(line.qty) ?? 0))) return false;
  const weight = numberOf(line.weight);
  if (filters.weight_min !== undefined && (weight === null || weight < filters.weight_min)) return false;
  if (filters.weight_max !== undefined && (weight === null || weight > filters.weight_max)) return false;
  const mark = (filters.package_mark ?? '').trim().toLowerCase();
  if (mark && !(textOf(line.package_mark) ?? '').toLowerCase().includes(mark)) return false;
  const haystack = [number, header.customer_name, line.item_name, line.package_mark, line.rack, header.registration]
    .map(value => (typeof value === 'string' ? value.toLowerCase() : ''))
    .join('\u001f');
  return pgSearchTerms(filters.search).every(term => haystack.includes(term));
}

/** A line of an unsent GRN as a row of the list: the receipt's fields and the lot's, the ids being the local ones. */
function listRowOf(doc: NewDocRow, line: Row): GRNItem {
  const header = asRow(doc.header);
  return {
    id: doc.localId,
    grn_id: doc.localId,
    // An empty number is a real receipt to the list (it stays visible); the card says "Number when sent" for it (WH-161).
    gr_no: typeof doc.number === 'string' ? doc.number : '',
    date: header.date ?? null,
    customer_id: header.customer_id ?? null,
    customer_name: header.customer_name ?? null,
    supervisor_name: header.supervisor_name ?? null,
    registration: header.registration ?? null,
    out_of_stock: false,
    invoiced: false,
    invoice_state: null,
    imported: false,
    note: header.note ?? null,
    grn_item_id: line.id,
    item_id: line.item_id ?? null,
    item_name: line.item_name ?? null,
    packaging: line.packaging ?? null,
    qty: line.qty ?? null,
    stock: line.stock ?? null,
    weight: line.weight ?? null,
    rack: line.rack ?? null,
    package_mark: line.package_mark ?? null,
    trl_img_url: null,
  } as unknown as GRNItem;
}

export interface UnsentListPart {
  /** Rows for page 0, newest first, a receipt's lines together. */
  rows: GRNItem[];
  receipts: number;
  qty: number;
  stock: number;
  weight: number;
}

/** The unsent new GRNs that match the list's request. */
export function unsentGrnPart(params: GRNListParams, held: HeldBySync = NONE_HELD): UnsentListPart {
  const part: UnsentListPart = { rows: [], receipts: 0, qty: 0, stock: 0, weight: 0 };
  const documents = [...liveDocuments(held)].sort((a, b) => Number(b.recordedAt ?? 0) - Number(a.recordedAt ?? 0));
  for (const doc of documents) {
    const passing = linesOf(doc).filter(line => matches(doc, line, params));
    if (passing.length === 0) continue;
    part.receipts += 1;
    for (const line of passing) {
      part.rows.push(listRowOf(doc, line));
      part.qty += numberOf(line.qty) ?? 0;
      part.stock += numberOf(line.stock) ?? 0;
      part.weight += numberOf(line.weight) ?? 0;
    }
  }
  return part;
}

/** The unsent (or just-sent, pre-sync) GRN with this local or server id, or undefined. */
export const unsentGrnById = (id: string): NewDocRow | undefined =>
  documentsOf().find(doc => doc.localId === id || doc.serverId === id);

/** `get_grn_details` for an unsent GRN, from the copy and the overlay alone (no server call; rates and invoices need one). */
export async function readNewGrnDetails(q: CopyReader, doc: NewDocRow): Promise<Row> {
  const header = asRow(doc.header);
  const lines = linesOf(doc);
  const customer = (await customerDetails(q, header.customer_id)) ?? { id: header.customer_id ?? null, name: header.customer_name ?? null };
  const supervisorName = typeof header.supervisor_name === 'string' ? header.supervisor_name : undefined;
  const supervisor = await supervisorDetails(q, undefined, supervisorName);
  const qty = lines.reduce((sum, line) => sum + (numberOf(line.qty) ?? 0), 0);
  return {
    id: doc.serverId ?? doc.localId,
    gr_no: typeof doc.number === 'string' ? doc.number : null,
    date: header.date ?? null,
    registration: header.registration ?? null,
    note: header.note ?? null,
    gr_image_url: null,
    invoiced: false,
    imported: false,
    leon: false,
    out_of_stock: false,
    pricing_mode: header.pricing_mode ?? null,
    duration_mode: null,
    rates: [],
    created_at: null,
    updated_at: null,
    header_images: [],
    customer_details: customer,
    supervisor_details: supervisor ?? (supervisorName ? { name: supervisorName } : null),
    sender_details: { id: null, name: header.sender_name ?? null },
    items: lines.map(line => ({
      id: line.id, qty: line.qty ?? null, stock: line.stock ?? null, weight: line.weight ?? null, rack: line.rack ?? null,
      package_mark: line.package_mark ?? null, item_name: line.item_name ?? null, packaging: line.packaging ?? null,
      pricing_mode: header.pricing_mode ?? null, trl_img_url: null, item_images: [], item_details: null,
    })),
    statistics: {
      total_items: new Set(lines.map(line => line.item_id)).size,
      total_qty: qty,
      total_stock: qty,
      total_weight: lines.reduce((sum, line) => sum + (numberOf(line.weight) ?? 0) * (numberOf(line.qty) ?? 0), 0),
      total_dispatched: 0,
      has_out_of_stock: false,
    },
    invoices_summary: { total_invoices: 0, invoice_state: null, can_create_invoice: false, invoices: [], cancelled_count: 0, total_amount: 0, invoice_labels: [], invoice_numbers: [] },
    dispatches_summary: { total_dispatches: 0, dispatch_numbers: [] },
  };
}

/** What the unsent lots add to a stock total (7a): bags, weight (per bag times bags, as the copy totals it), receipts. */
export interface UnsentStock {
  bags: number;
  weight: number;
  receipts: number;
}

/** The unsent lots of one customer, or of everyone, summed. */
export function unsentStockOf(customerId?: string, held: HeldBySync = NONE_HELD): UnsentStock {
  const lots: NewLotRow[] = unsentLotsOf(customerId, held);
  return {
    bags: lots.reduce((sum, lot) => sum + lot.stock, 0),
    weight: lots.reduce((sum, lot) => sum + (lot.weight ?? 0) * lot.stock, 0),
    receipts: new Set(lots.map(lot => lot.grn_id)).size,
  };
}
export function unsentLotsOf(customerId?: string, held: HeldBySync = NONE_HELD): NewLotRow[] {
  return lotsOfOverlay().filter(lot => (customerId === undefined || lot.customer_id === customerId) && !held.has(lot.grn_id));
}
