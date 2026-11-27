/**
 * `get_customer_invoice_summary` over a customer account's phone copy (WH-306, contract
 * product/tech/app-offline-customer-accounts.md 3 R7): one customer's invoices, cancelled ones included, as the server's
 * short row. Every figure is the one the server stored (decision 4); nothing is worked out here.
 */
import type { CopyReader } from '@/features/phone-copy/readRoute';
import { numberOf, parseRow, pick, textOf, type Row } from '../rows';

export async function readCustomerInvoiceSummary(q: CopyReader, customerId: string): Promise<{ invoices: Row[] }> {
  const records = await q.all<{ irow: string; grow: string }>(
    `SELECT i.row AS irow, gr.row AS grow FROM invoice i JOIN goodsreceived gr ON gr.id = i.gr_id
      WHERE i.customer_id = ? AND i.deleted_at IS NULL ORDER BY i.inv_date_us DESC, i.inv_no_sk DESC, i.id`,
    [customerId]
  );
  const invoices = records.map(record => {
    const i = parseRow(record.irow);
    const g = parseRow(record.grow);
    const year = numberOf(i.inv_fin_year);
    const number = numberOf(i.inv_no) ?? textOf(i.inv_no);
    return {
      invoice_id: pick(i, 'id'),
      invoice_number: `${year ?? 0}-${number ?? ''}`,
      invoice_label: `${textOf(i.inv_prefix) ?? ''}${number ?? ''}`,
      invoice_date: pick(i, 'inv_date'),
      financial_year: year === null ? null : `${year}-${year + 1}`,
      total: pick(i, 'total'),
      labour: pick(i, 'labour'),
      discount: pick(i, 'discount'),
      tax_amount: pick(i, 'tax_amount'),
      notes: pick(i, 'notes'),
      cancelled_at: pick(i, 'cancelled_at'),
      grn_id: pick(g, 'id'),
      grn_ref: pick(g, 'gr_no'),
    };
  });
  return { invoices };
}
