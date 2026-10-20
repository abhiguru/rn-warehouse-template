/**
 * The periods of an item's default rate, for the Pricing tab of the item page. Pure: no React, no clock.
 *
 * A period is the rows saved together: the same price type, start day and last day (one row per weight band).
 * Periods are listed newest first, Upcoming, then In force, then Ended.
 */
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { rateState, type RateState } from './rateModel';

export interface RatePeriod {
  /** price type | start | last day: stable between reads. */
  key: string;
  priceType: PriceType;
  state: RateState;
  from: string;
  /** The last day, or null when the rate has no end. */
  to: string | null;
  /** The weight bands of the period, lightest first. */
  rows: ItemStoragePrice[];
}

const byWeight = (a: ItemStoragePrice, b: ItemStoragePrice) => a.weight_min - b.weight_min || a.weight_max - b.weight_max;

/** Newest first: the later start comes first; on the same start the open-ended one. */
const newestFirst = (a: RatePeriod, b: RatePeriod) =>
  b.from.localeCompare(a.from) || (b.to ?? '9999-12-31').localeCompare(a.to ?? '9999-12-31');

/** The default rate (all customers) periods of one price type on `day`. */
export function ratePeriods(rows: ItemStoragePrice[], priceType: PriceType, day: string): RatePeriod[] {
  const groups = new Map<string, RatePeriod>();
  for (const row of rows) {
    if (row.customer_id !== null || row.price_type !== priceType) continue;
    const to = row.effective_to ?? null;
    const key = `${priceType}|${row.effective_from}|${to ?? ''}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, priceType, state: rateState(row, day), from: row.effective_from, to, rows: [row] });
  }
  const periods = [...groups.values()];
  for (const period of periods) period.rows.sort(byWeight);
  return periods.sort(newestFirst);
}
