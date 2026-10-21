/**
 * createGRN and the duplicate warning (backend migration 124, opt-in):
 * - a normal save asks for the check (`p_warn_duplicate: true`); "Save anyway" sends false, which is another body and so
 *   another request code;
 * - POSSIBLE_DUPLICATE is a warning: nothing was saved, the earlier GRN is returned for the screen to word, and it is not
 *   a lost answer, also when it answers a RESEND after a lost answer;
 * - a server without migration 124 gets the save without the parameter.
 */
import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { forgetUnfinishedSave, rememberUnfinishedSave } from '@/services/unfinishedSaves';
import { createGRN } from '../grnFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc, storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) } }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
// The real key: it hashes the body, so a body with another flag has another key.
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: async (operation: string, body: unknown) => `${operation}:${JSON.stringify(body)}`,
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => {}),
  forgetUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const header: GRNHeaderData = {
  gr_no: 'Z0011',
  registration: 'GJ01AB1234',
  date: '2026-10-21',
  sender_id: '',
  sender_name: 'Fictional Farms',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Hilltop Fresh Mart',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Ravi Example',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [],
};
const items = [{
  item_table_id: '66666666-2222-4333-8444-555555555555',
  item_name: 'Potatoes',
  packaging: 'Jute bag',
  qty: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [],
}];
const saved = { data: { success: true, data: { grn_id: GRN_ID, gr_no: 'Z0011', item_mapping: [] } }, error: null };
const duplicate = {
  data: {
    success: false,
    error_code: 'WH409',
    reason: 'POSSIBLE_DUPLICATE',
    error: 'GRN Z0010 for Hilltop Fresh Mart was created 3 minutes ago with the same items.',
    message: 'GRN Z0010 for Hilltop Fresh Mart was created 3 minutes ago with the same items.',
    kind: 'grn',
    existing_id: '77777777-2222-4333-8444-555555555555',
    existing_number: 'Z0010',
    existing_created_at: '2026-10-21T10:27:00Z',
    existing_created_by: 'Ravi Example',
    customer_name: 'Hilltop Fresh Mart',
    items: [{ item_name: 'Potatoes', packaging: 'Jute bag' }],
    window_minutes: 30,
  },
  error: null,
};
const dropped = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
const unknownSignature = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_grn(p_warn_duplicate) in the schema cache' } };
const bodies = () => mockRpc.mock.calls.map(([, body]) => body);

beforeEach(() => {
  mockRpc.mockReset();
  jest.mocked(forgetUnfinishedSave).mockClear();
  jest.mocked(rememberUnfinishedSave).mockClear();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('asking for the check', () => {
  it('a normal save sends p_warn_duplicate: true', async () => {
    mockRpc.mockResolvedValue(saved);
    await createGRN({ header, items });
    expect(mockRpc.mock.calls[0][0]).toBe('save_grn');
    expect(bodies()[0].p_warn_duplicate).toBe(true);
  });

  it('"Save anyway" sends p_warn_duplicate: false, under a request code of its own', async () => {
    mockRpc.mockResolvedValue(saved);
    await createGRN({ header, items, nonce: 'form-a' });
    await createGRN({ header, items, nonce: 'form-a', warnDuplicate: false });

    expect(bodies()[1].p_warn_duplicate).toBe(false);
    expect(bodies()[1].p_idempotency_key).not.toBe(bodies()[0].p_idempotency_key);
    // Nothing else differs.
    const { p_idempotency_key: _a, p_warn_duplicate: _b, ...first } = bodies()[0];
    const { p_idempotency_key: _c, p_warn_duplicate: _d, ...second } = bodies()[1];
    expect(second).toEqual(first);
  });
});

describe('a possible duplicate', () => {
  it('is a warning: the earlier GRN is returned, nothing is a lost answer, and the note is taken away', async () => {
    mockRpc.mockResolvedValueOnce(duplicate);

    const result = await createGRN({ header, items });

    expect(result.success).toBe(false);
    expect(result.lostAnswer).toBeUndefined();
    expect(result.numberTaken).toBeUndefined();
    expect(result.rateError).toBeUndefined();
    expect(result.duplicate).toMatchObject({
      kind: 'grn',
      existingNumber: 'Z0010',
      existingId: '77777777-2222-4333-8444-555555555555',
      createdBy: 'Ravi Example',
      customerName: 'Hilltop Fresh Mart',
      items: [{ itemName: 'Potatoes', packaging: 'Jute bag' }],
      windowMinutes: 30,
    });
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(bodies()[0].p_idempotency_key);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('Save anyway after it saves the GRN', async () => {
    mockRpc.mockResolvedValueOnce(duplicate).mockResolvedValueOnce(saved);

    const first = await createGRN({ header, items });
    const again = await createGRN({ header, items, warnDuplicate: false });

    expect(first.duplicate).toBeDefined();
    expect(again).toMatchObject({ success: true, data: { id: GRN_ID, gr_no: 'Z0011' } });
    expect(again.duplicate).toBeUndefined();
  });

  it('answering a RESEND after a lost answer settles the attempt: the warning, and not a lost answer', async () => {
    mockRpc.mockResolvedValueOnce(dropped);
    const lost = await createGRN({ header, items });
    expect(lost.lostAnswer).toBeDefined();
    mockRpc.mockResolvedValueOnce(duplicate);

    const resent = await createGRN({ header, items, resend: lost.lostAnswer });

    expect(resent.duplicate).toBeDefined();
    expect(resent.lostAnswer).toBeUndefined();
    // The identical request was sent again, with the flag it was first sent with.
    expect(bodies()[1]).toBe(lost.lostAnswer!.args);
    expect(bodies()[1].p_warn_duplicate).toBe(true);
    // Settled: the note of the lost send is taken away.
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(lost.lostAnswer!.key);
  });

  it('is not claimed for another refusal', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, reason: 'NUMBER_TAKEN', message: 'Number is taken' }, error: null });
    expect((await createGRN({ header, items })).duplicate).toBeUndefined();
  });
});

describe('a server without migration 124', () => {
  it('gets the save again without p_warn_duplicate, and the GRN is created', async () => {
    mockRpc.mockResolvedValueOnce(unknownSignature).mockResolvedValueOnce(saved);

    const result = await createGRN({ header, items });

    expect(result).toMatchObject({ success: true, data: { id: GRN_ID } });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect('p_warn_duplicate' in bodies()[0]).toBe(true);
    expect('p_warn_duplicate' in bodies()[1]).toBe(false);
    // Not applied by the first, so its note went before the second one was written.
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(bodies()[0].p_idempotency_key);
  });

  it('keeps the rates it was given when only p_warn_duplicate is unknown', async () => {
    const rates = [{ item_id: '66666666-2222-4333-8444-555555555555', weight: 50, rate: 5 }];
    mockRpc.mockResolvedValueOnce(unknownSignature).mockResolvedValueOnce(saved);

    await createGRN({ header, items, rates: rates as never });

    expect(bodies()[1].p_rates).toEqual(rates);
    expect('p_warn_duplicate' in bodies()[1]).toBe(false);
  });
});
