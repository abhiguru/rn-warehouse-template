/**
 * Creating and saving a GRN when the answer may be lost (review 2026-10-20, G1/H1, G5, G16b; owner rule D22):
 * - the number is the form's: createGRN never asks the server for one, so a retry sends the same body and key;
 * - the form's nonce is hashed into the key and never sent in the body;
 * - a failure after the request went out is reported as a lost answer with the request code (the key) and the time
 *   it was sent; a refusal, a failure before sending and a statement timeout are not one. Nothing is looked up by
 *   number, customer or lines any more: the screen asks the server about the code;
 * - the answer found stored under the code is handled as the answer that was lost, and nothing is sent;
 * - another GRN holding the number is reported as such;
 * - an item deleted after it was put into the form gets a plain message, not "Other records depend on this one".
 */
import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { submissionIdempotencyKey } from '@/utils/submissionIdempotency';
import { createGRN, updateGRN } from '../grnFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => ({
    rpc: mockRpc,
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
  }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: jest.fn(async () => 'warehouse-grn-fictional-key'),
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const ITEM_ID = '66666666-2222-4333-8444-555555555555';
const header: GRNHeaderData = {
  gr_no: 'A0010',
  registration: 'GJ01AB1234',
  date: '2026-10-01',
  sender_id: '',
  sender_name: 'Fictional Farms',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Green Valley Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Ravi Example',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [],
};
const items = [{
  item_table_id: ITEM_ID,
  item_name: 'Garlic',
  packaging: 'Bag',
  qty: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [],
}];
const saved = { data: { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010', item_mapping: [{ index: 0, item_id: LINE_ID }] } }, error: null };
// The connection dropped after the request went out (nothing says it did not leave), and before it left.
const dropped = { message: 'TypeError: Network request failed', code: '' };
const neverSent = { message: 'Error: fetch failed: connect timed out', code: '' };
const callsOf = (name: string) => mockRpc.mock.calls.filter(([fn]) => fn === name);

beforeEach(() => {
  mockRpc.mockReset();
  jest.mocked(submissionIdempotencyKey).mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the number is the form\'s', () => {
  it('createGRN never asks the server for a number: with none in the form it sends nothing', async () => {
    const result = await createGRN({ header: { ...header, gr_no: '' }, items });
    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a retry after a lost answer sends the same body with the same number', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed', code: '' } }).mockResolvedValueOnce(saved);
    await createGRN({ header, items });
    await createGRN({ header, items });
    expect(callsOf('get_next_grn_number')).toHaveLength(0);
    expect(callsOf('save_grn')).toHaveLength(2);
    expect(callsOf('save_grn')[1][1]).toEqual(callsOf('save_grn')[0][1]);
    expect(callsOf('save_grn')[0][1].p_gr_no).toBe('A0010');
  });
});

describe('the form nonce', () => {
  it('is hashed into the idempotency key and is not in the RPC body', async () => {
    mockRpc.mockResolvedValue(saved);
    await createGRN({ header, items, nonce: 'nonce-of-this-form' });
    const [operation, hashed] = jest.mocked(submissionIdempotencyKey).mock.calls[0];
    expect(operation).toBe('grn');
    expect(hashed).toMatchObject({ p_gr_no: 'A0010', nonce: 'nonce-of-this-form' });
    expect(callsOf('save_grn')[0][1]).not.toHaveProperty('nonce');
  });

  it('without a nonce the key is hashed from the body alone, as before', async () => {
    mockRpc.mockResolvedValue(saved);
    await createGRN({ header, items });
    expect(jest.mocked(submissionIdempotencyKey).mock.calls[0][1]).not.toHaveProperty('nonce');
  });
});

