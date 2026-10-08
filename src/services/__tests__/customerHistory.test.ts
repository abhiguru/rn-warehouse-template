import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  getAssignedCustomerGRNItems,
  getCustomerGRNItems,
} from '../grn-service';
import { getCustomerDispatchList } from '../dispatch-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(() => ({
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }) },
  })),
  getStoredToken: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as any);
  logs = ['log', 'warn', 'error', 'time', 'timeEnd'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});

afterEach(() => logs.forEach(log => log.mockRestore()));

it('maps the assigned-customer GRN contract into the list response', async () => {
  rpc.mockResolvedValue({
    data: {
      success: true,
      data: {
        items: [{
          id: 'line-a',
          grn_id: 'grn-a',
          gr_no: 'A0001',
          date: '2026-09-20T00:00:00Z',
          customer_id: 'customer-a',
          customer_name: 'Example Customer',
          item_id: 'item-a',
          item_name: 'Example Potatoes',
          qty: '20',
          stock: '15',
          weight: '10',
        }],
        pagination: { total: 2, has_more: true },
        aggregations: { total_qty: 20, total_stock: 15, total_count: 2 },
      },
    },
    error: null,
  });

  const result = await getCustomerGRNItems('customer-a', { p_limit: 1, p_offset: 0 });

  expect(rpc).toHaveBeenCalledWith(
    'get_customer_grn_items',
    expect.objectContaining({ p_customer_id: 'customer-a', p_limit: 1, p_offset: 0 })
  );
  expect(result).toMatchObject({
    success: true,
    data: {
      items: [{ id: 'line-a', grn_id: 'grn-a', qty: 20, stock: 15, weight: 10 }],
      pagination: { total_count: 2, limit: 1, offset: 0, has_more: true },
    },
  });
});

it('combines assigned-customer GRNs while rejecting an unassigned filter', async () => {
  rpc.mockImplementation((_name, params) => Promise.resolve({
    data: {
      success: true,
      data: {
        items: [{
          id: `line-${params.p_customer_id}`,
          grn_id: `grn-${params.p_customer_id}`,
          gr_no: params.p_customer_id === 'customer-a' ? 'A0001' : 'A0002',
          date: params.p_customer_id === 'customer-a' ? '2026-09-20' : '2026-09-21',
          customer_id: params.p_customer_id,
          customer_name: params.p_customer_id,
          item_name: 'Example Item',
          qty: 1,
          stock: 1,
        }],
        pagination: { total: 1, has_more: false },
        aggregations: { total_qty: 1, total_stock: 1 },
      },
    },
    error: null,
  }));

  const combined = await getAssignedCustomerGRNItems(
    ['customer-a', 'customer-b'],
    { p_limit: 1, p_sort_by: 'date', p_sort_order: 'desc' }
  );
  expect(combined.data.items[0].customer_id).toBe('customer-b');
  expect(combined.data.pagination).toMatchObject({ total_count: 2, has_more: true });

  rpc.mockClear();
  const denied = await getAssignedCustomerGRNItems(
    ['customer-a'],
    { p_filters: { customer_ids: ['customer-b'] } }
  );
  expect(denied).toMatchObject({ success: false, message: 'Customer access denied' });
  expect(rpc).not.toHaveBeenCalled();
});

it('loads enough pages to combine assigned-customer GRNs beyond the RPC page limit', async () => {
  rpc.mockImplementation((_name, params) => {
    const total = params.p_customer_id === 'customer-a' ? 160 : 1;
    const count = Math.min(params.p_limit, Math.max(total - params.p_offset, 0));
    return Promise.resolve({
      data: {
        success: true,
        data: {
          items: Array.from({ length: count }, (_, index) => ({
            id: `${params.p_customer_id}-${params.p_offset + index}`,
            grn_id: `grn-${params.p_customer_id}-${params.p_offset + index}`,
            gr_no: String(params.p_offset + index).padStart(4, '0'),
            date: `2026-09-${String(((params.p_offset + index) % 28) + 1).padStart(2, '0')}`,
            customer_id: params.p_customer_id,
            customer_name: params.p_customer_id,
            item_name: 'Example Item',
            qty: 1,
            stock: 1,
          })),
          pagination: {
            total,
            has_more: params.p_offset + count < total,
          },
          aggregations: { total_qty: total, total_stock: total },
        },
      },
      error: null,
    });
  });

  const result = await getAssignedCustomerGRNItems(
    ['customer-a', 'customer-b'],
    { p_limit: 60, p_offset: 100, p_sort_by: 'gr_no', p_sort_order: 'asc' }
  );

  expect(result).toMatchObject({
    success: true,
    data: { pagination: { total_count: 161, limit: 60, offset: 100, has_more: true } },
  });
  expect(result.data.items).toHaveLength(60);
  expect(rpc).toHaveBeenCalledWith(
    'get_customer_grn_items',
    expect.objectContaining({ p_customer_id: 'customer-a', p_limit: 60, p_offset: 100 })
  );
});

it('maps the customer dispatch-list contract and preserves pagination', async () => {
  rpc.mockResolvedValue({
    data: {
      success: true,
      data: {
        dispatches: [{
          id: 'dispatch-a',
          disp_no: 'I0001',
          disp_date: '2026-09-21T00:00:00Z',
          customer_id: 'customer-a',
          customer_name: 'Example Customer',
          total_items: 1,
          total_qty: 3,
          total_weight: 30,
          items: [{
            item_id: 'item-a',
            item_name: 'Example Potatoes',
            disp_qty: 3,
            weight: 10,
            gr_no: 'A0001',
            grn_item_id: 'line-a',
            grn_qty: 20,
          }],
        }],
        pagination: { total_count: 2, limit: 1, offset: 0, has_more: true },
      },
    },
    error: null,
  });

  const result = await getCustomerDispatchList({
    p_customer_id: 'customer-a',
    p_limit: 1,
    p_offset: 0,
    p_include_items: true,
  });

  expect(rpc).toHaveBeenCalledWith('get_customer_dispatch_list', {
    p_customer_id: 'customer-a',
    p_limit: 1,
    p_offset: 0,
    p_include_items: true,
  });
  expect(result).toMatchObject({
    success: true,
    data: {
      dispatches: [{
        dispatch_id: 'dispatch-a',
        disp_no: 'I0001',
        total_qty: 3,
        items: [{ disp_qty: 3, gr_no: 'A0001' }],
      }],
      pagination: { total_count: 2, limit: 1, offset: 0, has_more: true },
    },
  });
});

it('surfaces customer-contract denials instead of returning an empty success', async () => {
  rpc.mockResolvedValue({
    data: { success: false, message: 'Customer access denied', data: null },
    error: null,
  });

  expect(await getCustomerGRNItems('other-customer')).toMatchObject({
    success: false,
    message: 'Customer access denied',
  });
  expect(await getCustomerDispatchList({ p_customer_id: 'other-customer' })).toMatchObject({
    success: false,
    message: 'Customer access denied',
  });
});
