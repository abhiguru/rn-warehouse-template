import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { checkSubmission } from '@/utils/lostAnswer';
import { getStandardRate, setStandardRate } from '../item-pricing-service';

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
const tier = (min: number, max: number, rent: number) => ({ weight_min: min, weight_max: max, unit_price: rent, labour_rate: 1, tax_percent: 5 });
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

describe('getStandardRate', () => {
  it('reads the tiers ordered by weight with who saved them and when', async () => {
    rpc.mockResolvedValue({
      data: { success: true, data: { tiers: [tier(11, 20, 4), { ...tier(0, 10, 3), unit_price: '3.00' }, { weight_min: 'x' }], updated_at: '2026-10-15T08:00:00Z', updated_by_name: 'Dev Admin' } },
      error: null,
    });
    expect(await getStandardRate()).toEqual({ tiers: [tier(0, 10, 3), tier(11, 20, 4)], updatedAt: '2026-10-15T08:00:00Z', updatedByName: 'Dev Admin' });
    expect(rpc).toHaveBeenCalledWith('get_standard_rate');
  });

  it('is empty when none was ever saved', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { tiers: [], updated_at: null, updated_by_name: null } }, error: null });
    expect(await getStandardRate()).toEqual({ tiers: [], updatedAt: null, updatedByName: null });
  });

  it('throws when the server refuses, fails or has no such function (a server without migration 85)', async () => {
    rpc.mockResolvedValue({ data: { success: false }, error: null });
    await expect(getStandardRate()).rejects.toThrow();
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_standard_rate' } });
    await expect(getStandardRate()).rejects.toThrow(t('pricing.standard.error.serverNeedsUpdate'));
  });
});

describe('setStandardRate', () => {
  const tiers = [tier(0, 10, 3), tier(11, 20, 4)];

  it('sends p_tiers and returns the tiers saved and how many items got them', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { tiers, items_priced: 55 } }, error: null });
    expect(await setStandardRate(tiers)).toEqual({ success: true, tiers, itemsPriced: 55, updatedAt: null, dryRun: false });
    expect(rpc).toHaveBeenCalledWith('set_standard_rate', { p_tiers: tiers });
  });

  it('sends the version it was built from and the dry-run flag, and returns the new version exactly as written', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { tiers, items_priced: 3, updated_at: '2026-10-20T10:11:12.123456+00:00' } }, error: null });
    const result = await setStandardRate(tiers, { expectedUpdatedAt: '-infinity', dryRun: true });
    expect(rpc).toHaveBeenCalledWith('set_standard_rate', { p_tiers: tiers, p_expected_updated_at: '-infinity', p_dry_run: true });
    expect(result).toMatchObject({ success: true, itemsPriced: 3, updatedAt: '2026-10-20T10:11:12.123456+00:00', dryRun: true });
  });

  it.each([
    ['INVALID_BANDS', 'pricing.error.tooManyBands'],
    ['INVALID_BAND', 'pricing.error.invalidBand'],
    ['INVALID_AMOUNT', 'pricing.error.invalidAmount'],
    ['BANDS_OVERLAP', 'pricing.error.bandsOverlap'],
    ['BANDS_GAP', 'pricing.error.bandsGap'],
    ['STANDARD_RATE_MANAGER_ONLY', 'pricing.standard.error.managerOnly'],
    ['STALE_STANDARD_RATE', 'pricing.standard.error.stale'],
  ])('shows the app\'s own text for %s, never the server\'s', async (code, key) => {
    rpc.mockResolvedValue(refused(code, {}));
    const result = await setStandardRate(tiers);
    expect(result).toEqual({ success: false, errorCode: code, message: t(key as never) });
    expect(result.message).not.toContain('English sentence');
  });

  it('names the tier and the field the server refused', async () => {
    rpc.mockResolvedValue(refused('INVALID_AMOUNT', { index: 2, field: 'tax_percent' }));
    expect(await setStandardRate(tiers)).toMatchObject({ errorCode: 'INVALID_AMOUNT', tierIndex: 2, field: 'tax_percent' });
    rpc.mockResolvedValue(refused('BANDS_GAP', { index: 1, expected_min: 11 }));
    expect(await setStandardRate(tiers)).toMatchObject({ errorCode: 'BANDS_GAP', tierIndex: 1 });
  });

  it('says a server without migration 85 needs an update', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.set_standard_rate' } });
    expect(await setStandardRate(tiers)).toEqual({ success: false, errorCode: 'SERVER_NEEDS_UPDATE', message: t('pricing.standard.error.serverNeedsUpdateSave') });
  });

  it('says the save may have gone through when the answer never came', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    expect(await setStandardRate(tiers)).toMatchObject({ success: false, outcomeUnknown: true, message: t('pricing.standard.error.unconfirmed') });
  });
});

describe('setStandardRate with a request key and a lost answer', () => {
  const tiers = [tier(0, 10, 3)];
  const lost = { data: null, error: null, status: 200 };

  it('sends p_request_key on a real save only', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { tiers, items_priced: 0, updated_at: 'v1' } }, error: null });
    await setStandardRate(tiers, { requestKey: 'k-9', dryRun: true });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_request_key');
    await setStandardRate(tiers, { requestKey: 'k-9' });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_request_key: 'k-9' });
  });

  it('found: the stored answer is the result and nothing is sent again', async () => {
    rpc.mockResolvedValueOnce(lost);
    jest.mocked(checkSubmission).mockResolvedValue({ found: true, response: { success: true, data: { tiers, items_priced: 4, updated_at: 'v2' } } });
    expect(await setStandardRate(tiers, { requestKey: 'k-9' })).toMatchObject({ success: true, itemsPriced: 4, updatedAt: 'v2' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('not found: the identical request is sent again with the same key', async () => {
    rpc.mockResolvedValueOnce(lost).mockResolvedValueOnce({ data: { success: true, data: { tiers, items_priced: 0, updated_at: 'v3' } }, error: null });
    jest.mocked(checkSubmission).mockResolvedValue({ found: false });
    expect(await setStandardRate(tiers, { requestKey: 'k-9', expectedUpdatedAt: 'v0' })).toMatchObject({ success: true, updatedAt: 'v3' });
    expect(rpc.mock.calls[1][1]).toEqual(rpc.mock.calls[0][1]);
  });
});
