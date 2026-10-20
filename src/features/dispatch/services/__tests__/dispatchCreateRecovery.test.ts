/**
 * Creating and saving a dispatch:
 * - the form's own id is part of the idempotency key and is never sent (review 2026-10-20, A3);
 * - a create or save whose answer was lost asks the server about THAT attempt by its request code (owner rule D22):
 *   found, and the stored answer is the answer; not found, and the identical request is sent again with the same code.
 *   Nothing is looked up by number, customer or lines;
 * - another dispatch holding the number is named as such, by the server's reason or by the unique-key error of an
 *   older server (M4);
 * - the answer says how many lines of the source order are still open (A7).
 */
import { createDispatch, updateDispatch } from '../dispatchFormService';
import { submissionIdempotencyKey } from '@/utils/submissionIdempotency';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: jest.fn(async (_operation: string, body: { nonce?: string }) => `key-${body.nonce ?? 'none'}`),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));
// The shared helper (src/utils/lostAnswer.ts) is tested with its own file; here only what the service asks of it.
const mockCheckSubmission = jest.fn();
jest.mock(
  '@/utils/lostAnswer',
  () => ({
    // A network failure or a timeout after the request went out; an answer with a code (57014 included) is not one.
    isLostAnswer: (error: { message?: string; code?: string }) => !error.code && /Network request failed|TimeoutError|dropped/i.test(error.message ?? ''),
    checkSubmission: (...args: unknown[]) => mockCheckSubmission(...args),
    waitForServer: jest.fn(async () => {}),
  }),
  { virtual: true }
);

const header = {
  disp_no: 'I0042',
  disp_date: '2026-10-01',
  registration: 'GJ01AB1234',
  customer_id: 'c1',
  customer_name: 'Fictional Traders',
  supervisor_id: 's1',
  supervisor_name: 'Fictional Supervisor',
  note: '',
};
const payload = {
  header,
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
  images: [],
} as unknown as Parameters<typeof createDispatch>[0];
const updatePayload = payload as unknown as Parameters<typeof updateDispatch>[1];

const names = () => mockRpc.mock.calls.map(([name]) => name);
const lost = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };

/** The create answers `createAnswer`. */
function server(createAnswer: unknown) {
  mockRpc.mockImplementation(async () => createAnswer);
}

