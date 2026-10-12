/**
 * Invoice history, one customer: the monthly table, and the period's Paid and
 * Pending figures, are built from the invoices' `total` (the amount the customer
 * pays, labour and tax included). The server's `net_total` is not used: before
 * backend migration 61 it counts labour and tax twice. The invoices here carry a
 * `net_total` that differs from `total` (as an unfixed server sends it, even
 * negative), so a month built from the wrong field gives different figures.
 *
 * Paid is the money received and Pending is what is still owed (`invoicePayment`,
 * tested in invoicePayment.test.ts): a part payment is under Paid and its balance
 * under Pending, and the invoice counts as Pending. An invoice given here with a
 * status and no amount is as an older server answers it: "paid" is paid in full,
 * anything else has nothing received.
 */
import {
  invoiceMonthKey,
  invoiceMonths,
  invoiceMonthsHavePaise,
  invoiceMonthTotals,
  type InvoiceMonth,
  type MonthlyInvoice,
} from '../configs/reports/invoiceMonths';

/**
 * An invoice of `total`. Its `net_total` is what a server without migration 61 sends for an invoice with
 * labour 7, tax 3 and a discount of 25: total + 7 + 3 - 25. The month sums must not see it.
 */
type InvoiceWithNet = MonthlyInvoice & { net_total: number };
const invoice = (date: string | null | undefined, total: number, status?: string | null, amount?: number): InvoiceWithNet => ({
  invoice_date: date as string,
  total,
  net_total: total + 7 + 3 - 25,
  payment_status: status === undefined && amount === undefined ? undefined : { status, ...(amount !== undefined && { amount }) },
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
    expect(invoiceMonthTotals([])).toEqual({ invoiceCount: 0, amount: 0, paidAmount: 0, pendingAmount: 0, paidCount: 0, pendingCount: 0 });
  });

  it('sums the invoices\' `total`, never their `net_total`, which an unfixed server overstates and can send negative', () => {
    // Storage 100, labour 5, tax 5, discount 90: total 20 (rounded up), and the unfixed server's net_total
    // 20 + 5 + 5 - 90 = -60. A second invoice with labour 2.50 and tax 5%: total 14, net_total 17.50.
    const discounted: InvoiceWithNet = { invoice_date: '2026-10-12', total: 20, net_total: -60, payment_status: { status: 'paid' } };
    const taxed: InvoiceWithNet = { invoice_date: '2026-10-11', total: 14, net_total: 17.5, payment_status: { status: 'pending' } };
    const months = invoiceMonths([discounted, taxed]);
    expect(months).toEqual([{ month: '2026-10', invoiceCount: 2, amount: 34, paidAmount: 20, pendingAmount: 14, paidCount: 1, pendingCount: 1 }]);
    // The same invoices on a server with migration 61 (net_total equals total): the same table.
    const fixedServer: InvoiceWithNet[] = [{ ...discounted, net_total: 20 }, { ...taxed, net_total: 14 }];
    expect(invoiceMonths(fixedServer)).toEqual(months);
  });

  it('gives the period\'s Paid and Pending, amounts and counts, as the totals of its months: one calculation for the tiles and the Total row', () => {
    const invoices = [
      invoice('2026-10-12', 5400, 'paid'),
      invoice('2026-10-11', 21500, 'pending'),
      invoice('2026-09-30', 1800, 'partly_paid'),
      invoice('2026-09-20', 7350, 'pending'),
      invoice('2026-08-18', 3540, 'paid'),
    ];
    const period = invoiceMonthTotals(invoiceMonths(invoices));
    // The invoice of 1800 has a word the app does not know and no amount: nothing received, all of it owed.
    expect(period).toEqual({ invoiceCount: 5, amount: 39590, paidAmount: 8940, pendingAmount: 30650, paidCount: 2, pendingCount: 3 });
    expect(period.paidAmount + period.pendingAmount).toBe(period.amount);
    // Not the sum of the invoices\' net_total (each is its total - 15).
    expect(period.amount).not.toBe(invoices.reduce((sum, row) => sum + row.net_total, 0));
    // The same figures however the invoices are split into months.
    expect(invoiceMonthTotals(invoiceMonths(invoices.slice().reverse()))).toEqual(period);
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
    expect(months[0]).toEqual({ month: '2026-10', invoiceCount: 3, amount: 39500, paidAmount: 18000, pendingAmount: 21500, paidCount: 2, pendingCount: 1 });
  });

  it('counts a plain date and a full ISO date of the same month into one row', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', 100, 'paid'),
      invoice('2026-10-03T09:15:00+00:00', 200, 'pending'),
      invoice('2026-10-31T18:29:59.000Z', 300, 'paid'),
    ]);
    expect(months).toEqual([{ month: '2026-10', invoiceCount: 3, amount: 600, paidAmount: 400, pendingAmount: 200, paidCount: 2, pendingCount: 1 }]);
  });

  it('counts an invoice made after 18:30 UTC on the last day of a month into the next month, as the books do in India', () => {
    const months = invoiceMonths([
      invoice('2026-09-30T20:00:00+00:00', 400, 'paid'),
      invoice('2026-09-30T18:29:59Z', 50, 'pending'),
      invoice('2026-10-12', 1000, 'paid'),
    ]);
    expect(months).toEqual([
      { month: '2026-10', invoiceCount: 2, amount: 1400, paidAmount: 1400, pendingAmount: 0, paidCount: 2, pendingCount: 0 },
      { month: '2026-09', invoiceCount: 1, amount: 50, paidAmount: 0, pendingAmount: 50, paidCount: 0, pendingCount: 1 },
    ]);
  });

  it('puts what was received under Paid and the balance under Pending, and counts a part-paid invoice as Pending', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', 20, 'paid', 20),
      // 4.00 of 14.00, as a server before backend migration 62 answers it: "paid", because a payment exists.
      invoice('2026-10-05', 14, 'paid', 4),
      invoice('2026-09-20', 30, 'pending'),
    ]);
    expect(months).toEqual([
      { month: '2026-10', invoiceCount: 2, amount: 34, paidAmount: 24, pendingAmount: 10, paidCount: 1, pendingCount: 1 },
      { month: '2026-09', invoiceCount: 1, amount: 30, paidAmount: 0, pendingAmount: 30, paidCount: 0, pendingCount: 1 },
    ]);
    expect(invoiceMonthTotals(months)).toEqual({ invoiceCount: 3, amount: 64, paidAmount: 24, pendingAmount: 40, paidCount: 1, pendingCount: 2 });
  });

  it('gives the same months for the answer of a server with backend migration 62, whose word is already by the rule', () => {
    const before62 = [invoice('2026-10-12', 20, 'paid', 20), invoice('2026-10-05', 14, 'paid', 4), invoice('2026-09-20', 30, 'pending')];
    const with62 = [
      { ...invoice('2026-10-12', 20, 'paid', 20), received_amount: 20, balance_amount: 0 },
      { ...invoice('2026-10-05', 14, 'pending', 4), received_amount: 4, balance_amount: 10 },
      { ...invoice('2026-09-20', 30, 'pending'), received_amount: 0, balance_amount: 30 },
    ];
    expect(invoiceMonths(with62)).toEqual(invoiceMonths(before62));
    expect(invoiceMonthTotals(invoiceMonths(with62))).toEqual({ invoiceCount: 3, amount: 64, paidAmount: 24, pendingAmount: 40, paidCount: 1, pendingCount: 2 });
  });

  it('counts no more than the total as received, and no less than nothing', () => {
    const months = invoiceMonths([
      // 20 paid on an invoice of 14: 14 received, nothing owed.
      invoice('2026-10-12', 14, 'paid', 20),
      // A negative amount is no payment: all 30 owed.
      invoice('2026-10-11', 30, 'paid', -5),
    ]);
    expect(months).toEqual([{ month: '2026-10', invoiceCount: 2, amount: 44, paidAmount: 14, pendingAmount: 30, paidCount: 1, pendingCount: 1 }]);
  });

  it('counts an invoice with at most 0.50 owed as Paid and one with 0.51 owed as Pending, the paise owed under Pending either way', () => {
    const [atTolerance] = invoiceMonths([invoice('2026-10-12', 14, 'paid', 13.5)]);
    expect(atTolerance).toEqual({ month: '2026-10', invoiceCount: 1, amount: 14, paidAmount: 13.5, pendingAmount: 0.5, paidCount: 1, pendingCount: 0 });
    const [overTolerance] = invoiceMonths([invoice('2026-10-12', 14, 'paid', 13.49)]);
    expect(overTolerance).toEqual({ month: '2026-10', invoiceCount: 1, amount: 14, paidAmount: 13.49, pendingAmount: 0.51, paidCount: 0, pendingCount: 1 });
  });

  it('takes an invoice with no amount by the server\'s word: "paid" is paid in full, any other word has nothing received', () => {
    const [month] = invoiceMonths([
      invoice('2026-09-30', 1800, 'partly_paid'),
      invoice('2026-09-20', 7350, 'pending'),
      invoice('2026-09-10', 640, 'paid'),
      invoice('2026-09-05', 90, undefined),
      invoice('2026-09-04', 10, null),
      invoice('2026-09-03', 1000, 'PAID'),
    ]);
    // Pending: 1800 + 7350 + 90 + 10 + 1000. Every invoice is under one of the two, so they add up.
    expect(month).toEqual({ month: '2026-09', invoiceCount: 6, amount: 10890, paidAmount: 640, pendingAmount: 10250, paidCount: 1, pendingCount: 5 });
    expect(month.paidAmount + month.pendingAmount).toBe(month.amount);
  });

  it('adds Paid and Pending up to the Amount, and the two counts up to the invoices, always: row by row and in the totals', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', 5400, 'paid', 5400),
      invoice('2026-10-11', 21500, 'paid', 1500.25),
      invoice('2026-10-10', 99.99, 'pending', 33.33),
      invoice('2026-09-30', 1800, 'partly_paid'),
      invoice('2026-09-20', 7350, 'pending', 9000),
      invoice('2026-09-10', 640.5, 'paid', 640),
      invoice('2026-08-18', 3540, undefined, -10),
      invoice('2026-08-17', 0, 'pending'),
      invoice('2026-08-16', -4, 'paid'),
      invoice(undefined, 250.1, 'paid', 0.1),
    ]);
    const paise = (amount: number) => Math.round(amount * 100);
    for (const month of months) {
      expect(paise(month.paidAmount) + paise(month.pendingAmount)).toBe(paise(month.amount));
      expect(month.paidCount + month.pendingCount).toBe(month.invoiceCount);
    }
    const totals = invoiceMonthTotals(months);
    expect(totals).toEqual({ invoiceCount: 10, amount: 40576.59, paidAmount: 14919.68, pendingAmount: 25656.91, paidCount: 5, pendingCount: 5 });
    expect(paise(totals.paidAmount) + paise(totals.pendingAmount)).toBe(paise(totals.amount));
    expect(totals.paidCount + totals.pendingCount).toBe(totals.invoiceCount);
  });

  it('adds paid and pending up to the amount when every invoice is paid or pending, row by row and in the totals', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', 5400, 'paid'),
      invoice('2026-10-11', 21500, 'pending'),
      invoice('2026-09-30', 1800, 'paid'),
      invoice('2026-09-20', 7350, 'pending'),
      invoice('2026-08-18', 3540, 'pending'),
    ]);
    for (const month of months) expect(month.paidAmount + month.pendingAmount).toBe(month.amount);
    const totals = invoiceMonthTotals(months);
    expect(totals).toEqual({ invoiceCount: 5, amount: 39590, paidAmount: 7200, pendingAmount: 32390, paidCount: 2, pendingCount: 3 });
    expect(totals.paidAmount + totals.pendingAmount).toBe(totals.amount);
    expect(totals.paidCount + totals.pendingCount).toBe(totals.invoiceCount);
  });

  it('sums decimals in whole paise, so paid and pending still equal the amount', () => {
    const months = invoiceMonths([invoice('2026-10-12', 100.1, 'paid'), invoice('2026-10-11', 200.2, 'pending'), invoice('2026-09-01', 0.1, 'paid'), invoice('2026-09-02', 0.2, 'paid')]);
    // 100.1 + 200.2 is 300.29999999999995 in floating point.
    expect(months[0]).toEqual({ month: '2026-10', invoiceCount: 2, amount: 300.3, paidAmount: 100.1, pendingAmount: 200.2, paidCount: 1, pendingCount: 1 });
    expect(months[1].amount).toBe(0.3);
    expect(invoiceMonthTotals(months).amount).toBe(300.6);
  });

  it('sums part payments in whole paise: three of 0.10 on invoices of 0.90 are 0.30 received and 2.40 owed', () => {
    const part = () => invoice('2026-10-12', 0.9, 'paid', 0.1);
    const [month] = invoiceMonths([part(), part(), part()]);
    // As floats 0.1 + 0.1 + 0.1 is 0.30000000000000004 and 0.8 + 0.8 + 0.8 is 2.4000000000000004.
    expect(month).toEqual({ month: '2026-10', invoiceCount: 3, amount: 2.7, paidAmount: 0.3, pendingAmount: 2.4, paidCount: 0, pendingCount: 3 });
  });

  it('counts an invoice with an unreadable total as zero, and one with no readable date in a last row of its own', () => {
    const months = invoiceMonths([
      invoice('2026-10-12', Number.NaN, 'paid'),
      invoice('2026-10-11', undefined as unknown as number, 'pending'),
      invoice(undefined, 500, 'pending'),
      invoice('', 250, 'paid'),
      invoice('2026-01-05', 10, 'paid'),
    ]);
    expect(months).toEqual([
      // Nothing is owed on an amount of zero: both count as Paid, whatever the server's word.
      { month: '2026-10', invoiceCount: 2, amount: 0, paidAmount: 0, pendingAmount: 0, paidCount: 2, pendingCount: 0 },
      { month: '2026-01', invoiceCount: 1, amount: 10, paidAmount: 10, pendingAmount: 0, paidCount: 1, pendingCount: 0 },
      { month: '', invoiceCount: 2, amount: 750, paidAmount: 250, pendingAmount: 500, paidCount: 1, pendingCount: 1 },
    ]);
  });

  it('has totals that are the sums of the rows it is given, not of anything else', () => {
    const rows = [
      { month: '2026-10', invoiceCount: 3, amount: 39500, paidAmount: 18000, pendingAmount: 21500, paidCount: 2, pendingCount: 1 },
      { month: '2026-09', invoiceCount: 2, amount: 9150, paidAmount: 0, pendingAmount: 7350, paidCount: 0, pendingCount: 1 },
      { month: '2026-08', invoiceCount: 1, amount: 3540, paidAmount: 3540, pendingAmount: 0, paidCount: 1, pendingCount: 0 },
    ];
    expect(invoiceMonthTotals(rows)).toEqual({ invoiceCount: 6, amount: 52190, paidAmount: 21540, pendingAmount: 28850, paidCount: 3, pendingCount: 2 });
    expect(invoiceMonthTotals(rows.slice(1))).toEqual({ invoiceCount: 3, amount: 12690, paidAmount: 3540, pendingAmount: 7350, paidCount: 1, pendingCount: 1 });
  });

  it('does not change the invoices it is given', () => {
    const invoices = [invoice('2026-10-12', 100, 'paid'), invoice('2026-09-12', 200, 'pending')];
    const before = JSON.stringify(invoices);
    invoiceMonths(invoices);
    expect(JSON.stringify(invoices)).toBe(before);
  });
});

