/**
 * Which items have no rate (the Items list: its strip, its "No rate" tag and its "No rate" filter). Pure: no React.
 *
 * "No rate" is an ACTIVE item with no default rate (all customers) in force on the day, of either kind: an item whose
 * only rate starts later, or whose rate was stopped and has ended, has none. A deactivated item is never listed:
 * `items` holds the active items only (listActiveItems).
 */
import type { ActiveItem, ItemStoragePrice } from '@/types/item-pricing.types';
import { rateState } from './rateModel';

export function itemIdsWithoutRate(items: ActiveItem[], rates: ItemStoragePrice[], day: string): Set<string> {
  const rated = new Set<string>();
  for (const rate of rates) {
    if (rate.customer_id === null && rateState(rate, day) === 'inForce') rated.add(rate.item_id);
  }
  return new Set(items.filter(item => !rated.has(item.id)).map(item => item.id));
}
