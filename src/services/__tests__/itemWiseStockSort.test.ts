/**
 * get_item_wise_stock_list with the sort of backend migration 52, and with a
 * backend that does not have it yet (PostgREST refuses the two parameters
 * with PGRST202 before running anything).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { StockService, forgetItemSortSupport } from '../stock-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn(() => ({ type: 'test/forceLogout' })) }));
let mockServer = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const rpc = jest.fn();
const ITEMS = [{ item_id: 'i1', item_name: 'Example Garlic', total_qty: 100, total_stock: 40, grn_count: 2 }];
const answer = (extra: Record<string, unknown> = {}) => ({ data: { success: true, data: { items: ITEMS, total_count: 123, ...extra } }, error: null });
const OLD_BACKEND = {
  data: null,
  error: { code: 'PGRST202', message: 'Could not find the function public.get_item_wise_stock_list(p_customer_id, p_limit, p_offset, p_search_query, p_sort_by, p_sort_order) in the schema cache' },
};
const BASE = { p_customer_id: null, p_search_query: 'gar', p_limit: 50, p_offset: 50 };
const SORTED = { ...BASE, p_sort_by: 'total_stock', p_sort_order: 'desc' };
const ask = (over: Record<string, unknown> = {}) =>
  StockService.getItemWiseStockList({ searchQuery: 'gar', limit: 50, offset: 50, sortBy: 'total_stock', sortOrder: 'desc', ...over });

beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockReset();
  forgetItemSortSupport();
  mockServer = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
});

describe('a backend with migration 52', () => {
  it('sends the sort and reads the totals of the whole list', async () => {
    rpc.mockResolvedValueOnce(answer({ summary: { total_stock: 4321, total_qty: 9000, item_count: 123 } }));
    const result = await ask();
    expect(rpc.mock.calls).toEqual([['get_item_wise_stock_list', SORTED]]);
    expect(result).toMatchObject({
      success: true,
      data: {
        items: ITEMS,
        pagination: { totalCount: 123, hasMore: true, limit: 50, offset: 50 },
        summary: { total_stock: 4321, total_qty: 9000, item_count: 123 },
        sortApplied: true,
      },
    });
  });

  it('sends the default for a sort given only in part', async () => {
    rpc.mockResolvedValueOnce(answer());
    await ask({ sortBy: undefined, sortOrder: 'desc' });
    expect(rpc.mock.calls[0][1]).toEqual({ ...BASE, p_sort_by: 'item_name', p_sort_order: 'desc' });
  });

  it('a caller that asks for no sort sends the four parameters it always sent', async () => {
    rpc.mockResolvedValueOnce(answer());
    const result = await StockService.getItemWiseStockList({ customerId: 'c1' });
    expect(rpc.mock.calls).toEqual([['get_item_wise_stock_list', { p_customer_id: 'c1', p_search_query: null, p_limit: 50, p_offset: 0 }]]);
    expect(result.data).toMatchObject({ sortApplied: true });
    expect(result.data?.summary).toBeUndefined();
  });

  it('reads no summary from an answer whose summary is incomplete', async () => {
    rpc.mockResolvedValueOnce(answer({ summary: { total_stock: 10, total_qty: 'many' } }));
    expect((await ask()).data?.summary).toBeUndefined();
  });

  it('does not ask again without the sort when the server refuses for another reason', async () => {
    rpc.mockResolvedValueOnce({ data: { success: false, error: 'Access denied to customer' }, error: null });
    const result = await ask();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    // Nothing was learnt about the backend: the next call sends the sort again.
    rpc.mockResolvedValueOnce(answer());
    await ask();
    expect(rpc.mock.calls[1][1]).toEqual(SORTED);
  });
});

describe('a backend without migration 52', () => {
  it('asks again without the sort, says the sort was not applied, and has no totals', async () => {
    rpc.mockResolvedValueOnce(OLD_BACKEND).mockResolvedValueOnce(answer());
    const result = await ask();
    expect(rpc.mock.calls).toEqual([
      ['get_item_wise_stock_list', SORTED],
      ['get_item_wise_stock_list', BASE],
    ]);
    expect(result).toMatchObject({ success: true, data: { items: ITEMS, sortApplied: false } });
    expect(result.data?.summary).toBeUndefined();
  });

  it('leaves the sort out at once on the later calls to that facility, and tries it on another', async () => {
    rpc.mockResolvedValueOnce(OLD_BACKEND).mockResolvedValue(answer());
    await ask();
    rpc.mockClear();

    const later = await ask({ offset: 100, sortBy: 'grn_count' });
    expect(rpc.mock.calls).toEqual([['get_item_wise_stock_list', { ...BASE, p_offset: 100 }]]);
    expect(later.data).toMatchObject({ sortApplied: false });

    mockServer = { origin: 'https://other.example.test', instanceId: 'instance-b' };
    rpc.mockClear();
    await ask();
    expect(rpc.mock.calls).toEqual([['get_item_wise_stock_list', SORTED]]);
  });

  it('knows the database\'s own wording for a missing function', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function public.get_item_wise_stock_list(uuid, text, integer, integer, text, text) does not exist' } })
      .mockResolvedValueOnce(answer());
    const result = await ask();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.data).toMatchObject({ sortApplied: false });
  });

  it('reports the failure of the second call as the answer', async () => {
    rpc.mockResolvedValueOnce(OLD_BACKEND).mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    const result = await ask();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ success: false });
  });
});
