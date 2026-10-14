import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { undoRateChange } from '../item-pricing-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSessionIdentity: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
const input = { itemId: 'item-1', customerId: null, priceType: 'monthly' as const, startsOn: '2027-01-01' };
const refused = (error_code: string) => ({
  data: { success: false, error: 'English sentence from the server', error_code, data: {} },
  error: null,
});
let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  logs = ['log', 'warn', 'error'].map(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(() => logs.forEach(l => l.mockRestore()));

describe('undoRateChange', () => {
  it('calls undo_rate_change with the p_ parameters', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: {} }, error: null });
    await undoRateChange(input);
    expect(rpc).toHaveBeenCalledWith('undo_rate_change', {
      p_item_id: 'item-1',
      p_customer_id: null,
      p_price_type: 'monthly',
      p_starts_on: '2027-01-01',
    });
    await undoRateChange({ ...input, customerId: 'c-1' });
    expect(rpc).toHaveBeenLastCalledWith('undo_rate_change', expect.objectContaining({ p_customer_id: 'c-1' }));
  });

  it('returns removed and reopened rows on success', async () => {
    const removed = [{ id: 'r2', effective_from: '2027-01-01' }];
    const reopened = [{ id: 'r1', effective_from: '2026-04-01', effective_to: null }];
    rpc.mockResolvedValue({ data: { success: true, data: { removed, reopened } }, error: null });
    expect(await undoRateChange(input)).toEqual({ success: true, removed, reopened });
  });

  it.each([
    ['NOTHING_TO_UNDO', 'pricing.error.nothingToUndo'],
    ['PAST_DATE_NOT_ALLOWED', 'pricing.error.pastDateNotAllowed'],
    ['ITEM_NOT_FOUND', 'pricing.error.itemNotFound'],
    ['CUSTOMER_NOT_FOUND', 'pricing.error.customerNotFound'],
    ['BANDS_OVERLAP', 'pricing.error.bandsOverlap'],
    ['INVALID_PRICE_TYPE', 'pricing.error.generic'],
    ['SOMETHING_NEW', 'pricing.error.generic'],
  ] as const)('maps %s to the app text, never the server sentence', async (code, key) => {
    rpc.mockResolvedValue(refused(code));
    const result = await undoRateChange(input);
    expect(result.success).toBe(false);
    expect(result.message).toBe(t(key as never));
    expect(result.message).not.toContain('English sentence');
  });

  it('maps a refusal for a customer to PERMISSION_DENIED', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'access required' } });
    expect((await undoRateChange(input)).errorCode).toBe('PERMISSION_DENIED');
  });

  it('says the server needs an update when the function is missing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.undo_rate_change' } });
    const result = await undoRateChange(input);
    expect(result.errorCode).toBe('SERVER_NEEDS_UPDATE');
    expect(result.message).toBe(t('pricing.error.serverNeedsUpdate'));
  });

  it('returns a generic failure when the call throws', async () => {
    rpc.mockRejectedValue(new Error('boom'));
    expect((await undoRateChange(input)).errorCode).toBe('UNKNOWN');
  });
});
