/**
 * What the rate screens show, worked out from the stored rows. Pure: no React, no clock.
 *
 * Days are 'YYYY-MM-DD' strings and are compared as strings, never as Dates: a rate is
 * "ended" on a day when its last day is before it. This mirrors the server's
 * find_storage_price, so the screens say what an invoice will use.
 */
import { parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import type { ActiveItem, ItemStoragePrice, PriceType } from '@/types/item-pricing.types';

const nextDay = (day: string): string => {
  const d = parseLocalISODate(day);
  d.setDate(d.getDate() + 1);
  return toLocalISODate(d);
};

export type RateState = 'inForce' | 'upcoming' | 'ended';

export interface UpcomingGroup {
  startsOn: string;
  rows: ItemStoragePrice[];
}

export interface ScopeView {
  /** Rows in force on the day, by weight. */
  inForce: ItemStoragePrice[];
  /** The soonest rate that starts after the day (a later second start is ignored). */
  upcoming: UpcomingGroup | null;
  /** Rows whose last day is before the day, newest first. */
  ended: ItemStoragePrice[];
  /** Two rows in force whose weights intersect (old data), else null. */
  overlap: ItemStoragePrice[] | null;
  /** The one last day shared by every row in force, when there is one. */
  stopsAfter: string | null;
}

export interface ItemRates {
  item: ActiveItem;
  rows: ItemStoragePrice[];
}

export interface ItemSummaryFilters {
  customerIds?: string[];
  priceType?: 'all' | PriceType;
  needsRate?: boolean;
}

export interface ItemSummary {
  itemId: string;
  name: string;
  /** Type of the rate the row shows: monthly if the item has one in force, else one-time, else null. */
  priceType: PriceType | null;
  /** The rates shown in the row (the default's, or the chosen customer's own). */
  bands: ItemStoragePrice[];
  minRent: number | null;
  maxRent: number | null;
  /** Labour of the bands when they all agree, else the highest. */
  labour: number | null;
  /** The lowest labour of the bands (equal to `labour` when they agree). */
  labourMin: number | null;
  tax: number | null;
  /** The highest tax of the bands (equal to `tax` when they agree). */
  taxMax: number | null;
  weightMin: number | null;
  weightMax: number | null;
  /** Customers who have their own rate in force or coming. */
  customerRateCount: number;
  /** Start of the default rate that comes next. */
  upcomingFrom: string | null;
  /** The day the rate in force stops, when it does. */
  rateEnds: string | null;
  /** No default rate in force on the day. */
  noRateToday: boolean;
  /** The Customer filter is set and this customer has a rate of their own. */
  ownRate: boolean;
  /** The Customer filter is set and the figure is the customer's own rate (name for the search line). */
  ownRateCustomer: string | null;
  /** Rows in the shown scope that cover the same weights. */
  overlap: boolean;
}

export const rateState = (row: Pick<ItemStoragePrice, 'effective_from' | 'effective_to'>, day: string): RateState => {
  if (row.effective_to && row.effective_to < day) return 'ended';
  if (row.effective_from > day) return 'upcoming';
  return 'inForce';
};

export const scopeKey = (row: Pick<ItemStoragePrice, 'item_id' | 'customer_id' | 'price_type'>): string =>
  `${row.item_id}|${row.customer_id ?? 'default'}|${row.price_type}`;

const byWeight = (a: ItemStoragePrice, b: ItemStoragePrice) => a.weight_min - b.weight_min || a.weight_max - b.weight_max;

export function groupByItem(rows: ItemStoragePrice[], items: ActiveItem[]): ItemRates[] {
  const byItem = new Map<string, ItemStoragePrice[]>();
  for (const r of rows) {
    const list = byItem.get(r.item_id);
    if (list) list.push(r);
    else byItem.set(r.item_id, [r]);
  }
  return items.map(item => ({ item, rows: byItem.get(item.id) ?? [] }));
}

export function scopeView(rows: ItemStoragePrice[], day: string): ScopeView {
  const inForce: ItemStoragePrice[] = [];
  const later: ItemStoragePrice[] = [];
  const ended: ItemStoragePrice[] = [];
  for (const r of rows) {
    const state = rateState(r, day);
    if (state === 'inForce') inForce.push(r);
    else if (state === 'upcoming') later.push(r);
    else ended.push(r);
  }
  inForce.sort(byWeight);
  ended.sort((a, b) => (b.effective_to ?? '').localeCompare(a.effective_to ?? '') || b.effective_from.localeCompare(a.effective_from) || byWeight(a, b));

  let upcoming: UpcomingGroup | null = null;
  if (later.length > 0) {
    const startsOn = later.reduce((min, r) => (r.effective_from < min ? r.effective_from : min), later[0].effective_from);
    upcoming = { startsOn, rows: later.filter(r => r.effective_from === startsOn).sort(byWeight) };
  }

  let overlap: ItemStoragePrice[] | null = null;
  for (let i = 0; i < inForce.length && !overlap; i++) {
    for (let j = i + 1; j < inForce.length; j++) {
      if (inForce[i].weight_min <= inForce[j].weight_max && inForce[j].weight_min <= inForce[i].weight_max) {
        overlap = [inForce[i], inForce[j]];
        break;
      }
    }
  }

  const ends = new Set(inForce.map(r => r.effective_to));
  const only = inForce.length > 0 && ends.size === 1 ? [...ends][0] : null;
  // A rate that is followed by a new one (saving a change ends the old rate the day before) is not "stopping".
  const followed = only !== null && upcoming !== null && upcoming.startsOn <= nextDay(only);
  return { inForce, upcoming, ended, overlap, stopsAfter: only && !followed ? only : null };
}

/** The rate an invoice uses for one bag of `weight` kg (mirror of find_storage_price). */
export function applicableRate(
  rows: ItemStoragePrice[],
  q: { customer_id: string | null; weight: number; price_type: PriceType; day: string },
): ItemStoragePrice | undefined {
  const holds = (r: ItemStoragePrice) =>
    r.price_type === q.price_type && rateState(r, q.day) === 'inForce' && r.weight_min <= q.weight && q.weight <= r.weight_max;
  const pick = (list: ItemStoragePrice[]) =>
    [...list].sort((a, b) => (a.weight_max - a.weight_min) - (b.weight_max - b.weight_min) || b.effective_from.localeCompare(a.effective_from))[0];
  if (q.customer_id) {
    const own = rows.filter(r => r.customer_id === q.customer_id && holds(r));
    if (own.length > 0) return pick(own);
  }
  return pick(rows.filter(r => r.customer_id === null && holds(r)));
}

const TYPES: PriceType[] = ['monthly', 'one_time'];

/** The figures of one item row on the list, for the day. */
export function itemSummary(itemRates: ItemRates, day: string, filters: ItemSummaryFilters = {}): ItemSummary {
  const { item, rows } = itemRates;
  const defaults = rows.filter(r => r.customer_id === null);
  const typeFilter = filters.priceType && filters.priceType !== 'all' ? filters.priceType : null;

  // Each scope's view is worked out once per call.
  const views = new Map<string, ScopeView>();
  const viewOf = (type: PriceType, customerId: string | null): ScopeView => {
    const key = `${type}|${customerId ?? ''}`;
    let view = views.get(key);
    if (!view) {
      view = scopeView(rows.filter(r => r.price_type === type && r.customer_id === customerId), day);
      views.set(key, view);
    }
    return view;
  };

  const candidates = typeFilter ? [typeFilter] : TYPES;
  const headline = candidates.find(type => viewOf(type, null).inForce.length > 0) ?? null;
  const defaultView = headline ? viewOf(headline, null) : null;

  // With a Customer filter the row shows what that customer pays: their own rate, else the default.
  let bands = defaultView?.inForce ?? [];
  let shownType = headline;
  let ownRateCustomer: string | null = null;
  let ownView: ScopeView | null = null;
  const ids = filters.customerIds ?? [];
  if (ids.length > 0) {
    for (const type of candidates) {
      const own = ids.map(id => ({ id, view: viewOf(type, id) })).find(c => c.view.inForce.length > 0);
      if (own) {
        bands = own.view.inForce;
        ownView = own.view;
        shownType = type;
        ownRateCustomer = rows.find(r => r.customer_id === own.id)?.customer_name ?? null;
        break;
      }
    }
  }

  // Customers with a rate of their own (in force or coming), not those whose rates all ended.
  const customers = new Set<string>();
  for (const r of rows) {
    if (r.customer_id && rateState(r, day) !== 'ended') customers.add(r.customer_id);
  }

  const upcomingStarts = TYPES.map(type => viewOf(type, null).upcoming?.startsOn).filter((d): d is string => Boolean(d));
  const anyDefaultInForce = defaults.some(r => rateState(r, day) === 'inForce');
  const hasShown = bands.length > 0;
  const labours = bands.map(b => b.labour_rate);
  // The customer's full view (a following rate is known), not the in-force rows alone.
  const shownView = ownView ?? defaultView;

  return {
    itemId: item.id,
    name: item.name,
    priceType: hasShown ? shownType : null,
    bands,
    minRent: hasShown ? Math.min(...bands.map(b => b.unit_price)) : null,
    maxRent: hasShown ? Math.max(...bands.map(b => b.unit_price)) : null,
    labour: hasShown ? Math.max(...labours) : null,
    labourMin: hasShown ? Math.min(...labours) : null,
    tax: hasShown ? Math.min(...bands.map(b => b.tax_percent)) : null,
    taxMax: hasShown ? Math.max(...bands.map(b => b.tax_percent)) : null,
    weightMin: hasShown ? Math.min(...bands.map(b => b.weight_min)) : null,
    weightMax: hasShown ? Math.max(...bands.map(b => b.weight_max)) : null,
    customerRateCount: customers.size,
    upcomingFrom: upcomingStarts.length > 0 ? upcomingStarts.sort()[0] : null,
    rateEnds: shownView?.stopsAfter ?? null,
    noRateToday: !anyDefaultInForce,
    ownRate: ownRateCustomer !== null,
    ownRateCustomer,
    overlap: Boolean(defaultView?.overlap),
  };
}
