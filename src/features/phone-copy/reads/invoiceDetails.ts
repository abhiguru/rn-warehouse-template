/**
 * An invoice's details over the phone copy (WH-348, product/tech/app-offline-read-more.md section 15): `get_invoice_data`,
 * `get_invoice_items_detailed` and the reasons of `get_invoice_detail`, for an administrator, a supervisor or staff. The
 * text is the definition files and migrations 134, 143, 164, 173, 175, 177, 178 and 191 as read from the backend, not run.
 * Every figure the server works out is a key of the row (`storage_amount`, `payment_state`, `line_amounts`,
 * `items_total_amount`): it is copied as it is and, when the feed does not send it yet, reads as null. Nothing here adds,
 * multiplies or rounds money (M1).
 */
import { stateNameOf } from '@/features/gst/indianStates';
import { enCompare, parseTimestampUs, uuidTimestampUs } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { compareNullsLast, compareNumbers, compareText, numberOf, parseRow, parseRows, pick, textOf, type Row } from './rows';

const isSet = (value: unknown): boolean => value !== null && value !== undefined;
const label = (invoice: Row): string => `${textOf(invoice.inv_prefix) ?? ''}${numberOf(invoice.inv_no) ?? textOf(invoice.inv_no) ?? ''}`;
const obj = (value: unknown): Row => (typeof value === 'object' && value !== null ? (value as Row) : {});

async function one(q: CopyReader, table: string, id: unknown): Promise<Row | null> {
  if (typeof id !== 'string') return null;
  const found = await q.get<{ row: string }>(`SELECT row FROM ${table} WHERE id = ?`, [id]);
  return found ? parseRow(found.row) : null;
}
async function person(q: CopyReader, id: unknown): Promise<Row | null> {
  return (await one(q, 'user_profiles', id)) ?? (await one(q, 'people', id));
}

interface Line {
  line: Row;
  dispatchLine: Row | null;
  dispatch: Row | null;
  lot: Row | null;
  grn: Row | null;
  item: Row | null;
}

async function linesOf(q: CopyReader, invoiceId: string): Promise<Line[]> {
  const lines = parseRows(await q.all<{ row: string }>('SELECT row FROM invoice_trl WHERE invoice_id = ?', [invoiceId]));
  const out: Line[] = [];
  for (const line of lines) {
    const dispatchLine = await one(q, 'dispatch_trl', line.disp_trl_id);
    const dispatch = await one(q, 'dispatch', dispatchLine?.disp_id);
    const lot = await one(q, 'goodsreceived_trl', dispatchLine?.gr_trl_id);
    const grn = await one(q, 'goodsreceived', lot?.gr_id);
    const item = await one(q, 'items', lot?.item_id);
    out.push({ line, dispatchLine, dispatch, lot, grn, item });
  }
  return out;
}

const byLineId = (a: Line, b: Line): number =>
  compareNullsLast(uuidTimestampUs(textOf(a.line.id)), uuidTimestampUs(textOf(b.line.id)), compareNumbers) || compareText(String(a.line.id), String(b.line.id));

/** The kept copy of a line (a cancelled invoice's, or an imported one's) wins over the dispatch line, GRN and item. */
const kept = (line: Row): boolean => isSet(line.details_kept_at);

