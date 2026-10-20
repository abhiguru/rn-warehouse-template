/**
 * A deleted GRN marks every report out of date, once; a failed or blocked delete does not
 * (review 2026-10-13, SR-10).
 */
import { invalidateReportQueries } from '@/lib/queryClient';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { waitForServer } from '@/utils/lostAnswer';
import { checkGRNGone, deleteGRN, photoPathsOf, removeGRNPhotoFiles, settleLostDelete } from '../grn-detail-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/serviceErrorHandler', () => ({ executeRPC: jest.fn() }));
// The wait for the server is the shared helper's (utils/lostAnswer); said here. Whether a failure is a lost answer is
// executeRPC's flag (`lostAnswer`), which this test sets on the result it mocks.
jest.mock('@/utils/lostAnswer', () => ({ waitForServer: jest.fn(async () => {}) }));

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

// Review 2026-10-20, G11 and owner rule D22: a delete that got no answer is read back, not retried blind.
describe('deleteGRN after a failure on the way', () => {
  it('asks for the delete wording and says the answer was lost when the failure came after the request went out', async () => {
    rpc.mockResolvedValue({ success: false, message: 'No answer from the server. It may have been deleted.', error: 'TimeoutError: Request timeout', errorCode: 'TIMEOUT', lostAnswer: true } as never);
    expect(await deleteGRN(GRN_ID)).toMatchObject({ success: false, lostAnswer: true, message: 'No answer from the server. It may have been deleted.' });
    expect(rpc.mock.calls[0][3]).toMatchObject({ write: true, delete: true });
  });

  it('a failure before the request left, a statement timeout and a refusal the server answered are not a lost answer', async () => {
    rpc.mockResolvedValue({ success: false, message: 'Offline', error: 'AppError: No internet connection', errorCode: 'NETWORK' } as never);
    expect((await deleteGRN(GRN_ID)).lostAnswer).toBe(false);
    rpc.mockResolvedValue({ success: false, message: 'Refused', error: 'P0001', errorCode: 'P0001' } as never);
    expect((await deleteGRN(GRN_ID)).lostAnswer).toBe(false);
  });

  // Owner rule D22: the delete sent again after a lost answer is settled only by the server's answer.
  describe('sent again after a lost answer (resend)', () => {
    it('"GRN not found" means it is gone, as asked: a success, and the reports are told', async () => {
      rpc.mockResolvedValue({ success: true, data: { success: false, error: 'GRN not found' } } as never);
      expect(await deleteGRN(GRN_ID, { resend: true })).toEqual({ success: true, alreadyGone: true });
      expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('"GRN not found" on a first delete is still only a refusal', async () => {
      rpc.mockResolvedValue({ success: true, data: { success: false, error: 'GRN not found' } } as never);
      expect((await deleteGRN(GRN_ID)).success).toBe(false);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('a statement timeout or a failure before sending leaves it unsettled: a lost answer again', async () => {
      rpc.mockResolvedValue({ success: false, message: 'Cancelled', error: 'canceling statement due to statement timeout', errorCode: '57014' } as never);
      expect((await deleteGRN(GRN_ID, { resend: true })).lostAnswer).toBe(true);
      rpc.mockResolvedValue({ success: false, message: 'Offline', error: 'AppError: No internet connection', errorCode: 'NETWORK' } as never);
      expect((await deleteGRN(GRN_ID, { resend: true })).lostAnswer).toBe(true);
      // The same failures on a first delete are answers of the phone, not lost answers.
      rpc.mockResolvedValue({ success: false, message: 'Cancelled', error: 'canceling statement due to statement timeout', errorCode: '57014' } as never);
      expect((await deleteGRN(GRN_ID)).lostAnswer).toBe(false);
    });

    it('a refusal the server answers settles it: no lost answer', async () => {
      rpc.mockResolvedValue({ success: false, message: 'Refused', error: 'P0001', errorCode: 'P0001' } as never);
      expect((await deleteGRN(GRN_ID, { resend: true })).lostAnswer).toBe(false);
    });
  });
});

describe('checkGRNGone', () => {
  const answer = (rpcResult: unknown) =>
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: jest.fn(async () => rpcResult) } as never);

  it('says gone when the server answers GRN not found', async () => {
    answer({ data: { success: false, data: null, message: 'GRN not found or access denied' }, error: null });
    expect(await checkGRNGone(GRN_ID)).toBe('gone');
  });

  it('says exists when the server answers with the GRN', async () => {
    answer({ data: { success: true, data: { grn: { id: GRN_ID } } }, error: null });
    expect(await checkGRNGone(GRN_ID)).toBe('exists');
  });

  it('says unknown when the server cannot be asked or answers something else', async () => {
    answer({ data: null, error: { message: 'Network request failed' } });
    expect(await checkGRNGone(GRN_ID)).toBe('unknown');
    answer({ data: { success: false, data: null, message: 'Error retrieving GRN details: boom' }, error: null });
    expect(await checkGRNGone(GRN_ID)).toBe('unknown');
    jest.mocked(getAuthenticatedClient).mockRejectedValue(new Error('no session'));
    expect(await checkGRNGone(GRN_ID)).toBe('unknown');
  });
});

describe('settleLostDelete', () => {
  const notFound = { data: { success: false, data: null, message: 'GRN not found or access denied' }, error: null };
  const there = { data: { success: true, data: { grn: { id: GRN_ID } } }, error: null };
  const unreadable = { data: null, error: { message: 'Network request failed' } };
  /** The read answers these in turn (the last one for every later read); returns the read's calls. */
  const reads = (...answers: unknown[]) => {
    const read = jest.fn(async () => (answers.length > 1 ? answers.shift() : answers[0]));
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: read } as never);
    return read;
  };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for the server (online, 10 s since the request) and then reads the GRN: gone means it was deleted', async () => {
    const read = reads(notFound);
    const signal = new AbortController().signal;
    expect(await settleLostDelete(GRN_ID, 1_000, signal)).toBe('gone');
    // The delete had been applied: a report left open stops listing the GRN, as after any delete.
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(waitForServer).toHaveBeenCalledWith(1_000, signal);
    expect(read).toHaveBeenCalledWith('get_grn_details', { p_grn_id: GRN_ID });
    expect(jest.mocked(waitForServer).mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]);
  });

  it('says exists when the GRN is still there: the caller sends the delete once more', async () => {
    reads(there);
    expect(await settleLostDelete(GRN_ID, 1_000)).toBe('exists');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('a read that fails is tried again, with a longer wait each time, until the server answers', async () => {
    const read = reads(unreadable, unreadable, notFound);
    const settled = settleLostDelete(GRN_ID, 1_000);
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    // The second wait is longer than the first.
    await jest.advanceTimersByTimeAsync(1_999);
    expect(read).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    expect(await settled).toBe('gone');
  });

  it('stops when the person leaves: no more reads, and the answer is aborted', async () => {
    const read = reads(unreadable);
    const controller = new AbortController();
    const settled = settleLostDelete(GRN_ID, 1_000, controller.signal);
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);

    controller.abort();
    expect(await settled).toBe('aborted');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('is aborted at once when the wait for the server is aborted', async () => {
    const read = reads(notFound);
    const controller = new AbortController();
    jest.mocked(waitForServer).mockImplementationOnce(async () => { controller.abort(); throw new Error('aborted'); });
    expect(await settleLostDelete(GRN_ID, 1_000, controller.signal)).toBe('aborted');
    expect(read).not.toHaveBeenCalled();
  });
});

describe('the photo files of a deleted GRN (G11)', () => {
  it('lists the stored file of each photo of the header and of the lines, once, and none that has no path', () => {
    expect(photoPathsOf({
      header_images: [
        { id: 'h1', storage_path: 'headers/g/a.webp' },
        { id: 'h2', storage_path: 'headers/g/a.webp' },
        { id: 'h3', storage_path: '' },
      ],
      items: [{ item_images: [{ id: 'i1', storage_path: 'items/g/l/b.webp' }] }, { item_images: undefined }, {}],
    } as never)).toEqual(['headers/g/a.webp', 'items/g/l/b.webp']);
    expect(photoPathsOf(undefined)).toEqual([]);
    expect(photoPathsOf({} as never)).toEqual([]);
  });

  it('removes them from the grn-images bucket', async () => {
    const remove = jest.fn(async () => ({ data: [], error: null }));
    const from = jest.fn(() => ({ remove }));
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ storage: { from } } as never);
    await removeGRNPhotoFiles(['headers/g/a.webp', 'items/g/l/b.webp']);
    expect(from).toHaveBeenCalledWith('grn-images');
    expect(remove).toHaveBeenCalledWith(['headers/g/a.webp', 'items/g/l/b.webp']);
  });

  it('asks for nothing when there are no files, and never throws when the removal fails', async () => {
    const from = jest.fn();
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ storage: { from } } as never);
    await removeGRNPhotoFiles([]);
    expect(from).not.toHaveBeenCalled();

    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ storage: { from: () => ({ remove: async () => { throw new Error('offline'); } }) } } as never);
    await expect(removeGRNPhotoFiles(['headers/g/a.webp'])).resolves.toBeUndefined();
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ storage: { from: () => ({ remove: async () => ({ data: null, error: { message: 'denied' } }) }) } } as never);
    await expect(removeGRNPhotoFiles(['headers/g/a.webp'])).resolves.toBeUndefined();
  });
});
