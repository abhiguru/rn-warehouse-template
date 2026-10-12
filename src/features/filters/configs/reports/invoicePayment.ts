/**
 * Invoice history: what has been paid of an invoice and what is still owed.
 *
 * The owner's rule: "Paid is the money received and Pending is what is still
 * owed. An invoice counts as Paid only when nothing is owed; a part-paid invoice
 * stays Pending with the balance."
 *
 *   received  the payments recorded against the invoice, never less than 0 and
 *             never more than the invoice's `total`
 *   balance   total - received
 *   Paid      when the balance is at most 0.50 (the tolerance of the backend's
 *             payment reconciliation); Pending otherwise
 *
 * An invoice of nothing, or of less than nothing (a credit), owes nothing: it is
 * Paid, and its whole amount is under Paid.
 *
 * The payments are `payment_status.amount`: from backend migration 61 the sum of
 * the invoice's payment rows. The server's own word, `payment_status.status`, is
 * not the rule: before backend migration 62 it is "paid" as soon as any payment
 * is recorded. It is read in one case only: an answer that says "paid" and
 * carries no amount (an older server) is taken as paid in full. Migration 62
 * applies this rule on the server and sends more keys per invoice; none of them
 * is read, so the screen shows the same on a server with or without it.
 *
 * One calculation for the tiles, the monthly table, the Payment choice and the
 * tag and line on a card, in whole paise so that sums of decimals add up:
 * received + balance is the total for every invoice, so Paid + Pending is the
 * Amount in every row and in the totals.
 */
import type { InvoiceHistoryRecord } from '@/types/report.types';

/** An invoice is Paid while no more than this is owed on it: 0.50, in paise. */
export const PAID_TOLERANCE_PAISE = 50;

/** The parts of an invoice the rule reads. */
export type PayableInvoice = Pick<InvoiceHistoryRecord, 'total'> & {
  payment_status?: { status?: string | null; amount?: unknown } | null;
};

export interface InvoicePayment {
  /** By the rule above, whatever the server's word is. */
  status: 'paid' | 'pending';
  /** Money was received and a balance is still owed: the invoice is Pending, and its card says how much of each. */
  partPaid: boolean;
  /** The money received, in rupees. */
  received: number;
  /** What is still owed, in rupees. */
  balance: number;
  /** The invoice's amount, the money received and the balance in whole paise, for sums. */
  totalPaise: number;
  receivedPaise: number;
  balancePaise: number;
}

/** Whole paise, so that sums of decimals add up exactly (0.1 + 0.2 is 30 paise). An unreadable amount is 0. */
export const toPaise = (amount: unknown): number => Math.round((Number(amount) || 0) * 100);
export const toRupees = (paise: number): number => paise / 100;

/** The recorded payments in whole paise, or null when the answer carries no amount that can be read. */
function recordedPaise(amount: unknown): number | null {
  const value = typeof amount === 'number' ? amount : typeof amount === 'string' && amount.trim() !== '' ? Number(amount) : Number.NaN;
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function invoicePayment(invoice: PayableInvoice): InvoicePayment {
  const totalPaise = toPaise(invoice.total);
  const recorded = recordedPaise(invoice.payment_status?.amount);
  // No amount: nothing is recorded, unless an older server says "paid", which is then paid in full.
  const paidPaise = recorded ?? (invoice.payment_status?.status === 'paid' ? totalPaise : 0);
  // Never less than 0 owed (an over-payment, or an invoice of nothing or less, owes nothing) and never
  // more than the total (a negative amount recorded counts as none).
  const balancePaise = Math.max(totalPaise - Math.max(paidPaise, 0), 0);
  const receivedPaise = totalPaise - balancePaise;
  const paid = balancePaise <= PAID_TOLERANCE_PAISE;
  return {
    status: paid ? 'paid' : 'pending',
    partPaid: !paid && receivedPaise > 0,
    received: toRupees(receivedPaise),
    balance: toRupees(balancePaise),
    totalPaise,
    receivedPaise,
    balancePaise,
  };
}
