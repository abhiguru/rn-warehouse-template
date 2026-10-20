import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import {
  buildRates, changeFacts, changeFor, contextKey, defaultTo, dropOtherPriceType, entryProblems, groupRows, grnRatesFromDetails,
  missingCount, preloadAdd, preloadChange, priceRows, withEntry, withoutEntryFor, type PreloadInput,
} from '../grnRateModel';
import type { GrnRate, RateChange } from '../types';

const DAY = '2026-10-12';
const CUST = 'cust-a';
let seq = 0;
const row = (item: string, min: number, max: number, rent: number, from: string, to: string | null = null, customer: string | null = null, type: PriceType = 'monthly'): ItemStoragePrice => ({
  id: `r${(seq += 1)}`, item_id: item, item_name: item, customer_id: customer, customer_name: customer ? 'Orchard A' : null, price_type: type,
  unit_price: rent, weight_min: min, weight_max: max, labour_rate: 1.5, tax_percent: 5, effective_from: from, effective_to: to, created_at: '', created_by: '',
});
const ctx = { customerId: CUST, day: DAY, priceType: 'monthly' as PriceType };
const input = (rates: ItemStoragePrice[], standard?: PreloadInput['standard']): PreloadInput => ({ rates, ctx, standard });
const ROW = (item: string, weight: number) => ({ key: `${item}|${weight}`, item_id: item, item_name: item, weight });

describe('rows', () => {
  it('groups lines by item and bag weight; two lines of the same item and weight share a row; no weight is 0', () => {
    const rows = groupRows([
      { item_table_id: 'gur', item_name: 'Gur', weight: 12 },
      { item_table_id: 'gur', item_name: 'Gur', weight: 12 },
      { item_table_id: 'gur', item_name: 'Gur', weight: 30 },
      { item_table_id: 'rice', item_name: 'Rice', weight: null },
      { item_table_id: 'rice', item_name: 'Rice', weight: undefined },
      { item_table_id: '', item_name: 'x', weight: 5 },
    ]);
    expect(rows.map(r => [r.item_id, r.weight])).toEqual([['gur', 12], ['gur', 30], ['rice', 0]]);
  });
});

describe('which rate a row is priced with', () => {
  const rates = [
    row('gur', 0, 100, 3, '2026-01-01'),
    row('gur', 0, 100, 3.5, '2026-01-01', null, CUST),
    row('rice', 0, 20, 2, '2026-01-01'),
  ];
  const gurChange: RateChange = { item_id: 'gur', weight_min: 0, weight_max: 100, unit_price: 9, labour_rate: 1, tax_percent: 5, scope: 'everyone', to: null, ctx: contextKey(ctx), price_type: 'monthly' };
  const gurGrn: GrnRate = { price_type: 'monthly', item_id: 'gur', weight_min: 0, weight_max: 100, unit_price: 8, labour_rate: 1, tax_percent: 5 };
  const rows = [ROW('gur', 12), ROW('rice', 12), ROW('rice', 50)];

  it("the customer's own rate, else the item's rate, else none", () => {
    const priced = priceRows(rows, { rates, ctx, grnRates: [], changes: [] });
    expect(priced.map(p => [p.rate?.source, p.rate?.unit_price])).toEqual([['customer', 3.5], ['item', 2], [undefined, undefined]]);
    expect(missingCount(priced)).toBe(1);
  });

  it('a rate for this GRN only wins over both; a pending change wins over that', () => {
    expect(priceRows([rows[0]], { rates, ctx, grnRates: [gurGrn], changes: [] })[0].rate).toMatchObject({ source: 'grn', unit_price: 8 });
    expect(priceRows([rows[0]], { rates, ctx, grnRates: [gurGrn], changes: [{ ...gurChange, scope: 'customer' }] })[0].rate).toMatchObject({ source: 'change', unit_price: 9 });
  });

  it('a change made for another customer, day or price type does not apply', () => {
    const other = { ...gurChange, ctx: contextKey({ ...ctx, customerId: 'cust-b' }) };
    expect(changeFor(rows[0], [other], ctx)).toBeUndefined();
    expect(priceRows([rows[0]], { rates, ctx, grnRates: [], changes: [other] })[0].rate?.source).toBe('customer');
  });

  it('prices by the GRN day: a rate that starts later or ended earlier is not used; the GRN price type is', () => {
    const r = [row('gur', 0, 100, 3, '2026-10-13'), row('gur', 0, 100, 4, '2026-01-01', '2026-10-11'), row('gur', 0, 100, 5, '2026-01-01', null, null, 'one_time')];
    expect(priceRows([ROW('gur', 12)], { rates: r, ctx, grnRates: [], changes: [] })[0].rate).toBeNull();
    expect(priceRows([ROW('gur', 12)], { rates: r, ctx: { ...ctx, priceType: 'one_time' }, grnRates: [], changes: [] })[0].rate?.unit_price).toBe(5);
  });

  it('a weight of 0 is priced by the band that starts at 0', () => {
    expect(priceRows([ROW('gur', 0)], { rates, ctx, grnRates: [], changes: [] })[0].rate?.unit_price).toBe(3.5);
  });
});

