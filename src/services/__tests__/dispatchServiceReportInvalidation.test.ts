/**
 * A deleted dispatch marks every report out of date, once; a failed or refused delete does
 * not (review 2026-10-13, SR-10).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { invalidateReportQueries } from '@/lib/queryClient';
import { deleteDispatch } from '../dispatch-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const invalidate = jest.mocked(invalidateReportQueries);
const rpc = jest.fn();

beforeEach(() => {
  invalidate.mockClear();
  rpc.mockReset();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('deleteDispatch', () => {
  it('marks the reports out of date once after the delete', async () => {
    rpc.mockResolvedValue({ data: { success: true, message: 'Deleted', order_restored: false }, error: null });
    expect((await deleteDispatch('d1', 'user-a')).success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('marks nothing after a transport error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Network request failed', code: '' } });
    expect((await deleteDispatch('d1', 'user-a')).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('marks nothing when the server refuses (success: false)', async () => {
    rpc.mockResolvedValue({ data: { success: false, message: 'Invoiced', blocking_reason: 'invoice' }, error: null });
    expect((await deleteDispatch('d1', 'user-a')).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
