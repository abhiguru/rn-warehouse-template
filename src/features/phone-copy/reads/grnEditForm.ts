/**
 * The data of the "Edit GRN" form from the phone copy (WH-303; product/tech/app-offline-edit-grn.md sections 2 and 14.3):
 * what `loadGRNData` answers from the server, built from the copy plus this person's own unsent changes, so a second edit
 * starts from the phone's values. Used only while the phone is offline; online the form reads the server.
 */
import { firstDispatchDayOf, invoiceRefOf, locksOfLines, updatedAtOf } from '@/features/grn/services/grnEditState';
import type { GRNHeaderData, GRNImageData, GRNInvoiceRef, GRNItemData } from '@/store/slices/grnFormSlice';
import { COPY_FORMAT_V3 } from '../copySchema';
import { photoFile } from '../photoStore';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay } from '../unsentOverlay';
import { lotsOfGrn } from './lotOverlay';
import { comparePhotos, numberOf, parseRow, parseRows, pick, textOf, type Row } from './rows';

export interface GrnEditFormAnswer {
  header: GRNHeaderData;
  items: GRNItemData[];
  /** The GRN's own rates in `get_grn_details`' shape; the service reads them with `grnRatesFromDetails`. Empty for staff. */
  rates: Row[];
  grnInvoiced: boolean;
  grnImported: boolean;
  updatedAt: string | null;
  invoice: GRNInvoiceRef | null;
  firstDispatchDate: string | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

async function photoOf(p: Row): Promise<GRNImageData> {
  const storagePath = textOf(p.storage_path) ?? undefined;
  const createdAt = textOf(p.created_at);
  // A photo kept on this phone is shown; any other is a frame the form cannot fill (Design 2.5).
  const kept = storagePath ? await photoFile(storagePath) : null;
  return {
    id: String(p.id),
    fileName: textOf(p.original_filename) ?? 'image.jpg',
    imageUrl: kept ?? '',
    uploadStatus: 'completed',
    uploadProgress: 100,
    ...(storagePath ? { storagePath } : {}),
    fileSize: numberOf(p.file_size) ?? 0,
    mimeType: textOf(p.mime_type) ?? 'image/jpeg',
    ...(createdAt ? { uploadTimestamp: createdAt } : {}),
  };
}

/** The GRN's rates as `get_grn_details` lists them; an administrator's or supervisor's copy of format 3 holds them. */
async function ratesOf(q: CopyReader, grnId: string, archived: boolean): Promise<Row[]> {
  if (q.role === 'staff' || q.format < COPY_FORMAT_V3) return [];
  const found = await q.all<{ row: string; item_name: string | null }>(
    "SELECT r.row AS row, i.name AS item_name FROM grn_rates r LEFT JOIN items i ON i.id = json_extract(r.row, '$.item_id') WHERE r.gr_id = ?",
    [grnId]
  );
  return found.map(record => {
    const rate = parseRow(record.row);
    return {
      id: rate.id, item_id: pick(rate, 'item_id'), item_name: record.item_name, price_type: pick(rate, 'price_type'), weight_min: pick(rate, 'weight_min'),
      weight_max: pick(rate, 'weight_max'), unit_price: pick(rate, 'unit_price'), labour_rate: pick(rate, 'labour_rate'),
      tax_percent: pick(rate, 'tax_percent'), archived,
    };
  });
}

/** The form's data, or null when the GRN is not in the copy or is deleted. */
export async function readGrnEditForm(q: CopyReader, grnId: string): Promise<GrnEditFormAnswer | null> {
  const found = await q.get<{ row: string }>('SELECT row FROM goodsreceived WHERE id = ?', [grnId]);
  if (!found) return null;
  const g = parseRow(found.row);
  if (g.deleted_at !== null && g.deleted_at !== undefined) return null;
  const overlay = getUnsentOverlay();
  const own = { ...g, ...overlay.grn(grnId) };

  const lock = await q.get<{ row: string }>('SELECT row FROM grn_lock WHERE id = ?', [grnId]);
  const lockRow = lock ? parseRow(lock.row) : {};
  const locks = locksOfLines(lockRow.lines);

  const copyLots = parseRows(await q.all<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE gr_id = ? ORDER BY id', [grnId]));
  // A removed line is not in the form: a second edit starts from what the phone shows without it.
  const lots = lotsOfGrn(copyLots, grnId, overlay, false);

  const photos = parseRows(await q.all<{ row: string }>('SELECT row FROM grn_images WHERE grn_id = ?', [grnId])).sort(comparePhotos);
  const headerPhotos = await Promise.all(photos.filter(p => p.image_type === 'header').map(photoOf));
  const photosOf = async (lotId: string): Promise<GRNImageData[]> =>
    Promise.all(photos.filter(p => p.image_type === 'item' && p.grn_item_id === lotId).map(photoOf));

  const invoice = invoiceRefOf(lockRow.invoice);
  const grnInvoiced = g.invoiced === true || invoice !== null || lockRow.invoice_state === 'invoiced';
  const items: GRNItemData[] = [];
  for (const lot of lots) {
    const id = String(lot.id);
    const lotLocks = locks.get(id);
    items.push({
      grn_trl_id: id,
      item_table_id: text(lot.item_id),
      item_name: text(lot.item_name),
      packaging: text(lot.packaging),
      qty: numberOf(lot.qty) ?? 0,
      stock: numberOf(lot.stock) ?? 0,
      weight: numberOf(lot.weight) ?? 0,
      rack: text(lot.rack),
      package_mark: text(lot.package_mark),
      trl_images: await photosOf(id),
      ...(lotLocks ? { locks: lotLocks } : {}),
    });
  }

  const header: GRNHeaderData = {
    gr_no: text(own.gr_no),
    registration: text(own.registration),
    date: text(own.date),
    sender_id: text(own.sender_id),
    sender_name: text(own.sender_name),
    customer_id: text(own.customer_id),
    customer_name: text(own.customer_name),
    supervisor_id: text(own.supervisor_id),
    supervisor_name: text(own.supervisor_name),
    note: text(own.note),
    leon: own.leon === true,
    pricing_mode: own.pricing_mode === 'ONE_TIME' ? 'ONE_TIME' : 'MONTHLY',
    gr_images: headerPhotos,
  };
  return {
    header,
    items,
    rates: await ratesOf(q, grnId, grnInvoiced),
    grnInvoiced,
    grnImported: lockRow.imported === true || (g.import_batch_id !== null && g.import_batch_id !== undefined),
    updatedAt: updatedAtOf(lockRow.updated_at),
    invoice,
    firstDispatchDate: firstDispatchDayOf(lockRow.first_dispatch_date),
  };
}