describe('Add rate: what the sheet starts with', () => {
  it('a date gap: the band and figures of the rate that starts later, ending the day before it', () => {
    const p = preloadAdd(ROW('gur', 12), input([row('gur', 11, 20, 4, '2026-11-01')]));
    expect(p).toMatchObject({ origin: 'gap', scope: 'everyone', band: { weight_min: 11, weight_max: 20 }, to: '2026-10-31', figures: { unit_price: 4, labour_rate: 1.5, tax_percent: 5 } });
  });

  it("a date gap in the customer's own rate preselects This customer only", () => {
    const p = preloadAdd(ROW('gur', 12), input([row('gur', 11, 20, 4, '2026-11-01', null, CUST), row('gur', 0, 100, 3, '2026-12-01')]));
    expect(p).toMatchObject({ scope: 'customer', to: '2026-10-31' });
  });

  it('the earliest of several later starts is used', () => {
    const p = preloadAdd(ROW('gur', 12), input([row('gur', 11, 20, 4, '2026-12-01'), row('gur', 0, 100, 3, '2026-11-05')]));
    expect(p.to).toBe('2026-11-04');
    expect(p.band).toEqual({ weight_min: 0, weight_max: 100 });
  });

  it('a weight above the last band: from the last Up to + 1 up to the weight, with the last band figures', () => {
    const p = preloadAdd(ROW('gur', 75), input([row('gur', 0, 50, 3, '2026-01-01')]));
    expect(p).toMatchObject({ origin: 'above', scope: 'everyone', band: { weight_min: 51, weight_max: 75 }, to: null, figures: { unit_price: 3 } });
  });

  it('else the standard tier that holds the weight (one-time: without its monthly rent)', () => {
    const standard = [{ weight_min: 0, weight_max: 10, unit_price: 2, labour_rate: 1, tax_percent: 5 }, { weight_min: 11, weight_max: 50, unit_price: 3, labour_rate: 2, tax_percent: 12 }];
    expect(preloadAdd(ROW('gur', 12), input([], standard))).toMatchObject({ origin: 'standard', band: { weight_min: 11, weight_max: 50 }, figures: { unit_price: 3, labour_rate: 2, tax_percent: 12 } });
    const oneTime = preloadAdd(ROW('gur', 12), { rates: [], ctx: { ...ctx, priceType: 'one_time' }, standard });
    expect(oneTime.figures).toEqual({ unit_price: null, labour_rate: 0, tax_percent: 12 });
  });

  it('else blank: the weight as the band and no figures', () => {
    expect(preloadAdd(ROW('gur', 12), input([]))).toMatchObject({ origin: 'blank', band: { weight_min: 12, weight_max: 12 }, figures: { unit_price: null, labour_rate: null, tax_percent: null } });
  });
});

