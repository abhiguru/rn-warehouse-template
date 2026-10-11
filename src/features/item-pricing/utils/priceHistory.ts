/**
 * What one entry of the price history changed (backend migration 48,
 * get_item_price_history). No text is built here: the screen names and formats the
 * fields (see priceHistoryLabels.ts).
 */
import type { ItemPriceHistoryAction, ItemPriceHistoryValues } from '@/types/item-pricing.types';

/** The fields a person sees, in the order shown. */
export type PriceHistoryField =
  | 'priceType'
  | 'monthlyPrice'
  | 'oneTimePrice'
  | 'weightBand'
  | 'labourRate'
  | 'tax'
  | 'effectiveFrom'
  | 'effectiveTo';

export interface WeightBand {
  min: number | null;
  max: number | null;
}

/** priceType, effectiveFrom, effectiveTo: text. weightBand: both ends. The rest: a number. Null: not there. */
export type PriceHistoryValue = string | number | WeightBand | null;

export interface PriceFieldChange {
  field: PriceHistoryField;
  /** The value before the change; null for a price that was added. */
  before: PriceHistoryValue;
  /** The value after the change; null for a price that was deleted. */
  after: PriceHistoryValue;
  /**
   * Set on the two price rows of an update that changed the price type: the old price exists
   * only under the old type's label ('before') and the new price only under the new one ('after').
   */
  only?: 'before' | 'after';
}

/** Which of an entry's two sides there are to show. */
export type PriceHistorySides = 'both' | 'before' | 'after' | 'none';

/** The fields after the price type and the price, in the order shown. */
const OTHER_FIELDS = ['weightBand', 'labourRate', 'tax', 'effectiveFrom', 'effectiveTo'] as const;

type PriceField = 'monthlyPrice' | 'oneTimePrice';

interface PriceRead extends Record<(typeof OTHER_FIELDS)[number], PriceHistoryValue> {
  priceType: string | null;
  /** The label the price goes under: that of its own type. */
  priceField: PriceField;
  price: number | null;
}

/** A JSON number, or a number sent as text ("5.00"); anything else is null. */
function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * A price has one price: `unit_price`, the only column billing reads, shown under the label
 * of the price's own type. `unit_price_monthly` and `unit_price_one_time` are compatibility
 * copies. The copy of the other type is never shown: it is not always 0 (the server's
 * default-pricing routine writes all three columns equal) and the server sets it to 0 on the
 * next update, which is not a change anyone made. The copy of the price's own type is read
 * only when a hand-made row has no `unit_price`. A row with no known type is read as monthly,
 * as the server's price lookup does.
 */
function read(values: ItemPriceHistoryValues): PriceRead {
  const oneTime = values.price_type === 'one_time';
  return {
    priceType: textOf(values.price_type),
    priceField: oneTime ? 'oneTimePrice' : 'monthlyPrice',
    price: numberOf(values.unit_price) ?? numberOf(oneTime ? values.unit_price_one_time : values.unit_price_monthly),
    weightBand: { min: numberOf(values.weight_min), max: numberOf(values.weight_max) },
    labourRate: numberOf(values.labour_rate),
    tax: numberOf(values.tax_percent),
    effectiveFrom: textOf(values.effective_from),
    effectiveTo: textOf(values.effective_to),
  };
}

const isBand = (value: PriceHistoryValue): value is WeightBand => typeof value === 'object' && value !== null;

function same(a: PriceHistoryValue, b: PriceHistoryValue): boolean {
  if (isBand(a) && isBand(b)) return a.min === b.min && a.max === b.max;
  return a === b;
}

const isValues = (values: ItemPriceHistoryValues | null | undefined): values is ItemPriceHistoryValues =>
  typeof values === 'object' && values !== null && !Array.isArray(values);

/**
 * Which sides of an entry are shown. It goes by the values that are there, not by the action
 * alone: an update that arrives with one side only is shown like a delete (old values) or an
 * insert (new values). An insert never has a "before" and a delete never an "after"; a
 * truncate has neither (its `old_values` is a count, see `truncatedPriceCount`).
 */
export function priceHistorySides(
  action: ItemPriceHistoryAction | string,
  oldValues: ItemPriceHistoryValues | null | undefined,
  newValues: ItemPriceHistoryValues | null | undefined
): PriceHistorySides {
  if (action === 'truncate') return 'none';
  const before = action !== 'insert' && isValues(oldValues);
  const after = action !== 'delete' && isValues(newValues);
  if (before && after) return 'both';
  return before ? 'before' : after ? 'after' : 'none';
}

/**
 * The fields of an entry, for the screen to show.
 *
 *   both sides   only the fields whose value differs, each with its old and new value; an
 *                empty list when nothing a person sees differs. When the price type changed,
 *                the old price under the old type's label and the new price under the new
 *                type's label (`only`), old first.
 *   one side     every field of that price (see `priceHistorySides`); the other side is null
 *   no side      an empty list
 */
export function priceHistoryChanges(
  action: ItemPriceHistoryAction | string,
  oldValues: ItemPriceHistoryValues | null | undefined,
  newValues: ItemPriceHistoryValues | null | undefined
): PriceFieldChange[] {
  const sides = priceHistorySides(action, oldValues, newValues);
  const before = (sides === 'both' || sides === 'before') && isValues(oldValues) ? read(oldValues) : null;
  const after = (sides === 'both' || sides === 'after') && isValues(newValues) ? read(newValues) : null;

  if (before && after) {
    const changes: PriceFieldChange[] = [];
    if (before.priceType !== after.priceType) {
      changes.push({ field: 'priceType', before: before.priceType, after: after.priceType });
    }
    if (before.priceField !== after.priceField) {
      changes.push({ field: before.priceField, before: before.price, after: null, only: 'before' });
      changes.push({ field: after.priceField, before: null, after: after.price, only: 'after' });
    } else if (before.price !== after.price) {
      changes.push({ field: before.priceField, before: before.price, after: after.price });
    }
    for (const field of OTHER_FIELDS) {
      if (!same(before[field], after[field])) changes.push({ field, before: before[field], after: after[field] });
    }
    return changes;
  }

  const whole = before ?? after;
  if (!whole) return [];
  const value = (side: PriceRead | null, field: 'priceType' | 'price' | (typeof OTHER_FIELDS)[number]) => (side ? side[field] : null);
  return [
    { field: 'priceType' as const, before: value(before, 'priceType'), after: value(after, 'priceType') },
    { field: whole.priceField, before: value(before, 'price'), after: value(after, 'price') },
    ...OTHER_FIELDS.map((field) => ({ field, before: value(before, field), after: value(after, field) })),
  ];
}

/** How many prices a truncate removed; null when the entry does not say. */
export function truncatedPriceCount(oldValues: ItemPriceHistoryValues | null | undefined): number | null {
  return isValues(oldValues) ? numberOf(oldValues.rows) : null;
}