describe('a Create that got no answer', () => {
  it('is reported as a lost answer with its request code and send time after a dropped connection', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: dropped });
    const before = Date.now();
    const result = await createGRN({ header, items, nonce: 'nonce-of-this-form' });
    expect(result.success).toBe(false);
    expect(result.lostAnswer).toEqual({ key: 'warehouse-grn-fictional-key', sentAt: expect.any(Number) });
    expect(result.lostAnswer!.sentAt).toBeGreaterThanOrEqual(before);
  });

  it('is not one after a refusal, a failure before the request left, or a statement timeout (nothing was saved)', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, message: 'Refused' }, error: null });
    expect((await createGRN({ header, items })).lostAnswer).toBeUndefined();

    mockRpc.mockResolvedValueOnce({ data: null, error: neverSent });
    expect((await createGRN({ header, items })).lostAnswer).toBeUndefined();

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } });
    expect((await createGRN({ header, items })).lostAnswer).toBeUndefined();
  });

  it('does not look anything up by number, customer or lines: only save_grn is called', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: dropped });
    await createGRN({ header, items });
    expect(mockRpc.mock.calls.map(([fn]) => fn)).toEqual(['save_grn']);
  });

  it('sent again as it was, it goes out under the same request code with the same body', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: dropped }).mockResolvedValueOnce(saved);
    const request = { header, items, nonce: 'nonce-of-this-form' };
    const first = await createGRN(request);
    const again = await createGRN(request);

    const hashed = jest.mocked(submissionIdempotencyKey).mock.calls.map(([, body]) => body);
    expect(hashed[1]).toEqual(hashed[0]);
    expect(callsOf('save_grn')[1][1]).toEqual(callsOf('save_grn')[0][1]);
    expect(first.lostAnswer?.key).toBe(callsOf('save_grn')[0][1].p_idempotency_key);
    expect(again).toMatchObject({ success: true, data: { id: GRN_ID } });
  });

  it('with the stored answer found under its code it is handled as the lost answer and nothing is sent', async () => {
    const result = await createGRN({ header, items, nonce: 'nonce-of-this-form', storedAnswer: saved.data });
    expect(result).toMatchObject({ success: true, data: { id: GRN_ID, gr_no: 'A0010', item_mapping: [{ index: 0, item_id: LINE_ID }] } });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a stored answer that is a refusal is reported as one, and not as saved', async () => {
    const result = await createGRN({ header, items, storedAnswer: { success: false, message: 'Refused' } });
    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('another GRN holds the number', () => {
  it('is reported with the number, for the screen to offer the next free one', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, message: 'GRN number already exists: A0010' }, error: null });
    const result = await createGRN({ header, items });
    expect(result).toMatchObject({ success: false, numberTaken: { number: 'A0010' } });
    expect(result.lostAnswer).toBeUndefined();
  });

  it('is also taken from the named reason of a newer server', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, reason: 'NUMBER_TAKEN', message: 'Number is taken' }, error: null });
    expect((await createGRN({ header, items })).numberTaken).toEqual({ number: 'A0010' });
  });

  it('is not claimed for any other refusal', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, message: 'At least one item is required' }, error: null });
    expect((await createGRN({ header, items })).numberTaken).toBeUndefined();
  });
});

describe('a Save of an edited GRN that got no answer', () => {
  const lines = [{ ...items[0], grn_trl_id: LINE_ID, stock: 10 }];
  const updated = { data: { success: true, gr_id: GRN_ID, grn: { images: [] }, item_mapping: [] }, error: null };

  it('is reported as a lost answer with the edit session\'s key, and not after a refusal', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: dropped });
    const result = await updateGRN(GRN_ID, { header, items: lines });
    expect(result.lostAnswer).toEqual({ key: 'warehouse-grn-update-fictional-key', sentAt: expect.any(Number) });

    mockRpc.mockResolvedValueOnce({ data: { success: false, message: 'Refused' }, error: null });
    expect((await updateGRN(GRN_ID, { header, items: lines })).lostAnswer).toBeUndefined();
  });

  it('is not one after a statement timeout', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } });
    expect((await updateGRN(GRN_ID, { header, items: lines })).lostAnswer).toBeUndefined();
  });

  it('sent again as it was, the body is the same: no line is given another id, nothing is adopted', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: dropped }).mockResolvedValueOnce(updated);
    const newLine = { ...items[0], grn_trl_id: 'item-1700000000000-abc', stock: 10 };
    const request = { header, items: [...lines, newLine] };
    await updateGRN(GRN_ID, request);
    const again = await updateGRN(GRN_ID, request);

    expect(callsOf('update_grn')[1][1]).toEqual(callsOf('update_grn')[0][1]);
    expect(callsOf('update_grn')).toHaveLength(2);
    expect(callsOf('update_grn')[1][1].p_idempotency_key).toBe('warehouse-grn-update-fictional-key');
    expect(again.success).toBe(true);
  });

  it('with the stored answer found under its code it is handled as the lost answer and nothing is sent', async () => {
    const result = await updateGRN(GRN_ID, { header, items: lines }, { storedAnswer: updated.data });
    expect(result).toMatchObject({ success: true, data: { id: GRN_ID } });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('an item deleted after it was put into the form (G16b)', () => {
  const PLAIN = 'An item in this GRN was deleted. Remove that line, then save again.';
  const itemFk = 'insert or update on table "goodsreceived_trl" violates foreign key constraint "goodsreceived_trl_item_id_fkey"';

  it('create: the refusal of save_grn is worded plainly', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, message: `Invalid reference: ${itemFk}` }, error: null });
    expect(await createGRN({ header, items })).toMatchObject({ success: false, error: PLAIN });
  });

  it('edit: the foreign key error of update_grn is worded plainly', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23503', message: itemFk, details: 'Key (item_id)=(x) is not present in table "items".' } });
    expect(await updateGRN(GRN_ID, { header, items: [{ ...items[0], grn_trl_id: LINE_ID, stock: 10 }] })).toMatchObject({ success: false, error: PLAIN });
  });

  it('edit: a line that cannot be removed keeps the shared text, not this one', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'update or delete on table "goodsreceived_trl" violates foreign key constraint "stock_movements_gr_trl_id_fkey" on table "stock_movements"' },
    });
    const result = await updateGRN(GRN_ID, { header, items: [{ ...items[0], grn_trl_id: LINE_ID, stock: 10 }] });
    expect(result.success).toBe(false);
    expect(result.error).not.toBe(PLAIN);
  });
});
