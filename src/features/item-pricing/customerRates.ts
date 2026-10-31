/** What a customer's Pricing tab shows: the items the customer has an own rate for. */
import type { ActiveItem, ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { planScope } from './scopePlan';

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
  /** The item is deactivated: its rate is shown for reading only (the item's rate box cannot be opened). */
  deactivated: boolean;
}

/**
 * One entry per item the customer has an own rate in force or coming on `day`, by item name. `rates` holds
 * every row of every item (the session cache); the first price type of the customer (monthly before one-time)
 * is the one shown, and the default rate beside it is of the same type. An item that is not among `items` (no
 * longer active) still has its entry, marked `deactivated` and named by its rate rows: GRNs of it that are not
 * invoiced yet still invoice at this rate. Its box cannot be opened, so the entry is for reading only.
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
  const known = new Set(items.map(item => item.id));
  const named: { id: string; name: string; deactivated: boolean }[] = [
    ...items.filter(item => byItem.has(item.id)).map(item => ({ id: item.id, name: item.name, deactivated: false })),
    ...[...byItem.keys()]
      .filter(id => !known.has(id))
      .map(id => ({ id, name: (byItem.get(id) as ItemStoragePrice[])[0].item_name, deactivated: true })),
  ];
  return named
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
        deactivated: item.deactivated,
      };
    })
    .filter((e): e is CustomerItemEntry => e !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
