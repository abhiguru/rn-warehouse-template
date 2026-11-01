import { useEffect, useMemo, useRef } from 'react';
import { createRequestKeyKeeper } from '@/utils/requestKeyKeeper';

const randomHex = (digits: number): string =>
  Array.from({ length: digits }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/** A request key for one rate save: unique for the signed-in user, built from the time and random digits. */
export const newRateRequestKey = (kind: string): string => `warehouse-rate-${kind}-${Date.now().toString(36)}-${randomHex(20)}`;

/**
 * The request key and the abort signal of one rate form (owner rule D22). The key made for a save is kept across presses
 * of Save until the server's definite answer (`settle`), or until the form changes (a different `signature`), so a repeat
 * after a lost answer is the identical request. The signal is aborted when the screen is left: a lost answer is then no
 * longer asked about.
 */
export function useRateSaveKey(kind: string) {
  const keeper = useRef(createRequestKeyKeeper(() => newRateRequestKey(kind)));
  const controller = useRef<AbortController | null>(null);
  if (controller.current === null) controller.current = new AbortController();
  useEffect(() => {
    // A screen mounted again (a remount in development) gets a live signal.
    if (controller.current?.signal.aborted) controller.current = new AbortController();
    return () => controller.current?.abort();
  }, []);
  return useMemo(() => ({
    keyFor: (signature: string) => keeper.current.keyFor(signature),
    settle: () => keeper.current.settle(),
    signal: () => (controller.current as AbortController).signal,
  }), []);
}
