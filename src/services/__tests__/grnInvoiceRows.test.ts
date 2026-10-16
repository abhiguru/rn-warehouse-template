/**
 * getGrnInvoiceRows: a GRN's invoices for its Invoices tab, from the list the account may read
 * (staff: get_invoices_list; a customer account: get_customer_invoice_summary), kept only when
 * their GRN id is this GRN's (the GRN-number search also matches longer numbers).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getGrnInvoiceRows } from '../invoice-service';
import { clearCustomerHistoryCache } from '../customerHistoryCache';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const staffRow = (id: string, number: number, grnId: string, grnNo: string) => ({
  invoice_id: id,
  invoice_number: number,
  invoice_date: '2026-10-01T09:00:00+00:00',
  total: 1906,
  customer: { id: 'customer-a', name: 'Fictional Traders' },
  grn: { id: grnId, gr_no: grnNo },
});

function mockClient(rpc: jest.Mock) {
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({
    rpc,
    from: jest.fn(() => ({ select: jest.fn(() => ({ in: jest.fn(async () => ({ data: [], error: null })) })) })),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearCustomerHistoryCache();
});

describe('getGrnInvoiceRows', () => {
  it('reads the staff list by GRN number and customer, and keeps only this GRN by id', async () => {
    const rpc = jest.fn(async () => ({
      data: {
        success: true,
        // get_invoices_list sends the rows as `data` and the paging beside it.
        data: [staffRow('inv-1', 104, 'grn-1', 'DV0001'), staffRow('inv-2', 105, 'grn-10', 'DV00010')],
        pagination: { total_count: 2, limit: 200, offset: 0, has_more: false },
      },
      error: null,
    }));
    mockClient(rpc);

    const result = await getGrnInvoiceRows({ grnId: 'grn-1', grnNo: 'DV0001', customerId: 'customer-a', warehouseRole: true });

    expect(rpc).toHaveBeenCalledWith('get_invoices_list', expect.objectContaining({
      p_search_grn_no: 'DV0001',
      p_customer_id: 'customer-a',
      p_limit: 200,
    }));
    expect(result.success).toBe(true);
    expect(result.invoices.map((invoice) => invoice.invoice_id)).toEqual(['inv-1']);
  });

  it('reads a customer account through its own invoice summary, never the staff list', async () => {
    const rpc = jest.fn(async () => ({
      data: {
        success: true,
        data: {
          invoices: [
            { invoice_id: 'inv-1', invoice_number: '2026-0104', invoice_date: '2026-10-01', financial_year: '2026-2027', grn_ref: 'DV0001', grn_id: 'grn-1', total: 1906 },
            { invoice_id: 'inv-9', invoice_number: '2026-0109', invoice_date: '2026-10-02', financial_year: '2026-2027', grn_ref: 'DV0009', grn_id: 'grn-9', total: 50 },
          ],
        },
      },
      error: null,
    }));
    mockClient(rpc);

    const result = await getGrnInvoiceRows({
      grnId: 'grn-1', grnNo: 'DV0001', customerId: 'customer-a', warehouseRole: false, assignedCustomerIds: ['customer-a'],
    });

    expect(rpc).toHaveBeenCalledWith('get_customer_invoice_summary', expect.objectContaining({ p_customer_uuid: 'customer-a' }));
    expect(rpc).not.toHaveBeenCalledWith('get_invoices_list', expect.anything());
    expect(result.invoices.map((invoice) => [invoice.invoice_id, invoice.invoice_number, invoice.total])).toEqual([['inv-1', 104, 1906]]);
  });

  it('refuses a customer account that is not assigned to the GRN customer, without a call', async () => {
    const rpc = jest.fn();
    mockClient(rpc);

    const result = await getGrnInvoiceRows({
      grnId: 'grn-1', grnNo: 'DV0001', customerId: 'customer-b', warehouseRole: false, assignedCustomerIds: ['customer-a'],
    });

    expect(result).toEqual({ success: false, invoices: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a failed read, so the tab falls back to the summary', async () => {
    mockClient(jest.fn(async () => ({ data: null, error: { message: 'permission denied' } })));

    expect(await getGrnInvoiceRows({ grnId: 'grn-1', grnNo: 'DV0001', warehouseRole: true })).toEqual({ success: false, invoices: [] });
  });
});
