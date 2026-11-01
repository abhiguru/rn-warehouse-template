import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getGrnItemRates, getItemsWithoutRate } from '../item-pricing-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  ['log', 'warn', 'error'].forEach(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(() => jest.restoreAllMocks());

describe('getGrnItemRates', () => {
  it('maps the answer, in the order of the lots, with numbers as numbers and no-rate figures null', async () => {
    rpc.mockResolvedValue({
      data: {
        success: true,
        data: {
          gr_id: 'g1', grn_date: '2026-10-01T00:00:00Z', price_type: 'one_time', invoiced: true,
          rates: [
            { grn_item_id: 'l1', item_id: 'gur', item_name: 'Fictional Gur', weight: '25', source: 'customer', unit_price: '4.5', labour_rate: 1.5, tax_percent: 5, weight_min: 0, weight_max: 50, varies: false },
            { grn_item_id: 'l2', item_id: 'rice', item_name: 'Fictional Rice', weight: 30, source: null, unit_price: null, labour_rate: null, tax_percent: null, weight_min: null, weight_max: null, varies: false },
            { grn_item_id: 'l3', item_id: 'gur', item_name: 'Fictional Gur', weight: 25, source: 'invoice', unit_price: 4.3, labour_rate: 1, tax_percent: 5, weight_min: null, weight_max: null, varies: true },
          ],
        },
      },
      error: null,
    });
    const result = await getGrnItemRates('g1');
    expect(rpc).toHaveBeenCalledWith('get_grn_item_rates', { p_grn_id: 'g1' });
    expect(result).toMatchObject({ gr_id: 'g1', grn_date: '2026-10-01', price_type: 'one_time', invoiced: true });
    expect(result!.rates.map(r => r.grn_item_id)).toEqual(['l1', 'l2', 'l3']);
    expect(result!.rates[0]).toMatchObject({ weight: 25, source: 'customer', unit_price: 4.5, weight_max: 50 });
    expect(result!.rates[1]).toMatchObject({ source: null, unit_price: null, labour_rate: null, tax_percent: null });
    expect(result!.rates[2]).toMatchObject({ source: 'invoice', weight_min: null, varies: true });
  });

  it('gives null when the server lacks the function', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_grn_item_rates(p_grn_id) in the schema cache' } });
    await expect(getGrnItemRates('g1')).resolves.toBeNull();
  });

  it('throws when unreachable and when the server refuses', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '08006', message: 'network down' } });
    await expect(getGrnItemRates('g1')).rejects.toThrow('network down');
    rpc.mockResolvedValueOnce({ data: { success: false, error: 'GRN not found', error_code: 'GRN_NOT_FOUND' }, error: null });
    await expect(getGrnItemRates('g1')).rejects.toThrow();
  });
});

describe('getItemsWithoutRate', () => {
  it('sends the customer, the items and the day, and returns the ids without a rate', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { item_ids: ['rice'] } }, error: null });
    await expect(getItemsWithoutRate('c1', [{ itemId: 'gur', weight: 50 }, { itemId: 'rice', weight: 0 }, { itemId: 'gur', weight: 120.4 }], '2026-10-01', 'one_time')).resolves.toEqual(['rice']);
    expect(rpc).toHaveBeenCalledWith('get_items_without_rate', {
      p_customer_id: 'c1',
      p_item_ids: ['gur', 'rice', 'gur'],
      p_on: '2026-10-01',
      p_weights: [50, 0, 120],
      p_pricing_mode: 'one_time',
    });
  });

  it('sends the GRN id on an edit only', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { item_ids: [] } }, error: null });
    await getItemsWithoutRate('c1', [{ itemId: 'gur', weight: 0 }], '2026-10-01', 'monthly', 'g1');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_grn_id: 'g1' });
    rpc.mockClear();
    await getItemsWithoutRate('c1', [{ itemId: 'gur', weight: 0 }], '2026-10-01', 'monthly', null);
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_grn_id');
  });

  it('gives null on an older server or any failure, and asks nothing for no items', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    await expect(getItemsWithoutRate('c1', [{ itemId: 'gur', weight: 0 }], '2026-10-01', 'monthly')).resolves.toBeNull();
    rpc.mockRejectedValueOnce(new Error('offline'));
    await expect(getItemsWithoutRate('c1', [{ itemId: 'gur', weight: 0 }], '2026-10-01', 'monthly')).resolves.toBeNull();
    rpc.mockResolvedValueOnce({ data: { success: false }, error: null });
    await expect(getItemsWithoutRate('c1', [{ itemId: 'gur', weight: 0 }], '2026-10-01', 'monthly')).resolves.toBeNull();
    rpc.mockClear();
    await expect(getItemsWithoutRate('c1', [], '2026-10-01', 'monthly')).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

