/**
 * The rates a GRN carries (backend migration 86): kept in the GRN form and saved together with the GRN
 * as `p_rates`. Weights are whole kg, both ends included; amounts are numbers.
 */
import type { PriceType } from '@/types/item-pricing.types';

/** A band of bag weights: both ends are included. */
export interface RateBand {
  weight_min: number;
  weight_max: number;
}

export interface RateFigures {
  unit_price: number;
  labour_rate: number;
  tax_percent: number;
}

/**
 * A rate for this GRN only (scope 'grn'); archived by the server once the GRN is invoiced. `price_type` is the
 * type it was set for: when the GRN's price type changes, the entries of the other type go (the figures of a
 * monthly rate mean nothing as a one-time charge).
 */
export interface GrnRate extends RateBand, RateFigures {
  item_id: string;
  price_type: PriceType;
  /** Read from the server (an edit of a saved GRN), not set in this form: its action reads Remove, not Undo change. */
  saved?: boolean;
}

/**
 * A change of the item's rate that waits in the form: "This customer only" or "Everyone", from the GRN's day
 * to `to` (null: no end). `ctx` names the customer, day and price type it was made for; when one of them
 * changes in the form the change no longer applies and is dropped.
 */
export interface RateChange extends GrnRate {
  scope: 'customer' | 'everyone';
  to: string | null;
  ctx: string;
}

export type RateScope = 'customer' | 'everyone' | 'grn';

/** One entry of `p_rates`, exactly as the server reads it (contract-2 section 1). */
export type RatesPayloadEntry =
  | ({ scope: 'grn' } & Omit<GrnRate, 'price_type'>)
  | ({ scope: 'customer' | 'everyone'; to: string | null } & Omit<GrnRate, 'price_type'>);