describe('invoiceMonthsHavePaise', () => {
  const month = (amount: number, paidAmount: number, pendingAmount: number): InvoiceMonth => ({
    month: '2026-10',
    invoiceCount: 1,
    amount,
    paidAmount,
    pendingAmount,
    paidCount: 0,
    pendingCount: 0,
  });

  it('is false for no months', () => {
    expect(invoiceMonthsHavePaise([])).toBe(false);
  });

  it('is false while every amount is a whole number of rupees, zero and large ones included', () => {
    expect(invoiceMonthsHavePaise([month(39500, 18000, 21500), month(9150, 0, 7350), month(0, 0, 0)])).toBe(false);
    expect(invoiceMonthsHavePaise([month(12345678, 12345678, 0)])).toBe(false);
    // Built by the month function from whole-rupee invoices.
    expect(invoiceMonthsHavePaise(invoiceMonths([invoice('2026-10-12', 5400, 'paid'), invoice('2026-10-11', 21500, 'pending')]))).toBe(false);
  });

  it('is true for a single paisa in any one of the three amounts of any one row', () => {
    expect(invoiceMonthsHavePaise([month(100.01, 0, 0)])).toBe(true);
    expect(invoiceMonthsHavePaise([month(100, 0.01, 0)])).toBe(true);
    expect(invoiceMonthsHavePaise([month(100, 0, 99.99)])).toBe(true);
    // The row with paise is the last of several.
    expect(invoiceMonthsHavePaise([month(100, 100, 0), month(200, 0, 200), month(0.01, 0, 0)])).toBe(true);
  });

  it('is true when only the amount is whole: 100.50 paid and two pending of 50.25 make an amount of 201 with paise in the others', () => {
    const rows = invoiceMonths([
      invoice('2026-10-12', 100.5, 'paid'),
      invoice('2026-10-11', 50.25, 'pending'),
      invoice('2026-10-10', 50.25, 'pending'),
    ]);
    expect(rows).toEqual([{ month: '2026-10', invoiceCount: 3, amount: 201, paidAmount: 100.5, pendingAmount: 100.5, paidCount: 1, pendingCount: 2 }]);
    expect(invoiceMonthsHavePaise(rows)).toBe(true);
  });

  it('is true when only a part payment has paise: 4.25 received of 14.00 leaves 9.75, beside a whole amount', () => {
    const rows = invoiceMonths([invoice('2026-10-12', 14, 'paid', 4.25), invoice('2026-10-11', 20, 'paid', 20)]);
    expect(rows).toEqual([{ month: '2026-10', invoiceCount: 2, amount: 34, paidAmount: 24.25, pendingAmount: 9.75, paidCount: 1, pendingCount: 1 }]);
    expect(invoiceMonthsHavePaise(rows)).toBe(true);
    // The same invoices with whole payments: whole rupees.
    expect(invoiceMonthsHavePaise(invoiceMonths([invoice('2026-10-12', 14, 'paid', 4), invoice('2026-10-11', 20, 'paid', 20)]))).toBe(false);
  });

  it('is true for 0.1 + 0.2, which is 30 paise, and false for ten times 0.1, which is a rupee with float noise', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(invoiceMonthsHavePaise([month(0.1 + 0.2, 0, 0)])).toBe(true);
    expect(invoiceMonthsHavePaise(invoiceMonths([invoice('2026-10-12', 0.1 + 0.2, 'paid')]))).toBe(true);
    let sum = 0;
    for (let i = 0; i < 10; i += 1) sum += 0.1;
    expect(sum).not.toBe(1);
    expect(invoiceMonthsHavePaise([month(sum, sum, 0)])).toBe(false);
  });

  it('counts a negative amount by its paise too: -4 is whole, -4.5 and -0.01 are not', () => {
    expect(invoiceMonthsHavePaise([month(-4, -4, 0)])).toBe(false);
    expect(invoiceMonthsHavePaise([month(-4.5, -4.5, 0)])).toBe(true);
    expect(invoiceMonthsHavePaise([month(-0.01, 0, 0)])).toBe(true);
    expect(invoiceMonthsHavePaise([month(-100, 0, -100)])).toBe(false);
  });

  it('reads an unreadable amount as zero, like the sums do', () => {
    expect(invoiceMonthsHavePaise([month(Number.NaN, undefined as unknown as number, null as unknown as number)])).toBe(false);
  });
});
