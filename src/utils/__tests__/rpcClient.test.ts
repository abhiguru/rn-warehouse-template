// Review 2026-10-10, M1-9: a request the app stops waiting for is aborted, and
// a finished request leaves no timer behind.
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { callRPC, withTimeout } from '../rpcClient';

const clientWith = (answer: Promise<unknown>) => {
  let signal: AbortSignal | undefined;
  const builder = {
    abortSignal: (given: AbortSignal) => {
      signal = given;
      return answer;
    },
  };
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: jest.fn(() => builder) } as never);
  return { signal: () => signal };
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a timed-out RPC is aborted, not left running', async () => {
  const client = clientWith(new Promise(() => {}));
  const pending = callRPC('get_dispatch_list', {}, { context: 'Test', timeout: 30000 });
  await jest.advanceTimersByTimeAsync(29999);
  expect(client.signal()?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(client.signal()?.aborted).toBe(true);
  expect((await pending).success).toBe(false);
});

test('an RPC that answers in time is not aborted and leaves no timer', async () => {
  const client = clientWith(Promise.resolve({ data: { success: true, data: [] }, error: null }));
  expect((await callRPC('get_dispatch_list', {}, { context: 'Test' })).success).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  expect(client.signal()?.aborted).toBe(false);
});

test('withTimeout clears its timer when the promise rejects', async () => {
  await expect(withTimeout(Promise.reject(new Error('refused')), 60000)).rejects.toThrow('refused');
  expect(jest.getTimerCount()).toBe(0);
});
