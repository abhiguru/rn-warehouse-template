/**
 * An empty or non-JSON HTTP 200 to a dispatch write is a lost answer: the server is asked about the request key, as
 * for a timeout, and the identical request is sent again only when it holds nothing.
 */
import { createDispatch, updateDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: async () => 'warehouse-dispatch-fictional-key' }));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => {}),
  forgetUnfinishedSave: jest.fn(async () => {}),
  releaseUnfinishedSave: jest.fn(),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));
const mockCheck = jest.fn();
// The real isLostAnswer: only the waiting and the question to the server are replaced.
jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  checkSubmission: (...args: unknown[]) => mockCheck(...args),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));

const header = {
  disp_no: 'D0042', disp_date: '2026-10-21', registration: 'gj01ab1234', customer_id: 'c1', customer_name: 'Green Valley Traders',
  supervisor_id: 's1', supervisor_name: 'Fictional Supervisor', note: '',
};
const create = { header, items: [{ grnItems_id: 'lot', disp_quantity: 2 }], images: [], submissionNonce: 'form-a' } as never;
const update = { header, items: [{ grnItems_id: 'lot', disp_quantity: 2 }] } as never;
const emptyOk = { data: null, error: null, status: 200 };
const notJson = { data: null, error: { message: '<html>Maintenance</html>' }, status: 200 };
const saved = { data: { success: true, dispatch_id: 'd1' }, error: null, status: 200 };

beforeEach(() => {
  mockRpc.mockReset();
  mockCheck.mockReset();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe.each([
  ['an empty 200', emptyOk],
  ['a non-JSON 200', notJson],
])('%s', (_name, bad) => {
  it('create: asks the server by the request key, then sends the same request again when nothing is stored', async () => {
    mockRpc.mockResolvedValueOnce(bad).mockResolvedValueOnce(saved);
    mockCheck.mockResolvedValue({ found: false });
    const result = await createDispatch(create);
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[1][1]).toBe(mockRpc.mock.calls[0][1]);
    expect(result).toMatchObject({ success: true, dispatch_id: 'd1' });
  });

  it('update: uses the stored answer when the server holds one, and sends nothing again', async () => {
    mockRpc.mockResolvedValueOnce(bad);
    mockCheck.mockResolvedValue({ found: true, response: { success: true, dispatch_id: 'd9' } });
    const result = await updateDispatch('d9', update);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, dispatch_id: 'd9' });
  });
});
