/**
 * True while the screens read a copy that does not hold the older records yet: offline in the second stage of the first
 * load (WH-299; Design offline-capture.md 2.6 and 2.10a). It ends when the connection returns or the load is complete.
 */
import { useSyncExternalStore } from 'react';
import { subscribeFacilityCapabilities } from '@/config/facilityCapabilities';
import { copyRoute } from './readRoute';
import { subscribeCopyOffline } from './syncEngine';
import { getSyncSnapshot, subscribeSync } from './syncStore';

function subscribe(listener: () => void): () => void {
  const stops = [subscribeSync(listener), subscribeCopyOffline(listener), subscribeFacilityCapabilities(listener)];
  return () => stops.forEach(stop => stop());
}

const absent = (): boolean => getSyncSnapshot().phase === 'stage2' && copyRoute('stage1') === 'copy';

export function useOlderRecordsAbsent(): boolean {
  return useSyncExternalStore(subscribe, absent, absent);
}
