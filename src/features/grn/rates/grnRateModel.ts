/**
 * The Rates section of a GRN's Review step: which rate each line is priced with, what the rate sheet is
 * preloaded with, what changing a rate in force affects, and the `p_rates` the GRN is saved with.
 * Pure: no React, no network, no clock. Days are 'YYYY-MM-DD' strings compared as strings.
 *
 * It mirrors the server (`find_storage_price` for the pick, `save_grn`/`update_grn` for the payload):
 * a customer's rate first, then the default; the narrowest band, the latest start; a rate for this GRN
 * only wins over both.
 */
import { addDays } from '@/features/item-pricing/rateText';
import { applicableRate, rateState } from '@/features/item-pricing/rateModel';
import type { ItemStoragePrice, PriceType, StandardTier } from '@/types/item-pricing.types';
import type { GrnRate, RateBand, RateChange, RateFigures, RateScope, RatesPayloadEntry } from './types';

/** A line of the GRN as far as pricing needs it. */
export interface GrnLine {
  item_table_id: string;
  item_name: string;
  weight?: number | null;
}

/** One row of the section: an item and the weight of one bag. Two lines of the same item and weight share a row. */
export interface RateRow {
  key: string;
  item_id: string;
  item_name: string;
  weight: number;
}

/** Where a row's rate comes from. 'change' is a change of the item's rate waiting in the form. */
export type RowSource = 'customer' | 'item' | 'grn' | 'change';

export interface RowRate extends RateBand, RateFigures {
  source: RowSource;
  /** The pending change or GRN-only rate in the form (Undo change removes it); absent for a stored rate. */
  entry?: GrnRate | RateChange;
  /** The stored rate behind it (what the row would be priced with without the entry), when there is one. */
  stored?: ItemStoragePrice;
  /**
   * An Everyone change waiting in the form that does not reach this row: the customer's own rate holds the
   * weight on the GRN's day, so the row keeps it. `entry` is the same change (Undo change removes it).
   */
  keptOwn?: boolean;
}

export interface PricedRow extends RateRow {
  rate: RowRate | null;
}

/** What the rates are priced for: the GRN's customer, India day and price type. */
export interface RateContext {
  customerId: string | null;
  day: string;
  priceType: PriceType;
}

export const priceTypeOf = (pricingMode: string | null | undefined): PriceType => (pricingMode === 'ONE_TIME' ? 'one_time' : 'monthly');

/** Names the customer, day and price type a pending change was made for. */
export const contextKey = (c: RateContext): string => `${c.customerId ?? ''}|${c.day}|${c.priceType}`;

const holds = (band: RateBand, weight: number): boolean => band.weight_min <= weight && weight <= band.weight_max;
const sameBand = (a: RateBand, b: RateBand): boolean => a.weight_min === b.weight_min && a.weight_max === b.weight_max;
const overlaps = (a: RateBand, b: RateBand): boolean => a.weight_min <= b.weight_max && b.weight_min <= a.weight_max;
const figuresOf = (r: RateFigures): RateFigures => ({ unit_price: Number(r.unit_price), labour_rate: Number(r.labour_rate), tax_percent: Number(r.tax_percent) });
const bandOf = (r: RateBand): RateBand => ({ weight_min: r.weight_min, weight_max: r.weight_max });

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

/** The weight of a line as the server reads it: no weight (null, NaN, negative) is 0 kg. */
export const lineWeight = (line: GrnLine): number => {
  const w = Number(line.weight);
  return Number.isFinite(w) && w > 0 ? w : 0;
};

/** One row per distinct item and bag weight, in the order the items first appear. Lines without an item are skipped. */
export function groupRows(lines: GrnLine[]): RateRow[] {
  const rows = new Map<string, RateRow>();
  for (const line of lines) {
    if (!line.item_table_id) continue;
    const weight = lineWeight(line);
    const key = `${line.item_table_id}|${weight}`;
    if (!rows.has(key)) rows.set(key, { key, item_id: line.item_table_id, item_name: line.item_name, weight });
  }
  return [...rows.values()];
}

/** The pending change that prices a row (made for this context), or undefined. */
export function changeFor(row: RateRow, changes: RateChange[], ctx: RateContext): RateChange | undefined {
  const key = contextKey(ctx);
  return changes.find(c => c.ctx === key && c.item_id === row.item_id && holds(c, row.weight));
}

