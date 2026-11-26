/**
 * The 2-hour clock of unsent work (WH-301, product/tech/app-offline-unsent-work.md section 5, decision 6, criterion 11).
 *
 * The work clock `T` counts milliseconds the phone has run or been seen to pass, and does not follow the wall clock while
 * the app runs: within one run it moves with the monotonic clock (`performance.now()`, as `lostAnswer.ts` does). It is
 * kept in the file's `meta` table as `{ t, wall, runId }` and written every 30 s, on a save, and when asked.
 *
 * After a kill or a reboot (a new run) the time the app was dead is taken from the wall clock: a clock moved forward counts
 * in full (the safe side), a small step back (a correction, `CLOCK_SET_BACK_TOLERANCE_MS`) counts for nothing, and a larger
 * one means the phone cannot tell. When it cannot tell, and when the ledger is missing or damaged while work is kept, `T`
 * is moved past the limit of every item saved so far: the limit counts as passed for them, and an item saved later starts a
 * fresh age (so "cannot tell" ends by itself when that work is sent, as the contract's `clock_unknown` did).
 */
import { CLOCK_SET_BACK_TOLERANCE_MS } from '@/config/offlineLimit';
import { createLogger } from '@/utils/logger';
import type { UnsentDb } from './unsentDb';

const logger = createLogger('[unsent-clock]');

/** Unsent work older than this stops new work (Owner, 2026-11-25). */
export const UNSENT_LIMIT_MS = 2 * 60 * 60 * 1000;
/** How often the ledger is written while the app runs. */
export const CLOCK_WRITE_INTERVAL_MS = 30_000;

const CLOCK_KEY = 'clock';

const run = {
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  /** `T` at `mono`. */
  t: 0,
  mono: 0,
  started: false,
  timer: null as ReturnType<typeof setInterval> | null,
};

const monotonicNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/** The work clock now, in ms. Synchronous: the gate and the bar read it. */
export function workNow(): number {
  return run.t + Math.max(0, monotonicNow() - run.mono);
}

interface Ledger {
  t: number;
  wall: number;
  runId: string;
}

function parseLedger(text: string | undefined): Ledger | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { t, wall, runId } = value as Record<string, unknown>;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return null;
    if (typeof wall !== 'number' || !Number.isFinite(wall) || wall <= 0) return null;
    return { t, wall, runId: typeof runId === 'string' ? runId : '' };
  } catch {
    return null;
  }
}

/** Writes the ledger with `T` as it is now. */
export async function persistWorkClock(db: UnsentDb): Promise<void> {
  const t = workNow();
  run.t = t;
  run.mono = monotonicNow();
  const ledger: Ledger = { t, wall: Date.now(), runId: run.id };
  await db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [CLOCK_KEY, JSON.stringify(ledger)]);
}

/**
 * Starts the clock for this run from the ledger in the file. `newestTick` is the largest `recorded_tick` of the items kept
 * (null when there are none): a missing or damaged ledger with work kept cannot be told from a long time passed.
 */
export async function startWorkClock(db: UnsentDb, newestTick: number | null): Promise<void> {
  const [row] = await db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [CLOCK_KEY]);
  const ledger = parseLedger(row?.value);
  let t = 0;
  if (ledger?.runId === run.id && run.started) {
    t = workNow();
  } else if (ledger) {
    const gap = Date.now() - ledger.wall;
    if (gap < -CLOCK_SET_BACK_TOLERANCE_MS) {
      logger.warn('The phone clock was set back; the limit counts as passed for the work kept');
      t = ledger.t + UNSENT_LIMIT_MS;
    } else {
      t = ledger.t + Math.max(0, gap);
    }
  } else if (newestTick !== null) {
    logger.warn('The clock ledger is missing; the limit counts as passed for the work kept');
    t = newestTick + UNSENT_LIMIT_MS;
  }
  run.t = t;
  run.mono = monotonicNow();
  run.started = true;
  await persistWorkClock(db);
  if (!run.timer) {
    const timer = setInterval(() => {
      persistWorkClock(db).catch(() => undefined);
    }, CLOCK_WRITE_INTERVAL_MS);
    // Under Node (tests) the timer must not keep the process alive.
    (timer as { unref?: () => void }).unref?.();
    run.timer = timer;
  }
}
