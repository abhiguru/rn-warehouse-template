/**
 * A cancelled invoice (backend migration 134) is listed and tagged Cancelled, and counted in no sum on the phone:
 * not in the month table, not in the Paid and Pending tiles, not under the Paid or Pending choice.
 */
import { INVOICE_HISTORY_CUSTOMER, invoiceRecordsView } from '../configs/reports/invoiceHistory';
import { invoiceMonths, invoiceMonthTotals, type MonthlyInvoice } from '../configs/reports/invoiceMonths';
import { invoicePayment, isCancelledInvoice, type PayableInvoice } from '../configs/reports/invoicePayment';
import { invoicePaymentStatus } from '@/components/reports/invoicePaymentStatus';
import type { FilterContext } from '../types';

describe('isCancelledInvoice', () => {
  it('is true for cancelled_at and for the server status, false otherwise', () => {
    expect(isCancelledInvoice({ cancelled_at: '2026-10-05T10:00:00Z' })).toBe(true);
    expect(isCancelledInvoice({ payment_status: { status: 'cancelled' } })).toBe(true);
    expect(isCancelledInvoice({ cancelled_at: null, payment_status: { status: 'pending' } })).toBe(false);
    expect(isCancelledInvoice({})).toBe(false);
  });
});

describe('invoicePayment of a cancelled invoice', () => {
  it('owes nothing, received nothing, and is neither Paid nor Pending', () => {
    const row: PayableInvoice = { total: 500, cancelled_at: '2026-10-05T10:00:00Z', payment_status: { status: 'cancelled', amount: 0 } };
    expect(invoicePayment(row)).toEqual({
      status: 'cancelled', partPaid: false, received: 0, balance: 0, totalPaise: 0, receivedPaise: 0, balancePaise: 0,
    });
  });
});

describe('the month table and the tiles', () => {
  const live = (date: string, total: number, status: string, amount?: number): MonthlyInvoice => ({
    invoice_date: date, total, payment_status: { status, ...(amount !== undefined && { amount }) },
  });
  const cancelled = (date: string, total: number): MonthlyInvoice => ({
    invoice_date: date, total, cancelled_at: '2026-10-06T10:00:00Z', payment_status: { status: 'cancelled' },
  });

  it('leave a cancelled invoice out of the count, the amount, Paid and Pending', () => {
    const months = invoiceMonths([
      live('2026-10-01', 100, 'paid', 100),
      live('2026-10-02', 40, 'pending', 10),
      cancelled('2026-10-03', 900),
      cancelled('2026-09-03', 700),
    ]);
    expect(months).toEqual([
      { month: '2026-10', invoiceCount: 2, amount: 140, paidAmount: 110, pendingAmount: 30, paidCount: 1, pendingCount: 1 },
    ]);
    expect(invoiceMonthTotals(months)).toEqual({ invoiceCount: 2, amount: 140, paidAmount: 110, pendingAmount: 30, paidCount: 1, pendingCount: 1 });
  });

  it('give no month at all when every invoice of the period is cancelled', () => {
    expect(invoiceMonths([cancelled('2026-10-03', 900)])).toEqual([]);
  });
});

describe('the Payment choice', () => {
  const row = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    invoice_id: id, invoice_number: `2026/${id}`, invoice_date: '2026-10-01', grn_ref: `A${id}`, total: 100,
    payment_status: { status, paid_date: null, payment_ref: null, amount: status === 'paid' ? 100 : 0 },
    line_items: [], ...extra,
  });
  const rows = [row('1', 'paid'), row('2', 'pending'), row('3', 'cancelled', { cancelled_at: '2026-10-05T10:00:00Z', cancel_reason: 'Wrong customer' })];
  const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
  const ids = (payment: string) =>
    invoiceRecordsView(
      rows as unknown as Parameters<typeof invoiceRecordsView>[0],
      INVOICE_HISTORY_CUSTOMER.toRequest({ payment }, { field: 'number', order: 'asc' }, staff, new Date(2026, 9, 12)).view
    ).map(r => r.invoice_id);

  it('lists the cancelled invoice under All only, never under Paid or Pending', () => {
    expect(ids('all')).toEqual(['1', '2', '3']);
    expect(ids('paid')).toEqual(['1']);
    expect(ids('pending')).toEqual(['2']);
  });
});

describe('the status tag', () => {
  it('says Cancelled in the negative tone', () => {
    expect(invoicePaymentStatus('cancelled')).toEqual({ kind: 'negative', label: 'Cancelled' });
  });
});
