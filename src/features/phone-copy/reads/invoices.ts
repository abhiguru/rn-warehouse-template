/**
 * `get_invoices_list` over the phone copy (WH-348, product/tech/app-offline-read-more.md sections 2, 3 and 14.1): the
 * server's `data` and `pagination`, key for key, for an administrator, a supervisor or staff. Its text is migration 125
 * with the patches of 134, 138, 172, 173, 175 and 191, as installed on temp1. Every money figure is the one the server
 * stored (decision 4): this file selects, filters, counts and orders, and adds nothing up.
 */
import type { SqlValue } from '../copyDriver';
import { enCompare, likeUnescaped, parseTimestampUs, pgSearchTerms } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { documentNumberSortKey } from '@/utils/documentNumber';
import { compareText, IN_LIST, numberOf, parseRow, pick, textOf, type Row } from './rows';

export interface InvoiceListRequest {
  limit: number;
  offset: number;
  customerId: string | null;
  financialYear: number | null;
  searchInvoiceNo: string | null;
  searchGrnNo: string | null;
  invNoFrom: number | null;
  invNoTo: number | null;
  sortField: string;
  sortDirection: string;
  search: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  customerIds: readonly string[] | null;
  paymentStatus: string | null;
  docType: string | null;
}

export interface InvoiceListData {
  invoices: Row[];
  total_count: number;
  has_more: boolean;
}

interface Where {
  sql: string[];
  params: SqlValue[];
}
function add(where: Where, sql: string, ...params: SqlValue[]): void {
  where.sql.push(sql);
  where.params.push(...params);
}
function microsOf(time: string): number {
  const value = parseTimestampUs(time);
  // The server refuses a date it cannot read: so does this read, and the server's answer is shown.
  if (value === null) throw new Error('not a time');
  return value;
}
const present = (value: string | null): string | null => (value === null || value === '' ? null : value);

/** `invoice i` joined as the server joins it: its customer and its GRN. */
const FROM = 'FROM invoice i JOIN customers c ON c.id = i.customer_id JOIN goodsreceived gr ON gr.id = i.gr_id';
const INV_NO = "json_extract(i.row, '$.inv_no')";
const FIN_YEAR = "json_extract(i.row, '$.inv_fin_year')";

function whereOf(request: InvoiceListRequest, role: CopyReader['role']): Where {
  const w: Where = { sql: ['i.deleted_at IS NULL', 'c.deleted_at IS NULL'], params: [] };
  // Migration 172: the status filter is for administrators and supervisors; the server refuses staff, so this read does not answer.
  if (request.paymentStatus !== null && role === 'staff') throw new Error('the payment filter is refused to staff');
  if (request.customerId) add(w, 'c.id = ?', request.customerId);
  // Zero and the empty text are no filter, as the server's `|| null` has it.
  if (request.financialYear) add(w, `${FIN_YEAR} = ?`, request.financialYear);
  const byNumber = present(request.searchInvoiceNo);
  if (byNumber !== null) {
    const like = likeUnescaped(`%${byNumber}%`);
    add(w, `i.inv_no_lc ${like.sql}`, like.param);
  }
  const byGrn = present(request.searchGrnNo);
  if (byGrn !== null) {
    const like = likeUnescaped(`%${byGrn}%`);
    add(w, `gr.gr_no_lc ${like.sql}`, like.param);
  }
  if (request.invNoFrom) add(w, `i.inv_no_sk >= ?`, documentNumberSortKey(String(request.invNoFrom)));
  if (request.invNoTo) add(w, `i.inv_no_sk <= ?`, documentNumberSortKey(String(request.invNoTo)));
  if (request.dateFrom) add(w, 'i.inv_date_us >= ?', microsOf(request.dateFrom));
  if (request.dateTo) add(w, 'i.inv_date_us <= ?', microsOf(request.dateTo));
  if (request.customerIds?.length) add(w, `c.id ${IN_LIST}`, JSON.stringify(request.customerIds));
  if (request.paymentStatus !== null) add(w, "json_extract(i.row, '$.payment_state.payment_status') = ?", request.paymentStatus);
  if (request.docType !== null) add(w, 'i.doc_type = ?', request.docType);
  // Every word of the search must be in the invoice label, the customer, the GRN number or one of the year-number forms.
  const number = `CAST(${INV_NO} AS TEXT)`;
  for (const term of pgSearchTerms(request.search)) {
    add(
      w,
      `(instr(i.inv_no_lc, ?) > 0 OR instr(c.name_lc, ?) > 0 OR instr(gr.gr_no_lc, ?) > 0
        OR instr(${FIN_YEAR} || '-' || ${number}, ?) > 0
        OR instr(${FIN_YEAR} || '-' || substr('0000000000' || ${number}, -max(4, length(${number}))), ?) > 0)`,
      term, term, term, term, term
    );
  }
  return w;
}

const SORT_SQL: Record<string, (direction: 'ASC' | 'DESC') => string> = {
  inv_date: d => `i.inv_date_us ${d}, i.inv_no_sk DESC`,
  inv_no: d => `i.inv_no_sk ${d}`,
  invoice_number: d => `i.inv_no_sk ${d}`,
  total: d => `i.total ${d} ${d === 'ASC' ? 'NULLS LAST' : 'NULLS FIRST'}, i.inv_date_us DESC, i.inv_no_sk DESC`,
  financial_year: d => `${FIN_YEAR} ${d}, i.inv_no_sk DESC`,
};

