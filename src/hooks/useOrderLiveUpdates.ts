import { useLiveUpdates, type LiveUpdatesOptions } from '@/hooks/useLiveUpdates';

export type OrderLiveUpdatesOptions = LiveUpdatesOptions;

/** Orders are re-read every 15 s: a customer's change should show on the staff screens within 15 s. */
export const ORDER_REFRESH_INTERVAL_MS = 15_000;

/**
 * Re-reads orders every 15 s while the signed-in user's order screen is shown, the
 * app is in the foreground and the device is online; the gating and catch-up rules
 * are those of `useLiveUpdates`.
 */
export function useOrderLiveUpdates(
  refresh: () => void | Promise<void>,
  enabled = true,
  options: OrderLiveUpdatesOptions = {},
) {
  useLiveUpdates(refresh, enabled, { ...options, intervalMs: ORDER_REFRESH_INTERVAL_MS });
}