describe('Change: what the sheet starts with', () => {
  const rates = [row('gur', 0, 100, 3, '2026-01-01'), row('gur', 0, 100, 3.8, '2026-11-15')];
  const current = priceRows([ROW('gur', 12)], { rates, ctx: { ...ctx, customerId: null }, grnRates: [], changes: [] })[0].rate!;

  it('keeps the band and figures, preselects Only this GRN and ends the new rate the day before the next planned one', () => {
    const p = preloadChange(ROW('gur', 12), current, { rates, ctx: { ...ctx, customerId: null } });
    expect(p).toMatchObject({ scope: 'grn', band: { weight_min: 0, weight_max: 100 }, figures: { unit_price: 3 }, to: '2026-11-14' });
  });

  it('has no end when no rate of the band is planned', () => {
    const p = preloadChange(ROW('gur', 12), current, { rates: [rates[0]], ctx: { ...ctx, customerId: null } });
    expect(p.to).toBeNull();
  });

  it('the To of a scope follows that scope: This customer only ignores the default rate that is planned', () => {
    expect(defaultTo('customer', 'gur', { weight_min: 0, weight_max: 100 }, input(rates))).toBeNull();
    expect(defaultTo('everyone', 'gur', { weight_min: 0, weight_max: 100 }, input(rates))).toBe('2026-11-14');
    expect(defaultTo('grn', 'gur', { weight_min: 0, weight_max: 100 }, input(rates))).toBeNull();
  });
});

describe('the sheet checks', () => {
  const rates = [row('gur', 0, 100, 3, '2026-01-01'), row('gur', 0, 100, 3.8, '2026-11-15')];
  const entry = (over = {}) => ({ scope: 'everyone' as const, weight_min: 0, weight_max: 100, unit_price: 4, labour_rate: 1, tax_percent: 5, to: null, ...over });

  it('the band must hold the weight', () => {
    expect(entryProblems(entry({ weight_min: 20, weight_max: 30 }), ROW('gur', 12), input(rates)).bandHolds).toBeDefined();
    expect(entryProblems(entry({ weight_min: 20, weight_max: 10 }), ROW('gur', 12), input(rates)).bandFrom).toBeDefined();
  });

  it('the last day cannot be before the GRN day', () => {
    expect(entryProblems(entry({ to: '2026-10-11' }), ROW('gur', 12), input(rates)).to).toEqual({ date: DAY });
    expect(entryProblems(entry({ to: DAY }), ROW('gur', 12), input([rates[0]])).to).toBeUndefined();
  });

  it('a planned rate of the band is never removed: no end, or an end on or after its start, is refused', () => {
    expect(entryProblems(entry({ to: null }), ROW('gur', 12), input(rates)).planned).toEqual({ date: '2026-11-15' });
    expect(entryProblems(entry({ to: '2026-11-15' }), ROW('gur', 12), input(rates)).planned).toBeDefined();
    expect(entryProblems(entry({ to: '2026-11-14' }), ROW('gur', 12), input(rates)).planned).toBeUndefined();
  });

  it('a band that partly overlaps another band in force is refused; Only this GRN skips these checks', () => {
    const two = [row('gur', 0, 10, 3, '2026-01-01'), row('gur', 11, 100, 4, '2026-01-01')];
    expect(entryProblems(entry({ weight_min: 5, weight_max: 20 }), ROW('gur', 12), input(two)).overlap).toBeDefined();
    expect(entryProblems(entry({ weight_min: 11, weight_max: 100 }), ROW('gur', 12), input(two)).overlap).toBeUndefined();
    expect(entryProblems(entry({ scope: 'grn', to: '2020-01-01' }), ROW('gur', 12), input(two))).toEqual({});
  });
});

