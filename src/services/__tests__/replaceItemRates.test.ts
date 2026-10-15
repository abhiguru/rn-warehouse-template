import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { replaceItemRates, getItemPriceHistory } from '../item-pricing-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSessionIdentity: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
const band = { weight_min: 0, weight_max: 100, unit_price: 12, labour_rate: 3, tax_percent: 5 };
const input = {
  item_id: 'item-1',
  customer_id: null,
  price_type: 'monthly' as const,
  starts_on: '2027-01-01',
  bands: [band],
};
const refused = (error_code: string, data: unknown = {}) => ({
  data: { success: false, error: 'English sentence from the server', error_code, data },
  error: null,
});
let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  logs = ['log', 'warn', 'error'].map(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(() => logs.forEach(l => l.mockRestore()));

describe('replaceItemRates', () => {
  it('calls replace_item_rates with the p_ parameters and replace_later false by default', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: {} }, error: null });
    await replaceItemRates(input);
    expect(rpc).toHaveBeenCalledWith('replace_item_rates', {
      p_item_id: 'item-1',
      p_customer_id: null,
      p_price_type: 'monthly',
      p_starts_on: '2027-01-01',
      p_bands: [band],
      p_replace_later: false,
      p_mode: 'change',
      p_move_from: null,
    });
    await replaceItemRates({ ...input, customer_id: 'c-1', bands: [], replace_later: true });
    expect(rpc).toHaveBeenLastCalledWith('replace_item_rates', expect.objectContaining({ p_customer_id: 'c-1', p_bands: [], p_replace_later: true }));
  });

  it('returns what the server ended and added on success', async () => {
    const ended = [{ id: 'r1', effective_from: '2026-04-01', effective_to: '2026-12-31' }];
    const added = [{ id: 'r2', ...band }];
    rpc.mockResolvedValue({ data: { success: true, data: { ended, added, removed: [] } }, error: null });
    expect(await replaceItemRates(input)).toEqual({ success: true, ended, added });
  });

  it.each([
    ['INVALID_PRICE_TYPE', 'pricing.error.generic'],
    ['INVALID_DATE', 'pricing.error.invalidDateWindow'],
    ['PAST_DATE_NOT_ALLOWED', 'pricing.error.pastDateNotAllowed'],
    ['RATE_IN_FORCE_MANAGER_ONLY', 'pricing.error.rateInForceManagerOnly'],
    ['ITEM_NOT_FOUND', 'pricing.error.itemNotFound'],
    ['CUSTOMER_NOT_FOUND', 'pricing.error.customerNotFound'],
    ['INVALID_BANDS', 'pricing.error.tooManyBands'],
    ['INVALID_BAND', 'pricing.error.invalidBand'],
    ['INVALID_AMOUNT', 'pricing.error.invalidAmount'],
    ['BANDS_OVERLAP', 'pricing.error.bandsOverlap'],
    ['BANDS_GAP', 'pricing.error.bandsGap'],
    ['NOTHING_TO_STOP', 'pricing.error.nothingToStop'],
    ['SOMETHING_NEW', 'pricing.error.generic'],
  ])('maps %s to %s and never shows the server text', async (code, key) => {
    rpc.mockResolvedValue(refused(code));
    const result = await replaceItemRates(input);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(code === 'SOMETHING_NEW' ? 'UNKNOWN' : code);
    expect(result.message).toBe(t(key as TranslationKey));
    expect(result.message).not.toContain('English sentence');
  });

  it('INVALID_DATE with data.earliest names the oldest GRN day and keeps the day for the editor', async () => {
    rpc.mockResolvedValue(refused('INVALID_DATE', { earliest: '2022-01-01' }));
    expect(await replaceItemRates(input)).toMatchObject({
      errorCode: 'INVALID_DATE',
      earliest: '2022-01-01',
      message: 'Choose a day on or after 1 Jan 2022, the date of your oldest GRN.',
    });
  });

  it('names the band and field of INVALID_AMOUNT', async () => {
    rpc.mockResolvedValue(refused('INVALID_AMOUNT', { index: 1, field: 'tax_percent' }));
    expect(await replaceItemRates(input)).toMatchObject({ errorCode: 'INVALID_AMOUNT', bandIndex: 1, field: 'tax_percent' });
  });

  it('keeps the later rates of LATER_RATES_EXIST and gives no message', async () => {
    const later = [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 13 }];
    rpc.mockResolvedValue(refused('LATER_RATES_EXIST', { later }));
    const result = await replaceItemRates(input);
    expect(result).toEqual({ success: false, errorCode: 'LATER_RATES_EXIST', later });
  });

  it('maps 42501 and "access required" to PERMISSION_DENIED', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Staff access required' } });
    expect(await replaceItemRates(input)).toMatchObject({ errorCode: 'PERMISSION_DENIED', message: t('errors.parsed.noPermission') });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Admin Access Required' } });
    expect((await replaceItemRates(input)).errorCode).toBe('PERMISSION_DENIED');
  });

  it('maps a missing function to SERVER_NEEDS_UPDATE', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.replace_item_rates' } });
    expect(await replaceItemRates(input)).toMatchObject({ errorCode: 'SERVER_NEEDS_UPDATE', message: t('pricing.error.serverNeedsUpdate') });
  });

  it('maps a network failure to UNKNOWN: the outcome is not known', async () => {
    rpc.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await replaceItemRates(input)).toMatchObject({ errorCode: 'UNKNOWN', message: t('pricing.error.unconfirmed'), outcomeUnknown: true });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
    expect((await replaceItemRates(input)).errorCode).toBe('UNKNOWN');
  });
});

