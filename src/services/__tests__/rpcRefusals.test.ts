/**
 * A list RPC that refuses answers HTTP 200 with {success:false, data:null, message}.
 * These callers used to read that as a list with nothing in it.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { rpcRefusal, isAccessRefusal } from '@/utils/rpcRefusal';
import { OrderService } from '../order-service';
import { getAllDispatchItems } from '../dispatch-service';
import { getGRNPrefixesWithStock, getCustomerGRNsWithStock } from '@/features/dispatch/services/grnDetailService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(() => { throw new Error('Anonymous business access'); }),
  getStoredToken: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
const DENIED = { success: false, data: null, message: 'Access denied: No accessible customers found' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as any);
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('rpcRefusal', () => {
  it('reads success:false with either error or message', () => {
    expect(rpcRefusal({ success: false, error: 'No', error_code: '42501' })).toEqual({ text: 'No', code: '42501' });
    expect(rpcRefusal(DENIED)).toEqual({ text: DENIED.message, code: undefined });
  });

  it('reads the older shape that has an error and no success key', () => {
    expect(rpcRefusal({ error: 'Access denied: customer not accessible', summary: null })?.text)
      .toBe('Access denied: customer not accessible');
  });

  it('does not take an answer for a refusal', () => {
    expect(rpcRefusal({ success: true, data: [] })).toBeUndefined();
    expect(rpcRefusal({ success: true, error: 'ignored' })).toBeUndefined();
    expect(rpcRefusal({ summary: {}, items: [] })).toBeUndefined();
    expect(rpcRefusal([])).toBeUndefined();
    expect(rpcRefusal(null)).toBeUndefined();
    expect(rpcRefusal('text')).toBeUndefined();
  });

  it('tells a denial from a server failure', () => {
    expect(isAccessRefusal({ code: '42501' })).toBe(true);
    expect(isAccessRefusal({ text: 'Access denied: admin or supervisor role required' })).toBe(true);
    expect(isAccessRefusal({ text: 'Failed to retrieve dashboard: division by zero', code: '22012' })).toBe(false);
  });
});

describe('list callers', () => {
  it('get_all_dispatch_items: a denial is a failure, not an empty list', async () => {
    rpc.mockResolvedValue({ data: DENIED, error: null });
    const result = await getAllDispatchItems({ p_limit: 20, p_offset: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toBe(DENIED.message);
    expect(result.data).toBeUndefined();
  });

  it('get_all_dispatch_items: a list is still a list', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { items: [{ id: 'row-1' }], pagination: { total: 1 } } }, error: null });
    const result = await getAllDispatchItems({ p_limit: 20, p_offset: 0 });
    expect(result.success).toBe(true);
    expect(result.data?.items).toHaveLength(1);
  });

  it('get_customer_dispatch_items: a denial is a failure, not "no dispatches"', async () => {
    rpc.mockResolvedValue({ data: DENIED, error: null });
    const result = await OrderService.getCustomerDispatches('customer-a');
    expect(result.success).toBe(false);
    expect(result.message).toBe(DENIED.message);
  });

  it('get_customer_dispatch_items: an answer without rows is still an empty list', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: null }, error: null });
    const result = await OrderService.getCustomerDispatches('customer-a');
    expect(result.success).toBe(true);
    expect(result.data?.items).toEqual([]);
  });

  it('get_grn_prefixes_with_stock: a denial is thrown', async () => {
    rpc.mockResolvedValue({ data: DENIED, error: null });
    await expect(getGRNPrefixesWithStock()).rejects.toThrow(DENIED.message);
  });

  it('get_customer_grns_with_stock_dispatch_sorted: a denial is thrown', async () => {
    rpc.mockResolvedValue({ data: DENIED, error: null });
    await expect(getCustomerGRNsWithStock('customer-a', 20, 0)).rejects.toThrow(DENIED.message);
  });

  it('GRN pickers still read a list', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: [{ prefix: 'A', grn_count: 3 }] }, error: null });
    await expect(getGRNPrefixesWithStock()).resolves.toEqual([{ prefix: 'A', grnCount: 3 }]);
  });
});
