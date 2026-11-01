import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderEffect } from '@/services/orderEffects';

/**
 * The order effects of the save a Review step is about to make. They are read when `enabled` becomes true and again
 * whenever `key` (a text that changes with the form) changes; `refresh` reads them once more and answers them, so the
 * question before a save shows what the server says now. An answer that arrives after a newer read is dropped.
 */
export function useOrderEffectsPreview(enabled: boolean, key: string, fetcher: () => Promise<OrderEffect[] | null>) {
  const [effects, setEffects] = useState<OrderEffect[] | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const latest = useRef(0);

  const refresh = useCallback(async (): Promise<OrderEffect[] | null> => {
    const mine = ++latest.current;
    let result: OrderEffect[] | null = null;
    try {
      result = await fetcherRef.current();
    } catch {
      // A preview is a courtesy: whatever goes wrong, the question is asked as it always was.
    }
    if (mine === latest.current) setEffects(result);
    return result;
  }, []);

  useEffect(() => {
    if (!enabled) {
      latest.current += 1;
      setEffects(null);
      return;
    }
    void refresh();
  }, [enabled, key, refresh]);

  return { effects, refresh };
}
