/**
 * One action at a time: a second tap that arrives before the screen has drawn
 * `busy` does nothing (house rule from useAccountActions).
 *
 * `run(work)` sets a ref before its first await, so two taps in the same frame
 * cannot both start; `busy` drives the button's loading state. It returns what
 * `work` returns, or `undefined` when another run was in flight and `work` was
 * not called. A run that ends after the screen is gone does not set state.
 *
 * @example
 * const { run, busy } = useSingleFlight();
 * const save = () => run(async () => { await saveName(name); });
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SingleFlight {
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  busy: boolean;
}

export function useSingleFlight(): SingleFlight {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await work();
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { run, busy };
}
