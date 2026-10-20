import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n';
import { getItemPriceHistory } from '../item-pricing-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
let logs: jest.SpyInstance[];

const ENTRY = {
  id: 12,
  changed_at: '2026-10-11T09:15:27.123456+00:00',
  action: 'update',
  price_id: 'price-1',
  item_id: 'item-1',
  item_name: 'Example Chillies',
  customer_id: null,
  customer_name: null,
  old_values: { price_type: 'monthly', unit_price: 5, unit_price_monthly: 5 },
  new_values: { price_type: 'monthly', unit_price: 6, unit_price_monthly: 6 },
  changed_by: 'user-1',
  changed_by_name: 'Meera Joshi',
  changed_by_role: 'staff',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  logs = ['log', 'warn', 'error', 'info', 'debug'].map((method) =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});

afterEach(() => {
  logs.forEach((log) => log.mockRestore());
  setLanguage('en');
});

it('asks get_item_price_history for a page and returns the entries and the pagination', async () => {
  rpc.mockResolvedValue({
    data: { success: true, data: [ENTRY], pagination: { total: 37, limit: 50, offset: 50, has_more: false } },
    error: null,
  });

  const result = await getItemPriceHistory({ limit: 50, offset: 50 });

  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('get_item_price_history', { p_limit: 50, p_offset: 50 });
  expect(result).toEqual({
    success: true,
    data: [ENTRY],
    pagination: { total: 37, limit: 50, offset: 50, has_more: false },
  });
});

it('asks for the first 50 when no page is named', async () => {
  rpc.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0, limit: 50, offset: 0, has_more: false } }, error: null });
  await getItemPriceHistory();
  expect(rpc).toHaveBeenCalledWith('get_item_price_history', { p_limit: 50, p_offset: 0 });
});

it('keeps has_more as the server gives it', async () => {
  rpc.mockResolvedValue({ data: { success: true, data: [ENTRY], pagination: { total: 120, limit: 50, offset: 0, has_more: true } }, error: null });
  expect((await getItemPriceHistory()).pagination).toEqual({ total: 120, limit: 50, offset: 0, has_more: true });
});

it('an RPC error is a failure that names the reason in the app words, never the raw text', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Access denied: staff may not call get_item_price_history', code: '42501' } });

  const result = await getItemPriceHistory();

  expect(result.success).toBe(false);
  expect(result.data).toEqual([]);
  expect(result.pagination.has_more).toBe(false);
  expect(result.message).toBe('You do not have permission to perform this action.');
  expect(result.error).toBe('Access denied: staff may not call get_item_price_history');
});

it('an RPC error with no reason the app knows asks to try again', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'invalid input syntax for type integer' } });
  const result = await getItemPriceHistory();
  expect(result).toMatchObject({ success: false, data: [], message: 'Try again in a moment.' });
});

it.each([
  ['success false with a message', { success: false, message: 'Price history is not available' }, 'Price history is not available'],
  ['success false with an error', { success: false, error: 'Access denied' }, 'Access denied'],
  ['no success flag at all', { data: [ENTRY] }, 'Try again in a moment.'],
  ['success that is not true', { success: 'true', data: [ENTRY] }, 'Try again in a moment.'],
  ['an empty answer', null, 'Try again in a moment.'],
])('%s is a failure with no entries', async (_name, data, message) => {
  rpc.mockResolvedValue({ data, error: null });
  const result = await getItemPriceHistory();
  expect(result.success).toBe(false);
  expect(result.data).toEqual([]);
  expect(result.message).toBe(message);
});

it('a refusal is shown in the app words in Gujarati', async () => {
  setLanguage('gu');
  rpc.mockResolvedValue({ data: { success: false, error: 'Access denied' }, error: null });
  const refused = await getItemPriceHistory();
  expect(refused.message).not.toMatch(/[A-Za-z]/);
  expect(refused.message).not.toBe('થોડી વાર પછી ફરી પ્રયાસ કરો.');
  rpc.mockResolvedValue({ data: { success: false, message: 'Something unexpected' }, error: null });
  expect((await getItemPriceHistory()).message).toBe('થોડી વાર પછી ફરી પ્રયાસ કરો.');
});

it('a request that throws is a failure too', async () => {
  rpc.mockRejectedValue(new Error('Network request failed'));
  const result = await getItemPriceHistory();
  expect(result.success).toBe(false);
  expect(result.data).toEqual([]);
  expect(result.message).toBe('Check your connection and try again.');
});

// A backend without migration 48 does not have the function: PostgREST answers PGRST202.
describe('a server without the price history', () => {
  const NEEDS_UPDATE = "This facility's server needs an update before the price history is available.";

  it.each([
    ['the PostgREST code', { code: 'PGRST202', message: 'Not found' }],
    [
      'the PostgREST text',
      { message: 'Could not find the function public.get_item_price_history(p_limit, p_offset) in the schema cache' },
    ],
    ['the database code', { code: '42883', message: 'function public.get_item_price_history(integer, integer) does not exist' }],
  ])('says the server needs an update (%s)', async (_name, error) => {
    rpc.mockResolvedValue({ data: null, error });
    const result = await getItemPriceHistory();
    expect(result).toMatchObject({ success: false, data: [], message: NEEDS_UPDATE });
    expect(result.error).toBe(error.message);
  });

  it('says so when the request throws that answer', async () => {
    rpc.mockRejectedValue(new Error('Could not find the function public.get_item_price_history(p_limit, p_offset) in the schema cache'));
    expect((await getItemPriceHistory()).message).toBe(NEEDS_UPDATE);
  });

  it('says so in Gujarati', async () => {
    setLanguage('gu');
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect((await getItemPriceHistory()).message).toBe('દરનો ઇતિહાસ જોવા માટે આ કોલ્ડ સ્ટોરેજનું સર્વર અપડેટ કરવું જરૂરી છે.');
  });

  it('keeps "try again" for another missing thing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'invalid input syntax for type integer' } });
    expect((await getItemPriceHistory()).message).toBe('Try again in a moment.');
  });
});
