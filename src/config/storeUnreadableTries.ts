/**
 * How often in a row the phone's secure store could not be read (WH-363, product/design/offline-capture.md 12.3).
 *
 * "Sign in again" on the "Couldn't start the app" screen is offered only after TRIES_BEFORE_SIGN_IN_AGAIN failed
 * tries in a row, at least one of them on a fresh start: the first failure of a run of the app that began while an
 * earlier run's failures were still counted. The count is kept in AsyncStorage, not in the secure store it is about,
 * so a restart does not lose it; a good read removes it. Nothing here throws: a count that cannot be kept offers
 * nothing, and "Try again" stays.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'store_unreadable_tries_v1';

export const TRIES_BEFORE_SIGN_IN_AGAIN = 3;

interface TryRecord {
  count: number;
  /** At least one failed try was the first of a run of the app that began after earlier failures. */
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
    // Read as no failures: nothing is offered.
  }
  return { count: 0, fresh: false };
}

const isOffered = (record: TryRecord): boolean => record.count >= TRIES_BEFORE_SIGN_IN_AGAIN && record.fresh;

/** Counts one failed try and answers whether "Sign in again" is now offered. Never throws. */
export async function recordStoreUnreadableTry(): Promise<boolean> {
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
  return isOffered(next);
}

/** A good read, or the saved sign-in removed: the count goes. Never throws. */
export async function resetStoreUnreadableTries(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // The count stays; the next good read removes it.
  }
}
