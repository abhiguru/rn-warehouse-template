/**
 * The stored rates of a GRN's items, for the Rates section of the Review step. Read again when the step
 * gains focus (a rate may have been changed in Item pricing meanwhile) and when the items, customer, day or
 * price type change. Offline or failed: status 'error', and the GRN cannot be saved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { listRatesOfItems } from '@/services/item-pricing-service';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

export type GrnRatesStatus = 'loading' | 'ready' | 'error';

export interface UseGrnRatesResult {
  rates: ItemStoragePrice[];
  status: GrnRatesStatus;
  offline: boolean;
  refresh: () => Promise<void>;
}

export function useGrnRates(itemIds: string[], dependsOn: string): UseGrnRatesResult {
  const offline = useIsOffline();
  const [rates, setRates] = useState<ItemStoragePrice[]>([]);
  const [status, setStatus] = useState<GrnRatesStatus>('loading');
  const seq = useRef(0);
  const idsKey = [...new Set(itemIds)].sort().join(',');

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const ids = idsKey ? idsKey.split(',') : [];
    setStatus(current => (current === 'ready' ? current : 'loading'));
    try {
      const rows = await listRatesOfItems(ids);
      if (mine !== seq.current) return;
      setRates(rows);
      setStatus('ready');
    } catch {
      if (mine !== seq.current) return;
      setStatus('error');
    }
  }, [idsKey]);

  // The items, customer, day or price type changed: the rows shown are of the old ones until the new read arrives.
  useEffect(() => {
    setStatus('loading');
    void refresh();
    // dependsOn: the customer, day and price type the caller prices for.
  }, [refresh, dependsOn]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { rates, status: offline && status !== 'ready' ? 'error' : status, offline, refresh };
}
