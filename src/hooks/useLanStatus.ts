import { useSyncExternalStore } from 'react';
import { getLanStatus, subscribeLanStatus, toCanonicalUrl, viaCurrentPath, type LanStatus } from '@/config/lanTransport';

/** Which path requests go over (internet or warehouse network), the LAN address in use, and whether the fallback has a problem. */
export function useLanStatus(): LanStatus {
  return useSyncExternalStore(subscribeLanStatus, getLanStatus, getLanStatus);
}

/**
 * A link to a file on the facility's server (a signed photo URL), on the address the phone reaches the server by
 * now. It is worked out again whenever the path changes, so a photo already on screen follows the phone back to the
 * internet (or onto the warehouse network) instead of keeping the host it was signed with (WS-L review L6).
 */
export function useViaCurrentPath(url: string): string {
  useLanStatus();
  return viaCurrentPath(toCanonicalUrl(url));
}
