import { useLiveUpdates, type LiveUpdatesOptions } from '@/hooks/useLiveUpdates';
import { subscribeToOrderChanges } from '@/services/order-live-updates';

export type OrderLiveUpdatesOptions = LiveUpdatesOptions;

/**
 * Follows changes to orders while the signed-in user's order screen is shown, the
 * app is in the foreground and the device is online; the gating and catch-up rules
 * are those of `useLiveUpdates`.
 */
export function useOrderLiveUpdates(
  refresh: () => void | Promise<void>,
  enabled = true,
  options: OrderLiveUpdatesOptions = {},
) {
  useLiveUpdates(subscribeToOrderChanges, refresh, enabled, options);
}
