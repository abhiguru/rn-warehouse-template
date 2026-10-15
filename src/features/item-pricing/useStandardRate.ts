/**
 * The facility's standard rate (backend migration 85), kept in a session cache like the rates:
 * a screen that opens with it in the cache shows it at once and refreshes in the background.
 * The Standard rate screen refreshes it after a save; the item page and Add item read it for
 * the Standard tags and the summary. Cleared with the other session state (sessionScopedState).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { getStandardRate } from '@/services/item-pricing-service';
import { useAppSelector } from '@/store/hooks';
import type { StandardRate } from '@/types/item-pricing.types';

export type StandardRateStatus = 'loading' | 'ready' | 'error';

interface Snapshot {
  key: string;
  rate: StandardRate;
}

let snapshot: Snapshot | null = null;
let inFlight: Promise<void> | null = null;
let inFlightKey: string | null = null;
/** Bumped by every new load and by clearStandardRateCache: a load that is no longer the latest drops its answer. */
let loadSeq = 0;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach(fn => fn());
const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
};

const currentKey = (userId: string | undefined): string => `${getActiveOperatorServer()?.instanceId ?? 'none'}|${userId ?? 'none'}`;

/** Forget what was loaded (sign-out, facility change, tests). */
export function clearStandardRateCache(): void {
  snapshot = null;
  inFlight = null;
  inFlightKey = null;
  loadSeq += 1;
  emit();
}

/** Put a saved standard rate in the cache (the Standard rate screen does this after a save, before it reads again). */
export function rememberStandardRate(key: string, rate: StandardRate): void {
  loadSeq += 1;
  snapshot = { key, rate };
  emit();
}

export interface UseStandardRateResult {
  /** Null until loaded (or when loading failed). */
  rate: StandardRate | null;
  status: StandardRateStatus;
  /** Read it again; resolves when the answer is in the cache, rejects when it fails. */
  refresh: () => Promise<void>;
  /** The cache key of this person and facility, for rememberStandardRate. */
  key: string;
  /** The last read failed because the facility's server has no standard rate yet (migration 85 missing). */
  serverNeedsUpdate?: boolean;
}

export function useStandardRate(): UseStandardRateResult {
  const userId = useAppSelector(state => state.auth.userProfile?.id);
  const key = currentKey(userId);
  const stored = useSyncExternalStore(subscribe, () => snapshot);
  const data = stored && stored.key === key ? stored : null;
  const [failed, setFailed] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);

  const load = useCallback((): Promise<void> => {
    if (!inFlight || inFlightKey !== key) {
      const seq = ++loadSeq;
      const promise: Promise<void> = (async () => {
        const rate = await getStandardRate();
        if (seq !== loadSeq) return;
        snapshot = { key, rate };
        emit();
      })().finally(() => {
        if (inFlight === promise) {
          inFlight = null;
          inFlightKey = null;
        }
      });
      inFlight = promise;
      inFlightKey = key;
    }
    return inFlight;
  }, [key]);

  const refresh = useCallback(async () => {
    try {
      await load();
      setFailed(false);
      setNeedsUpdate(false);
    } catch (e) {
      setFailed(true);
      setNeedsUpdate((e as { code?: unknown })?.code === 'SERVER_NEEDS_UPDATE');
      throw e;
    }
  }, [load]);

  useEffect(() => {
    refresh().catch(() => { /* the screen keeps what it has; status says error when it has nothing */ });
    // Once per mount and facility.
  }, [key]);

  return { rate: data?.rate ?? null, status: data ? 'ready' : failed ? 'error' : 'loading', refresh, key, serverNeedsUpdate: needsUpdate };
}
