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

export const rateState = (row: Pick<ItemStoragePrice, 'effective_from' | 'effective_to'>, day: string): RateState => {
  if (row.effective_to && row.effective_to < day) return 'ended';
  if (row.effective_from > day) return 'upcoming';
  return 'inForce';
};

export const scopeKey = (row: Pick<ItemStoragePrice, 'item_id' | 'customer_id' | 'price_type'>): string =>
  `${row.item_id}|${row.customer_id ?? 'default'}|${row.price_type}`;

const byWeight = (a: ItemStoragePrice, b: ItemStoragePrice) => a.weight_min - b.weight_min || a.weight_max - b.weight_max;

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
