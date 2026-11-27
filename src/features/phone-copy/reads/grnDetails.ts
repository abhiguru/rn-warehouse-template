/**
 * `get_grn_details` over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 4 and 10.4):
 * the server's `data`, key for key, except the rates (Product's PR1: the copy has no rates; the section says it needs a
 * connection). Its text is the baseline function with migrations 137, 165, 174 and 191, as installed on temp1.
 */
import { COPY_FORMAT_V3, COPY_FORMAT_V4 } from '../copySchema';
import { enCompare, parseTimestampUs } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay, netStock } from '../unsentOverlay';
import { lotsOfGrn, removedLotIds } from './lotOverlay';
import { readNewGrnDetails, unsentGrnById } from './newDocuments';
import { customerDetails, itemDetailsById, supervisorDetails } from './documentParts';
import { compareNullsLast, compareNumbers, compareText, comparePhotos, distinctSorted, numberOf, parseRow, parseRows, pick, sumMoney, textOf, type Row } from './rows';

export type GrnDetailsAnswer = { kind: 'found'; grn: Row; needsServer: ['rates'] } | { kind: 'not-found' };

const photo = (p: Row): Row => ({
  id: p.id, storage_path: pick(p, 'storage_path'), image_url: pick(p, 'storage_path'), original_filename: pick(p, 'original_filename'),
  file_size: pick(p, 'file_size'), mime_type: pick(p, 'mime_type'), display_order: pick(p, 'display_order'),
  uploaded_by: pick(p, 'uploaded_by'), created_at: pick(p, 'created_at'),
});

/**
 * The GRN's own rates, as the server's `rates` lists them (administrators and supervisors; staff get an empty list):
 * the stored figures, ordered by item name, lower weight and id (WH-348). A copy of format 2 holds none.
 */
async function ratesOf(q: CopyReader, grnId: string, archived: boolean): Promise<Row[]> {
  if (q.role === 'staff') return [];
  const found = await q.all<{ row: string; item_name: string | null }>(
    'SELECT r.row AS row, i.name AS item_name FROM grn_rates r LEFT JOIN items i ON i.id = json_extract(r.row, \'$.item_id\') WHERE r.gr_id = ?',
    [grnId]
  );
  return found
    .map(record => ({ rate: parseRow(record.row), name: record.item_name }))
    .sort((a, b) =>
      enCompare(a.name, b.name) ||
      compareNullsLast(numberOf(a.rate.weight_min), numberOf(b.rate.weight_min), compareNumbers) ||
      compareText(String(a.rate.id), String(b.rate.id)))
    .map(({ rate, name }) => ({
      id: rate.id, item_id: pick(rate, 'item_id'), item_name: name, price_type: pick(rate, 'price_type'), weight_min: pick(rate, 'weight_min'),
      weight_max: pick(rate, 'weight_max'), unit_price: pick(rate, 'unit_price'), labour_rate: pick(rate, 'labour_rate'),
      tax_percent: pick(rate, 'tax_percent'), archived,
    }));
}

const labelOf = (inv: Row): string => `${textOf(inv.inv_prefix) ?? ''}${String(inv.inv_no)}`;