/** `invoice_gst_json`: the document type, the other document of a two-document save and the GST object. */
async function gstOf(q: CopyReader, invoice: Row, lines: readonly Line[]): Promise<Row> {
  const linked = await one(q, 'invoice', invoice.linked_invoice_id);
  const live = linked && !isSet(linked.deleted_at) ? linked : null;
  const docType = textOf(invoice.doc_type);
  const place = textOf(invoice.gst_place_of_supply);
  return {
    doc_type: pick(invoice, 'doc_type'),
    linked_invoice: live
      ? { id: live.id, inv_no: pick(live, 'inv_no'), inv_fin_year: pick(live, 'inv_fin_year'), doc_type: pick(live, 'doc_type'), total: pick(live, 'total'), cancelled: isSet(live.cancelled_at) }
      : null,
    gst: docType === 'invoice' ? null : {
      supplier: {
        legal_name: pick(invoice, 'gst_supplier_legal_name'), address: pick(invoice, 'gst_supplier_address'), gstin: pick(invoice, 'gst_supplier_gstin'),
        state_code: pick(invoice, 'gst_supplier_state'),
        state_name: typeof invoice.gst_supplier_state === 'string' ? nameOfState(invoice.gst_supplier_state) : null,
      },
      customer: {
        gstin: pick(invoice, 'gst_customer_gstin'), state_code: pick(invoice, 'gst_customer_state'),
        state_name: typeof invoice.gst_customer_state === 'string' ? nameOfState(invoice.gst_customer_state) : null, address: pick(invoice, 'gst_customer_address'),
      },
      place_of_supply: place === null ? null : { code: place, name: nameOfState(place) },
      tax_head: pick(invoice, 'gst_tax_head'), sac_storage: pick(invoice, 'gst_sac_storage'), sac_labour: pick(invoice, 'gst_sac_labour'),
      cgst_amount: pick(invoice, 'cgst_amount'), sgst_amount: pick(invoice, 'sgst_amount'), igst_amount: pick(invoice, 'igst_amount'),
      reverse_charge: isSet(invoice.gst_tax_head) ? false : null,
      lines: [...lines].sort(byLineId).map(({ line }) => ({
        id: line.id, disp_trl_id: pick(line, 'disp_trl_id'), gst_treatment: pick(line, 'gst_treatment'), taxable_value: pick(line, 'taxable_value'),
        tax_amount: pick(line, 'line_tax'), cgst_amount: pick(line, 'cgst_amount'), sgst_amount: pick(line, 'sgst_amount'), igst_amount: pick(line, 'igst_amount'),
      })),
    },
  };
}
/** The name of a GST state code, or null when it is not one (`gst_state_name`). */
const nameOfState = (code: string): string | null => {
  const name = stateNameOf(code);
  return name === code ? null : name;
};

