import { useLiveUpdates, type LiveUpdatesOptions } from '@/hooks/useLiveUpdates';

export type OrderLiveUpdatesOptions = LiveUpdatesOptions;

/** Orders are re-read every 15 s: a customer's change should show on the staff screens within 15 s. */
export const ORDER_REFRESH_INTERVAL_MS = 15_000;

/**
 * Keeps an order screen current while it is shown, the app is in the foreground and the device is online; the gating
 * and catch-up rules are those of `useLiveUpdates`. Orders are never in the phone copy (WH-381): every role re-reads
 * the server, and with no connection nothing is read.
 */
export function useOrderLiveUpdates(
  refresh: () => void | Promise<void>,
  enabled = true,
  options: OrderLiveUpdatesOptions = {},
) {
  useLiveUpdates(refresh, enabled, { ...options, intervalMs: ORDER_REFRESH_INTERVAL_MS });
}