/** The rate for this GRN only that prices a row (of the GRN's price type), or undefined. */
export function grnRateFor(row: RateRow, grnRates: GrnRate[], priceType?: PriceType): GrnRate | undefined {
  return grnRates.find(g => g.item_id === row.item_id && (!priceType || g.price_type === priceType) && holds(g, row.weight));
}

/**
 * The rate of every row: the pending change for the row, else the rate for this GRN only in the form, else
 * the stored rate the server will pick (a customer's own, else the default). `rates` are the stored rates
 * of the GRN's items, ended ones included.
 */
export function priceRows(
  rows: RateRow[],
  a: { rates: ItemStoragePrice[]; ctx: RateContext; grnRates: GrnRate[]; changes: RateChange[] }
): PricedRow[] {
  return rows.map(row => {
    const stored = applicableRate(a.rates.filter(r => r.item_id === row.item_id), {
      customer_id: a.ctx.customerId,
      weight: row.weight,
      price_type: a.ctx.priceType,
      day: a.ctx.day,
    });
    const change = changeFor(row, a.changes, a.ctx);
    // A change for Everyone only touches the rows without a customer: when the customer has a rate of their own
    // for this weight, the server keeps pricing the line with it (find_storage_price: the customer's rows first).
    const keptOwn = change?.scope === 'everyone' && !!stored?.customer_id;
    if (change && !keptOwn) return { ...row, rate: { source: 'change', ...bandOf(change), ...figuresOf(change), entry: change, stored } };
    const own = grnRateFor(row, a.grnRates, a.ctx.priceType);
    if (own) return { ...row, rate: { source: 'grn', ...bandOf(own), ...figuresOf(own), entry: own, stored } };
    if (!stored) return { ...row, rate: null };
    return {
      ...row,
      rate: {
        source: stored.customer_id ? 'customer' : 'item',
        ...bandOf(stored),
        ...figuresOf(stored),
        stored,
        ...(keptOwn ? { entry: change, keptOwn: true } : {}),
      },
    };
  });
}

export const missingCount = (rows: PricedRow[]): number => rows.filter(r => r.rate === null).length;

// ---------------------------------------------------------------------------------------------
// The rate sheet
// ---------------------------------------------------------------------------------------------

/** How the preload of Add rate was found. */
export type PreloadOrigin = 'gap' | 'above' | 'standard' | 'blank' | 'current';

export interface SheetPreload {
  scope: RateScope;
  band: RateBand;
  /** Null for a figure the preload does not know (the field starts empty). */
  figures: { unit_price: number | null; labour_rate: number | null; tax_percent: number | null };
  /** The last day of the new rate (first two scopes); null: no end. */
  to: string | null;
  origin: PreloadOrigin;
}

export interface PreloadInput {
  rates: ItemStoragePrice[];
  ctx: RateContext;
  /** The tiers of the facility's standard rate, when they were read. */
  standard?: StandardTier[] | null;
}

const scopeRows = (rates: ItemStoragePrice[], itemId: string, customerId: string | null, priceType: PriceType): ItemStoragePrice[] =>
  rates.filter(r => r.item_id === itemId && (r.customer_id ?? null) === customerId && r.price_type === priceType);

/** The day before the next rate that starts after the GRN's day in this scope and band, else null (a planned rate is never removed). */
export function plannedStart(rates: ItemStoragePrice[], itemId: string, customerId: string | null, priceType: PriceType, band: RateBand, day: string): string | null {
  const later = scopeRows(rates, itemId, customerId, priceType)
    .filter(r => sameBand(r, band) && r.effective_from > day)
    .map(r => r.effective_from)
    .sort();
  return later[0] ?? null;
}

/** The earliest start after the GRN's day of any row of the scope that shares a weight with the band (planned rates of other bands too). */
export function nextStart(rates: ItemStoragePrice[], itemId: string, customerId: string | null, priceType: PriceType, band: RateBand, day: string): string | null {
  const later = scopeRows(rates, itemId, customerId, priceType)
    .filter(r => overlaps(r, band) && r.effective_from > day)
    .map(r => r.effective_from)
    .sort();
  return later[0] ?? null;
}