beforeEach(() => {
  mockRpc.mockReset();
  mockCheckSubmission.mockReset();
  jest.mocked(submissionIdempotencyKey).mockClear();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("the form's id", () => {
  it('is hashed into the key and is not part of the request', async () => {
    server({ data: { success: true, dispatch_id: 'd1' }, error: null });

    await createDispatch({ ...payload, submissionNonce: 'form-a' });

    expect(submissionIdempotencyKey).toHaveBeenCalledWith('dispatch', expect.objectContaining({ nonce: 'form-a' }));
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('create_dispatch_with_stock_check');
    expect(args.p_idempotency_key).toBe('key-form-a');
    expect(Object.keys(args)).not.toContain('nonce');
    expect(Object.keys(args.p_dispatch_data)).not.toContain('nonce');
  });

  it('gives two forms with the same fields two keys', async () => {
    server({ data: { success: true, dispatch_id: 'd1' }, error: null });

    await createDispatch({ ...payload, submissionNonce: 'form-a' });
    await createDispatch({ ...payload, submissionNonce: 'form-b' });

    expect(mockRpc.mock.calls[0][1].p_idempotency_key).toBe('key-form-a');
    expect(mockRpc.mock.calls[1][1].p_idempotency_key).toBe('key-form-b');
  });
});

describe('a create whose answer was lost', () => {
  const stored = { success: true, dispatch_id: 'saved-1', order_lines_left: 2, invoice_data: { id: 'inv-1' } };

  it('goes on with the stored answer when the server has the attempt, and sends nothing again', async () => {
    server(lost);
    mockCheckSubmission.mockResolvedValue({ found: true, response: stored });
    const onLostAnswer = jest.fn();

    const result = await createDispatch({ ...payload, submissionNonce: 'form-a' }, { onLostAnswer });

    expect(result).toMatchObject({ success: true, dispatch_id: 'saved-1', order_lines_left: 2 });
    expect(names()).toEqual(['create_dispatch_with_stock_check']);
    expect(onLostAnswer).toHaveBeenCalledTimes(1);
    // The server is asked about this attempt's own request code, and when the request was sent.
    expect(mockCheckSubmission).toHaveBeenCalledTimes(1);
    expect(mockCheckSubmission.mock.calls[0][0]).toBe('key-form-a');
    expect(mockCheckSubmission.mock.calls[0][1]).toEqual(expect.any(Number));
  });

  it('uploads the photos of the form when the stored answer says the dispatch is saved', async () => {
    const { uploadDeferredDispatchImages } = jest.requireMock('../dispatchImageService');
    uploadDeferredDispatchImages.mockResolvedValue({ success: true, uploadedCount: 1, failed: [] });
    server(lost);
    mockCheckSubmission.mockResolvedValue({ found: true, response: stored });

    await createDispatch({ ...payload, images: [{ id: 'img-1' }] } as unknown as Parameters<typeof createDispatch>[0]);

    expect(uploadDeferredDispatchImages).toHaveBeenCalledWith('saved-1', [{ id: 'img-1' }]);
  });

  it('sends the identical request once more, with the same code, when the server does not have it', async () => {
    mockRpc.mockResolvedValueOnce(lost).mockResolvedValueOnce({ data: { success: true, dispatch_id: 'saved-2' }, error: null });
    mockCheckSubmission.mockResolvedValue({ found: false });

    const result = await createDispatch({ ...payload, submissionNonce: 'form-a' });

    expect(result).toMatchObject({ success: true, dispatch_id: 'saved-2' });
    expect(names()).toEqual(['create_dispatch_with_stock_check', 'create_dispatch_with_stock_check']);
    expect(mockRpc.mock.calls[1][1]).toEqual(mockRpc.mock.calls[0][1]);
    expect(mockRpc.mock.calls[1][1].p_idempotency_key).toBe('key-form-a');
    // The key was made once, for the attempt.
    expect(submissionIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('handles the answer of the resent request as any answer: a refusal is a refusal', async () => {
    mockRpc.mockResolvedValueOnce(lost).mockResolvedValueOnce({ data: { success: false, error: 'Insufficient stock for one or more items' }, error: null });
    mockCheckSubmission.mockResolvedValue({ found: false });

    const result = await createDispatch(payload);

    expect(result.success).toBe(false);
    expect(result.aborted).toBeUndefined();
    expect(names()).toHaveLength(2);
  });

  it('repeats the check and the resend while the answers are lost', async () => {
    mockRpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(lost).mockResolvedValueOnce({ data: { success: true, dispatch_id: 'saved-3' }, error: null });
    mockCheckSubmission.mockResolvedValue({ found: false });
    const onLostAnswer = jest.fn();

    const result = await createDispatch(payload, { onLostAnswer });

    expect(result).toMatchObject({ success: true, dispatch_id: 'saved-3' });
    expect(names()).toHaveLength(3);
    expect(mockCheckSubmission).toHaveBeenCalledTimes(2);
    expect(onLostAnswer).toHaveBeenCalledTimes(2);
  });

  it('is recognised from a timeout as well as from a dropped connection', async () => {
    server({ data: null, error: { message: 'TimeoutError: Request timeout', code: '' } });
    mockCheckSubmission.mockResolvedValue({ found: true, response: stored });
    expect((await createDispatch(payload)).success).toBe(true);
  });

  it('stops, and sends nothing again, when the person leaves meanwhile', async () => {
    const controller = new AbortController();
    server(lost);
    mockCheckSubmission.mockImplementation(async () => {
      controller.abort();
      return { found: false };
    });

    const result = await createDispatch(payload, { signal: controller.signal });

    expect(result).toMatchObject({ success: false, aborted: true });
    expect(names()).toEqual(['create_dispatch_with_stock_check']);
  });

  it('never looks the dispatch up by number, customer or lines', async () => {
    server(lost);
    mockCheckSubmission.mockResolvedValue({ found: true, response: stored });

    await createDispatch(payload);

    expect(names()).not.toContain('check_dispatch_exists');
  });

  it('is not asked about when the server answered with a refusal', async () => {
    server({ data: { success: false, error: 'Insufficient stock for one or more items' }, error: null });

    const result = await createDispatch(payload);

    expect(result.success).toBe(false);
    expect(names()).toEqual(['create_dispatch_with_stock_check']);
    expect(mockCheckSubmission).not.toHaveBeenCalled();
  });

  it('is not a lost answer when the server cancelled the statement (57014): nothing was saved', async () => {
    server({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } });
    const onLostAnswer = jest.fn();

    const result = await createDispatch(payload, { onLostAnswer });

    expect(result.success).toBe(false);
    expect(onLostAnswer).not.toHaveBeenCalled();
    expect(mockCheckSubmission).not.toHaveBeenCalled();
    expect(names()).toHaveLength(1);
  });
});

describe('a save of an edit', () => {
  const lostSave = lost;

  it('carries a request code of its own, and asks the server about it when the answer is lost', async () => {
    server(lostSave);
    mockCheckSubmission.mockResolvedValue({ found: true, response: { success: true, dispatch_id: 'd1' } });
    const onLostAnswer = jest.fn();

    const result = await updateDispatch('d1', updatePayload, { onLostAnswer });

    expect(result).toMatchObject({ success: true, dispatch_id: 'd1' });
    const sent = mockRpc.mock.calls[0][1];
    expect(sent.p_dispatch_data.request_key).toMatch(/^warehouse-dispatch-update-/);
    expect(mockCheckSubmission.mock.calls[0][0]).toBe(sent.p_dispatch_data.request_key);
    expect(onLostAnswer).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['update_dispatch_smart']);
  });

  it('sends the identical request with the same code once more when the server does not have it', async () => {
    mockRpc.mockResolvedValueOnce(lostSave).mockResolvedValueOnce({ data: { success: true, dispatch_id: 'd1' }, error: null });
    mockCheckSubmission.mockResolvedValue({ found: false });

    const result = await updateDispatch('d1', updatePayload);

    expect(result.success).toBe(true);
    expect(names()).toEqual(['update_dispatch_smart', 'update_dispatch_smart']);
    expect(mockRpc.mock.calls[1][1]).toEqual(mockRpc.mock.calls[0][1]);
  });

  it('stops when the person leaves meanwhile', async () => {
    const controller = new AbortController();
    server(lostSave);
    mockCheckSubmission.mockImplementation(async () => {
      controller.abort();
      return { found: false };
    });

    expect(await updateDispatch('d1', updatePayload, { signal: controller.signal })).toMatchObject({ success: false, aborted: true });
    expect(names()).toHaveLength(1);
  });

  it('is not a lost answer when the server cancelled the statement (57014)', async () => {
    server({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } });

    expect((await updateDispatch('d1', updatePayload)).success).toBe(false);
    expect(mockCheckSubmission).not.toHaveBeenCalled();
    expect(names()).toHaveLength(1);
  });
});

describe('when another dispatch holds the number', () => {
  const taken = { data: { success: false, error_code: 'WH409', reason: 'NUMBER_TAKEN', number: 'I0042', error: 'Dispatch number I0042 is already used.' }, error: null };
  const takenByOldServer = {
    data: { success: false, error_code: '23505', error: 'duplicate key value violates unique constraint "dispatch_disp_no_key"' },
    error: null,
  };

  it.each([['the server names it', taken], ['an older server gives the unique-key error', takenByOldServer]])(
    'a create is refused for the number: %s',
    async (_how, answer) => {
      server(answer);

      const result = await createDispatch(payload);

      expect(result).toMatchObject({ success: false, reason: 'NUMBER_TAKEN', number: 'I0042' });
      expect(names()).toEqual(['create_dispatch_with_stock_check']);
    }
  );

  it('a save of an edit is refused the same way', async () => {
    server(taken);
    expect(await updateDispatch('d1', updatePayload)).toMatchObject({ success: false, reason: 'NUMBER_TAKEN', number: 'I0042' });
  });

  it('a unique-key error of another key is not about the number', async () => {
    server({ data: { success: false, error_code: '23505', error: 'duplicate key value violates unique constraint "something_else_key"' }, error: null });
    expect((await createDispatch(payload)).reason).toBeUndefined();
  });
});

describe('the lines of the source order that are still open', () => {
  it.each([[0, 0], [3, 3]])('passes %s on as the server counted it', async (sent, expected) => {
    server({ data: { success: true, dispatch_id: 'd1', order_lines_left: sent }, error: null });
    expect((await createDispatch(payload)).order_lines_left).toBe(expected);
  });

  it('is null when the dispatch has no order, and when an older server does not say', async () => {
    server({ data: { success: true, dispatch_id: 'd1', order_lines_left: null }, error: null });
    expect((await createDispatch(payload)).order_lines_left).toBeNull();
    server({ data: { success: true, dispatch_id: 'd1' }, error: null });
    expect((await createDispatch(payload)).order_lines_left).toBeNull();
  });
});