/** Whether this GRN may be invoiced now (migration 174's rule), as far as the copy can tell. */
async function canCreateInvoice(q: CopyReader, grn: Row, lockImported: boolean): Promise<boolean> {
  // Which lines an imported invoice takes as billed is not on the phone: such a GRN is never offered.
  if (grn.deleted_at !== null && grn.deleted_at !== undefined) return false;
  if (lockImported) return false;
  const free = await q.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dispatch_trl dt JOIN dispatch d ON d.id = dt.disp_id AND d.deleted_at IS NULL
      WHERE dt.gr_id = ? AND NOT EXISTS (SELECT 1 FROM invoice_trl it JOIN invoice iv ON iv.id = it.invoice_id
        WHERE it.disp_trl_id = dt.id AND iv.deleted_at IS NULL AND iv.cancelled_at IS NULL)`,
    [String(grn.id)]
  );
  const hasFreeLine = (free?.n ?? 0) > 0;
  const charging = await q.get<{ row: string }>("SELECT row FROM settings WHERE id = 'charging_rule'");
  const onLeave = charging ? parseRow(charging.row).invoice_as_goods_leave === true : false;
  if (onLeave) return hasFreeLine;
  return hasFreeLine && grn.out_of_stock === true && grn.invoiced === false;
}

/** The GRN's unchecked replaced entries, newest first (`get_grn_details.replacements`). */
async function replacementsOf(q: CopyReader, grnId: string): Promise<Row[]> {
  const found = await q.all<{ row: string }>('SELECT row FROM grn_replacements WHERE grn_id = ? ORDER BY sent_at_us DESC, id', [grnId]);
  return parseRows(found);
}

export async function readGrnDetails(q: CopyReader, grnId: string): Promise<GrnDetailsAnswer> {
  const found = await q.get<{ row: string }>('SELECT row FROM goodsreceived WHERE id = ?', [grnId]);
  if (!found) {
    // A GRN that exists only on this phone (WH-161): answered from the overlay, with no server call.
    const unsent = unsentGrnById(grnId);
    return unsent ? { kind: 'found', grn: await readNewGrnDetails(q, unsent), needsServer: ['rates'] } : { kind: 'not-found' };
  }
  const g = parseRow(found.row);
  const overlay = getUnsentOverlay();
  const gOver = { ...g, ...overlay.grn(grnId) };

  const lotRecords = await q.all<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE gr_id = ? ORDER BY id', [grnId]);
  const lots: Row[] = lotsOfGrn(parseRows(lotRecords), grnId, overlay, true);
  // A line the person removed and has not sent stays in its place, but the totals are without it (Design 6.x DQ4).
  const removedIds = new Set(removedLotIds(overlay, grnId));
  const counted = lots.filter(l => !removedIds.has(String(l.id)));
  const lotIds = lots.map(l => String(l.id));
  const items = await itemDetailsById(q, [...new Set(lots.map(l => textOf(l.item_id)).filter((id): id is string => id !== null))]);

  const photos = parseRows(await q.all<{ row: string }>('SELECT row FROM grn_images WHERE grn_id = ?', [grnId]));
  const header = photos.filter(p => p.image_type === 'header').sort(comparePhotos).map(photo);
  const photosOf = (lotId: string) => photos.filter(p => p.image_type === 'item' && p.grn_item_id === lotId).sort(comparePhotos).map(photo);

  const dispatched = lotIds.length
    ? await q.all<{ disp_id: string; disp_qty: number | null; disp_no: string | null }>(
        `SELECT dt.disp_id AS disp_id, dt.disp_qty AS disp_qty, json_extract(d.row, '$.disp_no') AS disp_no
           FROM dispatch_trl dt JOIN dispatch d ON d.id = dt.disp_id
          WHERE dt.gr_trl_id IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(lotIds)]
      )
    : [];
  const totalDispatched = dispatched.reduce((sum, line) => sum + (line.disp_qty ?? 0), 0);

  const invoiceRows = parseRows(await q.all<{ row: string }>('SELECT row FROM invoice WHERE gr_id = ? AND deleted_at IS NULL', [grnId]));
  const live = invoiceRows.filter(inv => inv.cancelled_at === null || inv.cancelled_at === undefined);
  const byInvoice = (a: Row, b: Row) =>
    compareNullsLast(numberOf(a.inv_fin_year), numberOf(b.inv_fin_year), compareNumbers) ||
    compareNullsLast(numberOf(a.inv_no), numberOf(b.inv_no), compareNumbers) || compareText(String(a.id), String(b.id));
  live.sort(byInvoice);
  const labelPairs = [...new Map(live.filter(inv => numberOf(inv.inv_no) !== null).map(inv => [`${String(inv.inv_no)}|${labelOf(inv)}`, inv])).values()]
    .sort((a, b) => (numberOf(a.inv_no) ?? 0) - (numberOf(b.inv_no) ?? 0) || compareText(labelOf(a), labelOf(b)));
  const lock = await q.get<{ row: string }>('SELECT row FROM grn_lock WHERE id = ?', [grnId]);
  const lockRow = lock ? parseRow(lock.row) : null;

  const weights = counted.reduce((sum, l) => sum + (numberOf(l.weight) ?? 0) * (numberOf(l.qty) ?? 0), 0);
  const dispatchIds = new Set(dispatched.map(line => line.disp_id));
  const itemIdsOfLots = new Set(counted.map(l => textOf(l.item_id)).filter(id => id !== null));
  const grn: Row = {
    id: g.id,
    gr_no: pick(gOver, 'gr_no'),
    date: pick(gOver, 'date'),
    registration: pick(gOver, 'registration'),
    note: pick(gOver, 'note'),
    gr_image_url: pick(g, 'gr_image_url'),
    invoiced: gOver.invoiced ?? false,
    imported: g.import_batch_id !== null && g.import_batch_id !== undefined,
    leon: g.leon ?? false,
    out_of_stock: gOver.out_of_stock ?? false,
    pricing_mode: pick(g, 'pricing_mode'),
    duration_mode: pick(g, 'duration_mode'),
    // A copy of format 2 holds no rates: the key is left out and the service says they need the server (WH-299).
    // WH-303: the unchecked replaced entries, for the staff roles (a customer account has no such entity on the phone).
    ...(q.format >= COPY_FORMAT_V4 ? { replacements: await replacementsOf(q, grnId) } : {}),
    ...(q.format >= COPY_FORMAT_V3 ? { rates: await ratesOf(q, grnId, gOver.invoiced === true) } : {}),
    created_at: pick(g, 'created_at'),
    updated_at: pick(g, 'updated_at'),
    header_images: header,
    customer_details: await customerDetails(q, g.customer_id),
    supervisor_details: await supervisorDetails(q, g.supervisor_id, g.supervisor_name),
    sender_details: { id: pick(g, 'sender_id'), name: pick(g, 'sender_name') },
    items: lots.map(l => ({
      id: l.id, qty: pick(l, 'qty'), stock: l.stock, weight: pick(l, 'weight'), rack: pick(l, 'rack'),
      package_mark: pick(l, 'package_mark'), item_name: pick(l, 'item_name'), packaging: pick(l, 'packaging'),
      pricing_mode: pick(g, 'pricing_mode'), trl_img_url: pick(l, 'trl_img_url'),
      item_images: photosOf(String(l.id)), item_details: items.get(String(l.item_id)) ?? null,
    })),
    statistics: {
      total_items: itemIdsOfLots.size,
      total_qty: counted.reduce((sum, l) => sum + (numberOf(l.qty) ?? 0), 0),
      total_stock: counted.reduce((sum, l) => sum + (numberOf(l.stock) ?? 0), 0),
      total_weight: weights,
      total_dispatched: totalDispatched,
      has_out_of_stock: counted.some(l => (numberOf(l.stock) ?? 0) <= 0),
    },
    invoices_summary: {
      total_invoices: live.length,
      invoice_state: lockRow?.invoice_state ?? null,
      can_create_invoice: await canCreateInvoice(q, g, lockRow?.imported === true),
      invoices: live.map(inv => ({
        id: inv.id, inv_no: pick(inv, 'inv_no'), inv_fin_year: pick(inv, 'inv_fin_year'), inv_prefix: pick(inv, 'inv_prefix'),
        invoice_label: labelOf(inv), inv_date: pick(inv, 'inv_date'), total: pick(inv, 'total'),
      } satisfies Row)),
      cancelled_count: invoiceRows.length - live.length,
      total_amount: sumMoney(live.map(inv => numberOf(inv.total) ?? 0)),
      invoice_labels: labelPairs.map(labelOf),
      invoice_numbers: [...new Set(live.map(inv => numberOf(inv.inv_no)).filter((n): n is number => n !== null))].sort(compareNumbers),
    },
    dispatches_summary: {
      total_dispatches: dispatchIds.size,
      dispatch_numbers: distinctSorted(dispatched.map(line => line.disp_no)),
    },
  };
  return { kind: 'found', grn, needsServer: ['rates'] };
}