describe('what a change affects (the confirmation)', () => {
  const rates = [row('gur', 0, 100, 4, '2026-01-01')];
  const entry = (over = {}) => ({ scope: 'everyone' as const, weight_min: 0, weight_max: 100, unit_price: 3.5, labour_rate: 1, tax_percent: 5, to: null, ...over });

  it('Only this GRN needs no confirmation, nor does a band with no rate on the GRN day', () => {
    expect(changeFacts(entry({ scope: 'grn' }), ROW('gur', 12), input(rates))).toBeNull();
    expect(changeFacts(entry({ weight_min: 101, weight_max: 200 }), ROW('gur', 150), input(rates))).toBeNull();
  });

  it('lists old and new figures, the period, what ends and that it reaches everyone', () => {
    const facts = changeFacts(entry(), ROW('gur', 12), input(rates))!;
    expect(facts).toMatchObject({ scope: 'everyone', old: { unit_price: 4 }, next: { unit_price: 3.5 }, from: DAY, to: null, ends: { lastDay: '2026-10-11' }, resumes: null });
  });

  it('with a last day the old figures resume the day after it', () => {
    const facts = changeFacts(entry({ to: '2026-10-31' }), ROW('gur', 12), input(rates))!;
    expect(facts.resumes).toEqual({ from: '2026-11-01', figures: expect.objectContaining({ unit_price: 4 }) });
  });

  it('no resume when the old rate ends on or before the last day', () => {
    const ending = [row('gur', 0, 100, 4, '2026-01-01', '2026-10-20')];
    expect(changeFacts(entry({ to: '2026-10-31' }), ROW('gur', 12), input(ending))!.resumes).toBeNull();
  });

  it('an old rate that starts on the GRN day is replaced, not ended', () => {
    const same = [row('gur', 0, 100, 4, DAY)];
    expect(changeFacts(entry(), ROW('gur', 12), input(same))!.ends).toEqual({ replaced: true });
  });

  it('This customer only over the rate for everyone overrides it, which stays for other customers', () => {
    const facts = changeFacts(entry({ scope: 'customer' }), ROW('gur', 12), input(rates))!;
    expect(facts.ends).toEqual({ overrides: true });
  });

  it("This customer only over the customer's own rate ends that rate", () => {
    const own = [row('gur', 0, 100, 4.2, '2026-01-01', null, CUST)];
    const facts = changeFacts(entry({ scope: 'customer' }), ROW('gur', 12), input(own))!;
    expect(facts).toMatchObject({ old: { unit_price: 4.2 }, ends: { lastDay: '2026-10-11' } });
  });
});

describe('the form entries', () => {
  const entry = (over = {}) => ({ scope: 'customer' as const, weight_min: 0, weight_max: 100, unit_price: 4, labour_rate: 1, tax_percent: 5, to: '2026-10-31' as string | null, ...over });

  it('keeps a change under Changes and a GRN-only rate under rates; a newer entry over the same weights replaces the older', () => {
    let s = withEntry({ grnRates: [], changes: [] }, 'gur', entry(), ctx);
    expect(s.changes).toHaveLength(1);
    expect(s.changes[0]).toMatchObject({ item_id: 'gur', scope: 'customer', to: '2026-10-31', ctx: contextKey(ctx) });
    s = withEntry(s, 'gur', entry({ scope: 'grn', to: null }), ctx);
    expect(s.changes).toHaveLength(0);
    expect(s.grnRates).toHaveLength(1);
    s = withEntry(s, 'rice', entry({ scope: 'grn', to: null }), ctx);
    expect(s.grnRates.map(g => g.item_id)).toEqual(['gur', 'rice']);
  });

  it('drops pending changes made for another customer, day or price type', () => {
    const old = withEntry({ grnRates: [], changes: [] }, 'gur', entry(), { ...ctx, customerId: 'cust-b' });
    const s = withEntry(old, 'rice', entry(), ctx);
    expect(s.changes.map(c => c.item_id)).toEqual(['rice']);
  });

  it('Undo change takes away whatever holds the weight of the row', () => {
    const s = withEntry({ grnRates: [], changes: [] }, 'gur', entry(), ctx);
    expect(withoutEntryFor(s, ROW('gur', 12))).toEqual({ grnRates: [], changes: [] });
    expect(withoutEntryFor(s, ROW('gur', 150)).changes).toHaveLength(1);
  });
});

