/**
 * When the "Find goods" view is offered (WH-300, product/tech/app-offline-find-goods.md section 5). Synchronous, so a
 * screen can follow it with `useSyncExternalStore`.
 */
import { useSyncExternalStore } from 'react';
import { subscribeFacilityCapabilities } from '@/config/facilityCapabilities';
import { copyEligible } from '@/features/phone-copy/readRoute';
import { READ_FORMAT } from '@/features/phone-copy/copySchema';
import { getSyncSnapshot, subscribeSync } from '@/features/phone-copy/syncStore';

export type FindGoodsState = 'hidden' | 'loading' | 'ready';

export function findGoodsState(): FindGoodsState {
  if (!copyEligible()) return 'hidden';
  // `copyEligible` has ruled out feature 'off'; before the first load the feature is still 'unknown': the skeleton shows.
  const { format, phase } = getSyncSnapshot();
  if (format !== undefined && format < READ_FORMAT) return 'hidden';
  return phase === 'ready' ? 'ready' : 'loading';
}

function subscribe(listener: () => void): () => void {
  const stops = [subscribeSync(listener), subscribeFacilityCapabilities(listener)];
  return () => stops.forEach(stop => stop());
}

export function useFindGoodsState(): FindGoodsState {
  return useSyncExternalStore(subscribe, findGoodsState, findGoodsState);
}
