/**
 * `get_grn_details` over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 4 and 10.4):
 * the server's `data`, key for key, except the rates (Product's PR1: the copy has no rates; the section says it needs a
 * connection). Its text is the baseline function with migrations 137, 165, 174 and 191, as installed on temp1.
 */
import { COPY_FORMAT_V3, COPY_FORMAT_V4 } from '../copySchema';
import { enCompare } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay } from '../unsentOverlay';
import { lotsOfGrn, removedLotIds } from './lotOverlay';
import { readNewGrnDetails, unsentGrnById } from './newDocuments';
import { customerDetails, itemDetailsById, supervisorDetails } from './documentParts';
import { answerFor, compareNullsLast, compareNumbers, compareText, comparePhotos, numberOf, parseRow, parseRows, pick, textOf, type Row } from './rows';

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
  // Only administrators and supervisors are answered the rates; staff and a customer account get an empty list.
  if (q.role !== 'admin' && q.role !== 'supervisor') return [];
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
  const items = await itemDetailsById(q, [...new Set(lots.map(l => textOf(l.item_id)).filter((id): id is string => id !== null))]);

  const photos = parseRows(await q.all<{ row: string }>('SELECT row FROM grn_images WHERE grn_id = ?', [grnId]));
  const header = photos.filter(p => p.image_type === 'header').sort(comparePhotos).map(photo);
  const photosOf = (lotId: string) => photos.filter(p => p.image_type === 'item' && p.grn_item_id === lotId).sort(comparePhotos).map(photo);

  const lock = q.role === 'customer' ? null : await q.get<{ row: string }>('SELECT row FROM grn_lock WHERE id = ?', [grnId]);
  const lockRow = lock ? parseRow(lock.row) : null;

  const weights = counted.reduce((sum, l) => sum + (numberOf(l.weight) ?? 0) * (numberOf(l.qty) ?? 0), 0);
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
      // The bags that left each lot: what was received less what is left (no dispatch is on the phone, WH-381).
      total_dispatched: counted.reduce((sum, l) => sum + Math.max(0, (numberOf(l.qty) ?? 0) - (numberOf(l.stock) ?? 0)), 0),
      has_out_of_stock: counted.some(l => (numberOf(l.stock) ?? 0) <= 0),
    },
    // Invoices and dispatches are not on the phone (WH-381): the sections say they need a connection.
    invoices_summary: {
      total_invoices: 0,
      invoice_state: lockRow?.invoice_state ?? null,
      can_create_invoice: false,
      invoices: [],
      cancelled_count: 0,
      total_amount: 0,
      invoice_labels: [],
      invoice_numbers: [],
    },
    dispatches_summary: { total_dispatches: 0, dispatch_numbers: [] },
  };
  return { kind: 'found', grn: answerFor(q.role, grn), needsServer: ['rates'] };
}
