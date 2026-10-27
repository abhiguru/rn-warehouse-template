import { createDispatch } from '../dispatchFormService';
import { t } from '@/i18n';
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
// The check itself is a stand-in; the question is whether the service goes to it.
const mockCheckSubmission = jest.fn();
jest.mock(
  '@/utils/lostAnswer',
  () => ({
    ...jest.requireActual('@/utils/lostAnswer'),
    // isLostAnswer is the real one here: the point is how it reads the gateway's answers.
    checkSubmission: (...args: unknown[]) => mockCheckSubmission(...args),
    waitForServer: jest.fn(async () => {}),
  })
);
// The wait for the server reads the network state from NetInfo (a native module): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));

const payload = {
  header: {
    disp_no: 'I0042', disp_date: '2026-10-01', registration: 'GJ01AB1234', customer_id: 'c1', customer_name: 'Fictional Traders',
    supervisor_id: 's1', supervisor_name: 'Fictional Supervisor', note: '',
  },
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
  images: [],
} as unknown as Parameters<typeof createDispatch>[0];
const upgrading = {
  data: null,
  error: { code: 'upgrading', message: "The facility's server is being updated. Try again in a few minutes." },
  status: 503,
};
const badGateway = { data: null, error: { code: '', message: 'An invalid response was received from the upstream server' }, status: 502 };

beforeEach(() => {
  mockRpc.mockReset();
  mockCheckSubmission.mockReset();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('a dispatch save while the facility\'s server is being upgraded', () => {
  it('is NOT a lost answer: no check is made, nothing is sent again, and the person is told the server is being updated', async () => {
    mockRpc.mockResolvedValue(upgrading);
    const onLostAnswer = jest.fn();
    const result = await createDispatch({ ...payload, submissionNonce: 'form-a' }, { onLostAnswer });
    expect(result.success).toBe(false);
    expect(result).toMatchObject({ success: false, error: t('components.upgrading.message'), message: t('components.upgrading.message') });
    expect(onLostAnswer).not.toHaveBeenCalled();
    expect(mockCheckSubmission).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('a gateway that gave up (502) is still a lost answer, and goes to the check', async () => {
    mockRpc.mockResolvedValueOnce(badGateway);
    mockCheckSubmission.mockResolvedValue({ found: false });
    mockRpc.mockResolvedValueOnce({ data: { success: true, dispatch_id: 'saved-1' }, error: null });
    await createDispatch({ ...payload, submissionNonce: 'form-a' });
    expect(mockCheckSubmission).toHaveBeenCalledTimes(1);
  });
});