export type ItemDispatchesAnswer =
  | { kind: 'found'; dispatches: Row[]; summary: { total_dispatches: number; total_dispatched_qty: number; remaining_stock: number | null } }
  | { kind: 'not-found' };

/** `get_grn_item_dispatches`: the dispatches that took from one lot, newest first. */
export async function readItemDispatches(q: CopyReader, lotId: string): Promise<ItemDispatchesAnswer> {
  const lot = await q.get<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE id = ?', [lotId]);
  if (!lot) return { kind: 'not-found' };
  const l = parseRow(lot.row);
  const lines = await q.all<{ id: string; disp_id: string; disp_qty: number | null; drow: string }>(
    `SELECT dt.id AS id, dt.disp_id AS disp_id, dt.disp_qty AS disp_qty, d.row AS drow
       FROM dispatch_trl dt JOIN dispatch d ON d.id = dt.disp_id WHERE dt.gr_trl_id = ?`,
    [lotId]
  );
  const rows = lines.map(line => ({ line, d: parseRow(line.drow) }));
  // Newest first; a dispatch with no date comes first, as Postgres sorts a descending column.
  const dated = (d: Row): number | null => parseTimestampUs(textOf(d.disp_date));
  rows.sort((a, b) => {
    const [x, y] = [dated(a.d), dated(b.d)];
    const byDate = x === null || y === null ? (x === y ? 0 : x === null ? -1 : 1) : y - x;
    return byDate || enCompare(textOf(b.d.disp_no), textOf(a.d.disp_no)) || compareText(b.line.id, a.line.id);
  });
  const overlay = getUnsentOverlay();
  return {
    kind: 'found',
    dispatches: rows.map(({ line, d }) => ({
      id: line.id, dispatch_id: line.disp_id, disp_no: pick(d, 'disp_no'), disp_quantity: line.disp_qty, disp_date: pick(d, 'disp_date'),
      customer_name: pick(d, 'customer_name'), registration: pick(d, 'registration'), supervisor_name: pick(d, 'supervisor_name'), note: pick(d, 'note'),
    })),
    summary: {
      total_dispatches: lines.length,
      total_dispatched_qty: lines.reduce((sum, line) => sum + (line.disp_qty ?? 0), 0),
      remaining_stock: netStock(overlay, lotId, numberOf(l.stock)),
    },
  };
}