/** The To day a scope starts with: the day before a later rate over the band's weights, else none. */
export function defaultTo(scope: RateScope, itemId: string, band: RateBand, a: PreloadInput): string | null {
  if (scope === 'grn') return null;
  const start = nextStart(a.rates, itemId, scope === 'customer' ? a.ctx.customerId : null, a.ctx.priceType, band, a.ctx.day);
  return start ? addDays(start, -1) : null;
}

/**
 * Add rate (the row has no rate): the band and figures to start from.
 * 1. a date gap: the next rate of a band holding the weight that starts after the GRN's day, ending the day before it;
 * 2. a weight above the last band: from the last band's end + 1 up to this weight, with the last band's figures;
 * 3. the standard tier that holds the weight;
 * 4. nothing known: the weight itself as the band, no figures.
 * The scope starts as Everyone (This customer only when the rate found is the customer's own).
 */
export function preloadAdd(row: RateRow, a: PreloadInput): SheetPreload {
  const { ctx } = a;
  const orders: Array<{ customerId: string | null; scope: RateScope }> = [
    ...(ctx.customerId ? [{ customerId: ctx.customerId, scope: 'customer' as RateScope }] : []),
    { customerId: null, scope: 'everyone' },
  ];

  // 1. A date gap.
  let gap: { row: ItemStoragePrice; scope: RateScope } | null = null;
  for (const o of orders) {
    for (const r of scopeRows(a.rates, row.item_id, o.customerId, ctx.priceType)) {
      if (r.effective_from > ctx.day && holds(r, row.weight) && (!gap || r.effective_from < gap.row.effective_from)) gap = { row: r, scope: o.scope };
    }
  }
  if (gap) {
    return {
      scope: gap.scope,
      band: bandOf(gap.row),
      figures: figuresOf(gap.row),
      to: addDays(gap.row.effective_from, -1),
      origin: 'gap',
    };
  }

  // 2. A weight above the last band of the rates that apply per weight: the customer's own and the default's
  //    in force on the GRN's day; the highest end wins (the customer's on a tie), with its figures and scope.
  const inForceOf = (customerId: string | null) => scopeRows(a.rates, row.item_id, customerId, ctx.priceType).filter(r => rateState(r, ctx.day) === 'inForce');
  const candidates = [...(ctx.customerId ? inForceOf(ctx.customerId) : []), ...inForceOf(null)];
  if (candidates.length > 0) {
    const last = candidates.reduce((best, r) => (r.weight_max > best.weight_max ? r : best), candidates[0]);
    if (row.weight > last.weight_max) {
      return {
        scope: last.customer_id ? 'customer' : 'everyone',
        band: { weight_min: last.weight_max + 1, weight_max: Math.ceil(row.weight) },
        figures: figuresOf(last),
        to: null,
        origin: 'above',
      };
    }
  }

  // 3. The standard tier that holds the weight (its rent is a monthly rent: a one-time rate starts without it).
  const tier = (a.standard ?? []).find(t => holds(t, row.weight));
  if (tier) {
    const oneTime = ctx.priceType === 'one_time';
    return {
      scope: 'everyone',
      band: bandOf(tier),
      figures: { unit_price: oneTime ? null : Number(tier.unit_price), labour_rate: oneTime ? 0 : Number(tier.labour_rate), tax_percent: Number(tier.tax_percent) },
      to: null,
      origin: 'standard',
    };
  }

  // 4. Nothing to start from.
  const kg = Math.ceil(row.weight);
  return { scope: 'everyone', band: { weight_min: kg, weight_max: kg }, figures: { unit_price: null, labour_rate: null, tax_percent: null }, to: null, origin: 'blank' };
}

/**
 * Change (the row has a rate): the current figures in the same band, Only this GRN preselected, and the
 * To of the first two scopes ready as the day before the next planned rate of the band.
 */
export function preloadChange(row: RateRow, current: RowRate, a: PreloadInput): SheetPreload {
  const band = bandOf(current);
  // The planned rate that would follow is looked for where the stored rate lives: the customer's own, else the default.
  const storedScope: RateScope = current.stored?.customer_id ? 'customer' : 'everyone';
  return {
    scope: 'grn',
    band,
    figures: figuresOf(current),
    to: defaultTo(storedScope, row.item_id, band, a) ?? (current.stored?.effective_to ?? null),
    origin: 'current',
  };
}

