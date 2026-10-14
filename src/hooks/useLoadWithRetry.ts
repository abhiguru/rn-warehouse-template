/**
 * useLoadWithRetry - one read from the facility with its three states and "Try again".
 *
 * `key` names what is read. The read starts when a key is first given and again when
 * the key changes or `retry()` is called; a null or empty key reads nothing and stays
 * `loading`. `load` is the caller's latest one, so it may be written inline.
 *
 * An answer counts only for the key and the attempt that asked for it: one that comes
 * back after the key changed, after a retry, or after the screen is gone is dropped,
 * and a new key never shows the answer of the one before it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadWithRetry<T> = { retry: () => void } & (
  | { state: 'loading'; data: undefined }
  | { state: 'failed'; data: undefined }
  | { state: 'loaded'; data: T }
);

type Outcome<T> = { state: 'failed' } | { state: 'loaded'; data: T };
type Settled<T> = Outcome<T> & { key: string; attempt: number };

export function useLoadWithRetry<T>(key: string | null, load: () => Promise<T>): LoadWithRetry<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latestLoad = useRef(load);
  useEffect(() => {
    latestLoad.current = load;
  });

  useEffect(() => {
    if (!key) return undefined;
    let current = true;
    const settle = (outcome: Outcome<T>) => {
      if (current) setSettled({ ...outcome, key, attempt });
    };
    latestLoad.current().then(
      (data) => settle({ state: 'loaded', data }),
      () => settle({ state: 'failed' })
    );
    return () => {
      current = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const answer = settled && settled.key === key && settled.attempt === attempt ? settled : null;
  if (answer?.state === 'loaded') return { state: 'loaded', data: answer.data, retry };
  return { state: answer ? 'failed' : 'loading', data: undefined, retry };
}

export default useLoadWithRetry;