/** `get_invoice_data`'s `data`; null when the copy has no such invoice (the server answers "Invoice not found"). */
export async function readInvoiceData(q: CopyReader, invoiceId: string): Promise<Row | null> {
  const invoice = await one(q, 'invoice', invoiceId);
  if (!invoice || isSet(invoice.deleted_at)) return null;
  const customer = await one(q, 'customers', invoice.customer_id);
  const grn = await one(q, 'goodsreceived', invoice.gr_id);
  if (!customer || !grn) return null;
  const lines = (await linesOf(q, invoiceId)).sort(byLineId);
  const creator = await person(q, invoice.created_by);
  const canceller = await person(q, invoice.cancelled_by);
  const keptMode = lines.map(({ line }) => textOf(line.kept_pricing_mode)).find(mode => mode !== null) ?? null;
  const grnMode = keptMode ?? textOf(grn.pricing_mode);
  const duration = textOf(invoice.duration_mode) ?? 'legacy';
  const year = numberOf(invoice.inv_fin_year);

  const items = lines.map(({ line, dispatchLine, dispatch, lot, grn: lineGrn, item }) => {
    const keptLine = kept(line);
    const quantity = keptLine ? pick(line, 'kept_disp_qty') : pick(dispatchLine, 'disp_qty');
    const lineMode = textOf(line.kept_pricing_mode) ?? textOf(lineGrn?.pricing_mode);
    return {
      item_id: line.id, invoice_id: pick(line, 'invoice_id'), disp_trl_id: pick(line, 'disp_trl_id'),
      details_available: keptLine || dispatchLine !== null, duration: pick(line, 'duration'), no_of_days: pick(line, 'no_of_days'),
      charge: pick(line, 'charge'), tax: pick(line, 'tax'), labour_rate: pick(line, 'labour_rate'),
      storage_amount: isSet(line.issued_storage_amount) ? line.issued_storage_amount : quantity === null ? null : pick(line, 'storage_amount'),
      dispatch: {
        id: pick(dispatchLine, 'id'), gr_id: pick(dispatchLine, 'gr_id'), gr_trl_id: pick(dispatchLine, 'gr_trl_id'), disp_id: pick(dispatchLine, 'disp_id'),
        quantity, disp_no: keptLine ? pick(line, 'kept_disp_no') : pick(dispatch, 'disp_no'), disp_date: keptLine ? pick(line, 'kept_disp_date') : pick(dispatch, 'disp_date'),
      },
      grn_item: {
        id: pick(lot, 'id'), gr_id: pick(lot, 'gr_id'), item_id: pick(lot, 'item_id'), name: keptLine ? pick(line, 'kept_item_name') : pick(lot, 'item_name'),
        packaging: keptLine ? pick(line, 'kept_packaging') : pick(lot, 'packaging'), original_quantity: pick(lot, 'qty'), current_stock: pick(lot, 'stock'),
        weight: keptLine ? pick(line, 'kept_weight') : pick(lot, 'weight'), rack: keptLine ? pick(line, 'kept_rack') : pick(lot, 'rack'),
        package_mark: keptLine ? pick(line, 'kept_package_mark') : pick(lot, 'package_mark'), gr_no: keptLine ? pick(line, 'kept_grn_no') : pick(lineGrn, 'gr_no'),
        gr_date: keptLine ? pick(line, 'kept_grn_date') : pick(lineGrn, 'date'), image_url: pick(lot, 'trl_img_url'), pricing_mode: lineMode,
      },
      catalog: {
        id: pick(item, 'id'), name: keptLine ? pick(line, 'kept_item_name') : pick(item, 'name'),
        packaging: keptLine ? (line.kept_catalog_word_set === true ? pick(line, 'kept_catalog_packaging') : pick(line, 'kept_packaging')) : pick(item, 'packaging'),
        description: pick(item, 'description'), active: pick(item, 'active'),
      },
    };
  });

  const header: Row = {
    invoice_id: invoice.id, invoice_number: pick(invoice, 'inv_no'), inv_prefix: pick(invoice, 'inv_prefix'), invoice_label: label(invoice),
    invoice_date: pick(invoice, 'inv_date'), inv_fin_year: pick(invoice, 'inv_fin_year'), financial_year: year === null ? null : `${year}-${year + 1}`,
    gr_id: pick(invoice, 'gr_id'), gr_no: pick(invoice, 'gr_no'), customer_id: pick(invoice, 'customer_id'),
    invoice_customer_name: pick(invoice, 'customer_name'), inv_name: pick(invoice, 'inv_name'), one_time_charge: pick(invoice, 'one_time_charge'),
    labour: pick(invoice, 'labour'), tax_amount: pick(invoice, 'tax_amount'), total: pick(invoice, 'total'), discount: pick(invoice, 'discount'),
    is_auto_generated: pick(invoice, 'is_auto_generated'), pricing_mode: pick(invoice, 'pricing_mode'), duration_mode: duration,
    charging: { step_days: pick(invoice, 'charge_step_days'), minimum_days: pick(invoice, 'charge_minimum_days'), days_counted: duration, rounding: pick(invoice, 'total_rounding') },
    notes: pick(invoice, 'notes'), created_by: pick(invoice, 'created_by'), updated_at: pick(invoice, 'updated_at'),
    cancelled_at: pick(invoice, 'cancelled_at'), cancel_reason: pick(invoice, 'cancel_reason'), imported: isSet(invoice.import_batch_id),
    cancelled_by: pick(invoice, 'cancelled_by'), cancelled_by_name: canceller ? pick(canceller, 'name') : null,
    customer: {
      id: invoice.customer_id, name: pick(customer, 'name'), first_name: pick(customer, 'firstName'), last_name: pick(customer, 'lastName'),
      address: pick(customer, 'address'), city: pick(customer, 'city'), mobile: pick(customer, 'mobile'), pincode: pick(customer, 'pincode'),
      state: pick(customer, 'state'), telephone1: pick(customer, 'telephone1'), telephone2: pick(customer, 'telephone2'), gst: pick(customer, 'gst'),
      email: pick(customer, 'email'), active: pick(customer, 'active'), contact: pick(customer, 'contact'), pan: pick(customer, 'pan'),
      auto_invoice_generation: pick(customer, 'auto_invoice_generation'), created_at: pick(customer, 'created_at'), updated_at: pick(customer, 'updated_at'),
    },
    grn: {
      id: grn.id, gr_no: pick(grn, 'gr_no'), registration: pick(grn, 'registration'), date: pick(grn, 'date'), sender_id: pick(grn, 'sender_id'),
      sender_name: pick(grn, 'sender_name'), customer_id: pick(grn, 'customer_id'), customer_name: pick(grn, 'customer_name'),
      supervisor_id: pick(grn, 'supervisor_id'), supervisor_name: pick(grn, 'supervisor_name'), note: pick(grn, 'note'), leon: pick(grn, 'leon'),
      out_of_stock: pick(grn, 'out_of_stock'), invoiced: pick(grn, 'invoiced'), image_url: pick(grn, 'gr_image_url'), created_by: pick(grn, 'created_by'),
      updated_by: pick(grn, 'updated_by'), created_at: pick(grn, 'created_at'), updated_at: pick(grn, 'updated_at'), pricing_mode: grnMode,
    },
    created_by_info: { id: pick(invoice, 'created_by'), name: pick(creator, 'name'), display_name: pick(creator, 'display_name'), role: pick(creator, 'role') },
    ...(await gstOf(q, invoice, lines)),
    // Not for staff: the server's own figures, copied as they are (feed topic "sync invoice amounts").
    ...(q.role === 'staff' ? {} : obj(invoice.payment_state)),
  };
  return { header, items };
}