// ---------------------------------------------------------------------------------------------
// The sheet's entry and its checks
// ---------------------------------------------------------------------------------------------

/** What the sheet hands back: the band, scope, figures and last day of one row's rate. */
export interface SheetEntry extends RateBand, RateFigures {
  scope: RateScope;
  to: string | null;
}

export type SheetErrorKey = 'bandWeights' | 'bandFrom' | 'bandHolds' | 'to' | 'planned' | 'overlap';

/** Problems with the band and last day that depend on the stored rates (the amounts are checked by the sheet). */
export function entryProblems(
  entry: SheetEntry,
  row: RateRow,
  a: PreloadInput
): Partial<Record<SheetErrorKey, { date?: string }>> {
  const problems: Partial<Record<SheetErrorKey, { date?: string }>> = {};
  const { ctx } = a;
  if (!Number.isInteger(entry.weight_min) || !Number.isInteger(entry.weight_max) || entry.weight_min < 0) problems.bandWeights = {};
  else if (entry.weight_max < entry.weight_min) problems.bandFrom = {};
  else if (!holds(entry, row.weight)) problems.bandHolds = {};
  if (entry.scope !== 'grn') {
    if (entry.to !== null && entry.to < ctx.day) problems.to = { date: ctx.day };
    const customerId = entry.scope === 'customer' ? ctx.customerId : null;
    const planned = plannedStart(a.rates, row.item_id, customerId, ctx.priceType, entry, ctx.day);
    if (planned && (entry.to === null || entry.to >= planned)) problems.planned = { date: planned };
    // Another band of the scope over some of these weights on any day of [GRN day, last day]: the server refuses
    // a partly overlapping band, planned rows included.
    const clashes = scopeRows(a.rates, row.item_id, customerId, ctx.priceType).filter(
      r =>
        overlaps(r, entry) &&
        !sameBand(r, entry) &&
        (r.effective_to === null || r.effective_to >= ctx.day) &&
        (entry.to === null || r.effective_from <= entry.to)
    );
    // A clash that starts later is fixed with a last day before it: the error names that day.
    const later = clashes.filter(r => r.effective_from > ctx.day).map(r => r.effective_from).sort()[0];
    if (clashes.length > 0) problems.overlap = later ? { date: later } : {};
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// What a change affects
// ---------------------------------------------------------------------------------------------

export interface ChangeFacts {
  scope: 'customer' | 'everyone';
  band: RateBand;
  /** The rate in force on the GRN's day in the scope, with the same band. */
  old: RateFigures;
  next: RateFigures;
  from: string;
  to: string | null;
  /**
   * The old rate stops after this day; or it starts on the GRN's day itself and is replaced; or (`overrides`) it is
   * the item's rate for everyone, which stays for other customers while this customer pays the new one.
   */
  ends: { lastDay: string } | { replaced: true } | { overrides: true };
  /** With a last day, the old figures come back the day after it. */
  resumes: { from: string; figures: RateFigures } | null;
  /** Everyone, and the GRN's customer has a rate of their own for this weight on the GRN's day: this GRN keeps it. */
  keepsOwn: { rent: number } | null;
}

/**
 * What a Change of a rate in force (This customer only / Everyone) does, or null when the band has no rate
 * on the GRN's day in that scope (nothing is replaced, so nothing to confirm).
 */
/** A rate in force, shown beside the one being typed: its band and figures. */
export interface ReferenceRate {
  band: RateBand;
  figures: RateFigures;
}

/**
 * The rates in force on the GRN's day for this line's weight, to compare with what is typed (owner, 2026-10-17): the
 * customer's own rate and the rate for everyone (the item's default). Null where there is none.
 */
export function referenceRates(row: RateRow, a: PreloadInput): { customer: ReferenceRate | null; everyone: ReferenceRate | null } {
  const { ctx } = a;
  const inForce = (customerId: string | null): ReferenceRate | null => {
    const found = scopeRows(a.rates, row.item_id, customerId, ctx.priceType).find(r => rateState(r, ctx.day) === 'inForce' && holds(r, row.weight));
    return found ? { band: bandOf(found), figures: figuresOf(found) } : null;
  };
  return { customer: ctx.customerId ? inForce(ctx.customerId) : null, everyone: inForce(null) };
}

export function changeFacts(entry: SheetEntry, row: RateRow, a: PreloadInput): ChangeFacts | null {
  if (entry.scope === 'grn') return null;
  const { ctx } = a;
  const customerId = entry.scope === 'customer' ? ctx.customerId : null;
  const inScopeNow = (cid: string | null) =>
    scopeRows(a.rates, row.item_id, cid, ctx.priceType).find(r => rateState(r, ctx.day) === 'inForce' && sameBand(r, entry));
  const ownOld = inScopeNow(customerId);
  // A customer's own rate over the item's rate for everyone: that one stays for the others. It is also shown
  // when the default has only another band over these weights (the customer's band would cover weights the
  // default prices).
  const overlapsDefault = () =>
    scopeRows(a.rates, row.item_id, null, ctx.priceType).find(r => rateState(r, ctx.day) === 'inForce' && overlaps(r, entry));
  const old = ownOld ?? (entry.scope === 'customer' ? inScopeNow(null) ?? overlapsDefault() : undefined);
  if (!old) return null;
  const customerOwn =
    entry.scope === 'everyone' && ctx.customerId
      ? applicableRate(a.rates.filter(r => r.item_id === row.item_id), { customer_id: ctx.customerId, weight: row.weight, price_type: ctx.priceType, day: ctx.day })
      : undefined;
  const overrides = !ownOld;
  const next = { unit_price: entry.unit_price, labour_rate: entry.labour_rate, tax_percent: entry.tax_percent };
  const resumes =
    entry.to !== null && (old.effective_to === null || old.effective_to > entry.to)
      ? { from: addDays(entry.to, 1), figures: figuresOf(old) }
      : null;
  return {
    scope: entry.scope,
    band: bandOf(entry),
    old: figuresOf(old),
    next,
    from: ctx.day,
    to: entry.to,
    ends: overrides ? { overrides: true } : old.effective_from === ctx.day ? { replaced: true } : { lastDay: addDays(ctx.day, -1) },
    resumes,
    keepsOwn: customerOwn?.customer_id ? { rent: Number(customerOwn.unit_price) } : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Keeping the entries
// ---------------------------------------------------------------------------------------------

const toGrnRate = (item_id: string, e: SheetEntry, price_type: PriceType): GrnRate => ({
  item_id,
  price_type,
  weight_min: e.weight_min,
  weight_max: e.weight_max,
  unit_price: e.unit_price,
  labour_rate: e.labour_rate,
  tax_percent: e.tax_percent,
});

/**
 * Puts a sheet entry into the form's two lists. An older entry of the same item over any of the same
 * weights goes (the new one replaces what was set for those weights), and so does a pending change made
 * for another customer, day or price type.
 */
export function withEntry(
  state: { grnRates: GrnRate[]; changes: RateChange[] },
  item_id: string,
  entry: SheetEntry,
  ctx: RateContext
): { grnRates: GrnRate[]; changes: RateChange[] } {
  const key = contextKey(ctx);
  const keep = (e: GrnRate) => !(e.item_id === item_id && overlaps(e, entry));
  const grnRates = state.grnRates.filter(keep);
  const changes = state.changes.filter(c => c.ctx === key && keep(c));
  if (entry.scope === 'grn') grnRates.push(toGrnRate(item_id, entry, ctx.priceType));
  else changes.push({ ...toGrnRate(item_id, entry, ctx.priceType), scope: entry.scope, to: entry.to, ctx: key });
  return { grnRates, changes };
}

/** Takes away whatever the form holds for a row (Undo change). */
export function withoutEntryFor(
  state: { grnRates: GrnRate[]; changes: RateChange[] },
  row: RateRow
): { grnRates: GrnRate[]; changes: RateChange[] } {
  const drop = (e: GrnRate) => !(e.item_id === row.item_id && holds(e, row.weight));
  return { grnRates: state.grnRates.filter(drop), changes: state.changes.filter(drop) };
}

/** The removed saved rates for this GRN only that would price this row again: Undo remove shows when there are any. */
export function removedFor(removed: GrnRate[], row: RateRow): GrnRate[] {
  return removed.filter(e => e.item_id === row.item_id && holds(e, row.weight));
}

/**
 * Remove on a saved rate for this GRN only: the entries the row drops (as withoutEntryFor), with the saved ones
 * kept aside in `removed` for Undo remove.
 */
export function removeSavedFor(
  state: { grnRates: GrnRate[]; changes: RateChange[]; removed: GrnRate[] },
  row: RateRow
): { grnRates: GrnRate[]; changes: RateChange[]; removed: GrnRate[] } {
  const next = withoutEntryFor(state, row);
  const taken = state.grnRates.filter(e => e.saved === true && !next.grnRates.includes(e));
  return { ...next, removed: [...state.removed, ...taken] };
}

/** Undo remove: the row's removed saved rates go back into the GRN's set. */
export function restoreRemovedFor(
  state: { grnRates: GrnRate[]; removed: GrnRate[] },
  row: RateRow
): { grnRates: GrnRate[]; removed: GrnRate[] } {
  const back = removedFor(state.removed, row);
  return { grnRates: [...state.grnRates, ...back], removed: state.removed.filter(e => !back.includes(e)) };
}

/**
 * The GRN's price type changed: entries (rates for this GRN only and pending changes) made for the other type
 * go; the figures of a monthly rate mean nothing as a one-time charge. `removed` says whether any went.
 */
export function dropOtherPriceType(
  state: { grnRates: GrnRate[]; changes: RateChange[] },
  priceType: PriceType
): { grnRates: GrnRate[]; changes: RateChange[]; removed: boolean } {
  const grnRates = state.grnRates.filter(g => g.price_type === priceType);
  const changes = state.changes.filter(c => c.price_type === priceType);
  return { grnRates, changes, removed: grnRates.length !== state.grnRates.length || changes.length !== state.changes.length };
}

// ---------------------------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------------------------

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * `p_rates` for save_grn / update_grn: the pending changes made for this context, then the complete set of
 * rates for this GRN only. An entry whose item is no longer on the GRN, or whose band holds none of that
 * item's weights, is left out (the server refuses it: RATE_NOT_FOR_GRN). A one-time GRN stores labour 0.
 */
export function buildRates(a: { grnRates: GrnRate[]; changes: RateChange[]; ctx: RateContext; lines: GrnLine[]; invoiced?: boolean }): RatesPayloadEntry[] {
  const weights = new Map<string, number[]>();
  for (const line of a.lines) {
    if (!line.item_table_id) continue;
    const list = weights.get(line.item_table_id) ?? [];
    list.push(lineWeight(line));
    weights.set(line.item_table_id, list);
  }
  const live = (e: GrnRate) => (weights.get(e.item_id) ?? []).some(w => holds(e, w));
  const oneTime = a.ctx.priceType === 'one_time';
  const base = (e: GrnRate) => ({
    item_id: e.item_id,
    weight_min: e.weight_min,
    weight_max: e.weight_max,
    unit_price: round2(e.unit_price),
    labour_rate: oneTime ? 0 : round2(e.labour_rate),
    tax_percent: round2(e.tax_percent),
  });
  // An invoiced GRN keeps its stored set: sent back unchanged (the server accepts an equal set and checks nothing else).
  if (a.invoiced) return a.grnRates.map(g => ({ scope: 'grn' as const, ...base(g) }));
  const key = contextKey(a.ctx);
  return [
    ...a.changes.filter(c => c.ctx === key && c.price_type === a.ctx.priceType && live(c)).map(c => ({ scope: c.scope, ...base(c), to: c.to })),
    ...a.grnRates.filter(g => g.price_type === a.ctx.priceType && live(g)).map(g => ({ scope: 'grn' as const, ...base(g) })),
  ];
}

/** Rates for this GRN only from get_grn_details (`grn.rates`) as the form keeps them (a row without a price type is dropped). */
export function grnRatesFromDetails(raw: unknown): GrnRate[] {
  if (!Array.isArray(raw)) return [];
  const out: GrnRate[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    if (r?.price_type !== 'monthly' && r?.price_type !== 'one_time') continue;
    const entry = {
      item_id: String(r?.item_id ?? ''),
      price_type: r.price_type as PriceType,
      weight_min: Number(r?.weight_min),
      weight_max: Number(r?.weight_max),
      unit_price: Number(r?.unit_price),
      labour_rate: Number(r?.labour_rate),
      tax_percent: Number(r?.tax_percent),
    };
    if (entry.item_id && Object.values(entry).every(v => typeof v === 'string' || Number.isFinite(v))) out.push({ ...entry, saved: true });
  }
  return out;
}