describe('p_rates', () => {
  const lines = [{ item_table_id: 'gur', item_name: 'Gur', weight: 12 }, { item_table_id: 'gur', item_name: 'Gur', weight: 30 }];
  const change: RateChange = { item_id: 'gur', weight_min: 0, weight_max: 20, unit_price: 4.555, labour_rate: 1, tax_percent: 5, scope: 'customer', to: '2026-10-31', ctx: contextKey(ctx), price_type: 'monthly' };
  const grn: GrnRate = { price_type: 'monthly', item_id: 'gur', weight_min: 21, weight_max: 50, unit_price: 3, labour_rate: 2, tax_percent: 5 };

  it('is the pending changes, then the complete set for this GRN only, exactly as the contract has it', () => {
    expect(buildRates({ grnRates: [grn], changes: [change], ctx, lines })).toEqual([
      { scope: 'customer', item_id: 'gur', weight_min: 0, weight_max: 20, unit_price: 4.56, labour_rate: 1, tax_percent: 5, to: '2026-10-31' },
      { scope: 'grn', item_id: 'gur', weight_min: 21, weight_max: 50, unit_price: 3, labour_rate: 2, tax_percent: 5 },
    ]);
  });

  it('is an empty list when nothing was set', () => {
    expect(buildRates({ grnRates: [], changes: [], ctx, lines })).toEqual([]);
  });

  it('sends seen_ids with a customer or everyone entry: the ids of that scope in force on the GRN day, sorted; none for this GRN only', () => {
    const own = row('gur', 0, 100, 3.5, '2026-01-01', null, CUST);
    const ownToday = row('gur', 101, 200, 3.4, '2026-10-12', '2026-12-31', CUST);
    const everyone = row('gur', 0, 100, 3, '2026-01-01');
    const otherCustomer = row('gur', 0, 100, 3.2, '2026-01-01', null, 'cust-b');
    const otherItem = row('rice', 0, 100, 2, '2026-01-01', null, CUST);
    const stored = [ownToday, own, everyone, otherCustomer, otherItem];
    const everyoneChange: RateChange = { ...change, scope: 'everyone' };

    const out = buildRates({ grnRates: [grn], changes: [change, everyoneChange], ctx, lines, stored });
    expect(out[0]).toMatchObject({ scope: 'customer', seen_ids: [own.id, ownToday.id].sort() });
    expect(out[1]).toMatchObject({ scope: 'everyone', seen_ids: [everyone.id] });
    expect(out[2]).toEqual({ scope: 'grn', item_id: 'gur', weight_min: 21, weight_max: 50, unit_price: 3, labour_rate: 2, tax_percent: 5 });
  });

  it('does not list a row that ended before the GRN day or starts after it: such a row would hide one that really changed', () => {
    const inForce = row('gur', 0, 100, 3.5, '2026-01-01', null, CUST);
    const ended = row('gur', 0, 100, 3, '2025-01-01', '2025-12-31', CUST);
    const endedTheDayBefore = row('gur', 0, 100, 3.1, '2026-01-01', '2026-10-11', CUST);
    const planned = row('gur', 0, 100, 4, '2027-01-01', null, CUST);
    const startsTomorrow = row('gur', 0, 100, 4.1, '2026-10-13', null, CUST);
    const endsToday = row('gur', 0, 100, 3.6, '2026-02-01', '2026-10-12', CUST);

    const out = buildRates({ grnRates: [], changes: [change], ctx, lines, stored: [inForce, ended, endedTheDayBefore, planned, startsTomorrow, endsToday] });
    expect(out[0]).toMatchObject({ seen_ids: [inForce.id, endsToday.id].sort() });
  });

  it('sends an empty seen_ids when the scope has no stored row, and none at all when the stored rates are not given (an older call)', () => {
    expect(buildRates({ grnRates: [], changes: [change], ctx, lines, stored: [] })[0]).toMatchObject({ seen_ids: [] });
    expect(buildRates({ grnRates: [], changes: [change], ctx, lines })[0]).not.toHaveProperty('seen_ids');
  });

  it('leaves out an entry whose item is off the GRN or whose band holds none of its weights, and a change for another context', () => {
    const stale = { ...change, ctx: contextKey({ ...ctx, day: '2026-01-01' }) };
    const off = { ...grn, item_id: 'rice' };
    const empty = { ...grn, weight_min: 60, weight_max: 90 };
    expect(buildRates({ grnRates: [off, empty], changes: [stale], ctx, lines })).toEqual([]);
  });

  it('stores labour 0 on a one-time GRN', () => {
    const oneTime = { ...ctx, priceType: 'one_time' as PriceType };
    const out = buildRates({ grnRates: [{ ...grn, price_type: 'one_time' }], changes: [], ctx: oneTime, lines });
    expect(out[0]).toMatchObject({ labour_rate: 0 });
  });

  it('reads the rates for this GRN only from get_grn_details, skipping rubbish', () => {
    expect(grnRatesFromDetails([{ item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 10, unit_price: '3.50', labour_rate: 1, tax_percent: 5, archived: false }, { item_id: '', weight_min: 1 }, null])).toEqual([
      { item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 10, unit_price: 3.5, labour_rate: 1, tax_percent: 5, saved: true },
    ]);
    expect(grnRatesFromDetails(undefined)).toEqual([]);
  });
});


