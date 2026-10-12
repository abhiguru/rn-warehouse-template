/**
 * Invoice history: Paid is the money received and Pending is what is still owed.
 * An invoice is Paid only when nothing is owed (a balance of at most 0.50); a
 * part-paid one stays Pending with its balance. The rule is worked out in the app
 * from each invoice's `total` and `payment_status.amount`, so it is the same on a
 * server that says "paid" for any payment (before backend migration 62) and on
 * one that already answers by the rule.
 */
import { INVOICE_HISTORY_CUSTOMER, invoiceRecordsView } from '../configs/reports/invoiceHistory';
import { invoicePayment, PAID_TOLERANCE_PAISE, type PayableInvoice } from '../configs/reports/invoicePayment';
import type { FilterContext } from '../types';

const invoice = (total: unknown, status?: string | null, amount?: unknown): PayableInvoice => ({
  total: total as number,
  payment_status: status === undefined && amount === undefined ? undefined : { status, ...(amount !== undefined && { amount }) },
});

/** What the screen shows of a payment: the word, whether the card adds its line, the money received and the balance. */
const shown = (row: PayableInvoice) => {
  const payment = invoicePayment(row);
  return [payment.status, payment.partPaid, payment.received, payment.balance];
};

describe('invoicePayment', () => {
  it('has nothing received on an invoice with no payment: Pending for its whole amount', () => {
    expect(shown(invoice(14, 'pending'))).toEqual(['pending', false, 0, 14]);
    // An amount of zero is a payment of nothing.
    expect(shown(invoice(14, 'pending', 0))).toEqual(['pending', false, 0, 14]);
  });

  it('is Paid when the payments equal the total', () => {
    expect(shown(invoice(14, 'paid', 14))).toEqual(['paid', false, 14, 0]);
  });

  it('keeps a part-paid invoice Pending with its balance, whichever word the server sends', () => {
    // Before backend migration 62 any payment makes the server say "paid"; from 62 it says "pending".
    expect(shown(invoice(14, 'paid', 4))).toEqual(['pending', true, 4, 10]);
    expect(shown(invoice(14, 'pending', 4))).toEqual(['pending', true, 4, 10]);
    // A word the app does not know changes nothing: the money decides.
    expect(shown(invoice(14, 'partly_paid', 4))).toEqual(['pending', true, 4, 10]);
    expect(shown(invoice(14, undefined, 4))).toEqual(['pending', true, 4, 10]);
  });

  it('never counts more than the total as received: an over-payment is Paid with nothing owed', () => {
    expect(shown(invoice(14, 'paid', 20))).toEqual(['paid', false, 14, 0]);
    expect(shown(invoice(14, 'pending', 14.01))).toEqual(['paid', false, 14, 0]);
  });

  it('never counts less than nothing as received: a negative amount is no payment', () => {
    expect(shown(invoice(14, 'paid', -5))).toEqual(['pending', false, 0, 14]);
    expect(shown(invoice(14, 'pending', -0.01))).toEqual(['pending', false, 0, 14]);
  });

  it('is Paid up to a balance of 0.50 and Pending from 0.51', () => {
    expect(PAID_TOLERANCE_PAISE).toBe(50);
    // 14.00 with 13.50 received: 0.50 is still owed, and it counts as Paid.
    expect(shown(invoice(14, 'paid', 13.5))).toEqual(['paid', false, 13.5, 0.5]);
    // One paisa more owed: Pending, and part-paid.
    expect(shown(invoice(14, 'paid', 13.49))).toEqual(['pending', true, 13.49, 0.51]);
    // The same line for an invoice with no payment at all.
    expect(shown(invoice(0.5, 'pending'))).toEqual(['paid', false, 0, 0.5]);
    expect(shown(invoice(0.51, 'pending'))).toEqual(['pending', false, 0, 0.51]);
    // And either side of it for a large invoice.
    expect(shown(invoice(123456.5, 'pending', 123456))).toEqual(['paid', false, 123456, 0.5]);
    expect(shown(invoice(123456.51, 'pending', 123456))).toEqual(['pending', true, 123456, 0.51]);
  });

  it('takes "paid" with no amount, as an older server answers, as paid in full', () => {
    expect(shown(invoice(14, 'paid'))).toEqual(['paid', false, 14, 0]);
    // No amount that can be read is no amount.
    for (const amount of [null, '', '  ', 'none', Number.NaN, Number.POSITIVE_INFINITY, true, {}]) {
      expect(shown(invoice(14, 'paid', amount))).toEqual(['paid', false, 14, 0]);
      expect(shown(invoice(14, 'pending', amount))).toEqual(['pending', false, 0, 14]);
    }
    // But "paid" with an amount is that amount: a payment of nothing leaves everything owed.
    expect(shown(invoice(14, 'paid', 0))).toEqual(['pending', false, 0, 14]);
  });

  it('has nothing received when there is no amount and the word is not "paid"', () => {
    for (const status of ['pending', 'partly_paid', 'PAID', '', null, undefined]) {
      expect(shown(invoice(14, status))).toEqual(['pending', false, 0, 14]);
    }
    expect(shown({ total: 14 })).toEqual(['pending', false, 0, 14]);
    expect(shown({ total: 14, payment_status: null })).toEqual(['pending', false, 0, 14]);
  });

  it('reads an amount sent as text', () => {
    expect(shown(invoice(14, 'paid', '4.00'))).toEqual(['pending', true, 4, 10]);
    expect(shown(invoice('14.00', 'paid', ' 14 '))).toEqual(['paid', false, 14, 0]);
  });

  it('works in whole paise, so the money received and the balance add up to the total', () => {
    // As floats 100.1 - 33.35 is 66.74999999999999 and 0.3 - 0.1 is 0.19999999999999998.
    expect(shown(invoice(100.1, 'paid', 33.35))).toEqual(['pending', true, 33.35, 66.75]);
    expect(invoicePayment(invoice(100.1, 'paid', 33.35))).toMatchObject({ totalPaise: 10010, receivedPaise: 3335, balancePaise: 6675 });
    expect(shown(invoice(0.1 + 0.2, 'paid', 0.1))).toEqual(['paid', false, 0.1, 0.2]);
    expect(shown(invoice(1000.07, 'paid', 0.07))).toEqual(['pending', true, 0.07, 1000]);
    for (const [total, amount] of [[100.1, 33.35], [14, 4], [14, 20], [14, -5], [0.3, 0.1], [99999.99, 0.01], [-4, 2], [0, 0]]) {
      const payment = invoicePayment(invoice(total, 'paid', amount));
      expect(payment.receivedPaise + payment.balancePaise).toBe(payment.totalPaise);
      expect(Number.isInteger(payment.receivedPaise) && Number.isInteger(payment.balancePaise)).toBe(true);
    }
  });

  it('owes nothing on an invoice of nothing or of less than nothing: Paid, with its whole amount under Paid', () => {
    expect(shown(invoice(0, 'pending'))).toEqual(['paid', false, 0, 0]);
    expect(shown(invoice(0, 'paid', 5))).toEqual(['paid', false, 0, 0]);
    // A credit.
    expect(shown(invoice(-4, 'pending'))).toEqual(['paid', false, -4, 0]);
    expect(shown(invoice(-4, 'paid'))).toEqual(['paid', false, -4, 0]);
    expect(shown(invoice(-4, 'paid', 2))).toEqual(['paid', false, -4, 0]);
  });

  it('reads an unreadable total as zero', () => {
    for (const total of [undefined, null, Number.NaN, 'garbage']) {
      expect(shown(invoice(total, 'pending'))).toEqual(['paid', false, 0, 0]);
      expect(shown(invoice(total, 'paid', 4))).toEqual(['paid', false, 0, 0]);
    }
  });

  it('does not change the invoice it is given', () => {
    const row = invoice(14, 'paid', 4);
    const before = JSON.stringify(row);
    invoicePayment(row);
    expect(JSON.stringify(row)).toBe(before);
  });
});

