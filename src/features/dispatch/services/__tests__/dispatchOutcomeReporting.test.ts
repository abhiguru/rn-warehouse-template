/**
 * What the dispatch save reports to error reporting (src/utils/reportOutcome.ts): one redacted line per outcome, of the
 * kind that fits: a refusal the form words itself, a refusal that is thrown, a failure, a lost answer. Only codes and
 * the request code leave; never a message or a name.
 */
import { createDispatch, updateDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: jest.fn(async () => 'warehouse-dispatch-0123abcd'),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));
const mockCheckSubmission = jest.fn();
jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  isLostAnswer: (error: { message?: string; code?: string }) => !error.code && /Network request failed/i.test(error.message ?? ''),
  checkSubmission: (...args: unknown[]) => mockCheckSubmission(...args),
  waitForServer: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
const mockSentryMessage = jest.fn();
jest.mock('@sentry/react-native', () => ({ captureMessage: (...args: unknown[]) => mockSentryMessage(...args) }));
jest.mock('@/config/lanTransport', () => ({ getConnectionPath: () => 'public' }));

const header = {
  disp_no: 'D0042',
  disp_date: '2026-10-01',
  registration: 'GJ01AB1234',
  customer_id: 'c1',
  customer_name: 'Fictional Traders',
  supervisor_id: 's1',
  supervisor_name: 'Fictional Supervisor',
  note: '',
};
const createPayload = { header, items: [{ grnItems_id: 'lot', disp_quantity: 2 }], images: [] } as unknown as Parameters<typeof createDispatch>[0];
const updatePayload = createPayload as unknown as Parameters<typeof updateDispatch>[1];

const messages = () => mockSentryMessage.mock.calls.map(([text]) => text as string);
const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

beforeEach(() => {
  mockRpc.mockReset();
  mockCheckSubmission.mockReset();
  mockSentryMessage.mockReset();
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@errors.example.org/1';
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
});

describe.each([
  ['createDispatch', (): Promise<unknown> => createDispatch(createPayload)],
  ['updateDispatch', (): Promise<unknown> => updateDispatch('d1', updatePayload)],
])('%s', (_name, save) => {
  it('reports save_refused for a refusal the form words itself', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, reason: 'DISPATCH_DATE_FUTURE', message: 'Fictional Traders cannot' }, error: null });
    await save();
    expect(messages()).toEqual(['outcome save_refused code=DISPATCH_DATE_FUTURE path=public']);
  });

  it('reports save_refused for the number taken', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, reason: 'NUMBER_TAKEN' }, error: null });
    await save();
    expect(messages()).toEqual(['outcome save_refused code=NUMBER_TAKEN path=public']);
  });

  it('reports save_refused, not save_failed, for a refusal that is thrown', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, reason: 'INSUFFICIENT_STOCK', error: 'insufficient stock for Fictional Traders' }, error: null });
    await save();
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatch(/^outcome save_refused code=INSUFFICIENT_STOCK path=public key=/);
    expect(messages()[0]).not.toMatch(/Fictional/);
  });

  it('reports save_failed for a failure of the call', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom for Fictional Traders', code: 'XX000' } });
    await save();
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatch(/^outcome save_failed path=public key=warehouse-dispatch/);
    expect(messages()[0]).not.toMatch(/Fictional|boom/);
  });

  it('reports lost_answer with the request code when the answer is lost', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
    mockCheckSubmission.mockResolvedValue({ found: true, response: { success: true, dispatch_id: 'd1' } });
    await save();
    const lostLine = messages().filter(text => text.startsWith('outcome lost_answer'));
    expect(lostLine).toHaveLength(1);
    expect(lostLine[0]).toMatch(/^outcome lost_answer path=public key=(warehouse-dispatch-0123abcd|warehouse-dispatch-update-fictional-uuid)$/);
  });
});
