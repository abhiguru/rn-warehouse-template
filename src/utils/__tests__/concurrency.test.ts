/**
 * The limit on jobs running at once (P2F-MEDIA-2): photo uploads of a save
 * run a few at a time, not all together.
 */
import { createLimiter, mapWithConcurrency } from '../concurrency';

/** A job that waits until the test lets it finish. */
function gate() {
  const opened: Array<() => void> = [];
  let running = 0;
  let mostRunning = 0;
  const job = <R>(value: R) => async () => {
    running += 1;
    mostRunning = Math.max(mostRunning, running);
    await new Promise<void>((resolve) => opened.push(resolve));
    running -= 1;
    return value;
  };
  const openAll = async () => {
    // Opening one job lets a queued one start, which waits again.
    while (opened.length > 0) {
      opened.splice(0).forEach((open) => open());
      await flush();
    }
  };
  return { job, openAll, opened, get running() { return running; }, get mostRunning() { return mostRunning; } };
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('mapWithConcurrency', () => {
  it('never runs more than the limit, and keeps the results in input order', async () => {
    const jobs = gate();
    const items = Array.from({ length: 50 }, (_, index) => index);
    const done = mapWithConcurrency(items, 4, (item) => jobs.job(item * 10)());

    await flush();
    expect(jobs.running).toBe(4);
    expect(jobs.opened).toHaveLength(4);

    await jobs.openAll();
    expect(await done).toEqual(items.map((item) => item * 10));
    expect(jobs.mostRunning).toBe(4);
  });

  it('starts the next item as soon as one finishes, not after the whole batch', async () => {
    const jobs = gate();
    const started: number[] = [];
    const done = mapWithConcurrency([0, 1, 2, 3], 3, (item) => {
      started.push(item);
      return jobs.job(item)();
    });
    await flush();
    expect(started).toEqual([0, 1, 2]);

    jobs.opened.shift()!();
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);
    await jobs.openAll();
    await done;
  });

  it('returns each failure as the item function describes it', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (item) =>
      item === 2 ? { ok: false as const, item } : { ok: true as const, item }
    );
    expect(results).toEqual([{ ok: true, item: 1 }, { ok: false, item: 2 }, { ok: true, item: 3 }]);
  });

  it('runs every item even when one rejects, then passes the rejection on', async () => {
    const seen: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3, 4], 2, async (item) => {
        seen.push(item);
        if (item === 1) throw new Error('first failed');
        return item;
      })
    ).rejects.toThrow('first failed');
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 4, async (item: number) => item)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 10, async (item) => item + 1)).toEqual([2, 3]);
  });
});

describe('createLimiter', () => {
  it('holds the limit across several callers that share it', async () => {
    const jobs = gate();
    const limit = createLimiter(4);
    const first = Promise.all(Array.from({ length: 5 }, (_, index) => limit(jobs.job(index))));
    const second = Promise.all(Array.from({ length: 5 }, (_, index) => limit(jobs.job(index + 5))));

    await flush();
    expect(limit.active).toBe(4);
    expect(limit.pending).toBe(6);

    await jobs.openAll();
    expect(await first).toEqual([0, 1, 2, 3, 4]);
    expect(await second).toEqual([5, 6, 7, 8, 9]);
    expect(jobs.mostRunning).toBe(4);
    expect(limit.active).toBe(0);
  });

  it('frees the place of a job that fails, and the failure reaches only its caller', async () => {
    const limit = createLimiter(1);
    const failing = limit(async () => {
      throw new Error('upload refused');
    });
    const after = limit(async () => 'next one ran');

    await expect(failing).rejects.toThrow('upload refused');
    await expect(after).resolves.toBe('next one ran');
    expect(limit.active).toBe(0);
  });

  it('also frees the place of a job that throws before it returns a promise', async () => {
    const limit = createLimiter(1);
    const failing = limit((() => {
      throw new Error('thrown at once');
    }) as () => Promise<never>);
    await expect(failing).rejects.toThrow('thrown at once');
    await expect(limit(async () => 1)).resolves.toBe(1);
  });
});
