/**
 * The customers who have a rate of their own for an item, as the list of the item's customers shows them (the
 * count link on the item page, the "Customer rates" screen). Moved out of the item page so the page, the list and
 * their tests read the same rule.
 */
import type { ActiveItem, ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
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

/** One line of a customer's Pricing tab: an item the customer has an own rate for. */
export interface CustomerItemEntry {
  itemId: string;
  name: string;
  priceType: PriceType;
  /** The customer's bands in force on the day or, with only a later rate, the later rows. */
  bands: ItemStoragePrice[];
  /** The item's default bands of the same price type in force on the day (empty: no default rate). */
  defaultBands: ItemStoragePrice[];
  /** The start of the rate shown (the first band's). */
  since: string | null;
  /** The start of a rate that has not begun. */
  newRateFrom: string | null;
  /** The last day of a rate that stops. */
  rateEnds: string | null;
}

/**
 * One entry per active item the customer has an own rate in force or coming on `day`, by item name. `rates` holds
 * every row of every item (the session cache); the first price type of the customer (monthly before one-time)
 * is the one shown, and the default rate beside it is of the same type. An item that is not among `items` (no
 * longer active) has no entry, since its box cannot be opened.
 */
export function customerItemRows(
  rates: ItemStoragePrice[],
  items: ActiveItem[],
  customerId: string,
  day: string,
): CustomerItemEntry[] {
  const byItem = new Map<string, ItemStoragePrice[]>();
  for (const r of rates) {
    if (r.customer_id !== customerId) continue;
    byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]);
  }
  return items
    .filter(item => byItem.has(item.id))
    .map((item): CustomerItemEntry | null => {
      const first = planScope(byItem.get(item.id) as ItemStoragePrice[], day).plans[0];
      if (!first) return null;
      const bands = first.view.inForce.length > 0 ? first.view.inForce : first.view.upcoming?.rows ?? [];
      const defaults = planScope(rates.filter(r => r.item_id === item.id && r.customer_id === null), day).plans
        .find(p => p.priceType === first.priceType);
      return {
        itemId: item.id,
        name: item.name,
        priceType: first.priceType,
        bands,
        defaultBands: defaults?.view.inForce ?? [],
        since: bands[0]?.effective_from ?? null,
        newRateFrom: first.view.upcoming?.startsOn ?? null,
        rateEnds: first.view.stopsAfter ?? null,
      };
    })
    .filter((e): e is CustomerItemEntry => e !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
