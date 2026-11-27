/**
 * `get_dispatch_details` over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 4 and 10.4):
 * the server's `data`, key for key, except the invoice amounts (Product's PR1: the copy has no amounts; the Invoices
 * tab says they need a connection). Its text is the baseline function with migrations 137, 191 and 196, as installed on
 * temp1. A line that a live imported invoice takes as billed is not known to the phone (`imported_billed_dispatches` is
 * not in the feed): it shows no invoice.
 */
import { COPY_FORMAT_V3 } from '../copySchema';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay, netStock } from '../unsentOverlay';
import { readNewDispatchDetails, unsentDispatchById } from './newDispatches';
import { customerDetails, itemDetailsById, supervisorDetails } from './documentParts';
import { answerFor, compareText, comparePhotos, distinctSorted, numberOf, parseRow, parseRows, pick, textOf, type Row } from './rows';

export type DispatchDetailsAnswer = { kind: 'found'; dispatch: Row; needsServer: ['invoiceAmounts'] } | { kind: 'not-found' };

const labelOf = (inv: Row): string => `${textOf(inv.inv_prefix) ?? ''}${String(inv.inv_no)}`;
const mean = (values: readonly number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export async function readDispatchDetails(q: CopyReader, dispatchId: string): Promise<DispatchDetailsAnswer> {
  const found = await q.get<{ row: string }>('SELECT row FROM dispatch WHERE id = ?', [dispatchId]);
  if (!found) {
    // A dispatch that exists only on this phone (WH-161): answered from the copy's lots and the overlay.
    const unsent = unsentDispatchById(dispatchId);
    return unsent ? { kind: 'found', dispatch: await readNewDispatchDetails(q, unsent), needsServer: ['invoiceAmounts'] } : { kind: 'not-found' };
  }
  const d = parseRow(found.row);
  const overlay = getUnsentOverlay();
  const dOver = { ...d, ...overlay.dispatch(dispatchId) };

  const images = parseRows(await q.all<{ row: string }>('SELECT row FROM dispatch_images WHERE dispatch_id = ?', [dispatchId]))
    .filter(p => p.status === 'confirmed')
    .sort(comparePhotos);

  const lineRecords = await q.all<{ row: string }>('SELECT row FROM dispatch_trl WHERE disp_id = ? ORDER BY id', [dispatchId]);
  const lines = parseRows(lineRecords);
  const lotIds = lines.map(l => textOf(l.gr_trl_id)).filter((id): id is string => id !== null);
  const grnIds = [...new Set(lines.map(l => textOf(l.gr_id)).filter((id): id is string => id !== null))];
  const byId = async (table: 'goodsreceived_trl' | 'goodsreceived', ids: readonly string[]): Promise<Map<string, Row>> => {
    const rows = ids.length
      ? parseRows(await q.all<{ row: string }>(`SELECT row FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]))
      : [];
    return new Map(rows.map(r => [String(r.id), r]));
  };
  const lots = await byId('goodsreceived_trl', lotIds);
  const grns = await byId('goodsreceived', grnIds);
  const items = await itemDetailsById(q, [...new Set([...lots.values()].map(l => textOf(l.item_id)).filter((id): id is string => id !== null))]);

  // The live invoice line of each dispatch line, with its invoice.
  const lineIds = lines.map(l => String(l.id));
  const invoiceLines = lineIds.length
    ? await q.all<{ trow: string; irow: string }>(
        `SELECT it.row AS trow, iv.row AS irow FROM invoice_trl it JOIN invoice iv ON iv.id = it.invoice_id
          WHERE iv.deleted_at IS NULL AND iv.cancelled_at IS NULL AND it.disp_trl_id IN (SELECT value FROM json_each(?))
          ORDER BY it.id`,
        [JSON.stringify(lineIds)]
      )
    : [];
  const invoiceOf = new Map<string, { t: Row; inv: Row }>();
  for (const record of invoiceLines) {
    const t = parseRow(record.trow);
    if (!invoiceOf.has(String(t.disp_trl_id))) invoiceOf.set(String(t.disp_trl_id), { t, inv: parseRow(record.irow) });
  }

  // From format 3 the copy carries the invoice figures; before it they stay on the server (WH-299, PR1).
  const amounts = q.format >= COPY_FORMAT_V3;
  const items_ = lines.map(line => {
    const lot = lots.get(String(line.gr_trl_id)) ?? null;
    const grn = grns.get(String(line.gr_id)) ?? null;
    const billed = invoiceOf.get(String(line.id)) ?? null;
    return {
      id: line.id, disp_qty: pick(line, 'disp_qty'), grn_id: pick(line, 'gr_id'), grn_item_id: pick(line, 'gr_trl_id'),
      grn_item_details: lot
        ? {
            id: lot.id, qty: pick(lot, 'qty'), stock: netStock(overlay, String(lot.id), numberOf(lot.stock)), weight: pick(lot, 'weight'),
            rack: pick(lot, 'rack'), package_mark: pick(lot, 'package_mark'), item_name: pick(lot, 'item_name'), packaging: pick(lot, 'packaging'),
            pricing_mode: pick(grn, 'pricing_mode'), trl_img_url: pick(lot, 'trl_img_url'),
          }
        : null,
      grn_details: grn
        ? {
            id: grn.id, gr_no: pick(grn, 'gr_no'), date: pick(grn, 'date'), registration: pick(grn, 'registration'),
            customer_name: pick(grn, 'customer_name'), supervisor_name: pick(grn, 'supervisor_name'), sender_name: pick(grn, 'sender_name'),
            invoiced: pick(grn, 'invoiced'), out_of_stock: pick(grn, 'out_of_stock'),
          }
        : null,
      item_details: lot ? (items.get(String(lot.item_id)) ?? null) : null,
      // The charge, tax, labour rate and total are the server's stored figures, copied as they are (WH-348, decision 4). A
      // copy of format 2 is told by the service to keep WH-299's line in their place.
      invoice_details: billed
        ? {
            invoice_trl_id: billed.t.id, invoice_id: billed.t.invoice_id, duration: pick(billed.t, 'duration'), no_of_days: pick(billed.t, 'no_of_days'),
            ...(amounts ? { charge: pick(billed.t, 'charge'), tax: pick(billed.t, 'tax'), labour_rate: pick(billed.t, 'labour_rate') } : {}),
            invoice_no: pick(billed.inv, 'inv_no'), invoice_label: labelOf(billed.inv), invoice_date: pick(billed.inv, 'inv_date'),
            ...(amounts ? { total: pick(billed.inv, 'total') } : {}),
          }
        : null,
    };
  });

  const invoicesOnLines = [...invoiceOf.values()];
  const liveInvoices = [...new Map(invoicesOnLines.map(({ inv }) => [String(inv.id), inv])).values()];
  const numbered = liveInvoices.filter(inv => numberOf(inv.inv_no) !== null);
  const labelPairs = [...new Map(numbered.map(inv => [`${String(inv.inv_no)}|${labelOf(inv)}`, inv])).values()]
    .sort((a, b) => (numberOf(a.inv_no) ?? 0) - (numberOf(b.inv_no) ?? 0) || compareText(labelOf(a), labelOf(b)));

  const dispatch: Row = {
    id: d.id,
    disp_no: pick(dOver, 'disp_no'),
    imported: d.import_batch_id !== null && d.import_batch_id !== undefined,
    disp_date: pick(dOver, 'disp_date'),
    registration: pick(dOver, 'registration'),
    note: pick(dOver, 'note'),
    disp_image_url: pick(d, 'disp_image_url'),
    source_order_id: pick(d, 'source_order_id'),
    source_order_no: pick(d, 'source_order_no'),
    created_at: pick(d, 'created_at'),
    updated_at: pick(d, 'updated_at'),
    images: images.map(p => ({
      id: p.id, storage_path: pick(p, 'storage_path'), original_filename: pick(p, 'original_filename'), file_size: pick(p, 'file_size'),
      mime_type: pick(p, 'mime_type'), display_order: pick(p, 'display_order'), created_at: pick(p, 'created_at'),
    })),
    customer_details: await customerDetails(q, d.customer_id),
    supervisor_details: await supervisorDetails(q, d.supervisor_id, d.supervisor_name),
    items: items_,
    statistics: {
      total_items: new Set(lines.map(l => textOf(l.gr_trl_id)).filter(id => id !== null)).size,
      total_dispatched_qty: lines.reduce((sum, l) => sum + (numberOf(l.disp_qty) ?? 0), 0),
      unique_grns: new Set(lines.map(l => textOf(l.gr_id)).filter(id => id !== null)).size,
      total_invoiced_items: invoicesOnLines.length,
      avg_duration: mean(invoicesOnLines.map(({ t }) => numberOf(t.duration)).filter((n): n is number => n !== null)),
      avg_no_of_days: mean(invoicesOnLines.map(({ t }) => numberOf(t.no_of_days)).filter((n): n is number => n !== null)),
    },
    grns_summary: {
      total_grns: grns.size,
      grn_numbers: distinctSorted([...grns.values()].map(g => textOf(g.gr_no))),
    },
    invoices_summary: {
      total_invoices: liveInvoices.length,
      invoice_labels: labelPairs.map(labelOf),
      invoice_numbers: [...new Set(numbered.map(inv => numberOf(inv.inv_no)).filter((n): n is number => n !== null))].sort((a, b) => a - b),
    },
  };
  return { kind: 'found', dispatch: answerFor(q.role, dispatch), needsServer: ['invoiceAmounts'] };
}