describe('the Payment choice of one customer\'s invoices', () => {
  // The same four invoices as a server before backend migration 62 answers them ("paid" for any payment)
  // and as one with it does (the word already by the rule, and more keys per invoice).
  const record = (id: string, total: number, status: string, amount?: number, more: Record<string, unknown> = {}) => ({
    invoice_id: id,
    invoice_number: `2026/${id}`,
    invoice_date: '2026-10-01',
    grn_ref: `A${id}`,
    total,
    payment_status: { status, paid_date: null, payment_ref: null, ...(amount !== undefined && { amount }) },
    line_items: [],
    ...more,
  });
  const BEFORE_62 = [
    record('0401', 20, 'paid', 20),
    record('0402', 14, 'paid', 4),
    record('0403', 30, 'pending'),
    // 0.50 short: Paid.
    record('0404', 9, 'paid', 8.5),
  ];
  const WITH_62 = [
    record('0401', 20, 'paid', 20, { received_amount: 20, balance_amount: 0 }),
    record('0402', 14, 'pending', 4, { received_amount: 4, balance_amount: 10 }),
    record('0403', 30, 'pending', undefined, { received_amount: 0, balance_amount: 30 }),
    record('0404', 9, 'paid', 8.5, { received_amount: 8.5, balance_amount: 0.5 }),
  ];
  const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
  const ids = (rows: unknown[], payment: string) =>
    invoiceRecordsView(
      rows as Parameters<typeof invoiceRecordsView>[0],
      INVOICE_HISTORY_CUSTOMER.toRequest({ payment }, { field: 'number', order: 'asc' }, staff, new Date(2026, 9, 12)).view
    ).map(row => row.invoice_id);

  it.each([['a server before migration 62', BEFORE_62], ['a server with migration 62', WITH_62]])('on %s: Paid lists the invoices with nothing owed, Pending those with a balance, the part-paid one included', (_name, rows) => {
    expect(ids(rows, 'all')).toEqual(['0401', '0402', '0403', '0404']);
    expect(ids(rows, 'paid')).toEqual(['0401', '0404']);
    expect(ids(rows, 'pending')).toEqual(['0402', '0403']);
  });

  it('puts every invoice under exactly one of the two', () => {
    const odd = [...BEFORE_62, record('0405', 50, 'partly_paid'), record('0406', 0, 'pending'), record('0407', 60, 'paid')];
    expect(ids(odd, 'paid')).toEqual(['0401', '0404', '0406', '0407']);
    expect(ids(odd, 'pending')).toEqual(['0402', '0403', '0405']);
    expect([...ids(odd, 'paid'), ...ids(odd, 'pending')].sort()).toEqual(ids(odd, 'all'));
  });
});
