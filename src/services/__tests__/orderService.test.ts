import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { OrderService } from '../order-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(() => { throw new Error('Anonymous business access'); }),
  getStoredToken: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as any);
  logs = ['log', 'warn', 'error'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => logs.forEach(log => log.mockRestore()));

describe('getCustomerDispatches', () => {
  it('sends the snake_case sort key the RPC understands', async () => {
    rpc.mockResolvedValue({ data: { data: { items: [] } }, error: null });
    await OrderService.getCustomerDispatches('customer-a', { sortBy: 'dispDate', sortOrder: 'desc' });
    expect(rpc).toHaveBeenCalledWith('get_customer_dispatch_items',
      expect.objectContaining({ p_sort_by: 'disp_date', p_sort_order: 'desc' }));
  });

  it('defaults to GRN number order', async () => {
    rpc.mockResolvedValue({ data: { data: { items: [] } }, error: null });
    await OrderService.getCustomerDispatches('customer-a');
    expect(rpc).toHaveBeenCalledWith('get_customer_dispatch_items',
      expect.objectContaining({ p_sort_by: 'grn_gr_no' }));
  });
});

// get_customer_dispatch_items applies its date range only when both ends are given.
describe('getCustomerDispatches date range', () => {
  it('closes a range that has only a start, so "the last six months" is really asked for', async () => {
    rpc.mockResolvedValue({ data: { data: { items: [] } }, error: null });
    await OrderService.getCustomerDispatches('customer-a', { dateFrom: '2026-04-11T00:00:00+05:30' });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_date_from: '2026-04-11T00:00:00+05:30',
      p_date_to: '9999-12-31T23:59:59.999+05:30',
    });
  });

  it('sends no dates when none are asked for', async () => {
    rpc.mockResolvedValue({ data: { data: { items: [] } }, error: null });
    await OrderService.getCustomerDispatches('customer-a');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_date_from: null, p_date_to: null });
  });
});

describe('getOrdersList', () => {
  it('requests one page and reports whether more remain', async () => {
    rpc.mockResolvedValue({
      data: { success: true, data: { orders: [{ id: 'o1' }], pagination: { total_count: 45, has_more: true } } },
      error: null,
    });
    const result = await OrderService.getOrdersList({ has_items: true, offset: 20, limit: 20 });
    expect(rpc).toHaveBeenCalledWith('get_orders_list',
      expect.objectContaining({ p_has_items: true, p_limit: 20, p_offset: 20 }));
    expect(result).toMatchObject({ success: true, data: [{ id: 'o1' }], metadata: { total_count: 45, has_more: true } });
  });

  it('uses the default page size and treats a failure envelope as an error', async () => {
    rpc.mockResolvedValue({ data: { success: false, message: 'Customer access denied' }, error: null });
    const result = await OrderService.getOrdersList();
    expect(rpc).toHaveBeenCalledWith('get_orders_list', expect.objectContaining({ p_limit: 20, p_offset: 0 }));
    expect(result).toMatchObject({ success: false, message: 'Customer access denied' });
  });
});

describe('removeItemFromOrder', () => {
  it('removes through the recorded RPC, not a table delete', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { order_item_id: 'line-1' } }, error: null });
    const result = await OrderService.removeItemFromOrder('line-1', 'order-1');
    expect(rpc).toHaveBeenCalledWith('remove_item_from_order', { p_order_item_id: 'line-1' });
    expect(result.success).toBe(true);
  });

  it('reports a refusal from the server', async () => {
    rpc.mockResolvedValue({ data: { success: false, message: 'Cannot remove items from DISPATCHED orders' }, error: null });
    expect((await OrderService.removeItemFromOrder('line-1', 'order-1')).success).toBe(false);
  });
});

describe('searchCustomerItemsForOrder', () => {
  it('treats an access-denied payload as a failure, not an empty result', async () => {
    rpc.mockResolvedValue({
      data: { success: false, items: [], total_count: 0, error: 'Access denied to customer' },
      error: null,
    });
    const result = await OrderService.searchCustomerItemsForOrder({ customer_id: 'customer-b', search_query: 'onion' });
    expect(result).toMatchObject({ success: false, message: 'Access denied to customer' });
  });

  it('computes has_more from the page offset', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `lot-${i}`, item_name: 'Onion', stock: 1, qty: 1, grn_id: 'g' }));
    rpc.mockResolvedValue({ data: { items, total_count: 60 }, error: null });
    const lastPage = await OrderService.searchCustomerItemsForOrder({ customer_id: 'c', search_query: 'onion', offset: 50 });
    expect(rpc).toHaveBeenCalledWith('search_customer_items_for_order', expect.objectContaining({ p_offset: 50 }));
    expect(lastPage.metadata?.has_more).toBe(false);
    const middle = await OrderService.searchCustomerItemsForOrder({ customer_id: 'c', search_query: 'onion', offset: 10 });
    expect(middle.metadata?.has_more).toBe(true);
  });
});

