/**
 * One request key per dispatch edit: a second Save press with the same figures after a lost answer sends the same key
 * (the server answers from the stored result, no "someone else changed this dispatch"); a changed form or a definite
 * answer gives a new key.
 */
import { updateDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockCounter}` }));
jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  isLostAnswer: (error: { message?: string; code?: string }) => !error.code && /Network request failed/i.test(error.message ?? ''),
  checkSubmission: jest.fn(),
  waitForServer: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));

const header = {
  disp_no: 'I0042', disp_date: '2026-10-01', registration: 'GJ01AB1234', customer_id: 'c1',
  customer_name: 'Fictional Traders', supervisor_id: 's1', supervisor_name: 'Fictional Supervisor', note: '',
};
const payload = { header, items: [{ grnItems_id: 'lot', disp_quantity: 2 }], expectedUpdatedAt: '2026-10-01T10:00:00Z' } as unknown as Parameters<typeof updateDispatch>[1];
const lost = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
const saved = { data: { success: true, dispatch_id: 'd1' }, error: null };
const keyOf = (n: number) => mockRpc.mock.calls[n][1].p_dispatch_data.request_key as string;
const leftAfterLost = () => {
  const controller = new AbortController();
  controller.abort();
  return { signal: controller.signal };
};

beforeEach(() => {
  mockRpc.mockReset();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the request key of a dispatch edit', () => {
  it('two presses with the same figures after a lost answer send the same key; a definite answer ends it', async () => {
    mockRpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(saved).mockResolvedValueOnce(saved);

    const first = await updateDispatch('d-key-1', payload, leftAfterLost());
    expect(first).toMatchObject({ aborted: true, maybeSaved: true });
    await updateDispatch('d-key-1', payload);
    expect(keyOf(1)).toBe(keyOf(0));

    // The second press was answered: the next save is a new request.
    await updateDispatch('d-key-1', payload);
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it('a change to the form gives a new key', async () => {
    mockRpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(saved);

    await updateDispatch('d-key-2', payload, leftAfterLost());
    await updateDispatch('d-key-2', { ...payload, header: { ...header, note: 'changed' } } as never);

    expect(keyOf(1)).not.toBe(keyOf(0));
  });
});
