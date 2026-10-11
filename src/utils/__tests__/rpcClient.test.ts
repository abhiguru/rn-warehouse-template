// Review 2026-10-10, M1-9 and RM-2: the abort of a request the app stops
// waiting for is tested where requests are sent
// (src/config/__tests__/customSession.test.ts, "a request the server never
// answers"); callRPC, which no screen called, is gone. What stays here is the
// timer helper.
import { withTimeout } from '../rpcClient';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('withTimeout clears its timer when the promise rejects', async () => {
  await expect(withTimeout(Promise.reject(new Error('refused')), 60000)).rejects.toThrow('refused');
  expect(jest.getTimerCount()).toBe(0);
});

test('withTimeout runs onTimeout and rejects when the time is up', async () => {
  const onTimeout = jest.fn();
  const pending = withTimeout(new Promise(() => {}), 30000, 'Test', onTimeout);
  const failure = pending.catch((error: unknown) => error);
  await jest.advanceTimersByTimeAsync(30000);
  expect(onTimeout).toHaveBeenCalledTimes(1);
  expect(((await failure) as Error).name).toBe('TimeoutError');
});
