import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getAssignedCustomerDispatchList } from '../dispatch-service';
import { getAssignedCustomerInvoices } from '../invoice-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const CUSTOMER_A = 'customer-a';
const CUSTOMER_B = 'customer-b';

const dispatchRow = (id: string, dispNo: string, date: string, customerId: string, itemId: string) => ({
  id,
  disp_no: dispNo,
  disp_date: date,
  customer_id: customerId,
  customer_name: `Fictional ${customerId}`,
  items: [{ item_id: itemId, item_name: 'Fictional item', disp_qty: 10, weight: 50, gr_no: 'DV0001' }],
});

function mockClient(rpc: jest.Mock, customers: { id: string; name: string }[] = []) {
  const inFilter = jest.fn(async () => ({ data: customers, error: null }));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({
    rpc,
    from: jest.fn(() => ({ select: jest.fn(() => ({ in: inFilter })) })),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('dispatch list for a customer account', () => {
  const rpc = jest.fn(async (name: string, args: { p_customer_id: string }) => ({
    data: {
      success: true,
      data: {
        dispatches:
          args.p_customer_id === CUSTOMER_A
            ? [dispatchRow('d1', 'DD0001', '2026-07-01', CUSTOMER_A, 'item-1'), dispatchRow('d3', 'DD0003', '2026-09-01', CUSTOMER_A, 'item-2')]
            : [dispatchRow('d2', 'DD0002', '2026-08-10', CUSTOMER_B, 'item-1')],
        pagination: { has_more: false },
      },
    },
    error: null,
  }));

  it('reads each assigned customer through the customer RPC and merges newest first', async () => {
    mockClient(rpc);
    const result = await getAssignedCustomerDispatchList([CUSTOMER_A, CUSTOMER_B]);
    expect(result.success).toBe(true);
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['get_customer_dispatch_list', 'get_customer_dispatch_list']);
    expect(result.data.dispatches.map(d => d.disp_no)).toEqual(['DD0003', 'DD0002', 'DD0001']);
    expect(result.data.pagination).toMatchObject({ total_count: 3, has_more: false });
  });

  it('sorts by number, filters by item and number range, and pages in the app', async () => {
    mockClient(rpc);
    const byNumber = await getAssignedCustomerDispatchList([CUSTOMER_A, CUSTOMER_B], {
      p_sort_by: 'disp_no',
      p_sort_order: 'asc',
      p_limit: 2,
    });
    expect(byNumber.data.dispatches.map(d => d.disp_no)).toEqual(['DD0001', 'DD0002']);
    expect(byNumber.data.pagination.has_more).toBe(true);

    const filtered = await getAssignedCustomerDispatchList([CUSTOMER_A, CUSTOMER_B], {
      p_filters: { item_ids: ['item-1'], disp_no_from: 'DD0002' },
    });
    expect(filtered.data.dispatches.map(d => d.disp_no)).toEqual(['DD0002']);
  });

  it('refuses a customer the account is not assigned to, without calling the server', async () => {
    mockClient(rpc);
    const result = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: { customer_ids: ['someone-else'] } });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Customer access denied');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports an account with no assigned customer', async () => {
    mockClient(rpc);
    const result = await getAssignedCustomerDispatchList([]);
    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('invoice list for a customer account', () => {
  const rpc = jest.fn(async (name: string, args: { p_customer_uuid: string }) => ({
    data: {
      success: true,
      data: {
        invoices:
          args.p_customer_uuid === CUSTOMER_A
            ? [
                { invoice_id: 'i1', invoice_number: '2026-0001', invoice_date: '2026-08-10', financial_year: '2026-2027', grn_ref: 'DV0001', grn_id: 'g1', total: 1906, labour: 360, discount: 0, tax_amount: 91, notes: null },
              ]
            : [
                { invoice_id: 'i2', invoice_number: '2026-0007', invoice_date: '2026-09-02', financial_year: '2026-2027', grn_ref: 'DV0005', grn_id: 'g5', total: 500, labour: 0, discount: 20, tax_amount: 25, notes: null },
              ],
      },
    },
    error: null,
  }));
  const customers = [
    { id: CUSTOMER_A, name: 'Fictional Agro' },
    { id: CUSTOMER_B, name: 'Fictional Traders' },
  ];

  it('reads the customer summary RPC with an explicit date range and fills the list row', async () => {
    mockClient(rpc, customers);
    const result = await getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B]);
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'get_customer_invoice_summary',
      expect.objectContaining({ p_customer_uuid: CUSTOMER_A, p_from_date: '2000-01-01', p_to_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    );
    expect(result.data.invoices.map(invoice => invoice.invoice_id)).toEqual(['i2', 'i1']);
    expect(result.data.invoices[1]).toMatchObject({
      invoice_number: 1,
      inv_fin_year: 2026,
      financial_year: '2026-2027',
      total: 1906,
      customer: { id: CUSTOMER_A, name: 'Fictional Agro' },
      grn: { id: 'g1', gr_no: 'DV0001' },
    });
  });

  it('filters by invoice number and GRN number in the app', async () => {
    mockClient(rpc, customers);
    const byNumber = await getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { p_inv_no_from: 5 });
    expect(byNumber.data.invoices.map(invoice => invoice.invoice_id)).toEqual(['i2']);
    const byGrn = await getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { p_search_grn_no: 'dv0001' });
    expect(byGrn.data.invoices.map(invoice => invoice.invoice_id)).toEqual(['i1']);
  });

  it('refuses a customer the account is not assigned to, without calling the server', async () => {
    mockClient(rpc, customers);
    const result = await getAssignedCustomerInvoices([CUSTOMER_A], { p_customer_id: 'someone-else' });
    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the failure when the server refuses', async () => {
    mockClient(jest.fn(async () => ({ data: { success: false, error: 'Access denied' }, error: null })), customers);
    const result = await getAssignedCustomerInvoices([CUSTOMER_A]);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Access denied');
    expect(result.data.invoices).toEqual([]);
  });
});
