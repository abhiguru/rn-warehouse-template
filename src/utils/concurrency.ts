/**
 * Small helpers that keep a number of asynchronous jobs from all running at
 * once (photo uploads, photo preparation).
 */

/**
 * Runs jobs so that at most `limit` of them are running at any time. Jobs
 * start in the order they were given. A job that rejects frees its place like
 * one that resolves, and its rejection reaches only its own caller.
 *
 * One limiter can be shared by several callers: then the limit holds across
 * all of them, not for each one.
 */
export interface Limiter {
  <R>(job: () => Promise<R>): Promise<R>;
  /** Jobs running now. */
  readonly active: number;
  /** Jobs waiting for a place. */
  readonly pending: number;
}

export function createLimiter(limit: number): Limiter {
  const size = Math.max(1, Math.floor(limit));
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= size) return;
    const start = queue.shift();
    if (start) start();
  };

  const run = <R>(job: () => Promise<R>): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        let result: Promise<R>;
        try {
          result = Promise.resolve(job());
        } catch (error) {
          result = Promise.reject(error);
        }
        result.then(resolve, reject).finally(() => {
          active -= 1;
          next();
        });
      });
      next();
    });

  return Object.defineProperties(run, {
    active: { get: () => active },
    pending: { get: () => queue.length },
  }) as Limiter;
}

/**
 * `items.map(fn)` with at most `limit` calls of `fn` running at once. The
 * results are in the order of `items`.
 *
 * `fn` decides what a failure looks like: it is expected to resolve with a
 * value that describes the failure rather than reject, so one item never hides
 * the result of another. Should `fn` reject anyway, the other items still run
 * to the end, and only then is the first rejection passed on.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const size = Math.max(1, Math.floor(limit));
  let nextIndex = 0;
  let failure: { error: unknown } | undefined;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        if (!failure) failure = { error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  if (failure) throw failure.error;
  return results;
}