/** The page's invoice ids, in the server's order. */
async function pageIds(q: CopyReader, request: InvoiceListRequest, w: Where, offset: number, limit: number): Promise<string[]> {
  const direction = request.sortDirection.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const where = `WHERE ${w.sql.join(' AND ')}`;
  if (request.sortField === 'customer_name' || request.sortField === 'grn_number' || request.sortField === 'gr_no') {
    // Names and GRN numbers are ordered by the server's en_US rule, which SQL here cannot give.
    const all = await q.all<{ id: string; customer: string | null; grNo: string | null; date: number | null; key: string | null }>(
      `SELECT i.id AS id, c.name AS customer, gr.gr_no AS grNo, i.inv_date_us AS date, i.inv_no_sk AS key ${FROM} ${where}`, w.params);
    const sign = direction === 'ASC' ? 1 : -1;
    const byCustomer = request.sortField === 'customer_name';
    all.sort((a, b) => {
      const main = sign * (byCustomer ? enCompare(a.customer, b.customer) : enCompare(a.grNo, b.grNo));
      if (main) return main;
      const date = (b.date ?? 0) - (a.date ?? 0);
      if (date) return date;
      return -compareText(a.key ?? '', b.key ?? '') || compareText(a.id, b.id);
    });
    return all.slice(offset, offset + limit).map(r => r.id);
  }
  const order = (SORT_SQL[request.sortField] ?? ((): string => 'i.inv_date_us DESC, i.inv_no_sk DESC'))(direction);
  const found = await q.all<{ id: string }>(
    `SELECT i.id AS id ${FROM} ${where} ORDER BY ${order}, i.inv_date_us DESC, i.inv_no_sk DESC, i.id LIMIT ? OFFSET ?`,
    [...w.params, limit, offset]
  );
  return found.map(r => r.id);
}

interface PageRecord {
  id: string;
  irow: string;
  crow: string;
  grow: string;
  qty: number | null;
}

export async function readInvoicesList(q: CopyReader, raw: InvoiceListRequest): Promise<InvoiceListData> {
  // Migration 138: a page is 1 to 200 rows, from a start of 0 or more.
  const limit = Math.min(Math.max(raw.limit, 1), 200);
  const offset = Math.max(raw.offset, 0);
  const request = { ...raw, limit, offset };
  const w = whereOf(request, q.role);
  const ids = await pageIds(q, request, w, offset, limit);
  const total = (await q.get<{ n: number }>(`SELECT COUNT(*) AS n ${FROM} WHERE ${w.sql.join(' AND ')}`, w.params))?.n ?? 0;
  const records = ids.length
    ? await q.all<PageRecord>(
        `SELECT i.id AS id, i.row AS irow, c.row AS crow, gr.row AS grow,
           (SELECT sum(dt.disp_qty) FROM invoice_trl it JOIN dispatch_trl dt ON dt.id = it.disp_trl_id
              JOIN goodsreceived_trl grt ON grt.id = dt.gr_trl_id WHERE it.invoice_id = i.id) AS qty
         ${FROM} WHERE i.id ${IN_LIST}`,
        [JSON.stringify(ids)]
      )
    : [];
  const byId = new Map(records.map(r => [r.id, r]));
  const showPayments = q.role !== 'staff';
  const invoices = ids.flatMap(id => {
    const record = byId.get(id);
    if (!record) return [];
    const i = parseRow(record.irow);
    const c = parseRow(record.crow);
    const g = parseRow(record.grow);
    const year = numberOf(i.inv_fin_year);
    const prefix = textOf(i.inv_prefix);
    const number = numberOf(i.inv_no) ?? textOf(i.inv_no);
    const state = showPayments && typeof i.payment_state === 'object' && i.payment_state !== null ? (i.payment_state as Row) : {};
    return [{
      invoice_id: id,
      invoice_number: pick(i, 'inv_no'),
      inv_prefix: pick(i, 'inv_prefix'),
      invoice_label: `${prefix ?? ''}${number ?? ''}`,
      invoice_date: pick(i, 'inv_date'),
      inv_fin_year: pick(i, 'inv_fin_year'),
      financial_year: year === null ? null : `${year}-${year + 1}`,
      inv_name: pick(i, 'inv_name'),
      invoice_pricing_mode: pick(i, 'pricing_mode'),
      notes: pick(i, 'notes'),
      is_auto_generated: pick(i, 'is_auto_generated'),
      total: pick(i, 'total'),
      discount: pick(i, 'discount'),
      labour: pick(i, 'labour'),
      tax_amount: pick(i, 'tax_amount'),
      one_time_charge: pick(i, 'one_time_charge'),
      created_by: pick(i, 'created_by'),
      cancelled_at: pick(i, 'cancelled_at'),
      cancel_reason: pick(i, 'cancel_reason'),
      doc_type: pick(i, 'doc_type'),
      linked_invoice_id: pick(i, 'linked_invoice_id'),
      imported: i.import_batch_id !== null && i.import_batch_id !== undefined,
      total_qty: record.qty ?? 0,
      customer: {
        id: pick(c, 'id'), name: pick(c, 'name'), city: pick(c, 'city'), address: pick(c, 'address'), phone: pick(c, 'mobile'),
        email: pick(c, 'email'), gst: pick(c, 'gst'), active: pick(c, 'active'),
      },
      grn: {
        id: pick(g, 'id'), gr_no: pick(g, 'gr_no'), registration: pick(g, 'registration'), date: pick(g, 'date'),
        sender_id: pick(g, 'sender_id'), sender_name: pick(g, 'sender_name'), supervisor_id: pick(g, 'supervisor_id'),
        supervisor_name: pick(g, 'supervisor_name'), customer_id: pick(g, 'customer_id'), customer_name: pick(g, 'customer_name'),
      },
      ...state,
    }];
  });
  return { invoices, total_count: total, has_more: offset + limit < total };
}
