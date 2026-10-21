/**
 * createGRN writes the create down before the request goes out and takes the note away once the server's answer is
 * known (src/services/unfinishedSaves.ts): saved, refused, or never sent. It keeps the note while the answer is lost, so
 * that the next start of the app can ask the server what became of the request.
 */
import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { forgetUnfinishedSave, rememberUnfinishedSave } from '@/services/unfinishedSaves';
import { submissionIdempotencyKey } from '@/utils/submissionIdempotency';
import { createGRN } from '../grnFormService';

const order: string[] = [];
const mockRpc = jest.fn(async (name: string, ..._rest: unknown[]) => {
  order.push(`rpc:${name}`);
  return mockAnswers.shift() ?? { data: null, error: { message: 'unexpected call' } };
});
let mockAnswers: unknown[] = [];
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
  }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: jest.fn(async () => 'warehouse-grn-fictional-key'),
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => { order.push('remember'); }),
  forgetUnfinishedSave: jest.fn(async () => { order.push('forget'); }),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const header: GRNHeaderData = {
  gr_no: 'Z0010',
  registration: 'GJ01AB1234',
  date: '2026-10-01',
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
  item_name: 'Garlic',
  packaging: 'Bag',
  qty: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [],
}];
const saved = { data: { success: true, data: { grn_id: GRN_ID, gr_no: 'Z0010', item_mapping: [] } }, error: null };
const dropped = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
const neverSent = { data: null, error: { message: 'Error: fetch failed: connect timed out', code: '' } };
const KEY = 'warehouse-grn-fictional-key';

beforeEach(() => {
  order.length = 0;
  mockAnswers = [];
  mockRpc.mockClear();
  jest.mocked(rememberUnfinishedSave).mockClear();
  jest.mocked(forgetUnfinishedSave).mockClear();
  jest.mocked(submissionIdempotencyKey).mockClear();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('before the request goes out', () => {
  it('writes down the kind, the code that is sent, the number and the customer, then sends', async () => {
    mockAnswers = [saved];
    await createGRN({ header, items, nonce: 'form-a' });

    expect(rememberUnfinishedSave).toHaveBeenCalledTimes(1);
    expect(rememberUnfinishedSave).toHaveBeenCalledWith({ kind: 'grn', requestKey: KEY, number: 'Z0010', customerName: 'Hilltop Fresh Mart' });
    // The code written down is the one in the request.
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_idempotency_key: KEY });
    expect(order.slice(0, 2)).toEqual(['remember', 'rpc:save_grn']);
  });

  it('writes nothing down when there is nothing to send (no number in the form)', async () => {
    await createGRN({ header: { ...header, gr_no: '' }, items });
    expect(rememberUnfinishedSave).not.toHaveBeenCalled();
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
  });
});

describe('once the answer is known', () => {
  it('saved: the note is taken away', async () => {
    mockAnswers = [saved];
    const result = await createGRN({ header, items });
    expect(result.success).toBe(true);
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
    expect(order).toEqual(['remember', 'rpc:save_grn', 'forget']);
  });

  it.each([
    ['a refusal', { data: { success: false, message: 'At least one item is required' }, error: null }],
    ['the number being taken', { data: { success: false, message: 'GRN number already exists: Z0010' }, error: null }],
    ['a statement timeout (nothing was saved)', { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }],
    ['a failure before the request left the phone', neverSent],
  ])('%s: the note is taken away', async (_name, answer) => {
    mockAnswers = [answer];
    const result = await createGRN({ header, items });
    expect(result.success).toBe(false);
    expect(result.lostAnswer).toBeUndefined();
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it('a lost answer: the note stays', async () => {
    mockAnswers = [dropped];
    const result = await createGRN({ header, items });
    expect(result.lostAnswer?.key).toBe(KEY);
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
  });
});

describe('the identical request sent again after the check found nothing', () => {
  it('saved: the note written by the first send is taken away, and no second note is written', async () => {
    mockAnswers = [dropped, saved];
    const first = await createGRN({ header, items });
    jest.mocked(rememberUnfinishedSave).mockClear();
    order.length = 0;

    const again = await createGRN({ header, items, resend: first.lostAnswer });

    expect(again.success).toBe(true);
    expect(rememberUnfinishedSave).not.toHaveBeenCalled();
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it('refused by the server: the note is taken away', async () => {
    mockAnswers = [dropped, { data: { success: false, message: 'Refused' }, error: null }];
    const first = await createGRN({ header, items });

    await createGRN({ header, items, resend: first.lostAnswer });

    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it.each([
    ['lost again', dropped],
    ['a failure before it left the phone', neverSent],
    ['a statement timeout behind the original', { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }],
    ['the number being taken (the first send may have saved it)', { data: { success: false, message: 'GRN number already exists: Z0010' }, error: null }],
  ])('%s: the note stays', async (_name, answer) => {
    mockAnswers = [dropped, answer];
    const first = await createGRN({ header, items });

    const again = await createGRN({ header, items, resend: first.lostAnswer });

    expect(again.lostAnswer).toBeDefined();
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
  });
});

describe('a server that does not know p_rates', () => {
  it('forgets the first request, which was not applied, before writing down the second', async () => {
    const unknownSignature = { data: null, error: { message: 'Could not find the function public.save_grn(p_rates)', code: 'PGRST202' } };
    mockAnswers = [unknownSignature, saved];
    jest.mocked(submissionIdempotencyKey).mockResolvedValueOnce('key-with-rates').mockResolvedValueOnce('key-without-rates');

    const result = await createGRN({ header, items, rates: [] });

    expect(result.success).toBe(true);
    expect(order).toEqual(['remember', 'rpc:save_grn', 'forget', 'remember', 'rpc:save_grn', 'forget']);
    expect(jest.mocked(rememberUnfinishedSave).mock.calls.map(([entry]) => entry.requestKey)).toEqual(['key-with-rates', 'key-without-rates']);
    expect(jest.mocked(forgetUnfinishedSave).mock.calls.map(([key]) => key)).toEqual(['key-with-rates', 'key-without-rates']);
  });
});
