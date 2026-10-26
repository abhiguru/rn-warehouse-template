import { useSyncExternalStore } from 'react';
import { getLanStatus, subscribeLanStatus, type LanStatus } from '@/config/lanTransport';

/** Which path requests go over (internet or warehouse network), the LAN address in use, and whether the fallback has a problem. */
export function useLanStatus(): LanStatus {
  return useSyncExternalStore(subscribeLanStatus, getLanStatus, getLanStatus);
}
