/**
 * A dispatch create or save sent again after a lost answer goes out on the CURRENT authenticated client, not on the one
 * captured when the call began. A client holds the sign-in token it was made with, and the check before a resend can last
 * long enough for the token to be renewed or to expire; a resend on the old client would carry the old token each time.
 * A client that cannot be got is the failure of that send, which leaves the attempt unsettled: back to the check.
 */
import { AppError } from '@/utils/appError';
import { createDispatch, updateDispatch } from '../dispatchFormService';

type Client = { token: string; rpc: jest.Mock };
const clients: Client[] = [];
const mockGetClient = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: () => mockGetClient(),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: jest.fn(async () => 'key-form-a') }));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => {}),
  forgetUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));
const mockCheckSubmission = jest.fn();
jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  isLostAnswer: (error: { message?: string; code?: string }) => !error.code && /Network request failed/i.test(error.message ?? ''),
  checkSubmission: (...args: unknown[]) => mockCheckSubmission(...args),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));

const header = {
  disp_no: 'D0042',
  disp_date: '2026-10-21',
  registration: 'GJ01AB1234',
  customer_id: 'c1',
  customer_name: 'Green Valley Traders',
  supervisor_id: 's1',
  supervisor_name: 'Fictional Supervisor',
  note: '',
};
const payload = { header, items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }], images: [], submissionNonce: 'form-a' } as unknown as Parameters<typeof createDispatch>[0];
const updatePayload = payload as unknown as Parameters<typeof updateDispatch>[1];
const lost = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
const saved = { data: { success: true, dispatch_id: 'd1' }, error: null };

/** A client made with `token`; each call of the factory is one `getAuthenticatedClient()`. */
function clientWith(token: string, ...answers: unknown[]): Client {
  const rpc = jest.fn();
  for (const answer of answers) rpc.mockResolvedValueOnce(answer);
  const client = { token, rpc };
  clients.push(client);
  return client;
}

beforeEach(() => {
  clients.length = 0;
  mockGetClient.mockReset();
  mockCheckSubmission.mockReset();
  mockCheckSubmission.mockResolvedValue({ found: false });
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe.each([
  ['create', 'create_dispatch_with_stock_check', () => createDispatch(payload)],
  ['save', 'update_dispatch_smart', () => updateDispatch('d1', updatePayload)],
] as const)('a dispatch %s sent again after a lost answer', (_name, rpcName, run) => {
  it('goes out on the client the session has now, not on the one the call began with', async () => {
    const before = clientWith('token-before-renewal', lost);
    const after = clientWith('token-after-renewal', saved);
    mockGetClient.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    const result = await run();

    expect(result.success).toBe(true);
    expect(before.rpc).toHaveBeenCalledTimes(1);
    expect(after.rpc).toHaveBeenCalledTimes(1);
    expect(after.rpc.mock.calls[0][0]).toBe(rpcName);
    // The identical request: the same arguments, under the same request code.
    expect(after.rpc.mock.calls[0][1]).toEqual(before.rpc.mock.calls[0][1]);
    expect(mockGetClient).toHaveBeenCalledTimes(2);
  });

  it('asks for a current client on every resend, however many there are', async () => {
    const first = clientWith('token-1', lost);
    const second = clientWith('token-2', lost);
    const third = clientWith('token-3', saved);
    mockGetClient.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third);

    const result = await run();

    expect(result.success).toBe(true);
    expect([first, second, third].map((client) => client.rpc.mock.calls.length)).toEqual([1, 1, 1]);
    expect(mockCheckSubmission).toHaveBeenCalledTimes(2);
  });

  it('a client that cannot be got leaves the attempt unsettled: back to the check, and the next resend goes out', async () => {
    const first = clientWith('token-1', lost);
    const later = clientWith('token-3', saved);
    mockGetClient
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new AppError('NETWORK', 'Network request failed: session refresh unavailable'))
      .mockResolvedValueOnce(later);
    const onLostAnswer = jest.fn();

    const result = await (rpcName === 'update_dispatch_smart' ? updateDispatch('d1', updatePayload, { onLostAnswer }) : createDispatch(payload, { onLostAnswer }));

    // Never reported to the person as a failure: the form stays locked until the server's answer is known.
    expect(result.success).toBe(true);
    expect(mockCheckSubmission).toHaveBeenCalledTimes(2);
    expect(later.rpc).toHaveBeenCalledTimes(1);
    expect(first.rpc).toHaveBeenCalledTimes(1);
  });

  it('a first send is not changed: one client, got before anything is sent', async () => {
    const only = clientWith('token-only', saved);
    mockGetClient.mockResolvedValueOnce(only);

    await run();

    expect(mockGetClient).toHaveBeenCalledTimes(1);
    expect(only.rpc).toHaveBeenCalledTimes(1);
    expect(mockCheckSubmission).not.toHaveBeenCalled();
  });
});
