/**
 * How often in a row the phone copy's key could not be read (WH-365; the counting pattern of WH-363's
 * src/config/storeUnreadableTries.ts, with its own count).
 *
 * The copy is replaced by itself only after TRIES_BEFORE_REPLACE failed reads in a row, at least one of them on a fresh
 * start: the first failure of a run of the app that began while an earlier run's failures were still counted. The count
 * is kept in AsyncStorage, not in the secure store it is about, so a restart does not lose it; a good read removes it.
 * Nothing here throws: a count that cannot be kept replaces nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'copy_key_read_tries_v1';

export const TRIES_BEFORE_REPLACE = 3;

interface TryRecord {
  count: number;
  /** At least one failed read was the first of a run of the app that began after earlier failures. */
  fresh: boolean;
}

// In memory only: whether this run of the app has recorded a failure yet.
let recordedThisRun = false;

async function readRecord(): Promise<TryRecord> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<TryRecord> | null) : null;
    if (typeof parsed?.count === 'number' && Number.isFinite(parsed.count) && parsed.count > 0) {
      return { count: Math.floor(parsed.count), fresh: parsed.fresh === true };
    }
  } catch {
    // Read as no failures: nothing is replaced.
  }
  return { count: 0, fresh: false };
}

/** Counts one failed read and answers whether the copy is now to be replaced. Never throws. */
export async function recordCopyKeyReadTry(): Promise<boolean> {
  const before = await readRecord();
  const firstOfRun = !recordedThisRun;
  recordedThisRun = true;
  const next: TryRecord = {
    count: before.count + 1,
    fresh: before.fresh || (firstOfRun && before.count > 0),
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  return next.count >= TRIES_BEFORE_REPLACE && next.fresh;
}

/** A good read, or the copy replaced: the count goes. Never throws. */
export async function resetCopyKeyReadTries(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // The count stays; the next good read removes it.
  }
}
