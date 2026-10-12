/**
 * The invoice history service passes each invoice's `total` on: the screen's
 * amounts (cards, monthly table, Paid and Pending tiles, sort) are built from it,
 * not from `net_total`, which counts labour and tax twice on servers before
 * backend migration 61.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
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
