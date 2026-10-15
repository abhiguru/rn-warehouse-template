import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getItemStoragePrices } from '../item-pricing-service';
import { clearRateStartFloor, getRateStartFloor } from '../rateStartFloor';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  clearRateStartFloor();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
});

const page = (extra: Record<string, unknown>, data: unknown = []) =>
  rpc.mockResolvedValue({ data: { success: true, data, pagination: { total: 0, limit: 500, offset: 0, has_more: false }, ...extra }, error: null });

describe('earliest_start of the rates read (migration 86)', () => {
  it('is remembered from the answer', async () => {
    page({ earliest_start: '2022-01-01' });
    await getItemStoragePrices({ p_filters: { item_ids: ['i1'] } });
    expect(getRateStartFloor()).toBe('2022-01-01');
  });

  it('is also read from an object data block', async () => {
    page({}, { rates: [], earliest_start: '2021-05-06' });
    await getItemStoragePrices({});
    expect(getRateStartFloor()).toBe('2021-05-06');
  });

  it('stays unknown when the server (older) does not send it, or sends rubbish', async () => {
    page({});
    await getItemStoragePrices({});
    expect(getRateStartFloor()).toBeNull();
    page({ earliest_start: 'soon' });
    await getItemStoragePrices({});
    expect(getRateStartFloor()).toBeNull();
  });
});
