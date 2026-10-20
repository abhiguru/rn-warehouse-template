/**
 * The toast after an item is activated (swipe on the Items list, Activate on the item page).
 *
 * An item that turns active with no default rate gets the standard rate from the server (update_item,
 * migration 85), and the server says so in its answer (`rate_source: 'standard'`). The toast mentions the rate
 * only then; an older server says nothing, and the plain toast is shown.
 */
import { showToast } from '@/utils/toast';
import { t } from '@/i18n';

export function showActivatedToast(name: string, rateSource?: string): void {
  showToast(t(rateSource === 'standard' ? 'items.list.activatedStandardToast' : 'items.list.activatedToast', { name }));
}

export function showDeactivatedToast(name: string): void {
  showToast(t('items.list.deactivatedToast', { name }));
}
