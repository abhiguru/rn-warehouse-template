/**
 * The standard rate's rules (backend migration 85): the draft the Standard rate screen edits, its
 * checks, the call, the summary line of Add item and the Standard / This item tags of the item page.
 * Pure: no React, no network. The draft is the rate editor's own, with a labour and tax on every tier
 * (`BandsEditor` shows them when the bands carry them), so the weight arithmetic is one set of rules.
 */
import type { ItemStoragePrice, SetStandardRateResult, StandardTier } from '@/types/item-pricing.types';
import { toReplaceInput, validate, type BandDraft, type Draft, type EditorContext } from './editModel';
import { bandText, money } from './rateText';

/** The "Up to" of the four tiers an empty standard rate starts with: 0–10, 11–20, 21–30, 31–50 kg. */
export const STARTING_TIERS_UP_TO = [10, 20, 30, 50] as const;

const two = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
const taxText = (n: number): string => String(Number(n));

/** The editor's context for a monthly default rate that has no item, no customer and no start day to choose. */
export function standardContext(today: string): EditorContext {
  return {
    mode: 'add',
    itemId: '',
    itemName: '',
    customerId: null,
    customerName: null,
    priceTypeChoosable: false,
    today,
    canStartInPast: false,
    managerOnly: false,
    plannedGone: false,
    rows: [],
    editingIds: [],
    originalStart: null,
    copied: false,
  };
}

/** The tiers saved, or the four starting tiers with blank figures when none were ever saved. */
export function standardDraft(tiers: StandardTier[], today: string): Draft {
  const bands: BandDraft[] =
    tiers.length > 0
      ? tiers.map(tier => ({ upTo: String(tier.weight_max), rent: two(tier.unit_price), labour: two(tier.labour_rate), tax: taxText(tier.tax_percent) }))
      : STARTING_TIERS_UP_TO.map(upTo => ({ upTo: String(upTo), rent: '', labour: '', tax: '' }));
  return {
    priceType: 'monthly',
    // The standard rate has no start day; the editor's checks want one, so it is today and never shown.
    startsOn: today,
    startsOnChoice: 'today',
    firstFrom: tiers.length > 0 ? tiers[0].weight_min : 0,
    bands,
    labour: '',
    tax: '',
  };
}

/** The editor's checks without the start day: Up to at least From, whole kg, rent 0 to 9999.99, labour and tax 0 or more with two decimals, tax at most 100. */
export function validateStandard(draft: Draft, ctx: EditorContext): { ok: boolean; errors: Record<string, string> } {
  const { startsOn: _startsOn, ...errors } = validate(draft, ctx).errors;
  return { ok: Object.keys(errors).length === 0, errors };
}

/** The tiers to send. */
export function tiersOf(draft: Draft, ctx: EditorContext): StandardTier[] {
  return toReplaceInput(draft, ctx).bands;
}

const FIELD_KEYS = { unit_price: 'rent', labour_rate: 'labour', tax_percent: 'tax' } as const;

/**
 * The field a refused save names, in the keys BandsEditor shows errors under, or null when the
 * server named none (the screen then shows the message at the top).
 */
export function fieldForRefusal(result: SetStandardRateResult): string | null {
  if (result.tierIndex === undefined) return null;
  const i = result.tierIndex;
  if (result.errorCode === 'INVALID_AMOUNT') return result.field ? `band.${i}.${FIELD_KEYS[result.field]}` : `band.${i}.rent`;
  if (result.errorCode === 'INVALID_BAND' || result.errorCode === 'BANDS_OVERLAP' || result.errorCode === 'BANDS_GAP') return `band.${i}.upTo`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Tags on the item page
// ---------------------------------------------------------------------------------------------

export type TierTag = 'standard' | 'item';

const sameTier = (row: ItemStoragePrice, tier: StandardTier): boolean =>
  row.weight_min === tier.weight_min &&
  row.weight_max === tier.weight_max &&
  Number(row.unit_price) === Number(tier.unit_price) &&
  Number(row.labour_rate) === Number(tier.labour_rate) &&
  Number(row.tax_percent) === Number(tier.tax_percent);

/**
 * One tag per band of a default monthly rate: 'standard' when its weights, rent, labour and tax are
 * those of a tier of the standard rate, else 'item'. Null (no tags at all) when the standard rate is
 * empty, not loaded or failed. Customer rates and one-time rates are never tagged: the caller does not ask.
 */
export function tierTags(bands: ItemStoragePrice[], standard: StandardTier[] | null | undefined): TierTag[] | null {
  if (!standard || standard.length === 0) return null;
  return bands.map(band => (standard.some(tier => sameTier(band, tier)) ? 'standard' : 'item'));
}

// ---------------------------------------------------------------------------------------------
// Add item
// ---------------------------------------------------------------------------------------------

/** "0–10 kg ₹3.00 · 11–20 kg ₹4.00 · …": the rents of the tiers, for the Standard rate choice of Add item. */
export function tierSummary(tiers: StandardTier[]): string {
  return tiers.map(tier => `${bandText(tier.weight_min, tier.weight_max)} ${money(tier.unit_price)}`).join(' · ');
}

