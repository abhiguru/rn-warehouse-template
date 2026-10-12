/**
 * Invoice history, one customer: the period's invoices month by month, and the
 * same sums over the whole period for the Paid and Pending tiles.
 *
 * The figure is each invoice's `total`: the amount the customer pays. The
 * backend stores it as ceil(storage + labour + tax - discount), so it already
 * includes labour and tax and is after the discount; the invoice list, the
 * invoice screen, the invoice PDF and payments all use it. The server's
 * `net_total` is not used: on servers before backend migration 61 it adds labour
 * and tax a second time and takes the discount off a second time (it can even be
 * negative); from migration 61 it equals `total`. Reading `total` is right on
 * both. For the same reason the server's `by_month` and the summary's
 * `paid_amount` / `pending_amount` are not used: they are sums of that figure.
 * The table and the tiles are built here from the invoices of the period.
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
export type MonthlyInvoice = Pick<InvoiceHistoryRecord, 'invoice_date' | 'total'> & {
  payment_status?: { status?: string | null } | null;
};

export interface InvoiceMonth {
  /** "YYYY-MM"; "" for an invoice whose date cannot be read (last). */
  month: string;
  invoiceCount: number;
  /** The invoices' amounts: the sum of their `total`. */
  amount: number;
  /** Amount of the invoices whose status is "paid". */
  paidAmount: number;
  /** Amount of the invoices whose status is "pending". */
  pendingAmount: number;
  /** Invoices whose status is "paid". */
  paidCount: number;
  /** Invoices whose status is "pending". */
  pendingCount: number;
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
  amount: number;
  paid: number;
  pending: number;
  paidCount: number;
  pendingCount: number;
}

const emptySums = (): Sums => ({ count: 0, amount: 0, paid: 0, pending: 0, paidCount: 0, pendingCount: 0 });

const finish = (sums: Sums): InvoiceMonthTotals => ({
  invoiceCount: sums.count,
  amount: toRupees(sums.amount),
  paidAmount: toRupees(sums.paid),
  pendingAmount: toRupees(sums.pending),
  paidCount: sums.paidCount,
  pendingCount: sums.pendingCount,
});

/**
 * Every invoice is in the count and the amount. Only "paid" invoices are in
 * Paid and only "pending" ones in Pending: any other status is in neither, so
 * Paid + Pending is the amount when every invoice is one or the other.
 */
export function invoiceMonths(invoices: readonly MonthlyInvoice[]): InvoiceMonth[] {
  const byMonth = new Map<string, Sums>();
  for (const invoice of invoices) {
    const key = invoiceMonthKey(invoice.invoice_date);
    const sums = byMonth.get(key) ?? emptySums();
    const amount = toPaise(invoice.total);
    sums.count += 1;
    sums.amount += amount;
    if (invoice.payment_status?.status === 'paid') {
      sums.paid += amount;
      sums.paidCount += 1;
    } else if (invoice.payment_status?.status === 'pending') {
      sums.pending += amount;
      sums.pendingCount += 1;
    }
    byMonth.set(key, sums);
  }
  // "YYYY-MM" keys sort as dates; the empty key (no readable date) falls last.
  return [...byMonth.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map(month => ({ month, ...finish(byMonth.get(month)!) }));
}

/**
 * The totals row: the sums of the rows shown. Over the months of all the period's
 * invoices it is also the period's figures for the Paid and Pending tiles.
 */
export function invoiceMonthTotals(months: readonly InvoiceMonth[]): InvoiceMonthTotals {
  const sums = emptySums();
  for (const month of months) {
    sums.count += Number(month.invoiceCount) || 0;
    sums.amount += toPaise(month.amount);
    sums.paid += toPaise(month.paidAmount);
    sums.pending += toPaise(month.pendingAmount);
    sums.paidCount += Number(month.paidCount) || 0;
    sums.pendingCount += Number(month.pendingCount) || 0;
  }
  return finish(sums);
}

/**
 * True when any amount of the table is not a whole number of rupees: a row's
 * amount, paid or pending amount, or a total. Decided in whole paise, never by comparing
 * floats (0.1 + 0.2 has paise; ten times 0.1 is 0.9999999999999999 and has none).
 * The totals are sums of the rows, so they can have paise only when a row has.
 */
export function invoiceMonthsHavePaise(months: readonly InvoiceMonth[]): boolean {
  const hasPaise = (amount: number): boolean => toPaise(amount) % 100 !== 0;
  return months.some(month => hasPaise(month.amount) || hasPaise(month.paidAmount) || hasPaise(month.pendingAmount));
}
