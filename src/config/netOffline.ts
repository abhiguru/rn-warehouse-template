/**
 * "The phone is offline" outside React (WH-298), for the sync engine and its lifecycle: the same rule as `useIsOffline`
 * (src/hooks/useNetworkStatus.ts), which the status bar reads. A change to one is made to the other.
 *
 * Offline when NetInfo says there is no connection, or when the facility's server is not reachable over the internet
 * (NetInfo's probe of the facility's `hello`, src/config/netReachability.ts) unless the warehouse network path reaches
 * it without a failure (src/config/lanTransport.ts). Imports types only.
 */
import type { LanStatus } from './lanTransport';

export interface NetSnapshot {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

/** A state NetInfo did not give (null or undefined) is not offline: not knowing proves nothing. */
export function isOfflineState(net: NetSnapshot | null | undefined, lan: Pick<LanStatus, 'path' | 'failure'>): boolean {
  if (!net) return false;
  if (net.isConnected !== true) return true;
  if (net.isInternetReachable === false) return !(lan.path === 'lan' && lan.failure === null);
  return false;
}