// ---------------------------------------------------------------------------------------------
// Round 3 (Opus review of round 2)
// ---------------------------------------------------------------------------------------------

describe('D1: an Everyone change does not price a row the customer has an own rate for', () => {
  const rates = [row('gur', 0, 50, 3, '2026-01-01'), row('gur', 0, 50, 3.5, '2026-01-01', null, CUST)];
  const change = (scope: 'everyone' | 'customer'): RateChange => ({ item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1, tax_percent: 5, scope, to: null, ctx: contextKey(ctx) });

  it('the row keeps the customer rate (and the change, so it can be undone)', () => {
    const rate = priceRows([ROW('gur', 12)], { rates, ctx, grnRates: [], changes: [change('everyone')] })[0].rate!;
    expect(rate).toMatchObject({ source: 'customer', unit_price: 3.5, keptOwn: true, entry: expect.objectContaining({ scope: 'everyone' }) });
  });

  it('a customer who has no own rate for the weight is priced by the Everyone change; a This customer change always prices', () => {
    const noOwn = [rates[0]];
    expect(priceRows([ROW('gur', 12)], { rates: noOwn, ctx, grnRates: [], changes: [change('everyone')] })[0].rate).toMatchObject({ source: 'change', unit_price: 4 });
    expect(priceRows([ROW('gur', 12)], { rates, ctx, grnRates: [], changes: [change('customer')] })[0].rate).toMatchObject({ source: 'change', unit_price: 4 });
  });

  it('the confirmation says the customer keeps their own rate', () => {
    const entry = { scope: 'everyone' as const, weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1, tax_percent: 5, to: null };
    expect(changeFacts(entry, ROW('gur', 12), input(rates))).toMatchObject({ old: { unit_price: 3 }, keepsOwn: { rent: 3.5 } });
    expect(changeFacts(entry, ROW('gur', 12), input([rates[0]]))!.keepsOwn).toBeNull();
    expect(changeFacts({ ...entry, scope: 'customer' }, ROW('gur', 12), input(rates))!.keepsOwn).toBeNull();
  });
});

describe('D5: planned rates of other bands count', () => {
  // Default 0-50 ends 31 Oct; re-banded 0-20 / 21-50 from 1 Nov.
  const rates = [row('gur', 0, 50, 3, '2026-01-01', '2026-10-31'), row('gur', 0, 20, 3, '2026-11-01'), row('gur', 21, 50, 4, '2026-11-01')];
  const entry = (over = {}) => ({ scope: 'everyone' as const, weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1, tax_percent: 5, to: null as string | null, ...over });
  const inp = { rates, ctx: { ...ctx, customerId: null } };

  it('Change preloads the last day as the day before the earliest later row over the band', () => {
    const current = priceRows([ROW('gur', 12)], { rates, ctx: inp.ctx, grnRates: [], changes: [] })[0].rate!;
    expect(preloadChange(ROW('gur', 12), current, inp)).toMatchObject({ band: { weight_min: 0, weight_max: 50 }, to: '2026-10-31' });
  });

  it('with nothing following, Change offers the end of the current rate', () => {
    const ending = [row('gur', 0, 50, 3, '2026-01-01', '2026-12-31')];
    const current = priceRows([ROW('gur', 12)], { rates: ending, ctx: inp.ctx, grnRates: [], changes: [] })[0].rate!;
    expect(preloadChange(ROW('gur', 12), current, { rates: ending, ctx: inp.ctx }).to).toBe('2026-12-31');
  });

  it('no end date over a planned row of another band is refused, naming its start; an end before it passes', () => {
    expect(entryProblems(entry(), ROW('gur', 12), inp).overlap).toEqual({ date: '2026-11-01' });
    expect(entryProblems(entry({ to: '2026-10-31' }), ROW('gur', 12), inp).overlap).toBeUndefined();
  });

  it('a band in force is a clash without a date', () => {
    const two = [row('gur', 0, 10, 3, '2026-01-01'), row('gur', 11, 100, 4, '2026-01-01')];
    expect(entryProblems(entry({ weight_min: 5, weight_max: 20 }), ROW('gur', 12), input(two)).overlap).toEqual({});
  });
});

