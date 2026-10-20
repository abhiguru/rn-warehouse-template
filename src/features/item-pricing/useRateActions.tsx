/**
 * What the item page and the customer-rate page do to a rate besides editing its box: open the stop
 * screen, cancel a rate that has not started (a dialog, then undo_rate_change), and undo a stop
 * (undo_rate_change from the day after the last day).
 * Each result ends with notifyRatesChanged so every screen that shows the item refetches it.
 */
import React, { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { undoRateChange } from '@/services/item-pricing-service';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { t } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { notifyRatesChanged, stopPath } from './contract';
import type { UpcomingGroup } from './rateModel';
import { cancelMessage } from './cancelText';
import { addDays, dateText, rentRange } from './rateText';

export interface RateScope {
  priceType: PriceType;
  customerId: string | null;
  customerName?: string | null;
  /** Rows in force (may be empty when only a later rate exists). */
  bands: ItemStoragePrice[];
  upcoming: UpcomingGroup | null;
  stopsAfter: string | null;
  /** Every row id of this scope the screen loaded (item, customer, price type), ended and planned too: sent as p_seen_rows. */
  seenRows: string[];
}

export function useRateActions(item: { id: string; name: string }) {
  const [cancelling, setCancelling] = useState<RateScope | null>(null);
  const [busy, setBusy] = useState(false);

  const who = (scope: RateScope) => ({
    ...(scope.customerId ? { customer_id: scope.customerId, customer_name: scope.customerName ?? undefined } : {}),
  });

  const stop = useCallback(
    (scope: RateScope) => router.push(stopPath({ item_id: item.id, item_name: item.name, price_type: scope.priceType, ...who(scope) })),
    [item.id, item.name],
  );
  const askCancel = useCallback((scope: RateScope) => setCancelling(scope), []);

  const confirmCancel = useCallback(async () => {
    const scope = cancelling;
    if (!scope?.upcoming) return;
    setBusy(true);
    try {
      const result = await undoRateChange({
        itemId: item.id,
        customerId: scope.customerId,
        priceType: scope.priceType,
        startsOn: scope.upcoming.startsOn,
        seenRows: scope.seenRows,
      });
      // Show what the server has now, whatever the answer was.
      notifyRatesChanged(item.id);
      setCancelling(null);
      if (result.success) showToast(t('pricing.cancel.done'));
      else showAlert(t('pricing.cancel.failedTitle'), result.errorCode === 'STALE_RATES' ? t('pricing.error.staleRatesAction') : (result.message ?? t('pricing.cancel.failed')));
    } finally {
      setBusy(false);
    }
  }, [cancelling, item.id]);

  const undoStop = useCallback(
    async (scope: RateScope) => {
      if (!scope.stopsAfter) return;
      setBusy(true);
      try {
        const result = await undoRateChange({
          itemId: item.id,
          customerId: scope.customerId,
          priceType: scope.priceType,
          startsOn: addDays(scope.stopsAfter, 1),
          seenRows: scope.seenRows,
        });
        notifyRatesChanged(item.id);
        if (result.success) showToast(t('pricing.undo.done'));
        else showAlert(t('pricing.undo.failedTitle'), result.errorCode === 'STALE_RATES' ? t('pricing.error.staleRatesAction') : (result.message ?? t('pricing.error.generic')));
      } finally {
        setBusy(false);
      }
    },
    [item.id],
  );

  const current = cancelling && cancelling.bands.length > 0
    ? rentRange(Math.min(...cancelling.bands.map(b => b.unit_price)), Math.max(...cancelling.bands.map(b => b.unit_price)))
    : null;
  const incoming = cancelling?.upcoming
    ? rentRange(Math.min(...cancelling.upcoming.rows.map(r => r.unit_price)), Math.max(...cancelling.upcoming.rows.map(r => r.unit_price)))
    : '';

  const dialog = (
    <ConfirmDialog
      visible={cancelling !== null}
      variant="danger"
      title={t('pricing.cancel.title', { date: cancelling?.upcoming ? dateText(cancelling.upcoming.startsOn) : '' })}
      message={cancelMessage(cancelling, current, incoming)}
      confirmText={t('pricing.cancel.confirm')}
      cancelText={t('pricing.cancel.keep')}
      onConfirm={() => { void confirmCancel(); }}
      onCancel={() => setCancelling(null)}
      busy={busy}
      testID="cancel-rate-dialog"
    />
  );

  return { busy, stop, askCancel, undoStop, dialog };
}
