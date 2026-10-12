/**
 * For tests of screens and hooks that read a report through `useReportQuery`.
 *
 * The query library tells its observers on a timer, which a test would have to
 * race. `makeQueryUpdatesImmediate()` makes it tell them at once, so an answer
 * is on screen as soon as the promises behind it have run; `settleQueries()`
 * lets those promises run. Call it inside `act`.
 *
 *   let restore: () => void;
 *   beforeAll(() => { restore = makeQueryUpdatesImmediate(); });
 *   beforeEach(forgetQueries);
 *   afterAll(() => restore());
 *   ...
 *   await act(async () => { resolve(answer); await settleQueries(); });
 *
 * This file is not a test file, so the app's type check reads it too: it uses
 * no jest globals.
 */
import { notifyManager } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

/** Returns the function that puts the library's own timing back. */
export function makeQueryUpdatesImmediate(): () => void {
  notifyManager.setScheduler(callback => callback());
  return () => {
    queryClient.clear();
    notifyManager.setScheduler(callback => setTimeout(callback, 0));
  };
}

/** An answer kept from one test would be shown at once in the next. */
export const forgetQueries = (): void => queryClient.clear();

/** One turn of the event loop: every promise already resolved has run by then. */
export const settleQueries = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
