/**
 * Deleting an item, from the Items list (swipe, Delete) and from the item page (Overview, Delete item)
 * (G-57, G-30, G-31).
 *
 * The server is asked first where the item is used (get_item_usage). An item in use cannot be deleted, so the
 * person is told what uses it (GRN lines, order lines, rates set on single GRNs) and offered to deactivate it
 * instead, without a question that could only end in a refusal. Otherwise the question says how many rates go
 * with the item (delete_item_safe deletes its storage prices first). `rate_count` counts rates as the Item
 * pricing screens do: one customer (or the default), one price type and one start date each.
 * Offline, nothing is sent. A server that has no get_item_usage (an older one) is not asked: the question comes
 * first, and the server's own refusal says where the item is used.
 */
import { itemService } from '@/services/item-service';
import type { ItemUsage } from '@/types/item.types';
import { askAlert, showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { serverText } from '@/utils/serverText';
import { t } from '@/i18n';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('items');

export interface DeleteItemFlowOptions {
  /** Runs once the item is deleted (or is found gone), before the toast: remove the row, go back. */
  onDeleted: () => void;
  /** Deactivate instead, offered when the item is used and cannot be deleted. */
  onDeactivate: () => void | Promise<void>;
  /** True while the phone is offline: nothing is sent. */
  offline?: boolean;
  /** The caller is a form-like page (no pull to refresh): a timeout says to go back to the list and check. */
  form?: boolean;
}

/** Where an item is used, as the three counts the server refuses a delete on. */
interface UsedIn {
  grnLines: number;
  orderLines: number;
  grnRates: number;
}

/** The lines of "Can't delete {name}": where the item is used. */
function usedInMessage({ grnLines, orderLines, grnRates }: UsedIn, offerDeactivate: boolean): string {
  let message = `${t('items.delete.usedIn')}\n\n`;
  if (grnLines > 0) {
    message += `${t('items.delete.usedInLine', { count: t('items.delete.usedInGrnLines', { count: grnLines }) })}\n`;
  }
  if (orderLines > 0) {
    message += `${t('items.delete.usedInLine', { count: t('items.delete.usedInOrderLines', { count: orderLines }) })}\n`;
  }
  if (grnRates > 0) {
    message += `${t('items.delete.usedInLine', { count: t('items.delete.usedInGrnRates', { count: grnRates }) })}\n`;
  }
  return offerDeactivate ? `${message}\n${t('items.delete.deactivateInstead')}` : message.trimEnd();
}

/**
 * Resolves when the flow is over: the person cancelled, the question could not be asked, or the server has
 * answered the delete. A caller keeps its busy state until then, so nothing else is started in the middle.
 */
export async function deleteItemFlow(
  item: { id: string; name: string; active?: boolean },
  { onDeleted, onDeactivate, offline = false, form = false }: DeleteItemFlowOptions
): Promise<void> {
  if (offline) {
    showAlert(t('items.delete.couldNotDeleteTitle'), t('items.offline.connectToSave'));
    return;
  }

  /** The item is used: say where; offer to deactivate it instead when it is active. */
  const showCannotDelete = async (used: UsedIn, offerDeactivate: boolean) => {
    if (!offerDeactivate) {
      showAlert(t('items.delete.cannotDeleteTitle', { name: item.name }), usedInMessage(used, false), [{ text: t('common.ok') }]);
      return;
    }
    const choice = await askAlert<'deactivate' | 'cancel'>(
      t('items.delete.cannotDeleteTitle', { name: item.name }),
      usedInMessage(used, true),
      [
        { text: t('common.cancel'), style: 'cancel', value: 'cancel' },
        { text: t('items.list.deactivateItem'), value: 'deactivate' },
      ],
      'cancel'
    );
    if (choice === 'deactivate') await onDeactivate();
  };

  /** Someone else deleted it: the screen drops it too. */
  const showGone = () => {
    onDeleted();
    showAlert(t('items.delete.couldNotDeleteTitle'), t('items.form.someoneDeleted'), [{ text: t('common.ok') }]);
  };

  let usage;
  try {
    usage = await itemService.getItemUsage(item.id);
  } catch (error) {
    log.error('getItemUsage error', loggableError(error));
    showAlert(t('items.delete.couldNotDeleteTitle'), t('common.checkConnection'));
    return;
  }

  // Null when the server cannot say (no get_item_usage): ask first, and rely on delete_item_safe's refusal.
  let counts: ItemUsage | null = null;
  if (usage.success && usage.data) {
    counts = usage.data;
  } else if (usage.code !== 'SERVER_NEEDS_UPDATE') {
    if (usage.code === 'NOT_FOUND') {
      showGone();
      return;
    }
    showAlert(t('items.delete.couldNotDeleteTitle'), serverText(usage, t('items.list.tryAgainInAMoment')));
    return;
  }

  if (counts?.in_use) {
    await showCannotDelete({ grnLines: counts.grn_lines, orderLines: counts.order_lines, grnRates: counts.grn_rates }, counts.active);
    return;
  }

  const message = !counts
    ? t('items.delete.confirmMessagePricesUnknown')
    : counts.rate_count === 0
      ? t('items.delete.confirmMessage')
      : t('items.delete.confirmMessageWithPrices', { count: counts.rate_count });

  const choice = await askAlert<'delete' | 'cancel'>(
    t('items.delete.confirmTitle', { name: item.name }),
    message,
    [
      { text: t('common.cancel'), style: 'cancel', value: 'cancel' },
      { text: t('items.delete.deleteItem'), style: 'destructive', value: 'delete' },
    ],
    'cancel'
  );
  if (choice !== 'delete') return;

  try {
    const result = await itemService.deleteItem(item.id);
    if (result.success) {
      onDeleted();
      showToast(t('items.delete.deletedMessage', { name: item.name }));
    } else if (result.references) {
      // Used since it was counted (a GRN saved a moment ago), or the server could not be asked before.
      const { grn_items_count, order_items_count, grn_rates_count } = result.references;
      await showCannotDelete(
        { grnLines: grn_items_count, orderLines: order_items_count, grnRates: grn_rates_count ?? 0 },
        counts?.active ?? item.active ?? true
      );
    } else if (result.code === 'NOT_FOUND' || /not found/i.test(result.serverMessage ?? '')) {
      // Deleted by someone else between the count and the tap (an older server has the text only).
      showGone();
    } else {
      showAlert(t('items.delete.couldNotDeleteTitle'), serverText(result.message, t('items.list.tryAgainInAMoment'), { write: true, form }));
    }
  } catch (error) {
    log.error('deleteItem error', loggableError(error));
    showAlert(t('items.delete.couldNotDeleteTitle'), t('common.checkConnection'));
  }
}
