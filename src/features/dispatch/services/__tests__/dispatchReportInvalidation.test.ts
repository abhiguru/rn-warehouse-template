/**
 * A saved or deleted dispatch marks every report out of date, once; a failed or refused
 * one does not (review 2026-10-13, SR-10).
 */
import { invalidateReportQueries } from '@/lib/queryClient';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { createDispatch, deleteDispatch, updateDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: async () => 'warehouse-dispatch-fictional-key' }));
jest.mock('@/utils/serviceErrorHandler', () => ({
  executeRPC: jest.fn(),
  createErrorResponse: jest.fn((_error: unknown, message: string) => ({ success: false, error: message })),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));

const invalidate = jest.mocked(invalidateReportQueries);
const rpcHelper = jest.mocked(executeRPC);
const payload = {
  header: {
    disp_no: 'D0005',
    disp_date: '2026-10-01',
    registration: 'GJ01AB1234',
    customer_id: 'c2',
    customer_name: 'Green Valley Traders',
    supervisor_id: 's1',
    supervisor_name: 'Ravi Example',
    note: '',
  },
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
} as unknown as Parameters<typeof createDispatch>[0];
const updatePayload = payload as unknown as Parameters<typeof updateDispatch>[1];

beforeEach(() => {
  mockRpc.mockReset();
  rpcHelper.mockReset();
  invalidate.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const failures = [
  ['a transport error', { data: null, error: { message: 'Network request failed' } }],
  ['success: false', { data: { success: false, error: 'Not enough stock' }, error: null }],
] as const;

describe('createDispatch', () => {
  it('marks the reports out of date once after the save', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, dispatch_id: 'd1' }, error: null });
    expect((await createDispatch(payload)).success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(failures)('marks nothing after %s', async (_name, answer) => {
    mockRpc.mockResolvedValue(answer);
    expect((await createDispatch(payload)).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('updateDispatch', () => {
  it('marks the reports out of date once after the save', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, dispatch_id: 'd1', message: 'Saved' }, error: null });
    expect((await updateDispatch('d1', updatePayload)).success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(failures)('marks nothing after %s', async (_name, answer) => {
    mockRpc.mockResolvedValue(answer);
    expect((await updateDispatch('d1', updatePayload)).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('deleteDispatch', () => {
  it('marks the reports out of date once after the delete', async () => {
    rpcHelper.mockResolvedValue({ success: true, data: { message: 'Deleted' } } as never);
    expect((await deleteDispatch('d1', 'user-a')).success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('marks nothing when the delete fails', async () => {
    rpcHelper.mockResolvedValue({ success: false, error: 'Refused' } as never);
    expect((await deleteDispatch('d1', 'user-a')).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
