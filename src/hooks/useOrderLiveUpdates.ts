import { useEffect, useRef } from 'react';
import { useLiveUpdates, type LiveUpdatesOptions } from '@/hooks/useLiveUpdates';
import { subscribeCopyChanges } from '@/features/phone-copy/copyChanges';
import type { EntityName } from '@/features/phone-copy/copySchema';
import { syncNow } from '@/features/phone-copy/syncEngine';
import { getSyncSnapshot } from '@/features/phone-copy/syncStore';
import { isWarehouseCopyRole } from '@/config/copyRoles';
import { useAppSelector } from '@/store/hooks';

export type OrderLiveUpdatesOptions = LiveUpdatesOptions;

/** Orders are re-read every 15 s: a customer's change should show on the staff screens within 15 s. */
export const ORDER_REFRESH_INTERVAL_MS = 15_000;

/** What an order screen shows, as records of the phone copy: a sync that changed one of them is read again (WH-328, contract 7). */
const ORDER_KINDS: ReadonlySet<EntityName> = new Set<EntityName>(['orders', 'order_items', 'customers', 'dispatch', 'goodsreceived_trl']);

/**
 * Keeps an order screen current while it is shown, the app is in the foreground and the device is online; the gating
 * and catch-up rules are those of `useLiveUpdates`.
 *
 * With the phone copy on for a warehouse role (WH-328, Product PQ2), the screen reads the copy, not the server: every 15 s
 * the timer asks the sync engine for a changes run instead, and the screen reads again when that run (or any other sync)
 * changed a record it shows. A customer account, and a phone with the feature off, re-read the server as before.
 */
export function useOrderLiveUpdates(
  refresh: () => void | Promise<void>,
  enabled = true,
  options: OrderLiveUpdatesOptions = {},
) {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const fromCopy = isWarehouseCopyRole(role) && getSyncSnapshot().feature === 'on';
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useLiveUpdates(fromCopy ? () => void syncNow('orders') : refresh, enabled, { ...options, intervalMs: ORDER_REFRESH_INTERVAL_MS });
  useEffect(() => {
    if (!fromCopy || !enabled) return undefined;
    return subscribeCopyChanges(changes => {
      for (const kind of changes.kinds) {
        if (ORDER_KINDS.has(kind)) {
          void refreshRef.current();
          return;
        }
      }
    });
  }, [fromCopy, enabled]);
}
