/**
 * Invoice history, one customer: the monthly table is built from the invoices
 * of the period on the net basis. The invoices are made so that the net total
 * differs from the total before labour, tax and discount, so a month built from
 * the wrong field gives different figures.
 */
import { invoiceMonthKey, invoiceMonths, invoiceMonthTotals, type MonthlyInvoice } from '../configs/reports/invoiceMonths';

const invoice = (date: string | null | undefined, net: number, status?: string | null): MonthlyInvoice => ({
  invoice_date: date as string,
  net_total: net,
  payment_status: status === undefined ? undefined : { status },
});

describe('invoiceMonthKey', () => {
  it('is the year and month of a plain date, and of an instant as it falls in India', () => {
    expect(invoiceMonthKey('2026-10-12')).toBe('2026-10');
    expect(invoiceMonthKey('2026-10-12T04:30:00+00:00')).toBe('2026-10');
    expect(invoiceMonthKey('2026-01-01T00:00:00+05:30')).toBe('2026-01');
  });

  it('puts an instant in the month of its day in India, not in UTC', () => {
    // 30 Sep 20:00 UTC is 1 Oct 01:30 in India.
    expect(invoiceMonthKey('2026-09-30T20:00:00+00:00')).toBe('2026-10');
    expect(invoiceMonthKey('2026-09-30T20:00:00.000Z')).toBe('2026-10');
    expect(invoiceMonthKey('2026-09-30T18:30:00Z')).toBe('2026-10');
    // The last minute of September in India.
    expect(invoiceMonthKey('2026-09-30T18:29:59Z')).toBe('2026-09');
    expect(invoiceMonthKey('2026-09-30T23:59:59+05:30')).toBe('2026-09');
    // And the other way: 1 Jan 00:30 in India is still 31 Dec in UTC.
    expect(invoiceMonthKey('2026-12-31T19:00:00Z')).toBe('2027-01');
  });

  it('is empty when there is no date to read', () => {
    expect(invoiceMonthKey(undefined)).toBe('');
    expect(invoiceMonthKey(null)).toBe('');
    expect(invoiceMonthKey('')).toBe('');
    expect(invoiceMonthKey('garbage')).toBe('');
    expect(invoiceMonthKey('2026-13-01')).toBe('');
  });
});