describe('getAvailableItems', () => {
  it('passes the page offset and maps the lot image', async () => {
    rpc.mockResolvedValue({
      data: {
        success: true,
        data: [{ grn_item_id: 'lot-1', item_name: 'Onion', stock: 4, qty: 10, grn_id: 'g', image_url: 'grn/photo.jpg' }],
        pagination: { total_count: 51, has_more: false },
      },
      error: null,
    });
    const result = await OrderService.getAvailableItems({ customer_id: 'customer-a', offset: 50, page_size: 50 });
    expect(rpc).toHaveBeenCalledWith('get_customer_items_for_order_selection',
      expect.objectContaining({ p_offset: 50, p_page_size: 50 }));
    expect(result.data?.[0]).toMatchObject({ id: 'lot-1', image_url: 'grn/photo.jpg' });
    expect(result.metadata?.has_more).toBe(false);
  });
});

describe('getCustomerOrder (an order is made by its first line)', () => {
  it('reads the order of a business and never makes one', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { exists: true, order_id: 'o1', order_no: 'ORD-3', status: 'PENDING', item_count: 2, updated_at: 't' } }, error: null });
    const result = await OrderService.getCustomerOrder('c1');
    expect(rpc).toHaveBeenCalledWith('get_customer_order', { p_customer_id: 'c1' });
    expect(result).toMatchObject({ success: true, data: { order_id: 'o1', order_no: 'ORD-3', item_count: 2 } });
  });

  it('answers no order id when the business has none', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { exists: false, order_id: null, order_no: null, status: null, item_count: 0, updated_at: null } }, error: null });
    expect(await OrderService.getCustomerOrder('c1')).toMatchObject({ success: true, data: { order_id: null, item_count: 0 } });
  });

  it('says notAvailable on a facility without the function, so the older way of opening is used', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_customer_order(p_customer_id) in the schema cache' } });
    const result = await OrderService.getCustomerOrder('c1');
    expect(result).toMatchObject({ success: false, notAvailable: true });
  });

  it('is a plain failure, not notAvailable, for a lost answer or a refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TimeoutError: Request timeout', status: 504 } });
    const lost = await OrderService.getCustomerOrder('c1');
    expect(lost.success).toBe(false);
    expect(lost.notAvailable).toBeUndefined();
    expect(lost.lostAnswer).toBe(true);
    expect(lost.message).toMatch(/\S/);
  });
});

describe('addItemToOrder with no order yet', () => {
  it('sends the business instead of the order, and the answer carries the order made', async () => {
    rpc.mockResolvedValue({ data: { success: true, message: 'ok', data: { order_id: 'o9', order_created: true } }, error: null });
    const result = await OrderService.addItemToOrder(null, 'g1', 4, 'c1');
    expect(rpc).toHaveBeenCalledWith('add_item_to_order', { p_grn_item_id: 'g1', p_customer_id: 'c1', p_quantity: 4 });
    expect(result.data?.data?.order_id).toBe('o9');
  });

  it('still sends the order for a line of an existing order, and refuses a call with neither', async () => {
    rpc.mockResolvedValue({ data: { success: true, message: 'ok', data: {} }, error: null });
    await OrderService.addItemToOrder('o1', 'g1', 2);
    expect(rpc).toHaveBeenLastCalledWith('add_item_to_order', { p_grn_item_id: 'g1', p_order_id: 'o1', p_quantity: 2 });
    rpc.mockClear();
    expect((await OrderService.addItemToOrder(null, 'g1', 2)).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('getOrderWithItems keeps the order number', () => {
  it('maps order_data.order_no', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { order_data: { id: 'o1', order_no: 'ORD-5', customer_id: 'c1', customer_name: 'A' }, items: [] } }, error: null });
    const result = await OrderService.getOrderWithItems('o1');
    expect(result.data?.order_no).toBe('ORD-5');
  });
});
