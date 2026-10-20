/**
 * Deleting an item, from the Items list (swipe, Delete) and from Edit item
 * (G-57, G-30, G-31).
 *
 * The question names what goes with the item: delete_item_safe deletes the
 * item's storage prices first, so the question says how many rates go (read before
 * asking, as rates: one customer, one price type and one start date each). When the server refuses because the item is used, the refusal
 * lists where (GRN lines, order lines) and offers to deactivate instead.
 */
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { serverText } from '@/utils/serverText';
import { t } from '@/i18n';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('items');

export interface DeleteItemFlowOptions {
  /** Runs once the item is deleted, before the toast (remove the row, go back). */
  onDeleted: () => void;
  /** Deactivate instead, offered when the item is used and cannot be deleted. */
  onDeactivate: () => void;
}

const RATE_PAGE = 200;
const RATE_PAGES_MAX = 10;

/**
 * How many rates the item has: a number, or null when the lookup did not answer. A rate is
 * what the Item pricing screens show: one customer (or the default), one price type and one
 * start date, however many weight bands it has. Ended and planned rates count too.
 */
async function rateCount(itemId: string): Promise<number | null> {
  try {
    const rates = new Set<string>();
    for (let page = 0; page < RATE_PAGES_MAX; page += 1) {
      const response = await getItemStoragePrices({
        p_filters: { item_ids: [itemId], include_expired: true },
        p_limit: RATE_PAGE,
        p_offset: page * RATE_PAGE,
      });
      if (!response.success) return null;
      const rows = response.data ?? [];
      for (const row of rows) rates.add(`${row.customer_id ?? 'default'}|${row.price_type}|${row.effective_from}`);
      if (rows.length < RATE_PAGE) return rates.size;
    }
    return rates.size;
  } catch {
    return null;
  }
}

/** The lines of "Can't delete this item": where the item is used. */
function usedInMessage(references: NonNullable<Awaited<ReturnType<typeof itemService.deleteItem>>['references']>): string {
  let message = `${t('items.delete.usedIn')}\n\n`;
  if (references.grn_items_count > 0) {
    message += `${t('items.delete.usedInLine', { count: t('items.delete.usedInGrnLines', { count: references.grn_items_count }) })}\n`;
  }
  if (references.order_items_count > 0) {
    message += `${t('items.delete.usedInLine', { count: t('items.delete.usedInOrderLines', { count: references.order_items_count }) })}\n`;
  }
  return `${message}\n${t('items.delete.deactivateInstead')}`;
}

export async function deleteItemFlow(item: { id: string; name: string }, { onDeleted, onDeactivate }: DeleteItemFlowOptions): Promise<void> {
  const prices = await rateCount(item.id);
  const message =
    prices === null
      ? t('items.delete.confirmMessagePricesUnknown')
      : prices === 0
        ? t('items.delete.confirmMessage')
        : t('items.delete.confirmMessageWithPrices', { count: prices });

  showAlert(t('items.delete.confirmTitle', { name: item.name }), message, [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('items.delete.deleteItem'),
      style: 'destructive',
      onPress: async () => {
        try {
          const result = await itemService.deleteItem(item.id);
          if (result.success) {
            onDeleted();
            showToast(t('items.delete.deletedMessage', { name: item.name }));
          } else if (result.references) {
            showAlert(t('items.delete.cannotDeleteTitle'), usedInMessage(result.references), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('items.list.deactivateItem'), onPress: onDeactivate },
            ]);
          } else {
            showAlert(t('items.delete.couldNotDeleteTitle'), serverText(result.message, t('items.list.tryAgainInAMoment'), { write: true }));
          }
        } catch (error) {
          log.error('deleteItem error', loggableError(error));
          showAlert(t('items.delete.couldNotDeleteTitle'), t('common.checkConnection'));
        }
      },
    },
  ]);
}
