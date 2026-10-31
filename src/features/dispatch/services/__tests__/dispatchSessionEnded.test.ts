/** A dispatch save answered "Session expired or revoked" (403) ends the sign-in, so the reason is kept and shown. */
import { createDispatch, updateDispatch } from '../dispatchFormService';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/utils/serviceErrorHandler', () => ({ ...jest.requireActual('@/utils/serviceErrorHandler'), handleGlobalAuthError: jest.fn() }));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: async () => 'warehouse-dispatch-fictional-key' }));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));

const payload = {
  header: { disp_no: 'FXF901', disp_date: '2026-10-01', registration: 'TEST FIXTURE', customer_name: 'Fictional', customer_mobile: '', note: '' },
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
} as unknown as Parameters<typeof createDispatch>[0];
const ended = { data: null, error: { message: 'Session expired or revoked', code: '42501' }, status: 403 };

beforeEach(() => {
  mockRpc.mockReset();
  jest.mocked(handleGlobalAuthError).mockClear();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it.each([
  ['create', () => createDispatch(payload)],
  ['update', () => updateDispatch('fictional-dispatch-id', payload as unknown as Parameters<typeof updateDispatch>[1])],
])('%s answered 403 reports the ended session', async (_name, save) => {
  mockRpc.mockResolvedValue(ended);
  await save().catch(() => undefined);
  expect(handleGlobalAuthError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Session expired or revoked' }));
});
