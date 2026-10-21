/**
 * createDispatch writes the create down before the request goes out and takes the note away once the server's answer is
 * known (src/services/unfinishedSaves.ts): saved, refused, found stored, or never sent. It keeps the note while the answer
 * is unknown (the person left, or the number was refused twice after a lost answer), so that the next start of the app
 * can ask the server what became of the request.
 */
import { forgetUnfinishedSave, rememberUnfinishedSave } from '@/services/unfinishedSaves';
import { createDispatch } from '../dispatchFormService';

const order: string[] = [];
let mockAnswers: unknown[] = [];
const mockRpc = jest.fn(async (name: string, ..._rest: unknown[]) => {
  order.push(`rpc:${name}`);
  return mockAnswers.shift() ?? { data: null, error: { message: 'unexpected call' } };
});
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: (name: string, args: unknown) => mockRpc(name, args) }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: jest.fn(async (_operation: string, body: { nonce?: string }) => `key-${body.nonce ?? 'none'}`),
}));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => { order.push('remember'); }),
  forgetUnfinishedSave: jest.fn(async () => { order.push('forget'); }),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));
const mockCheckSubmission = jest.fn();
jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  isLostAnswer: (error: { message?: string; code?: string }) => !error.code && /Network request failed|TimeoutError|dropped/i.test(error.message ?? ''),
  checkSubmission: (...args: unknown[]) => mockCheckSubmission(...args),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));

const header = {
  disp_no: 'D0042',
  disp_date: '2026-10-01',
  registration: 'GJ01AB1234',
  customer_id: 'c1',
  customer_name: 'Green Valley Traders',
  supervisor_id: 's1',
  supervisor_name: 'Fictional Supervisor',
  note: '',
};
const payload = {
  header,
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
  images: [],
  submissionNonce: 'form-a',
} as unknown as Parameters<typeof createDispatch>[0];
const KEY = 'key-form-a';
const lost = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
const saved = { data: { success: true, dispatch_id: 'd1' }, error: null };

beforeEach(() => {
  order.length = 0;
  mockAnswers = [];
  mockRpc.mockClear();
  mockCheckSubmission.mockReset();
  jest.mocked(rememberUnfinishedSave).mockClear();
  jest.mocked(forgetUnfinishedSave).mockClear();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('before the request goes out', () => {
  it('writes down the kind, the code that is sent, the number and the customer, then sends', async () => {
    mockAnswers = [saved];
    await createDispatch(payload);

    expect(rememberUnfinishedSave).toHaveBeenCalledTimes(1);
    expect(rememberUnfinishedSave).toHaveBeenCalledWith({ kind: 'dispatch', requestKey: KEY, number: 'D0042', customerName: 'Green Valley Traders' });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_idempotency_key: KEY });
    expect(order.slice(0, 2)).toEqual(['remember', 'rpc:create_dispatch_with_stock_check']);
  });

  it('does it for a dispatch made from an order as well', async () => {
    mockAnswers = [saved];
    await createDispatch({ ...payload, header: { ...header, source_order_id: 'o1', source_order_no: 'O0007' } as never });

    expect(rememberUnfinishedSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dispatch', number: 'D0042' }));
  });
});

describe('once the answer is known', () => {
  it('saved: the note is taken away', async () => {
    mockAnswers = [saved];
    const result = await createDispatch(payload);
    expect(result.success).toBe(true);
    expect(order).toEqual(['remember', 'rpc:create_dispatch_with_stock_check', 'forget']);
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it.each([
    ['a refusal', { data: { success: false, error: 'Insufficient stock' }, error: null }],
    ['the number being taken', { data: { success: false, reason: 'NUMBER_TAKEN', number: 'D0042' }, error: null }],
    ['a statement timeout (nothing was saved)', { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }],
    ['a failure before the request left the phone', { data: null, error: { message: 'Error: fetch failed: connect timed out', code: '' } }],
  ])('%s: the note is taken away', async (_name, answer) => {
    mockAnswers = [answer];
    const result = await createDispatch(payload);
    expect(result.success).toBe(false);
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it('a lost answer that the check finds stored: the note is taken away, and nothing is sent again', async () => {
    mockAnswers = [lost];
    mockCheckSubmission.mockResolvedValue({ found: true, response: { success: true, dispatch_id: 'saved-1' } });

    const result = await createDispatch(payload);

    expect(result).toMatchObject({ success: true, dispatch_id: 'saved-1' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it('a lost answer, nothing found, and the identical request saved: the note is taken away', async () => {
    mockAnswers = [lost, saved];
    mockCheckSubmission.mockResolvedValue({ found: false });

    const result = await createDispatch(payload);

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(rememberUnfinishedSave).toHaveBeenCalledTimes(1);
    expect(forgetUnfinishedSave).toHaveBeenCalledTimes(1);
  });
});

describe('while the answer is unknown', () => {
  it('the person leaves during the check: the note stays', async () => {
    mockAnswers = [lost];
    const controller = new AbortController();
    mockCheckSubmission.mockImplementation(async () => {
      controller.abort();
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    });

    const result = await createDispatch(payload, { signal: controller.signal });

    expect(result).toMatchObject({ success: false, aborted: true });
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
  });

  it('the person left while the first send was on its way and its answer was lost: the note stays', async () => {
    const controller = new AbortController();
    mockRpc.mockImplementationOnce(async (name: string) => {
      order.push(`rpc:${name}`);
      controller.abort();
      return lost;
    });

    const result = await createDispatch(payload, { signal: controller.signal });

    expect(result).toMatchObject({ success: false, aborted: true, maybeSaved: true });
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
  });

  it('the identical request is refused for the number twice after a lost answer: the note stays', async () => {
    const taken = { data: { success: false, reason: 'NUMBER_TAKEN', number: 'D0042' }, error: null };
    mockAnswers = [lost, taken, taken];
    mockCheckSubmission.mockResolvedValue({ found: false });

    const result = await createDispatch(payload);

    expect(result).toMatchObject({ success: false, numberMaybeSaved: true });
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
  });
});
