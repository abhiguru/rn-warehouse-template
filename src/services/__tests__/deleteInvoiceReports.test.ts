/**
 * Deleting an invoice marks the report queries stale (SR-10), like every other write, so a
 * report left open under the invoice does not keep listing it.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { invalidateReportQueries } from '@/lib/queryClient';
import { deleteInvoice } from '../invoice-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/lib/queryClient', () => ({ invalidateReportQueries: jest.fn(async () => undefined) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('invalidates the report queries after a delete', async () => {
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({
    rpc: jest.fn(async () => ({ data: { success: true, message: 'Deleted', invoice_info: {}, deleted_counts: {}, gr_id: 'g1' }, error: null })),
  });

  const result = await deleteInvoice('inv-1');

  expect(result.success).toBe(true);
  expect(invalidateReportQueries).toHaveBeenCalledTimes(1);
});

it('leaves the reports alone when the delete failed', async () => {
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({
    rpc: jest.fn(async () => ({ data: { success: false, error: 'No' }, error: null })),
  });

  const result = await deleteInvoice('inv-1');

  expect(result.success).toBe(false);
  expect(invalidateReportQueries).not.toHaveBeenCalled();
});
