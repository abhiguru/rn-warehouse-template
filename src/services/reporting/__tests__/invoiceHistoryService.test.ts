/**
 * The invoice history service passes each invoice's `total` on: the screen's
 * amounts (cards, monthly table, Paid and Pending tiles, sort) are built from it,
 * not from `net_total`, which counts labour and tax twice on servers before
 * backend migration 61. It also passes on the payments recorded against each
 * invoice (`payment_status.amount`), from which the screen works out what is Paid
 * and what is Pending, whatever the server's own word is.
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