describe('getItemPriceHistory filters', () => {
  it('sends p_item_id and p_customer_id only when given', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0, limit: 50, offset: 0, has_more: false } }, error: null });
    await getItemPriceHistory({ limit: 20, offset: 40, itemId: 'item-1', customerId: 'c-1' });
    expect(rpc).toHaveBeenCalledWith('get_item_price_history', { p_limit: 20, p_offset: 40, p_item_id: 'item-1', p_customer_id: 'c-1' });
    await getItemPriceHistory({ itemId: 'item-1' });
    expect(rpc).toHaveBeenLastCalledWith('get_item_price_history', { p_limit: 50, p_offset: 0, p_item_id: 'item-1' });
  });
});

describe('replaceItemRates: outcome and kept stop (F29, F62, STALE_RATES)', () => {
  it('sends p_seen_rows only when the screen gives the loaded ids', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: {} }, error: null });
    await replaceItemRates({ ...input, seen_rows: ['r1', 'r2'] });
    expect(rpc).toHaveBeenLastCalledWith('replace_item_rates', expect.objectContaining({ p_seen_rows: ['r1', 'r2'] }));
    await replaceItemRates(input);
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_seen_rows');
  });

  it('a timeout is reported as an unknown outcome, not as "try again"', async () => {
    rpc.mockRejectedValueOnce(new Error('Rate change timed out'));
    const result = await replaceItemRates(input);
    expect(result).toMatchObject({ success: false, errorCode: 'UNKNOWN', outcomeUnknown: true, message: t('pricing.error.unconfirmed') });
  });

  it('a refusal from the server is not an unknown outcome', async () => {
    rpc.mockResolvedValueOnce(refused('PAST_DATE_NOT_ALLOWED'));
    expect((await replaceItemRates(input)).outcomeUnknown).toBeUndefined();
  });

  it('kept_end null is passed on as null; a missing kept_end stays missing', async () => {
    rpc.mockResolvedValueOnce({ data: { success: true, data: { kept_end: null } }, error: null });
    expect(await replaceItemRates(input)).toMatchObject({ success: true, keptEnd: null });
    rpc.mockResolvedValueOnce({ data: { success: true, data: {} }, error: null });
    expect(await replaceItemRates(input)).not.toHaveProperty('keptEnd');
  });

  it('STALE_RATES carries the app text', async () => {
    rpc.mockResolvedValueOnce(refused('STALE_RATES', { ids: ['x'] }));
    expect(await replaceItemRates(input)).toMatchObject({ errorCode: 'STALE_RATES', message: t('pricing.error.staleRates') });
  });
});
