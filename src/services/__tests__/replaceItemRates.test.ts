import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { checkSubmission } from '@/utils/lostAnswer';
import { replaceItemRates, getItemPriceHistory } from '../item-pricing-service';

jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  checkSubmission: jest.fn(),
}));

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

describe('replaceItemRates and an answer that did not come through', () => {
  it('an empty HTTP 200 is outcome unknown, not a failure', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 200 });
    expect(await replaceItemRates(input)).toMatchObject({ success: false, outcomeUnknown: true, message: t('pricing.error.unconfirmed') });
  });

  it('a non-JSON HTTP 200 is outcome unknown too', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '<html>Maintenance</html>' }, status: 200 });
    expect(await replaceItemRates(input)).toMatchObject({ success: false, outcomeUnknown: true });
  });

  it('sends a request key only when one is given', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: {} }, error: null });
    await replaceItemRates(input);
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_request_key');
    await replaceItemRates({ ...input, request_key: 'k-1' });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_request_key: 'k-1' });
  });
});

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

  it('INVALID_DATE for a day more than two years ahead says so, with or without data.earliest', async () => {
    rpc.mockResolvedValue(refused('INVALID_DATE', { earliest: '2022-01-01' }));
    const result = await replaceItemRates({ ...input, starts_on: '2999-01-01' });
    expect(result).toMatchObject({ errorCode: 'INVALID_DATE', message: 'Choose a start date within two years after today.' });
  });

  it('INVALID_DATE with data.earliest names that day and keeps it for the editor', async () => {
    rpc.mockResolvedValue(refused('INVALID_DATE', { earliest: '2022-01-01' }));
    expect(await replaceItemRates(input)).toMatchObject({
      errorCode: 'INVALID_DATE',
      earliest: '2022-01-01',
      message: 'Choose a start date on or after 01/01/22.',
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
    // The words alone are not read any more (docs/API_CONTRACT.md, "What the app may match": 42501 is the code).
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Admin Access Required' } });
    expect((await replaceItemRates(input)).errorCode).not.toBe('PERMISSION_DENIED');
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

describe('replaceItemRates with a request key and a lost answer', () => {
  const lost = { data: null, error: null, status: 200 };
  const saved = { data: { success: true, data: { ended: [], added: [] } }, error: null };

  it('asks the server what became of the key; found means saved and nothing is sent again', async () => {
    rpc.mockResolvedValueOnce(lost);
    jest.mocked(checkSubmission).mockResolvedValue({ found: true, response: { success: true, data: { kept_end: '2027-03-01' } } });
    expect(await replaceItemRates({ ...input, request_key: 'k-1' })).toEqual({ success: true, keptEnd: '2027-03-01' });
    expect(checkSubmission).toHaveBeenCalledWith('k-1', expect.any(Number), undefined);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('not found: sends the identical request again with the same key', async () => {
    rpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(saved);
    jest.mocked(checkSubmission).mockResolvedValue({ found: false });
    expect(await replaceItemRates({ ...input, request_key: 'k-1' })).toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual(rpc.mock.calls[0][1]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_request_key: 'k-1' });
  });

  it('an aborted wait returns the unconfirmed result', async () => {
    rpc.mockResolvedValueOnce(lost);
    const controller = new AbortController();
    jest.mocked(checkSubmission).mockImplementation(async () => {
      controller.abort();
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    });
    expect(await replaceItemRates({ ...input, request_key: 'k-1' }, { signal: controller.signal })).toMatchObject({ success: false, outcomeUnknown: true });
  });

  it('an older server without p_request_key gets the save once without it, and a lost answer there is not asked about', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }).mockResolvedValueOnce(lost);
    expect(await replaceItemRates({ ...input, request_key: 'k-1' })).toMatchObject({ success: false, outcomeUnknown: true });
    expect(rpc.mock.calls[0][1]).toHaveProperty('p_request_key');
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_request_key');
    expect(checkSubmission).not.toHaveBeenCalled();
  });
});
