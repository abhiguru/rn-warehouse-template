/**
 * The rate each lot of a GRN is invoiced at, for the Rates section of the Overview tab (backend migration 88).
 * Read once per mount and again when the screen regains focus (a rate may have changed in Item pricing).
 * Status: loading (first read), ready, error (unreachable or refused), unavailable (an older server, or no GRN id).
 * A re-read keeps the rows shown.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getGrnItemRates } from '@/services/item-pricing-service';
import type { RpcGrnItemRate } from '@/types/rpc-canonical.types';

export type GrnItemRatesStatus = 'loading' | 'ready' | 'error' | 'unavailable';

export interface UseGrnItemRatesResult {
  rates: RpcGrnItemRate[];
  priceType: 'monthly' | 'one_time';
  status: GrnItemRatesStatus;
  retry: () => Promise<void>;
}

export function useGrnItemRates(grnId?: string | null): UseGrnItemRatesResult {
  const [rates, setRates] = useState<RpcGrnItemRate[]>([]);
  const [priceType, setPriceType] = useState<'monthly' | 'one_time'>('monthly');
  const [status, setStatus] = useState<GrnItemRatesStatus>(grnId ? 'loading' : 'unavailable');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    if (!grnId) {
      setStatus('unavailable');
      return;
    }
    setStatus(current => (current === 'ready' ? current : 'loading'));
    try {
      const answer = await getGrnItemRates(grnId);
      if (mine !== seq.current) return;
      if (!answer) {
        setRates([]);
        setStatus('unavailable');
        return;
      }
      setRates(answer.rates);
      setPriceType(answer.price_type);
      setStatus('ready');
    } catch {
      if (mine !== seq.current) return;
      setStatus('error');
    }
  }, [grnId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        seq.current += 1; // drop an answer that arrives after the screen is left
      };
    }, [load]),
  );

  return { rates, priceType, status, retry: load };
}
