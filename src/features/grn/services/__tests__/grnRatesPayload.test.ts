/**
 * p_rates (backend migration 86): create and update send the rates with the GRN, the idempotency key is
 * computed over them, a rate refusal comes back with its code, and a server without p_rates says so.
 */
import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import type { RatesPayloadEntry } from '@/features/grn/rates/types';
import { createGRN, updateGRN } from '../grnFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getAuthenticatedClient: async () => ({ rpc: mockRpc, storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) } }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
// The key is the body itself here, so a different body is a different key.
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: async (_kind: string, body: unknown) => `key:${JSON.stringify(body)}`,
  grnUpdateIdempotencyKey: async (_id: string, body: unknown) => `update-key:${JSON.stringify(body)}`,
  beginGrnEditSession: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const ITEM = '66666666-2222-4333-8444-555555555555';
const header: GRNHeaderData = {
  gr_no: 'A0010', registration: '', date: '2026-10-01', sender_id: '', sender_name: '', customer_id: 'c1', customer_name: 'Green Valley Traders',
  supervisor_id: 's1', supervisor_name: 'Ravi Example', note: '', leon: false, pricing_mode: 'MONTHLY', gr_images: [],
};
const items = [{ grn_trl_id: LINE_ID, item_table_id: ITEM, item_name: 'Garlic', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '', trl_images: [] }];
const rates: RatesPayloadEntry[] = [
  { scope: 'customer', item_id: ITEM, weight_min: 41, weight_max: 60, unit_price: 4.5, labour_rate: 1, tax_percent: 5, to: null },
  { scope: 'grn', item_id: ITEM, weight_min: 41, weight_max: 60, unit_price: 4, labour_rate: 1, tax_percent: 5 },
];
const created = { data: { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010', item_ids: [LINE_ID], item_mapping: [{ index: 0, item_id: LINE_ID }] } }, error: null };
const updated = { data: { success: true, gr_id: GRN_ID, grn: { images: [] } }, error: null };

beforeEach(() => {
  mockRpc.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('createGRN with rates', () => {
  it('sends p_rates, and the key is made over them', async () => {
    mockRpc.mockResolvedValue(created);
    await createGRN({ header, items, rates });
    const [name, body] = mockRpc.mock.calls[0];
    expect(name).toBe('save_grn');
    expect(body.p_rates).toEqual(rates);
    expect(body.p_idempotency_key).toContain('"p_rates"');

    mockRpc.mockClear();
    await createGRN({ header, items, rates: [rates[0]] });
    expect(mockRpc.mock.calls[0][1].p_idempotency_key).not.toBe(body.p_idempotency_key);
  });

  it('sends an empty list as an empty list, and nothing when the caller gives none (the old call)', async () => {
    mockRpc.mockResolvedValue(created);
    await createGRN({ header, items, rates: [] });
    expect(mockRpc.mock.calls[0][1].p_rates).toEqual([]);
    mockRpc.mockClear();
    await createGRN({ header, items });
    expect('p_rates' in mockRpc.mock.calls[0][1]).toBe(false);
  });

  it('returns the code and data of a rate refusal', async () => {
    const lines = [{ item_id: ITEM, item_name: 'Garlic', weight: 50 }];
    mockRpc.mockResolvedValue({ data: { success: false, error: 'x', error_code: 'RATE_MISSING', message: 'Some lines of this GRN have no rate', data: { lines } }, error: null });
    const result = await createGRN({ header, items, rates: [] });
    expect(result.success).toBe(false);
    expect(result.rateError).toEqual({ code: 'RATE_MISSING', data: { lines } });
  });

  const unknown = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_grn(p_rates) in the schema cache' } };

  it('says the server needs an update when it has no p_rates and rates were set', async () => {
    mockRpc.mockResolvedValue(unknown);
    const result = await createGRN({ header, items, rates });
    expect(result.error).toBe("This cold storage's server needs an update before rates can be saved with a GRN.");
    // The save is tried once more without the duplicate warning (a server without p_rates has none either); the rates stay.
    expect(mockRpc).toHaveBeenCalledTimes(2);
    const [first, second] = mockRpc.mock.calls.map(c => c[1]);
    expect(first.p_warn_duplicate).toBe(true);
    expect('p_warn_duplicate' in second).toBe(false);
    expect(second.p_rates).toEqual(rates);
  });

  // Review D2: a facility still on migration 85 must go on creating GRNs when no rate was touched.
  it('with no rates set, a server without p_rates gets the old call (no p_rates, the old key) and the GRN is created', async () => {
    mockRpc.mockResolvedValueOnce(unknown).mockResolvedValueOnce(created);
    const result = await createGRN({ header, items, rates: [] });
    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    const [first, second] = mockRpc.mock.calls.map(c => c[1]);
    expect('p_rates' in first).toBe(true);
    expect('p_rates' in second).toBe(false);
    expect(second.p_idempotency_key).not.toContain('p_rates');
  });
});

describe('updateGRN with rates', () => {
  it('sends p_rates and hashes them into the key', async () => {
    mockRpc.mockResolvedValue(updated);
    await updateGRN(GRN_ID, { header, items, rates });
    const [name, body] = mockRpc.mock.calls[0];
    expect(name).toBe('update_grn');
    expect(body.p_rates).toEqual(rates);
    expect(body.p_idempotency_key).toContain('"p_rates"');
    mockRpc.mockClear();
    await updateGRN(GRN_ID, { header, items, rates: [] });
    expect(mockRpc.mock.calls[0][1].p_idempotency_key).not.toBe(body.p_idempotency_key);
  });

  it.each(['RATE_MISSING', 'RATE_PLANNED', 'BANDS_OVERLAP', 'GRN_INVOICED'])('returns %s as a rate refusal', async code => {
    mockRpc.mockResolvedValue({ data: { success: false, error_code: code, message: 'No', data: { starts_on: '2026-11-01' } }, error: null });
    const result = await updateGRN(GRN_ID, { header, items, rates });
    expect(result.success).toBe(false);
    expect(result.rateError).toEqual({ code, data: { starts_on: '2026-11-01' } });
  });

  const unknown = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.update_grn' } };

  it('says the server needs an update when it knows no update_grn with p_rates and rates were set', async () => {
    mockRpc.mockResolvedValue(unknown);
    const result = await updateGRN(GRN_ID, { header, items, rates });
    expect(result.error).toBe("This cold storage's server needs an update before rates can be saved with a GRN.");
  });

  // Review D2
  it('with no rates set, a server without p_rates gets the old call and the GRN is updated', async () => {
    mockRpc.mockResolvedValueOnce(unknown).mockResolvedValueOnce(updated);
    const result = await updateGRN(GRN_ID, { header, items, rates: [] });
    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    const [first, second] = mockRpc.mock.calls.map(c => c[1]);
    expect('p_rates' in first).toBe(true);
    expect('p_rates' in second).toBe(false);
    expect(second.p_idempotency_key).toBeDefined();
    expect(second.p_idempotency_key).not.toContain('p_rates');
  });
});

// BR-09: update_grn keeps the old value for null, so a switched-off or cleared field must go as a value.
describe('updateGRN header values that were switched off or cleared', () => {
  const sent = async (changes: Partial<GRNHeaderData>) => {
    mockRpc.mockResolvedValue(updated);
    await updateGRN(GRN_ID, { header: { ...header, ...changes }, items, rates: [] });
    return mockRpc.mock.calls[0][1];
  };

  it('sends p_leon false when Leon is switched off, and true when it is on', async () => {
    expect((await sent({ leon: false })).p_leon).toBe(false);
    mockRpc.mockReset();
    expect((await sent({ leon: true })).p_leon).toBe(true);
  });

  it('sends p_leon false, not null, when the form carries no value', async () => {
    expect((await sent({ leon: undefined as never })).p_leon).toBe(false);
  });

  it('sends a cleared note and registration as empty text, not null', async () => {
    const body = await sent({ note: '', registration: '' });
    expect(body.p_note).toBe('');
    expect(body.p_registration).toBe('');
  });

  it('sends the note and registration as typed', async () => {
    const body = await sent({ note: 'Handle with care', registration: 'GJ01AB1234' });
    expect(body.p_note).toBe('Handle with care');
    expect(body.p_registration).toBe('GJ01AB1234');
  });
});
