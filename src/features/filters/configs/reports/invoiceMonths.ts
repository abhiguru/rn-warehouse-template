/**
 * Invoice history, one customer: the period's invoices month by month, all on
 * the net basis (the invoice total after labour, tax and discount).
 *
 * The server's `by_month` cannot be shown beside the screen's figures: its
 * `total_amount` is the sum of the totals before labour, tax and discount, while
 * its paid and pending amounts are sums of the net totals, so a row did not add
 * up. The table is built here from the invoices of the period instead.
 *
 * The month is that of the invoice's calendar day in India ("2026-10"): the
 * invoice date is an instant (timestamptz, sent in UTC), and the facility's
 * months are India's, so 2026-09-30T20:00:00+00:00 belongs to October. The date
 * headings between the invoice cards use the same day (`indiaDay`). Newest month
 * first.
 */
import type { InvoiceHistoryRecord } from '@/types/report.types';
import { indiaDay } from '@/utils/formatters';

/** The parts of an invoice a month needs. */
export type MonthlyInvoice = Pick<InvoiceHistoryRecord, 'invoice_date' | 'net_total'> & {
  payment_status?: { status?: string | null } | null;
};

export interface InvoiceMonth {
  /** "YYYY-MM"; "" for an invoice whose date cannot be read (last). */
  month: string;
  invoiceCount: number;
  /** The invoices' net totals. */
  netAmount: number;
  /** Net total of the invoices whose status is "paid". */
  paidAmount: number;
  /** Net total of the invoices whose status is "pending". */
  pendingAmount: number;
}

export type InvoiceMonthTotals = Omit<InvoiceMonth, 'month'>;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])/;

/** "2026-10" for "2026-10-12" and for "2026-10-12T04:30:00+00:00"; "" when there is no date to read. */
export function invoiceMonthKey(date: string | null | undefined): string {
  const found = MONTH_KEY.exec(indiaDay(date));
  return found ? `${found[1]}-${found[2]}` : '';
}

/** Whole paise, so that sums of decimals add up exactly (0.1 + 0.2 is 300 paise). */
const toPaise = (amount: unknown): number => Math.round((Number(amount) || 0) * 100);
const toRupees = (paise: number): number => paise / 100;

interface Sums {
  count: number;
  net: number;
  paid: number;
  pending: number;
}

const finish = (sums: Sums): InvoiceMonthTotals => ({
  invoiceCount: sums.count,
  netAmount: toRupees(sums.net),
  paidAmount: toRupees(sums.paid),
  pendingAmount: toRupees(sums.pending),
});

/**
 * Every invoice is in the count and the net amount. Only "paid" invoices are in
 * Paid and only "pending" ones in Pending: any other status is in neither, so
 * Paid + Pending is the net amount when every invoice is one or the other.
 */
export function invoiceMonths(invoices: readonly MonthlyInvoice[]): InvoiceMonth[] {
  const byMonth = new Map<string, Sums>();
  for (const invoice of invoices) {
    const key = invoiceMonthKey(invoice.invoice_date);
    const sums = byMonth.get(key) ?? { count: 0, net: 0, paid: 0, pending: 0 };
    const net = toPaise(invoice.net_total);
    sums.count += 1;
    sums.net += net;
    if (invoice.payment_status?.status === 'paid') sums.paid += net;
    else if (invoice.payment_status?.status === 'pending') sums.pending += net;
    byMonth.set(key, sums);
  }
  // "YYYY-MM" keys sort as dates; the empty key (no readable date) falls last.
  return [...byMonth.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map(month => ({ month, ...finish(byMonth.get(month)!) }));
}

/** The totals row: the sums of the rows shown. */
export function invoiceMonthTotals(months: readonly InvoiceMonth[]): InvoiceMonthTotals {
  const sums: Sums = { count: 0, net: 0, paid: 0, pending: 0 };
  for (const month of months) {
    sums.count += Number(month.invoiceCount) || 0;
    sums.net += toPaise(month.netAmount);
    sums.paid += toPaise(month.paidAmount);
    sums.pending += toPaise(month.pendingAmount);
  }
  return finish(sums);
}
