/**
 * The invoice history service passes each invoice's `total` on: the screen's
 * amounts (cards, monthly table, Paid and Pending tiles, sort) are built from it,
 * not from `net_total`, which counts labour and tax twice on servers before
 * backend migration 61. It also passes on the payments recorded against each
 * invoice (`payment_status.amount`), from which the screen works out what is Paid
 * and what is Pending, whatever the server's own word is. A server before migration
 * 61 lists an invoice once per payment: the service merges those rows into one invoice
 * whose amount is the sum of the payments.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { invoiceMonths, invoiceMonthTotals } from '@/features/filters/configs/reports/invoiceMonths';
import { invoicePayment } from '@/features/filters/configs/reports/invoicePayment';
import { getAllInvoiceHistory, getCustomerInvoiceHistory } from '../invoice-history-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const rpc = jest.fn();

/** The data of a service result, which the test requires to be there. */
function dataOf<T>(result: { data?: T }): T {
  if (!result.data) throw new Error('The service returned no data');
  return result.data;
}

beforeEach(() => {
  jest.clearAllMocks();
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('getCustomerInvoiceHistory', () => {
  const ask = () => getCustomerInvoiceHistory({ customerId: 'cccccccc-1111-4222-8333-444444444444', fromDate: '2026-10-01', toDate: '2026-10-11' });

  it('maps each invoice\'s total beside its net_total, and a missing total to 0', async () => {
    rpc.mockResolvedValue({
      data: {
        success: true,
        data: {
          summary: {},
          // total 14 with labour 2.50 and tax 5% on a charge of 10; an unfixed server's net_total is 14 + 2.5 + 0.5 - 0 = 17.5.
          invoices: [
            { invoice_id: 'i1', invoice_number: '2026/0001', invoice_date: '2026-10-01', total: 14, labour: 2.5, tax_amount: 0.5, discount: 0, net_total: 17.5 },
            { invoice_id: 'i2', invoice_number: '2026/0002', invoice_date: '2026-10-02', net_total: 9 },
          ],
          by_month: [],
        },
      },
      error: null,
    });
    const result = await ask();
    expect(result.success).toBe(true);
    expect(dataOf(result).invoices.map(row => [row.invoice_id, row.total, row.net_total])).toEqual([
      ['i1', 14, 17.5],
      ['i2', 0, 9],
    ]);
  });

  describe('the payments recorded against an invoice', () => {
    const answerOf = (invoices: unknown[]) => ({ data: { success: true, data: { summary: {}, invoices, by_month: [] } }, error: null });
    const paid = (status: string, amount: number) => ({ status, paid_date: '2026-10-06', payment_ref: 'PAY-0007', amount, payment_mode: 'cash' });
    const row = (id: string, total: number, more: Record<string, unknown>) => ({ invoice_id: id, invoice_number: `2026/${id}`, invoice_date: '2026-10-05', total, net_total: total, ...more });
    // One paid in full, one part-paid (4.00 of 14.00) and one with no payment, as get_customer_invoice_summary
    // answers them from backend migration 61: the amount is the sum of the invoice's payment rows, and the
    // word is "paid" as soon as there is one.
    const BEFORE_62 = [
      row('0401', 20, { payment_status: paid('paid', 20) }),
      row('0402', 14, { payment_status: paid('paid', 4) }),
      row('0403', 30, { payment_status: { status: 'pending', paid_date: null, payment_ref: null } }),
    ];
    // The same with migration 62: the word by the rule, and keys of its own for the two amounts
    // (these names stand for whatever it sends: the app reads none of them).
    const WITH_62 = [
      row('0401', 20, { payment_status: paid('paid', 20), received_amount: 20, balance_amount: 0 }),
      row('0402', 14, { payment_status: paid('pending', 4), received_amount: 4, balance_amount: 10 }),
      row('0403', 30, { payment_status: { status: 'pending', paid_date: null, payment_ref: null }, received_amount: 0, balance_amount: 30 }),
    ];
    const mapped = async (invoices: unknown[]) => {
      rpc.mockResolvedValue(answerOf(invoices));
      return dataOf(await ask()).invoices;
    };

    it('maps the amount beside the server\'s word, and none for an invoice with no payment', async () => {
      const invoices = await mapped([...BEFORE_62, row('0404', 5, {})]);
      expect(invoices.map(invoice => [invoice.invoice_id, invoice.payment_status.status, invoice.payment_status.amount])).toEqual([
        ['0401', 'paid', 20],
        ['0402', 'paid', 4],
        ['0403', 'pending', undefined],
        ['0404', 'pending', undefined],
      ]);
    });

    it.each([['before migration 62', BEFORE_62], ['with migration 62', WITH_62]])('gives the screen what it needs %s: the part-paid invoice is Pending with its balance, and Paid + Pending is the Amount', async (_name, answer) => {
      const invoices = await mapped(answer);
      expect(invoices.map(invoice => [invoice.invoice_id, invoicePayment(invoice).status, invoicePayment(invoice).received, invoicePayment(invoice).balance])).toEqual([
        ['0401', 'paid', 20, 0],
        ['0402', 'pending', 4, 10],
        ['0403', 'pending', 0, 30],
      ]);
      expect(invoiceMonthTotals(invoiceMonths(invoices))).toEqual({ invoiceCount: 3, amount: 64, paidAmount: 24, pendingAmount: 40, paidCount: 1, pendingCount: 2 });
    });
  });

  // A server before backend migration 61 joins an invoice to its payment rows, so an invoice paid in several
  // parts comes back once per payment, with the same invoice_id and total on every row. The service gives the
  // screen one row per invoice (evidence: staged-pre61.txt, a real pre-61 database).
  describe('an older server that lists an invoice once per payment', () => {
    const answerOf = (invoices: unknown[]) => ({ data: { success: true, data: { summary: {}, invoices, by_month: [] } }, error: null });
    const payment = (status: string, amount: unknown, more: Record<string, unknown> = {}) => ({
      status,
      paid_date: '2026-10-06',
      payment_ref: 'PAY-0001',
      payment_mode: 'cash',
      ...(amount !== undefined && { amount }),
      ...more,
    });
    const row = (id: string | null | undefined, total: number, payment_status: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
      ...(id !== undefined && { invoice_id: id }),
      invoice_number: `2026/${id}`,
      invoice_date: '2026-10-05',
      total,
      net_total: total + 3.5,
      payment_status,
      ...more,
    });
    const mapped = async (invoices: unknown[]) => {
      rpc.mockResolvedValue(answerOf(invoices));
      return dataOf(await ask()).invoices;
    };
    const figures = (invoices: Parameters<typeof invoiceMonths>[0]) => invoiceMonthTotals(invoiceMonths(invoices));

    it('lists an invoice of 14 paid in two parts (4 and 10) once: Amount 14, Paid 14, Pending 0, Paid', async () => {
      const invoices = await mapped([
        row('i14', 14, payment('paid', 4, { payment_ref: 'PAY-0001', paid_date: '2026-10-05' })),
        row('i14', 14, payment('paid', 10, { payment_ref: 'PAY-0002', paid_date: '2026-10-06' })),
      ]);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].invoice_id).toBe('i14');
      expect(invoices[0].total).toBe(14);
      expect(invoices[0].payment_status.amount).toBe(14);
      expect(invoicePayment(invoices[0])).toMatchObject({ status: 'paid', received: 14, balance: 0 });
      expect(figures(invoices)).toEqual({ invoiceCount: 1, amount: 14, paidAmount: 14, pendingAmount: 0, paidCount: 1, pendingCount: 0 });
    });

    it('adds the amounts of three rows', async () => {
      const invoices = await mapped([
        row('i14', 14, payment('paid', 5)),
        row('i14', 14, payment('paid', 5)),
        row('i14', 14, payment('paid', 4)),
      ]);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].payment_status.amount).toBe(14);
      expect(figures(invoices)).toEqual({ invoiceCount: 1, amount: 14, paidAmount: 14, pendingAmount: 0, paidCount: 1, pendingCount: 0 });
    });

    it('keeps a part-paid invoice Pending with its balance, although the server says "paid" on its rows', async () => {
      const invoices = await mapped([row('i14', 14, payment('paid', 4)), row('i14', 14, payment('paid', 5))]);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].payment_status).toMatchObject({ status: 'paid', amount: 9 });
      expect(invoicePayment(invoices[0])).toMatchObject({ status: 'pending', partPaid: true, received: 9, balance: 5 });
      expect(figures(invoices)).toEqual({ invoiceCount: 1, amount: 14, paidAmount: 9, pendingAmount: 5, paidCount: 0, pendingCount: 1 });
    });

    it('adds in whole paise: 0.10 and 0.20 are 0.30, not 0.30000000000000004', async () => {
      const invoices = await mapped([row('i03', 0.3, payment('paid', 0.1)), row('i03', 0.3, payment('paid', 0.2))]);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].payment_status.amount).toBe(0.3);
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(figures(invoices)).toEqual({ invoiceCount: 1, amount: 0.3, paidAmount: 0.3, pendingAmount: 0, paidCount: 1, pendingCount: 0 });
    });

    it('adds amounts that arrive as text, as numbers', async () => {
      const invoices = await mapped([row('i14', 14, payment('paid', '4.00')), row('i14', 14, payment('paid', '10.00'))]);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].payment_status.amount).toBe(14);
    });

    it('lets a row without a readable amount add nothing', async () => {
      const invoices = await mapped([
        row('i14', 14, payment('paid', 4)),
        row('i14', 14, payment('paid', undefined)),
        row('i14', 14, payment('paid', null)),
        row('i14', 14, payment('paid', '')),
        row('i14', 14, payment('paid', 'n/a')),
        row('i14', 14, payment('paid', 5)),
      ]);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].payment_status.amount).toBe(9);
    });

    it('leaves the first row\'s amount as it was when no duplicate has a readable amount, and the word decides', async () => {
      const withoutAmounts = await mapped([row('i14', 14, payment('paid', undefined)), row('i14', 14, payment('paid', undefined))]);
      expect(withoutAmounts).toHaveLength(1);
      expect(withoutAmounts[0].payment_status.amount).toBeUndefined();
      // An answer that says "paid" and carries no amount is paid in full (invoicePayment).
      expect(invoicePayment(withoutAmounts[0])).toMatchObject({ status: 'paid', received: 14, balance: 0 });

      const unreadable = await mapped([row('i14', 14, payment('pending', null)), row('i14', 14, payment('pending', ''))]);
      expect(unreadable).toHaveLength(1);
      expect(unreadable[0].payment_status.amount).toBeNull();
      expect(unreadable[0].payment_status.status).toBe('pending');
      expect(invoicePayment(unreadable[0])).toMatchObject({ status: 'pending', received: 0, balance: 14 });
    });

    it('is "paid" when any row says so, else the first row\'s word', async () => {
      const [pendingThenPaid] = await mapped([row('a', 14, payment('pending', 4)), row('a', 14, payment('paid', 5))]);
      expect(pendingThenPaid.payment_status.status).toBe('paid');
      const [paidThenPending] = await mapped([row('a', 14, payment('paid', 4)), row('a', 14, payment('pending', 5))]);
      expect(paidThenPending.payment_status.status).toBe('paid');
      const [bothPending] = await mapped([row('a', 14, payment('pending', 4)), row('a', 14, payment('pending', 5))]);
      expect(bothPending.payment_status.status).toBe('pending');
      // A row without a payment_status has the default word: pending.
      const [noWord] = await mapped([row('a', 14, {}), row('a', 14, {})]);
      expect(noWord.payment_status.status).toBe('pending');
    });

    it('lists the invoices in the order of first appearance, with the first row\'s fields', async () => {
      const invoices = await mapped([
        row('b', 20, payment('paid', 5), { notes: 'first of b', item_count: 2, line_items: [{ item_id: 'it-1', item_name: 'Fictional Rice' }] }),
        row('a', 14, payment('paid', 4)),
        row('c', 30, { status: 'pending' }),
        row('b', 20, payment('paid', 15), { notes: 'second of b', item_count: 9, line_items: [{ item_id: 'it-1', item_name: 'Fictional Rice' }] }),
        row('a', 14, payment('paid', 10)),
      ]);
      expect(invoices.map(invoice => invoice.invoice_id)).toEqual(['b', 'a', 'c']);
      expect(invoices.map(invoice => invoice.payment_status.amount)).toEqual([20, 14, undefined]);
      // The first row's fields; the line items are not repeated.
      expect(invoices[0]).toMatchObject({ notes: 'first of b', item_count: 2 });
      expect(invoices[0].line_items.map(item => item.item_id)).toEqual(['it-1']);
      expect(figures(invoices)).toEqual({ invoiceCount: 3, amount: 64, paidAmount: 34, pendingAmount: 30, paidCount: 2, pendingCount: 1 });
    });

    it('never merges rows with no invoice_id (missing, null, empty or blank), whatever else they share', async () => {
      const invoices = await mapped([
        row('a', 14, payment('paid', 4)),
        row(undefined, 7, payment('paid', 7)),
        row(undefined, 7, payment('paid', 7)),
        row(null, 7, payment('paid', 7)),
        row('', 7, payment('paid', 7)),
        row('   ', 7, payment('paid', 7)),
        row('a', 14, payment('paid', 10)),
      ]);
      expect(invoices).toHaveLength(6);
      expect(invoices.map(invoice => invoice.invoice_id)).toEqual(['a', undefined, undefined, null, '', '   ']);
      expect(invoices.slice(1).map(invoice => invoice.payment_status.amount)).toEqual([7, 7, 7, 7, 7]);
      expect(invoices[0].payment_status.amount).toBe(14);
    });

    it('keeps the date, reference and mode of the row paid last, whatever its place', async () => {
      const early = payment('paid', 4, { paid_date: '2026-10-02', payment_ref: 'PAY-EARLY', payment_mode: 'cash' });
      const late = payment('paid', 5, { paid_date: '2026-10-06', payment_ref: 'PAY-LATE', payment_mode: 'upi' });
      const middle = payment('paid', 5, { paid_date: '2026-10-04', payment_ref: 'PAY-MIDDLE', payment_mode: 'cheque' });
      for (const rows of [[early, late, middle], [late, early, middle], [middle, early, late]]) {
        const [merged] = await mapped(rows.map(payment_status => row('a', 14, payment_status)));
        expect(merged.payment_status).toMatchObject({ paid_date: '2026-10-06', payment_ref: 'PAY-LATE', payment_mode: 'upi', amount: 14 });
      }
    });

    it('compares dates that carry a time, and lets a row without a date lose to a row with one', async () => {
      const morning = payment('paid', 4, { paid_date: '2026-10-06T09:00:00+00:00', payment_ref: 'PAY-AM', payment_mode: 'cash' });
      const afternoon = payment('paid', 5, { paid_date: '2026-10-06T15:00:00+00:00', payment_ref: 'PAY-PM', payment_mode: 'upi' });
      const undated = payment('paid', 5, { paid_date: null, payment_ref: 'PAY-NODATE', payment_mode: 'card' });
      const [byTime] = await mapped([row('a', 14, afternoon), row('a', 14, morning)]);
      expect(byTime.payment_status).toMatchObject({ payment_ref: 'PAY-PM', payment_mode: 'upi' });
      const [undatedFirst] = await mapped([row('a', 14, undated), row('a', 14, morning)]);
      expect(undatedFirst.payment_status).toMatchObject({ paid_date: '2026-10-06T09:00:00+00:00', payment_ref: 'PAY-AM', payment_mode: 'cash' });
      const [undatedLast] = await mapped([row('a', 14, morning), row('a', 14, undated)]);
      expect(undatedLast.payment_status).toMatchObject({ paid_date: '2026-10-06T09:00:00+00:00', payment_ref: 'PAY-AM', payment_mode: 'cash' });
    });

    it('keeps the first row\'s date, reference and mode when no row has a date, and on the same date', async () => {
      const first = payment('paid', 4, { paid_date: null, payment_ref: 'PAY-1', payment_mode: 'cash' });
      const second = payment('paid', 5, { paid_date: null, payment_ref: 'PAY-2', payment_mode: 'upi' });
      const undated = await mapped([row('a', 14, first), row('a', 14, second)]);
      expect(undated).toHaveLength(1);
      expect(undated[0].payment_status).toMatchObject({ paid_date: null, payment_ref: 'PAY-1', payment_mode: 'cash', amount: 9 });
      const sameDay = await mapped([
        row('a', 14, { ...first, paid_date: '2026-10-06' }),
        row('a', 14, { ...second, paid_date: '2026-10-06' }),
      ]);
      expect(sameDay).toHaveLength(1);
      expect(sameDay[0].payment_status).toMatchObject({ paid_date: '2026-10-06', payment_ref: 'PAY-1', payment_mode: 'cash', amount: 9 });
    });

    it('gives a real pre-61 answer (staged-pre61.txt: 6 rows, one invoice on two) 5 invoices and the right figures', async () => {
      // 2026-6203 (111) is on two rows, paid 51.00 and 60.00. The server's own sums for the six rows: 500.00.
      const invoices = await mapped([
        row('00000000-0000-4000-8000-000000006201', 14, payment('paid', 4)),
        row('00000000-0000-4000-8000-000000006202', 89, { status: 'pending', paid_date: null, payment_ref: null }),
        row('00000000-0000-4000-8000-000000006203', 111, payment('paid', 51)),
        row('00000000-0000-4000-8000-000000006203', 111, payment('paid', 60)),
        row('00000000-0000-4000-8000-000000006204', 109, payment('paid', 108.5)),
        row('00000000-0000-4000-8000-000000006205', 66, payment('paid', 65.49)),
      ]);
      expect(invoices.map(invoice => [invoice.invoice_id.slice(-4), invoice.total, invoicePayment(invoice).status, invoicePayment(invoice).received, invoicePayment(invoice).balance])).toEqual([
        ['6201', 14, 'pending', 4, 10],
        ['6202', 89, 'pending', 0, 89],
        ['6203', 111, 'paid', 111, 0],
        ['6204', 109, 'paid', 108.5, 0.5],
        ['6205', 66, 'pending', 65.49, 0.51],
      ]);
      // Not 6 invoices, Amount 500, Pending 211.01 (6203 counted twice, both rows Pending).
      expect(figures(invoices)).toEqual({ invoiceCount: 5, amount: 389, paidAmount: 288.99, pendingAmount: 100.01, paidCount: 2, pendingCount: 3 });
    });

    describe('an answer without duplicates', () => {
      // Every mapped field, as the service has always given it: a paid, a part-paid and an unpaid invoice,
      // with line items, and rows that look alike but are different invoices.
      const lineItem = {
        item_id: 'it-1', item_name: 'Fictional Rice', packaging: 'Bag 50 kg', quantity: 10, rate: 1.5, no_of_days: 30, charge: 450,
        labour_rate: 0.5, labour_amount: 5, tax_percent: 5, tax_amount: 22.5, line_total: 477.5,
        grn_item_ref: { gr_no: 'GR-1', rack: 'A-1', package_mark: 'PM-1' },
      };
      const server = [
        { invoice_id: 'p1', invoice_number: '2026/0001', invoice_date: '2026-10-01', financial_year: '2026-27', grn_ref: 'GRN-1', grn_id: 'g1', total: 478, labour: 5, discount: 0, tax_amount: 22.5, net_total: 478, item_count: 1, total_quantity: 10, notes: 'paid', payment_status: { status: 'paid', paid_date: '2026-10-02', payment_ref: 'PAY-1', amount: 478, payment_mode: 'upi' }, line_items: [lineItem] },
        { invoice_id: 'p2', invoice_number: '2026/0002', invoice_date: '2026-10-02', total: 14, net_total: 14, payment_status: { status: 'paid', paid_date: '2026-10-03', payment_ref: 'PAY-2', amount: 4, payment_mode: 'cash' } },
        { invoice_id: 'p3', invoice_number: '2026/0003', invoice_date: '2026-10-03', total: 14, net_total: 14 },
        { invoice_id: 'p4', invoice_number: '2026/0003', invoice_date: '2026-10-03', total: 14, net_total: 14, payment_status: { status: 'pending', paid_date: null, payment_ref: null } },
      ];
      const full = (partial: Record<string, unknown>) => ({
        invoice_id: undefined, invoice_number: undefined, invoice_date: undefined, financial_year: '', grn_ref: '', grn_id: '', total: 0, labour: 0, discount: 0, tax_amount: 0,
        net_total: 0, item_count: 0, total_quantity: 0, notes: null, line_items: [], ...partial,
      });
      // What the service gave before it merged anything: the mapping, field for field.
      const TODAY = [
        full({ ...server[0], payment_status: { status: 'paid', paid_date: '2026-10-02', payment_ref: 'PAY-1', amount: 478, payment_mode: 'upi' }, line_items: [lineItem] }),
        full({ ...server[1], payment_status: { status: 'paid', paid_date: '2026-10-03', payment_ref: 'PAY-2', amount: 4, payment_mode: 'cash' } }),
        full({ ...server[2], payment_status: { status: 'pending', paid_date: null, payment_ref: null, amount: undefined, payment_mode: undefined } }),
        full({ ...server[3], payment_status: { status: 'pending', paid_date: null, payment_ref: null, amount: undefined, payment_mode: undefined } }),
      ];

      it('comes out exactly as the mapping always gave it: the same fields and the same order, nothing merged or dropped', async () => {
        const invoices = await mapped(server);
        expect(invoices).toStrictEqual(TODAY);
      });

      it('is the same from migration 61 on: one row with the summed amount', async () => {
        const [merged] = await mapped([row('i14', 14, payment('paid', 14))]);
        expect(merged).toStrictEqual(full({
          invoice_id: 'i14', invoice_number: '2026/i14', invoice_date: '2026-10-05', total: 14, net_total: 17.5,
          payment_status: { status: 'paid', paid_date: '2026-10-06', payment_ref: 'PAY-0001', amount: 14, payment_mode: 'cash' },
        }));
      });

      it('has no invoices, and no list at all, as before', async () => {
        expect(await mapped([])).toEqual([]);
        rpc.mockResolvedValue({ data: { success: true, data: { summary: {}, by_month: [] } }, error: null });
        expect(dataOf(await ask()).invoices).toEqual([]);
      });
    });
  });
});

describe('getAllInvoiceHistory', () => {
  it('maps the summary\'s and each customer\'s total_amount beside the net_amount', async () => {
    rpc.mockResolvedValue({
      data: {
        success: true,
        data: {
          summary: { total_invoices: 3, total_customers: 1, total_amount: 1000, total_tax: 50, net_amount: 1300 },
          by_customer: [{ customer_id: 'c1', customer_name: 'Riverbank Produce', invoice_count: 3, total_amount: 1000, net_amount: 1300, latest_invoice_date: '2026-10-01' }],
          by_month: [],
        },
      },
      error: null,
    });
    const result = await getAllInvoiceHistory({ fromDate: '2026-10-01', toDate: '2026-10-11' });
    const data = dataOf(result);
    expect([data.summary.total_amount, data.summary.net_amount]).toEqual([1000, 1300]);
    expect(data.by_customer.map(row => [row.total_amount, row.net_amount])).toEqual([[1000, 1300]]);
  });
});
