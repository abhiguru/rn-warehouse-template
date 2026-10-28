/** A dispatch save refused with NUMBER_FORMAT (backend migration 127) comes back as a worded refusal, not as a failure to retry. */
import { createDispatch, updateDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: jest.fn(async () => 'key-fictional') }));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));

const payload = {
  header: {
    disp_no: 'X-1', disp_date: '2026-10-01', registration: 'GJ01AB1234', customer_id: 'c1', customer_name: 'Fictional Traders',
    supervisor_id: 's1', supervisor_name: 'Fictional Supervisor', note: '',
  },
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
  images: [],
} as unknown as Parameters<typeof createDispatch>[0];
const refusal = (pattern: string | null) => ({
  data: { success: false, error_code: 'WH409', reason: 'NUMBER_FORMAT', number: 'X-1', document_type: 'dispatch', pattern, error: 'This number does not follow this facility\'s numbering (I####)', message: 'This number does not follow this facility\'s numbering (I####)' },
  error: null,
});

beforeEach(() => {
  mockRpc.mockReset();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('a create refused for its format returns the reason and the pattern, and is sent once', async () => {
  mockRpc.mockResolvedValue(refusal('I####'));
  const result = await createDispatch({ ...payload, submissionNonce: 'form-a' });
  expect(result).toMatchObject({ success: false, reason: 'NUMBER_FORMAT', refusal: { reason: 'NUMBER_FORMAT', fields: { pattern: 'I####', number: 'X-1' } } });
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

it('an edit that changes the number is refused the same way', async () => {
  mockRpc.mockResolvedValue(refusal('I####'));
  const result = await updateDispatch('d1', payload);
  expect(result).toMatchObject({ success: false, reason: 'NUMBER_FORMAT', refusal: { fields: { pattern: 'I####' } } });
});