/** `get_invoice_items_detailed`'s `data` (`{ items, summary }`); null when the copy has no such invoice. */
export async function readInvoiceItemsDetailed(q: CopyReader, invoiceId: string): Promise<Row | null> {
  const invoice = await one(q, 'invoice', invoiceId);
  if (!invoice || isSet(invoice.deleted_at)) return null;
  const cancelled = isSet(invoice.cancelled_at);
  // A live invoice lists a line only when every join matches, or when it kept its details.
  const lines = (await linesOf(q, invoiceId)).filter(l => cancelled || kept(l.line) || (l.dispatchLine && l.dispatch && l.lot && l.grn));
  const built = lines.map(({ line, dispatchLine, dispatch, lot, grn, item }) => {
    const keptLine = kept(line);
    const ok = keptLine || dispatchLine !== null;
    const qty = ok ? (keptLine ? pick(line, 'kept_disp_qty') : pick(dispatchLine, 'disp_qty')) : null;
    const dispatchNo = keptLine ? pick(line, 'kept_disp_no') : pick(dispatch, 'disp_no');
    const dispatchDate = keptLine ? pick(line, 'kept_disp_date') : pick(dispatch, 'disp_date');
    const name = keptLine ? pick(line, 'kept_item_name') : pick(lot, 'item_name');
    const amounts = obj(line.line_amounts);
    const mark = keptLine ? pick(line, 'kept_package_mark') : pick(lot, 'package_mark');
    const rack = keptLine ? pick(line, 'kept_rack') : pick(lot, 'rack');
    const weight = keptLine ? pick(line, 'kept_weight') : pick(lot, 'weight');
    const catalogPackaging = keptLine ? pick(line, 'kept_packaging') : pick(item, 'packaging');
    return {
      sort: { no: textOf(dispatchNo), at: uuidTimestampUs(textOf(line.id)), id: String(line.id) },
      qty: typeof qty === 'number' ? qty : 0,
      row: {
        id: line.id, item_id: pick(lot, 'item_id'), duration: pick(line, 'duration'), no_of_days: pick(line, 'no_of_days'),
        charge: numberOf(line.charge) ?? 0, labour_rate: numberOf(line.labour_rate) ?? 0, tax: numberOf(line.tax) ?? 0,
        tax_amount: pick(amounts, 'tax_amount'), total_amount: pick(amounts, 'total_amount'),
        dispatch_qty: ok ? (qty ?? 0) : null, grn_quantity: pick(lot, 'qty'), item_name: name, gr_no: keptLine ? pick(line, 'kept_grn_no') : pick(grn, 'gr_no'),
        dispatch_id: pick(dispatch, 'id'), dispatch_no: dispatchNo, dispatch_date: dispatchDate, package_mark: mark, rack, weight, packaging: catalogPackaging,
        catalog: { id: pick(lot, 'item_id'), name: keptLine ? pick(line, 'kept_item_name') : pick(item, 'name'), packaging: catalogPackaging },
        grn_item: {
          id: pick(lot, 'id'), name, original_quantity: pick(lot, 'qty'), package_mark: mark, rack, weight,
          packaging: keptLine ? pick(line, 'kept_packaging') : pick(lot, 'packaging'),
        },
        details_available: ok,
        dispatch: { id: pick(dispatchLine, 'id'), disp_id: pick(dispatch, 'id'), dispatch_no: dispatchNo, dispatch_date: dispatchDate, quantity: ok ? (qty ?? 0) : null },
      },
    };
  });
  built.sort((a, b) => enCompare(a.sort.no, b.sort.no) || compareNullsLast(a.sort.at, b.sort.at, compareNumbers) || compareText(a.sort.id, b.sort.id));
  return {
    items: built.map(entry => entry.row),
    summary: {
      total_items: built.length,
      // A count of lines and a sum of quantities, no money.
      total_quantity: built.reduce((sum, entry) => sum + entry.qty, 0),
      total_amount: pick(invoice, 'items_total_amount'),
    },
  };
}

