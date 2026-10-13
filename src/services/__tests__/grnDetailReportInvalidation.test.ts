/**
 * A deleted GRN marks every report out of date, once; a failed or blocked delete does not
 * (review 2026-10-13, SR-10).
 */
import { invalidateReportQueries } from '@/lib/queryClient';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { deleteGRN } from '../grn-detail-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/serviceErrorHandler', () => ({ executeRPC: jest.fn() }));

const invalidate = jest.mocked(invalidateReportQueries);
const rpc = jest.mocked(executeRPC);
const GRN_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  invalidate.mockClear();
  rpc.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('deleteGRN', () => {
  it('marks the reports out of date once after the delete', async () => {
    rpc.mockResolvedValue({ success: true, data: { success: true, message: 'GRN deleted' } } as never);
    expect((await deleteGRN(GRN_ID)).success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('marks nothing when the request fails', async () => {
    rpc.mockResolvedValue({ success: false, message: 'Could not delete', error: 'P0001' } as never);
    expect((await deleteGRN(GRN_ID)).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('marks nothing when the server blocks the delete (success: false)', async () => {
    rpc.mockResolvedValue({ success: true, data: { success: false, error: 'Dispatches exist' } } as never);
    expect((await deleteGRN(GRN_ID)).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('marks nothing without a GRN', async () => {
    expect((await deleteGRN('')).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
