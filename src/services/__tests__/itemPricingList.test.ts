import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getItemStoragePrices, listActiveItems, listAllRates, listItemRates } from '../item-pricing-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSessionIdentity: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
const price = (id: string, item_id = 'item-1') => ({ id, item_id, item_name: 'Fictional', customer_id: null, price_type: 'monthly', unit_price: 1, weight_min: 0, weight_max: 100, labour_rate: 0, tax_percent: 0, effective_from: '2025-01-01', effective_to: null });
let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  logs = ['log', 'warn', 'error'].map(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(() => logs.forEach(l => l.mockRestore()));

describe('getItemStoragePrices pagination (P-02)', () => {
  it('keeps the total the server calls "total"', async () => {
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({
      data: { success: true, data: [price('a'), price('b')], pagination: { total: 2, limit: 1, offset: 0, has_more: true } },
      error: null,
    });
    const result = await getItemStoragePrices({ p_limit: 1 });
    expect(result.pagination.total_count).toBe(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.has_more).toBe(true);
  });
});

describe('getItemStoragePrices 30 second deadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  });
  afterEach(() => jest.useRealTimers());

  // A timer left counting down behind a finished call kept the Jest process open for 30 seconds
  // after the suite ("Jest did not exit one second after the test run has completed").
  it('leaves no timer behind once the server has answered', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: [price('a')], pagination: { total: 1, limit: 20, offset: 0, has_more: false } }, error: null });
    const result = await getItemStoragePrices();
    expect(result.success).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('leaves no timer behind when the call fails', async () => {
    rpc.mockRejectedValue(new Error('network down'));
    const result = await getItemStoragePrices();
    expect(result.success).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('still gives up after 30 seconds when the server never answers', async () => {
    rpc.mockReturnValue(new Promise(() => {}));
    const pending = getItemStoragePrices();
    await jest.advanceTimersByTimeAsync(29999);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timed out/i);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('listAllRates and listItemRates', () => {
  beforeEach(() => jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never));

  it('reads page after page, includes ended rates, and drops a row a later page repeats', async () => {
    rpc
      .mockResolvedValueOnce({ data: { success: true, data: [price('a'), price('b')], pagination: { total: 3, limit: 500, offset: 0, has_more: true } }, error: null })
      .mockResolvedValueOnce({ data: { success: true, data: [price('b'), price('c')], pagination: { total: 3, limit: 500, offset: 2, has_more: false } }, error: null });
    const rows = await listAllRates();
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: 500, p_offset: 0, p_filters: { include_expired: true } });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_offset: 500 });
  });

  it('fails as a whole when one page fails', async () => {
    rpc
      .mockResolvedValueOnce({ data: { success: true, data: [price('a')], pagination: { total: 2, limit: 500, offset: 0, has_more: true } }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(listAllRates()).rejects.toThrow();
  });

  it('listItemRates asks for one item with its ended rates (P-27)', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: [price('z', 'item-9')], pagination: { total: 1, limit: 500, offset: 0, has_more: false } }, error: null });
    const rows = await listItemRates('item-9');
    expect(rows.map(r => r.id)).toEqual(['z']);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_filters: { item_ids: ['item-9'], include_expired: true }, p_limit: 500 });
  });
});

describe('listActiveItems', () => {
  it('reads the active items by name', async () => {
    const order = jest.fn().mockResolvedValue({ data: [{ id: 'i1', name: 'Ajwain Bold', packaging: 'Bag' }], error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ from } as never);
    const items = await listActiveItems();
    expect(from).toHaveBeenCalledWith('items');
    expect(select).toHaveBeenCalledWith('id, name, packaging');
    expect(eq).toHaveBeenCalledWith('active', true);
    expect(order).toHaveBeenCalledWith('name');
    expect(items).toEqual([{ id: 'i1', name: 'Ajwain Bold', packaging: 'Bag' }]);
  });

  it('throws when the read fails', async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'x' } });
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ order }) }) }) } as never);
    await expect(listActiveItems()).rejects.toThrow();
  });
});
