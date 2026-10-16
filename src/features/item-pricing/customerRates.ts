/**
 * The customers who have a rate of their own for an item, as the list of the item's customers shows them (the
 * count link on the item page, the "Customer rates" screen). Moved out of the item page so the page, the list and
 * their tests read the same rule.
 */
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { planScope } from './scopePlan';

export interface CustomerRateEntry {
  id: string;
  name: string;
  /** The rows in force on the day or, with only a later rate, the later rows. */
  bands: ItemStoragePrice[];
  /** The start of a rate that has not begun, when it is what the entry shows. */
  newRateFrom: string | null;
  priceType: PriceType;
}

/**
 * One entry per customer who has an own rate in force or coming on `day`, by name. The first price type
 * the customer has (monthly before one-time) is the one shown; a customer whose rates all ended has no entry.
 */
export function customerRows(rows: ItemStoragePrice[], day: string): CustomerRateEntry[] {
  const ids = [...new Set(rows.filter(r => r.customer_id).map(r => r.customer_id as string))];
  return ids
    .map(id => {
      const own = rows.filter(r => r.customer_id === id);
      const plan = planScope(own, day);
      const first = plan.plans[0];
      if (!first) return null;
      const bands = first.view.inForce.length > 0 ? first.view.inForce : first.view.upcoming?.rows ?? [];
      return {
        id,
        name: own[0].customer_name ?? '',
        bands,
        newRateFrom: first.view.upcoming?.startsOn ?? null,
        priceType: first.priceType,
      };
    })
    .filter((r): r is CustomerRateEntry => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
