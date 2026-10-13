/**
 * A request started before a sign-out, sign-in or server switch is not joined after it, and its
 * late answer does not unregister the request that replaced it.
 */
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { deduplicatedRequest, getPendingRequestCount, isRequestPending } from '@/utils/requestDedup';

const KEY = 'getDispatchListWithItems::p_customer_id:"fictional-customer"';

it('does not join a request of the previous session', async () => {
  let answerOld: (value: string) => void = () => {};
  const oldRequest = deduplicatedRequest(KEY, () => new Promise<string>(resolve => (answerOld = resolve)));

  advanceSessionGeneration();
  expect(getPendingRequestCount()).toBe(0);

  let answerNew: (value: string) => void = () => {};
  const newFn = jest.fn(() => new Promise<string>(resolve => (answerNew = resolve)));
  const newRequest = deduplicatedRequest(KEY, newFn);
  expect(newFn).toHaveBeenCalledTimes(1);

  // The old answer arrives late: the new request stays registered and shared.
  answerOld('old session');
  await expect(oldRequest).resolves.toBe('old session');
  expect(isRequestPending(KEY)).toBe(true);
  const joined = deduplicatedRequest(KEY, () => Promise.resolve('not called'));
  answerNew('new session');
  await expect(newRequest).resolves.toBe('new session');
  await expect(joined).resolves.toBe('new session');
  expect(isRequestPending(KEY)).toBe(false);
});
