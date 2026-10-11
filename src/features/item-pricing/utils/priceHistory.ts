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
}

const FIELDS: readonly PriceHistoryField[] = [
  'priceType',
  'monthlyPrice',
  'oneTimePrice',
  'weightBand',
  'labourRate',
  'tax',
  'effectiveFrom',
  'effectiveTo',
];

/** A JSON number, or a number sent as text ("5.00"); anything else is null. */
function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * The price of one kind. The server keeps the price three times: `unit_price`, and a column
 * for each kind, of which the one that matches `price_type` repeats `unit_price` and the
 * other is 0. So `unit_price` is read as the price of the price's own kind and is never a
 * field of its own: a price that went from 5 to 6 is one change, not two.
 */
function priceOfKind(values: ItemPriceHistoryValues, kind: 'monthly' | 'one_time'): number | null {
  const own = numberOf(kind === 'monthly' ? values.unit_price_monthly : values.unit_price_one_time);
  return values.price_type === kind ? (numberOf(values.unit_price) ?? own) : own;
}

function read(values: ItemPriceHistoryValues): Record<PriceHistoryField, PriceHistoryValue> {
  return {
    priceType: textOf(values.price_type),
    monthlyPrice: priceOfKind(values, 'monthly'),
    oneTimePrice: priceOfKind(values, 'one_time'),
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

/** In the list of a whole price: the price of the other kind is left out while it is 0 or missing. */
function listed(field: PriceHistoryField, value: PriceHistoryValue, priceType: PriceHistoryValue): boolean {
  if (field === 'monthlyPrice') return priceType === 'monthly' || (typeof value === 'number' && value !== 0);
  if (field === 'oneTimePrice') return priceType === 'one_time' || (typeof value === 'number' && value !== 0);
  return true;
}

const isValues = (values: ItemPriceHistoryValues | null | undefined): values is ItemPriceHistoryValues =>
  typeof values === 'object' && values !== null && !Array.isArray(values);

/**
 * The fields of an entry, for the screen to show.
 *
 *   update    only the fields whose value differs, each with its old and new value; an
 *             empty list when nothing a person sees differs
 *   insert    every field of the new price (`before` is null)
 *   delete    every field of the old price (`after` is null)
 *   truncate  an empty list: its `old_values` is a count, see `truncatedPriceCount`
 *
 * An update that arrives with only one side is listed like an insert or a delete.
 */
export function priceHistoryChanges(
  action: ItemPriceHistoryAction | string,
  oldValues: ItemPriceHistoryValues | null | undefined,
  newValues: ItemPriceHistoryValues | null | undefined
): PriceFieldChange[] {
  if (action === 'truncate') return [];
  const before = action !== 'insert' && isValues(oldValues) ? read(oldValues) : null;
  const after = action !== 'delete' && isValues(newValues) ? read(newValues) : null;

  if (before && after) {
    return FIELDS.filter((field) => !same(before[field], after[field])).map((field) => ({
      field,
      before: before[field],
      after: after[field],
    }));
  }
  const whole = before ?? after;
  if (!whole) return [];
  return FIELDS.filter((field) => listed(field, whole[field], whole.priceType)).map((field) => ({
    field,
    before: before ? before[field] : null,
    after: after ? after[field] : null,
  }));
}

/** How many prices a truncate removed; null when the entry does not say. */
export function truncatedPriceCount(oldValues: ItemPriceHistoryValues | null | undefined): number | null {
  return isValues(oldValues) ? numberOf(oldValues.rows) : null;
}
