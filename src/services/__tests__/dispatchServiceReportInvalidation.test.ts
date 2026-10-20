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
// The shared helper (src/utils/lostAnswer.ts) is tested with its own file; here only what the service asks of it.
const mockWaitForServer = jest.fn(async (..._args: unknown[]) => {});
jest.mock(
  '@/utils/lostAnswer',
  () => ({
    // A network failure or a timeout after the request went out; a statement timeout (57014) and a failure before
    // sending ("No internet connection") are not.
    isLostAnswer: (result: { error?: string; errorCode?: string }) =>
      result.errorCode !== '57014' && /Network request failed|TimeoutError/i.test(result.error ?? ''),
    waitForServer: (...args: unknown[]) => mockWaitForServer(...args),
    checkSubmission: jest.fn(),
  }),
  { virtual: true }
);

const invalidate = jest.mocked(invalidateReportQueries);
const rpc = jest.fn();

beforeEach(() => {
  invalidate.mockClear();
  rpc.mockReset();
  mockWaitForServer.mockClear();
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

  it('marks nothing after a failure before the request was sent', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'No internet connection', code: '' } });
    expect((await deleteDispatch('d1', 'user-a')).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('marks nothing when the server refuses (success: false)', async () => {
    rpc.mockResolvedValue({ data: { success: false, message: 'Invoiced', blocking_reason: 'invoice' }, error: null });
    expect((await deleteDispatch('d1', 'user-a')).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('deleteDispatch: what the answer says and what it leaves unsaid', () => {
  const timedOut = { data: null, error: { message: 'TimeoutError: Request timeout', code: '' } };
  const notFound = { data: { success: false, message: 'Dispatch not found or access denied' }, error: null };
  const stillThere = { data: { success: true, data: { dispatch: { id: 'd1', disp_no: 'I0042' } } }, error: null };
  /** The delete answers `deleteAnswer`; the dispatch read after it answers `readAnswer`. */
  const server = (deleteAnswer: unknown, readAnswer: unknown) =>
    rpc.mockImplementation(async (name: string) => (name === 'get_dispatch_details' ? readAnswer : deleteAnswer));

  const names = () => rpc.mock.calls.map(([name]) => name);

  it('a lost answer locks the screen, waits for the server, and then reads the dispatch: gone means the delete went through', async () => {
    server(timedOut, notFound);
    const onLostAnswer = jest.fn();

    const result = await deleteDispatch('d1', 'user-a', { onLostAnswer });

    expect(result).toMatchObject({ success: true, orderCountsUnknown: true });
    expect(names()).toEqual(['delete_dispatch_with_order_cleanup', 'get_dispatch_details']);
    expect(rpc.mock.calls[1][1]).toEqual({ p_dispatch_id: 'd1' });
    expect(onLostAnswer).toHaveBeenCalledTimes(1);
    // The wait: online and 10 s since the request was sent (the helper), from the time it was sent.
    expect(mockWaitForServer).toHaveBeenCalledWith(expect.any(Number), undefined);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('a delete that did report its answer does not say the order is unknown', async () => {
    rpc.mockResolvedValue({ data: { success: true, message: 'Deleted' }, error: null });
    expect((await deleteDispatch('d1', 'user-a')).orderCountsUnknown).toBeUndefined();
  });

  it('with the dispatch still there, the delete is sent once more and its answer is the answer', async () => {
    rpc.mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(stillThere)
      .mockResolvedValueOnce({ data: { success: true, message: 'Deleted', order_restoration: { total_items_restored: 2 } }, error: null });

    const result = await deleteDispatch('d1', 'user-a');

    expect(names()).toEqual(['delete_dispatch_with_order_cleanup', 'get_dispatch_details', 'delete_dispatch_with_order_cleanup']);
    expect(rpc.mock.calls[2][1]).toEqual(rpc.mock.calls[0][1]);
    expect(result).toMatchObject({ success: true, orderLinesGivenBack: 2 });
    expect(result.orderCountsUnknown).toBeUndefined();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('with the dispatch still there, a refusal of the second delete is a refusal', async () => {
    rpc.mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(stillThere)
      .mockResolvedValueOnce({ data: { success: false, message: 'Invoiced', blocking_reason: 'invoices_exist' }, error: null });

    const result = await deleteDispatch('d1', 'user-a');

    expect(result).toMatchObject({ success: false, blockingReason: 'invoices_exist' });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('repeats while the answers are lost', async () => {
    rpc.mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(stillThere)
      .mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(notFound);
    const onLostAnswer = jest.fn();

    const result = await deleteDispatch('d1', 'user-a', { onLostAnswer });

    expect(result).toMatchObject({ success: true, orderCountsUnknown: true });
    expect(onLostAnswer).toHaveBeenCalledTimes(2);
    expect(mockWaitForServer).toHaveBeenCalledTimes(2);
  });

  it('asks again, a little later, when the read cannot tell', async () => {
    jest.useFakeTimers();
    try {
      rpc.mockResolvedValueOnce(timedOut).mockResolvedValueOnce(timedOut).mockResolvedValueOnce(notFound);

      const pending = deleteDispatch('d1', 'user-a');
      await jest.advanceTimersByTimeAsync(2000);
      const result = await pending;

      expect(result).toMatchObject({ success: true, orderCountsUnknown: true });
      expect(names()).toEqual(['delete_dispatch_with_order_cleanup', 'get_dispatch_details', 'get_dispatch_details']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops, and sends nothing again, when the person leaves meanwhile', async () => {
    const controller = new AbortController();
    rpc.mockResolvedValue(timedOut);
    mockWaitForServer.mockImplementationOnce(async () => {
      controller.abort();
    });

    const result = await deleteDispatch('d1', 'user-a', { signal: controller.signal });

    expect(result).toMatchObject({ success: false, aborted: true });
    expect(names()).toEqual(['delete_dispatch_with_order_cleanup']);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('a statement timeout (57014) is not a lost answer: nothing was deleted', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } });
    const onLostAnswer = jest.fn();

    const result = await deleteDispatch('d1', 'user-a', { onLostAnswer });

    expect(result.success).toBe(false);
    expect(onLostAnswer).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a refusal by the server is not followed by a look', async () => {
    server({ data: { success: false, message: 'Invoiced', blocking_reason: 'invoices_exist' }, error: null }, notFound);

    const result = await deleteDispatch('d1', 'user-a');

    expect(result).toMatchObject({ success: false, blockingReason: 'invoices_exist' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('reports the order lines given back and those that could not be', async () => {
    rpc.mockResolvedValue({
      data: {
        success: true,
        message: 'Dispatch I0042 deleted successfully.',
        order_restoration: { total_items_restored: 3 },
        cart_lines_not_restored: 1,
        cart_lines_without_open_cart: 2,
      },
      error: null,
    });

    const result = await deleteDispatch('d1', 'user-a');

    expect(result).toMatchObject({ success: true, orderLinesGivenBack: 3, orderLinesNotRestored: 1, orderLinesWithoutOpenOrder: 2 });
  });

  it('reports no counts when the server sent none', async () => {
    rpc.mockResolvedValue({ data: { success: true, message: 'Deleted' }, error: null });

    const result = await deleteDispatch('d1', 'user-a');

    expect(result).toMatchObject({ success: true, orderLinesGivenBack: 0, orderLinesNotRestored: 0, orderLinesWithoutOpenOrder: 0 });
  });
});