describe('D6: a weight above the last band takes both scopes into account', () => {
  it("customer 0-10, default 0-50, a 60 kg bag: from 51, the default's figures, for everyone", () => {
    const rates = [row('gur', 0, 50, 3, '2026-01-01'), row('gur', 0, 10, 2.5, '2026-01-01', null, CUST)];
    expect(preloadAdd(ROW('gur', 60), input(rates))).toMatchObject({ origin: 'above', scope: 'everyone', band: { weight_min: 51, weight_max: 60 }, figures: { unit_price: 3 } });
  });

  it("the customer's own band wins when it reaches furthest", () => {
    const rates = [row('gur', 0, 50, 3, '2026-01-01'), row('gur', 0, 55, 2.5, '2026-01-01', null, CUST)];
    expect(preloadAdd(ROW('gur', 60), input(rates))).toMatchObject({ scope: 'customer', band: { weight_min: 56, weight_max: 60 }, figures: { unit_price: 2.5 } });
  });

  it('a customer band over weights the default prices is confirmed (customer scope)', () => {
    const rates = [row('gur', 0, 50, 3, '2026-01-01'), row('gur', 0, 10, 2.5, '2026-01-01', null, CUST)];
    const entry = { scope: 'customer' as const, weight_min: 11, weight_max: 60, unit_price: 2.5, labour_rate: 1.5, tax_percent: 5, to: null };
    expect(changeFacts(entry, ROW('gur', 60), input(rates))).toMatchObject({ scope: 'customer', old: { unit_price: 3 }, ends: { overrides: true } });
    // The same band as the default's: the existing case.
    expect(changeFacts({ ...entry, weight_min: 0, weight_max: 50 }, ROW('gur', 12), input([rates[0]]))).toMatchObject({ ends: { overrides: true } });
  });
});

describe('D7: entries carry the price type', () => {
  const lines = [{ item_table_id: 'gur', item_name: 'Gur', weight: 12 }];
  const grn = (price_type: PriceType): GrnRate => ({ item_id: 'gur', price_type, weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5 });
  const change: RateChange = { ...grn('monthly'), scope: 'everyone', to: null, ctx: contextKey(ctx) };

  it('withEntry stamps the context price type', () => {
    const e = { scope: 'grn' as const, weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 0, tax_percent: 5, to: null };
    expect(withEntry({ grnRates: [], changes: [] }, 'gur', e, { ...ctx, priceType: 'one_time' }).grnRates[0].price_type).toBe('one_time');
  });

  it('a price type change drops the entries of the other type and says so', () => {
    expect(dropOtherPriceType({ grnRates: [grn('monthly'), grn('one_time')], changes: [change] }, 'one_time')).toEqual({ grnRates: [grn('one_time')], changes: [], removed: true });
    expect(dropOtherPriceType({ grnRates: [grn('monthly')], changes: [] }, 'monthly').removed).toBe(false);
  });

  it('p_rates leaves out entries of the other type, so labour is never silently turned into 0', () => {
    const oneTime = { ...ctx, priceType: 'one_time' as PriceType };
    expect(buildRates({ grnRates: [grn('monthly')], changes: [], ctx: oneTime, lines })).toEqual([]);
  });

  it('a stored row without a price type is not seeded', () => {
    expect(grnRatesFromDetails([{ item_id: 'gur', weight_min: 0, weight_max: 9, unit_price: 1, labour_rate: 1, tax_percent: 5 }])).toEqual([]);
  });
});

describe('D4: an invoiced GRN sends its stored set back unchanged', () => {
  it('all stored entries, even one no line holds, and no changes', () => {
    const lines = [{ item_table_id: 'gur', item_name: 'Gur', weight: 12 }];
    const stored: GrnRate = { item_id: 'gur', price_type: 'monthly', weight_min: 60, weight_max: 90, unit_price: 4, labour_rate: 1.5, tax_percent: 5, saved: true };
    const change: RateChange = { ...stored, scope: 'everyone', to: null, ctx: contextKey(ctx) };
    expect(buildRates({ grnRates: [stored], changes: [change], ctx, lines, invoiced: true })).toEqual([
      { scope: 'grn', item_id: 'gur', weight_min: 60, weight_max: 90, unit_price: 4, labour_rate: 1.5, tax_percent: 5 },
    ]);
    expect(buildRates({ grnRates: [stored], changes: [change], ctx, lines })).toHaveLength(0);
  });
});