/**
 * The Payments tab's part of `get_invoice_detail`: the invoice's paid, due and status (the invoice row's `payment_state`) and its
 * `payments[]`, each row as `payment_json` builds it (the feed's payment rows without `payment_date` and `customer_id`), ordered by
 * the day paid, the time and the payment number. Not for staff (the server sends them none); null when the copy has no such invoice.
 */
export async function readInvoicePayments(q: CopyReader, invoiceId: string): Promise<Row | null> {
  if (q.role === 'staff') throw new Error('payments are not read by staff');
  const invoice = await one(q, 'invoice', invoiceId);
  if (!invoice || isSet(invoice.deleted_at)) return null;
  const rows = parseRows(await q.all<{ row: string }>('SELECT row FROM payments WHERE invoice_id = ?', [invoiceId]));
  rows.sort((a, b) =>
    compareText(textOf(a.paid_on) ?? '', textOf(b.paid_on) ?? '') ||
    compareNullsLast(parseTimestampUs(textOf(a.payment_date)), parseTimestampUs(textOf(b.payment_date)), compareNumbers) ||
    compareNullsLast(numberOf(a.payment_no), numberOf(b.payment_no), compareNumbers));
  return {
    ...obj(invoice.payment_state),
    payments: rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'payment_date' && key !== 'customer_id'))),
  };
}

/** The reasons of `get_invoice_detail` (discount and zero charge, and who set them) from the invoice row; null when none. */
export async function readInvoiceReasons(q: CopyReader, invoiceId: string): Promise<Row | null> {
  const invoice = await one(q, 'invoice', invoiceId);
  if (!invoice || isSet(invoice.deleted_at)) return null;
  return {
    discount_reason: pick(invoice, 'discount_reason'), discount_set_by_name: pick(invoice, 'discount_set_by_name'), discount_set_at: pick(invoice, 'discount_set_at'),
    zero_charge_reason: pick(invoice, 'zero_charge_reason'), zero_charge_set_by_name: pick(invoice, 'zero_charge_set_by_name'), zero_charge_set_at: pick(invoice, 'zero_charge_set_at'),
  };
}