describe('invoiceMonths', () => {
  it('is empty for no invoices, and its totals are zero', () => {
    expect(invoiceMonths([])).toEqual([]);
    expect(invoiceMonthTotals([])).toEqual({ invoiceCount: 0, netAmount: 0, paidAmount: 0, pendingAmount: 0 });
  });

  it('groups by month of the invoice date, newest month first, whatever the order of the invoices', () => {
    const months = invoiceMonths([
      invoice('2026-08-18', 3540, 'paid'),
      invoice('2026-10-12', 5400, 'paid'),
      invoice('2026-09-20', 7350, 'pending'),
      invoice('2026-10-01', 12600, 'paid'),
      invoice('2025-12-31', 100, 'paid'),
      invoice('2026-10-11', 21500, 'pending'),
    ]);
    expect(months.map(month => month.month)).toEqual(['2026-10', '2026-09', '2026-08', '2025-12']);
    expect(months.map(month => month.invoiceCount)).toEqual([3, 1, 1, 1]);
    expect(months[0]).toEqual({ month: '2026-10', invoiceCount: 3, netAmount: 39500, paidAmount: 18000, pendingAmount: 21500 });
  });

  it('counts a plain date and a full ISO date of the same month into one row', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', 100, 'paid'),
      invoice('2026-10-03T09:15:00+00:00', 200, 'pending'),
      invoice('2026-10-31T18:29:59.000Z', 300, 'paid'),
    ]);
    expect(months).toEqual([{ month: '2026-10', invoiceCount: 3, netAmount: 600, paidAmount: 400, pendingAmount: 200 }]);
  });

  it('counts an invoice made after 18:30 UTC on the last day of a month into the next month, as the books do in India', () => {
    const months = invoiceMonths([
      invoice('2026-09-30T20:00:00+00:00', 400, 'paid'),
      invoice('2026-09-30T18:29:59Z', 50, 'pending'),
      invoice('2026-10-12', 1000, 'paid'),
    ]);
    expect(months).toEqual([
      { month: '2026-10', invoiceCount: 2, netAmount: 1400, paidAmount: 1400, pendingAmount: 0 },
      { month: '2026-09', invoiceCount: 1, netAmount: 50, paidAmount: 0, pendingAmount: 50 },
    ]);
  });

  it('puts paid and pending invoices in their own columns, and any other status in the count and the net amount only', () => {
    const [month] = invoiceMonths([
      invoice('2026-09-30', 1800, 'partly_paid'),
      invoice('2026-09-20', 7350, 'pending'),
      invoice('2026-09-10', 640, 'paid'),
      invoice('2026-09-05', 90, undefined),
      invoice('2026-09-04', 10, null),
      invoice('2026-09-03', 1000, 'PAID'),
    ]);
    expect(month).toEqual({ month: '2026-09', invoiceCount: 6, netAmount: 10890, paidAmount: 640, pendingAmount: 7350 });
    // Not paid and not pending: 1800 + 90 + 10 + 1000.
    expect(month.netAmount - month.paidAmount - month.pendingAmount).toBe(2900);
  });

  it('adds paid and pending up to the net amount when every invoice is paid or pending, row by row and in the totals', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', 5400, 'paid'),
      invoice('2026-10-11', 21500, 'pending'),
      invoice('2026-09-30', 1800, 'paid'),
      invoice('2026-09-20', 7350, 'pending'),
      invoice('2026-08-18', 3540, 'pending'),
    ]);
    for (const month of months) expect(month.paidAmount + month.pendingAmount).toBe(month.netAmount);
    const totals = invoiceMonthTotals(months);
    expect(totals).toEqual({ invoiceCount: 5, netAmount: 39590, paidAmount: 7200, pendingAmount: 32390 });
    expect(totals.paidAmount + totals.pendingAmount).toBe(totals.netAmount);
  });

  it('sums decimals in whole paise, so paid and pending still equal the net amount', () => {
    const months = invoiceMonths([invoice('2026-10-12', 100.1, 'paid'), invoice('2026-10-11', 200.2, 'pending'), invoice('2026-09-01', 0.1, 'paid'), invoice('2026-09-02', 0.2, 'paid')]);
    // 100.1 + 200.2 is 300.29999999999995 in floating point.
    expect(months[0]).toEqual({ month: '2026-10', invoiceCount: 2, netAmount: 300.3, paidAmount: 100.1, pendingAmount: 200.2 });
    expect(months[1].netAmount).toBe(0.3);
    expect(invoiceMonthTotals(months).netAmount).toBe(300.6);
  });

  it('counts an invoice with an unreadable net total as zero, and one with no readable date in a last row of its own', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', Number.NaN, 'paid'),
      invoice('2026-10-11', undefined as unknown as number, 'pending'),
      invoice(undefined, 500, 'pending'),
      invoice('', 250, 'paid'),
      invoice('2026-01-05', 10, 'paid'),
    ]);
    expect(months).toEqual([
      { month: '2026-10', invoiceCount: 2, netAmount: 0, paidAmount: 0, pendingAmount: 0 },
      { month: '2026-01', invoiceCount: 1, netAmount: 10, paidAmount: 10, pendingAmount: 0 },
      { month: '', invoiceCount: 2, netAmount: 750, paidAmount: 250, pendingAmount: 500 },
    ]);
  });

  it('has totals that are the sums of the rows it is given, not of anything else', () => {
    const rows = [
      { month: '2026-10', invoiceCount: 3, netAmount: 39500, paidAmount: 18000, pendingAmount: 21500 },
      { month: '2026-09', invoiceCount: 2, netAmount: 9150, paidAmount: 0, pendingAmount: 7350 },
      { month: '2026-08', invoiceCount: 1, netAmount: 3540, paidAmount: 3540, pendingAmount: 0 },
    ];
    expect(invoiceMonthTotals(rows)).toEqual({ invoiceCount: 6, netAmount: 52190, paidAmount: 21540, pendingAmount: 28850 });
    expect(invoiceMonthTotals(rows.slice(1))).toEqual({ invoiceCount: 3, netAmount: 12690, paidAmount: 3540, pendingAmount: 7350 });
  });

  it('does not change the invoices it is given', () => {
    const invoices = [invoice('2026-10-12', 100, 'paid'), invoice('2026-09-12', 200, 'pending')];
    const before = JSON.stringify(invoices);
    invoiceMonths(invoices);
    expect(JSON.stringify(invoices)).toBe(before);
  });
});
