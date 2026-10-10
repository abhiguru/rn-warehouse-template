import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getAssignedCustomerDispatchList } from '../dispatch-service';
import { getAssignedCustomerInvoices } from '../invoice-service';
import { clearCustomerHistoryCache, CUSTOMER_HISTORY_TTL_MS } from '../customerHistoryCache';
import { CUSTOMER_DISPATCH_MAX } from '../dispatch-service';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';

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

beforeEach(() => {
  jest.clearAllMocks();
  clearCustomerHistoryCache();
});

describe('dispatch list for a customer account', () => {
  const rpc = jest.fn(async (name: string, args: { p_customer_id: string }) => ({
    data: {
      success: true,
      data: {
        dispatches:
          args.p_customer_id === CUSTOMER_A
            ? // Dates deliberately do not follow the numbers, so a date sort and a
              // number sort give different orders.
              [dispatchRow('d1', 'DD0001', '2026-08-10', CUSTOMER_A, 'item-1'), dispatchRow('d3', 'DD0003', '2026-07-01', CUSTOMER_A, 'item-2')]
            : [dispatchRow('d2', 'DD0002', '2026-09-01', CUSTOMER_B, 'item-1')],
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
    expect(result.data.dispatches.map(d => d.disp_no)).toEqual(['DD0002', 'DD0001', 'DD0003']);
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
    const byNumberDescending = await getAssignedCustomerDispatchList([CUSTOMER_A, CUSTOMER_B], {
      p_sort_by: 'disp_no',
      p_sort_order: 'desc',
    });
    expect(byNumberDescending.data.dispatches.map(d => d.disp_no)).toEqual(['DD0003', 'DD0002', 'DD0001']);
    const byDateAscending = await getAssignedCustomerDispatchList([CUSTOMER_A, CUSTOMER_B], {
      p_sort_by: 'dispatch_date',
      p_sort_order: 'asc',
    });
    expect(byDateAscending.data.dispatches.map(d => d.disp_no)).toEqual(['DD0003', 'DD0001', 'DD0002']);

    const filtered = await getAssignedCustomerDispatchList([CUSTOMER_A, CUSTOMER_B], {
      p_filters: { item_ids: ['item-1'], disp_no_from: 'DD0002' },
    });
    expect(filtered.data.dispatches.map(d => d.disp_no)).toEqual(['DD0002']);
  });

  it('orders unusual dispatch numbers the way the backend does', async () => {
    const numbers = ['XYZ', 'I10', 'DD0003', 'I9', '77', 'Z0001', 'I2', 'I0001', 'D/2'];
    const mixed = jest.fn(async () => ({
      data: {
        success: true,
        data: {
          dispatches: numbers.map((no, index) => dispatchRow(`m${index}`, no, '2026-08-01', CUSTOMER_A, 'item-1')),
          pagination: { has_more: false },
        },
      },
      error: null,
    }));
    mockClient(mixed);
    const ascending = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_sort_by: 'disp_no', p_sort_order: 'asc' });
    // One-letter prefixes first (Z before I), numbers as numbers, then every other form.
    expect(ascending.data.dispatches.map(d => d.disp_no)).toEqual(['Z0001', 'I0001', 'I2', 'I9', 'I10', '77', 'D/2', 'DD0003', 'XYZ']);
    // All on one day: the date sort falls back to the number, in the requested direction.
    const sameDayNewestFirst = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_sort_by: 'dispatch_date', p_sort_order: 'desc' });
    expect(sameDayNewestFirst.data.dispatches.map(d => d.disp_no)).toEqual(['XYZ', 'DD0003', 'D/2', '77', 'I10', 'I9', 'I2', 'I0001', 'Z0001']);
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

// ---------------------------------------------------------------------------
// Review 2026-10-10, M2-4 / M4-2 / M2-10: what a customer account downloads
// ---------------------------------------------------------------------------
describe('how much of a customer history is downloaded', () => {
  /** A customer with `total` dispatches, DD0001 the oldest, served newest first, at most 100 a page. */
  const dispatchServer = (total: number) =>
    jest.fn(async (_name: string, args: { p_customer_id: string; p_limit: number; p_offset: number }) => {
      const rows = [];
      for (let index = args.p_offset; index < Math.min(args.p_offset + args.p_limit, total); index++) {
        const number = total - index;
        const day = new Date(Date.UTC(2020, 0, number)).toISOString().slice(0, 10);
        rows.push(dispatchRow(`d${number}`, `DD${String(number).padStart(4, '0')}`, day, args.p_customer_id, 'item-1'));
      }
      return {
        data: { success: true, data: { dispatches: rows, pagination: { total_count: total, limit: args.p_limit, offset: args.p_offset, has_more: args.p_offset + rows.length < total } } },
        error: null,
      };
    });

  it('one customer, newest first, no filter: the server pages and counts', async () => {
    const rpc = dispatchServer(1200);
    mockClient(rpc);
    const third = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_limit: 20, offset: 40, p_filters: { search: '', item_ids: [] } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_customer_dispatch_list', { p_customer_id: CUSTOMER_A, p_limit: 20, p_offset: 40, p_include_items: true });
    expect(third.data.dispatches).toHaveLength(20);
    expect(third.data.dispatches[0].disp_no).toBe('DD1160');
    expect(third.data.pagination).toMatchObject({ total_count: 1200, offset: 40, has_more: true });
  });

  it('a search reaches a dispatch older than the newest 1000 and says nothing is cut', async () => {
    const rpc = dispatchServer(1200);
    mockClient(rpc);
    const found = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: { search: 'DD0042' } });
    expect(found.data.dispatches.map(d => d.disp_no)).toEqual(['DD0042']);
    expect(found.data.pagination.total_count).toBe(1);
    expect(found.data.pagination.history_limit_reached).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(12);
  });

  it('the next page, a sort, another search and the count use the history already collected', async () => {
    const rpc = dispatchServer(250);
    mockClient(rpc);
    const filters = { search: 'DD' };
    await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: filters, p_limit: 20, offset: 0 });
    expect(rpc).toHaveBeenCalledTimes(3);
    const second = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: filters, p_limit: 20, offset: 20 });
    const sorted = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: filters, p_sort_by: 'disp_no', p_sort_order: 'asc' });
    const other = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: { search: 'DD0007' } });
    const count = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: filters, p_limit: 1, offset: 0 });
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(second.data.dispatches[0].disp_no).toBe('DD0230');
    expect(sorted.data.dispatches[0].disp_no).toBe('DD0001');
    expect(other.data.dispatches.map(d => d.disp_no)).toEqual(['DD0007']);
    expect(count.data.pagination.total_count).toBe(250);
  });

  it('the list and its count asked at the same moment share one download', async () => {
    const rpc = dispatchServer(150);
    mockClient(rpc);
    const filters = { search: 'DD' };
    await Promise.all([
      getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: filters }),
      getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: filters, p_limit: 1 }),
    ]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('pull to refresh, a new session and an old history read the server again', async () => {
    const rpc = dispatchServer(50);
    mockClient(rpc);
    const request = { p_filters: { search: 'DD' } };
    await getAssignedCustomerDispatchList([CUSTOMER_A], request);
    await getAssignedCustomerDispatchList([CUSTOMER_A], { ...request, p_fresh: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    advanceSessionGeneration();
    await getAssignedCustomerDispatchList([CUSTOMER_A], request);
    expect(rpc).toHaveBeenCalledTimes(3);
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + CUSTOMER_HISTORY_TTL_MS + 1);
    await getAssignedCustomerDispatchList([CUSTOMER_A], request);
    clock.mockRestore();
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it('a failed collection is not kept', async () => {
    const refused = jest.fn(async () => ({ data: { success: false, message: 'Customer access denied' }, error: null }));
    mockClient(refused);
    const request = { p_filters: { search: 'DD' } };
    expect((await getAssignedCustomerDispatchList([CUSTOMER_A], request)).success).toBe(false);
    const rpc = dispatchServer(5);
    mockClient(rpc);
    const result = await getAssignedCustomerDispatchList([CUSTOMER_A], request);
    expect(result.success).toBe(true);
    expect(result.data.pagination.total_count).toBe(5);
  });

  it('says so when the collection stops at its upper bound', async () => {
    const rpc = dispatchServer(CUSTOMER_DISPATCH_MAX + 500);
    mockClient(rpc);
    const result = await getAssignedCustomerDispatchList([CUSTOMER_A], { p_filters: { search: 'DD' } });
    expect(rpc).toHaveBeenCalledTimes(CUSTOMER_DISPATCH_MAX / 100);
    expect(result.data.pagination.history_limit_reached).toBe(true);
  });

  const invoiceServer = () =>
    jest.fn(async (_name: string, args: { p_customer_uuid: string }) => ({
      data: {
        success: true,
        data: {
          invoices: Array.from({ length: 45 }, (_, index) => ({
            invoice_id: `${args.p_customer_uuid}-i${index + 1}`, invoice_number: `2026-${String(index + 1).padStart(4, '0')}`,
            invoice_date: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`, financial_year: '2026-2027',
            grn_ref: `DV${String(index + 1).padStart(4, '0')}`, grn_id: `g${index + 1}`, total: 100 + index, labour: 0, discount: 0, tax_amount: 0, notes: null,
          })),
        },
      },
      error: null,
    }));
  const names = { [CUSTOMER_A]: 'Fictional Agro', [CUSTOMER_B]: 'Fictional Traders' };

  it('invoices: pages, a sort, a search and the count come from one download per customer', async () => {
    const rpc = invoiceServer();
    mockClient(rpc);
    const first = await getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { customerNames: names, p_limit: 20, p_offset: 0 });
    expect(rpc).toHaveBeenCalledTimes(2);
    const [second, sorted, searched, count] = await Promise.all([
      getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { customerNames: names, p_limit: 20, p_offset: 20 }),
      getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { customerNames: names, p_sort_field: 'total', p_sort_direction: 'asc' }),
      getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { customerNames: names, p_search: 'DV0045' }),
      getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { customerNames: names, p_limit: 1, p_offset: 0 }),
    ]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(first.data.pagination).toMatchObject({ total_count: 90, has_more: true });
    expect(second.data.invoices).toHaveLength(20);
    expect(sorted.data.invoices[0].total).toBe(100);
    expect(searched.data.invoices.map(invoice => invoice.grn.gr_no)).toEqual(['DV0045', 'DV0045']);
    expect(count.data.pagination.total_count).toBe(90);
    expect(first.data.invoices[0].customer.name).toMatch(/^Fictional/);
    await getAssignedCustomerInvoices([CUSTOMER_A, CUSTOMER_B], { customerNames: names, p_fresh: true });
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it('invoices: the upper date bound does not depend on the device date (M2-10)', async () => {
    const rpc = invoiceServer();
    mockClient(rpc);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2020, 0, 1));
    await getAssignedCustomerInvoices([CUSTOMER_A], { customerNames: names });
    clock.mockRestore();
    expect(rpc).toHaveBeenCalledWith('get_customer_invoice_summary', {
      p_customer_uuid: CUSTOMER_A, p_from_date: '2000-01-01', p_to_date: '2999-12-31',
    });
  });

  it('invoices: a refused read is not kept', async () => {
    mockClient(jest.fn(async () => ({ data: { success: false, error: 'Access denied' }, error: null })));
    expect((await getAssignedCustomerInvoices([CUSTOMER_A], { customerNames: names })).success).toBe(false);
    const rpc = invoiceServer();
    mockClient(rpc);
    expect((await getAssignedCustomerInvoices([CUSTOMER_A], { customerNames: names })).data.pagination.total_count).toBe(45);
  });
});
