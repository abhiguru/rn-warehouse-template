/**
 * The rate editor's rules, with the shared fixture F1 (Review North names, today = 2026-10-14).
 */
import { setLanguage } from '@/i18n';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import {
  fromOf,
  hasChanges,
  initialDraft,
  lotsRule,
  nowText,
  rateAfterCustomerStop,
  removeBand,
  rowsInForce,
  setPriceType,
  setStartsOn,
  setUpTo,
  appendEmptyBand,
  appendBandBlock,
  copyTiersFrom,
  startChips,
  stopChips,
  summaryLines,
  toReplaceInput,
  validate,
  type Draft,
} from '../editModel';

const TODAY = '2026-10-14';
const CUMIN = 'item-cumin';
const GARLIC = 'item-garlic';
const ONION = 'item-onion';
const GINGER = 'item-ginger';
const ORCH_A = 'cust-a';
const ORCH_B = 'cust-b';

let seq = 0;
const row = (
  item_id: string,
  customer_id: string | null,
  min: number,
  max: number,
  rent: number,
  labour: number,
  tax: number,
  from: string,
  to: string | null,
  price_type: PriceType = 'monthly'
): ItemStoragePrice => ({
  id: `row-${(seq += 1)}`,
  item_id,
  item_name: item_id,
  customer_id,
  customer_name: customer_id === ORCH_B ? 'Review Orchard B' : customer_id === ORCH_A ? 'Review Orchard A' : null,
  price_type,
  unit_price: rent,
  weight_min: min,
  weight_max: max,
  labour_rate: labour,
  tax_percent: tax,
  effective_from: from,
  effective_to: to,
  created_at: '',
  created_by: '',
});

/** F1 without the planned 12.00 rate (the state before job b). */
const cuminRows = [
  row(CUMIN, null, 0, 100, 10, 3, 5, '2025-01-01', '2026-03-31'),
  row(CUMIN, null, 0, 100, 11, 3, 5, '2026-04-01', null),
];
const garlicRows = [
  row(GARLIC, null, 0, 40, 6, 2.5, 5, '2025-01-01', null),
  row(GARLIC, null, 41, 100, 9.5, 2.5, 5, '2025-01-01', null),
];
const onionRows = [
  row(ONION, null, 0, 100, 3.5, 1.5, 5, '2025-01-01', null),
  row(ONION, ORCH_B, 0, 100, 3, 1.5, 5, '2026-01-01', null),
];
const gingerRows = [row(GINGER, null, 0, 100, 8, 2, 5, '2025-01-01', null)];

const base = { today: TODAY };
const open = (
  mode: Parameters<typeof initialDraft>[0]['mode'],
  params: Record<string, string | undefined>,
  rows: ItemStoragePrice[],
  role = 'admin'
) => initialDraft({ mode, params: { mode, ...params } as never, rows, role, ...base });

/** Draft with a chosen start day, as the person would after picking it. */
const startingOn = (draft: Draft, day: string): Draft => setStartsOn(draft, 'other', day);

describe('startChips', () => {
  it('offers today, the first of next month and the next 1 April', () => {
    expect(startChips('2026-10-14')).toEqual([
      { id: 'today', day: '2026-10-14' },
      { id: 'nextMonth', day: '2026-11-01' },
      { id: 'april', day: '2027-04-01' },
    ]);
  });

  it('drops the 1 April chip when it is the first of next month', () => {
    expect(startChips('2026-03-20')).toEqual([
      { id: 'today', day: '2026-03-20' },
      { id: 'nextMonth', day: '2026-04-01' },
    ]);
  });

  it('rolls December into January', () => {
    expect(startChips('2026-12-15').map(c => c.day)).toEqual(['2026-12-15', '2027-01-01', '2027-04-01']);
  });
});

describe('weight bands', () => {
  const { draft } = open('change', { item_id: GARLIC, price_type: 'monthly' }, garlicRows);

  it('prefills the bands, rent, labour and tax of the rate in force, with two decimals', () => {
    expect(draft.bands.map(b => [b.upTo, b.rent])).toEqual([['40', '6.00'], ['100', '9.50']]);
    expect(draft.labour).toBe('2.50');
    expect(draft.tax).toBe('5');
    expect(draft.startsOn).toBeNull();
    expect(draft.startsOnChoice).toBeNull();
  });

  it('starts band 2 where band 1 ends, and follows when band 1 changes', () => {
    expect(fromOf(draft, 0)).toBe(0);
    expect(fromOf(draft, 1)).toBe(41);
    const moved = setUpTo(draft, 0, '60');
    expect(fromOf(moved, 1)).toBe(61);
    expect(draft.bands[0].upTo).toBe('40');
  });

  it('appends an empty band that starts one kilogram above the last, and leaves the others alone', () => {
    const one = open('change', { item_id: CUMIN, price_type: 'monthly' }, cuminRows).draft;
    const added = appendEmptyBand(one);
    expect(added.bands.map(b => [fromOf(added, added.bands.indexOf(b)), b.upTo, b.rent])).toEqual([
      [0, '100', '11.00'],
      [101, '', ''],
    ]);
    expect(one.bands).toHaveLength(1);
  });

  it('gives the new band the labour and tax of the first when each band keeps its own', () => {
    const per = { ...draft, bands: draft.bands.map((b, i) => ({ ...b, labour: i === 0 ? '2.50' : '3.00', tax: i === 0 ? '5' : '12' })) };
    expect(appendEmptyBand(per).bands[2]).toEqual({ upTo: '', rent: '', labour: '2.50', tax: '5' });
    // A draft that shares one labour and tax gives the new band neither.
    expect(appendEmptyBand(draft).bands[2]).toEqual({ upTo: '', rent: '' });
  });

  it('adds nothing while the last "Up to" is not a whole number, and stops at ten bands', () => {
    const one = open('change', { item_id: CUMIN }, cuminRows).draft;
    const blank = { ...one, bands: [{ upTo: '', rent: '1' }] };
    expect(appendBandBlock(blank)).toBe('upTo');
    expect(appendEmptyBand(blank)).toBe(blank);
    const typed = { ...one, bands: [{ upTo: '40.5', rent: '1' }] };
    expect(appendEmptyBand(typed)).toBe(typed);
    let many = { ...one, bands: [{ upTo: '5', rent: '1.00' }] };
    for (let i = 0; i < 12; i += 1) {
      many = appendEmptyBand(many);
      many = { ...many, bands: many.bands.map((b, j) => (b.upTo === '' ? { ...b, upTo: String(10 * (j + 1)) } : b)) };
    }
    expect(many.bands).toHaveLength(10);
    expect(appendBandBlock(many)).toBe('max');
    expect(appendEmptyBand(many)).toBe(many);
  });

  it('replaces the bands, labour and tax with those of another item and keeps the start day', () => {
    const chosen = setStartsOn(draft, 'nextMonth', '2026-11-01');
    const other = [
      { ...cuminRows[0], weight_min: 11, weight_max: 20, unit_price: 4, labour_rate: 1.5, tax_percent: 5 },
      { ...cuminRows[0], weight_min: 0, weight_max: 10, unit_price: 3, labour_rate: 1, tax_percent: 5 },
    ];
    const copied = copyTiersFrom(chosen, other);
    expect(copied.bands.map(b => [b.upTo, b.rent, b.labour, b.tax])).toEqual([['10', '3.00', '1.00', '5'], ['20', '4.00', '1.50', '5']]);
    expect(copied.firstFrom).toBe(0);
    expect([copied.startsOn, copied.startsOnChoice]).toEqual(['2026-11-01', 'nextMonth']);
    expect(copied.priceType).toBe(chosen.priceType);
    expect(copyTiersFrom(chosen, [])).toBe(chosen);
  });

  it('removing a band that was just added (no "Up to" yet) leaves the band before as it was', () => {
    const added = appendEmptyBand(draft);
    expect(removeBand(added, 2).bands.map(b => b.upTo)).toEqual(['40', '100']);
  });

  it('removing the last band drops it: the range gets shorter and the band before keeps its own "Up to"', () => {
    const removed = removeBand(draft, 1);
    expect(removed.bands.map(b => b.upTo)).toEqual(['40']);
  });

  it('removing a middle band gives its weights to the band before', () => {
    const three = { ...draft, bands: [{ upTo: '10', rent: '3.00' }, { upTo: '20', rent: '4.00' }, { upTo: '50', rent: '5.00' }] };
    expect(removeBand(three, 1).bands.map(b => [b.upTo, b.rent])).toEqual([['20', '3.00'], ['50', '5.00']]);
  });

  it('Up to 1, Up to 8, remove the rest ends at 8 (the Eggs recipe)', () => {
    const eggs = { ...draft, bands: [{ upTo: '1', rent: '1.00' }, { upTo: '8', rent: '2.00' }, { upTo: '50', rent: '3.00' }] };
    expect(removeBand(eggs, 2).bands.map(b => b.upTo)).toEqual(['1', '8']);
  });

  it('removing the first band lets the next one start at the first weight', () => {
    const removed = removeBand(draft, 0);
    expect(removed.bands).toHaveLength(1);
    expect(fromOf(removed, 0)).toBe(0);
    expect(removed.bands[0].rent).toBe('9.50');
  });

  it('changing the type of an item with no rate keeps nothing from another type', () => {
    expect(setPriceType(draft, 'one_time').priceType).toBe('one_time');
  });
});

describe('validate', () => {
  const ctxFor = (rows: ItemStoragePrice[], item = GARLIC) => open('change', { item_id: item, price_type: 'monthly' }, rows);

  it('rejects a weight with a decimal point', () => {
    const { draft, context } = ctxFor(garlicRows);
    const result = validate(setUpTo(startingOn(draft, '2027-01-01'), 0, '40.5'), context);
    expect(result.ok).toBe(false);
    expect(result.errors['band.0.upTo']).toBe('Enter whole kilograms, for example 40.');
  });

  it('rejects a band that ends before it starts and names where it starts', () => {
    const { draft, context } = ctxFor(garlicRows);
    const result = validate(setUpTo(startingOn(draft, '2027-01-01'), 1, '40'), context);
    expect(result.errors['band.1.upTo']).toBe('Must be more than 40 kg; this band starts at 41 kg.');
  });

  it('accepts the unchanged rate once a start day is chosen', () => {
    const { draft, context } = ctxFor(garlicRows);
    expect(validate(startingOn(draft, '2027-01-01'), context)).toEqual({ ok: true, errors: {} });
  });

  it('asks for a start day', () => {
    const { draft, context } = ctxFor(garlicRows);
    expect(validate(draft, context).errors.startsOn).toBe('Choose a start date.');
  });

  it('rejects a rent with three decimals or letters', () => {
    const { draft, context } = ctxFor(cuminRows, CUMIN);
    const bad = { ...startingOn(draft, '2027-01-01'), bands: [{ upTo: '100', rent: '12.345' }] };
    expect(validate(bad, context).errors['band.0.rent']).toBe('Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.');
  });

  it('with no rate to copy, tax is empty and required', () => {
    const { draft, context } = open('add', { item_id: 'item-new', price_type: 'monthly' }, []);
    expect(draft.tax).toBe('');
    expect(draft.labour).toBe('');
    expect(draft.priceType).toBe('monthly');
    expect(draft.bands).toEqual([{ upTo: '100', rent: '' }]);
    const filled = { ...draft, bands: [{ upTo: '100', rent: '4' }], labour: '1' };
    const result = validate(filled, context);
    expect(result.errors.tax).toBe('Enter the tax rate for this item.');
    expect(validate({ ...filled, tax: '5' }, context).ok).toBe(true);
  });

  it('accepts a labour of 999999 and refuses 1000000, shared or per band', () => {
    const { draft, context } = open('add', { item_id: 'item-new', price_type: 'monthly' }, []);
    const base = { ...draft, bands: [{ upTo: '100', rent: '4' }], tax: '5' };
    expect(validate({ ...base, labour: '999999' }, context).errors.labour).toBeUndefined();
    expect(validate({ ...base, labour: '1000000' }, context).errors.labour).toBe('Enter a labour rate from 0 to 999999.');
    const perBand = (labour: string) => ({ ...base, bands: [{ upTo: '100', rent: '4', labour, tax: '5' }] });
    expect(validate(perBand('999999.99'), context).errors['band.0.labour']).toBe('Enter a labour rate from 0 to 999999.');
    expect(validate(perBand('999999'), context).errors['band.0.labour']).toBeUndefined();
  });

  it('rejects a tax above 100 and a missing labour (monthly only)', () => {
    const { draft, context } = open('add', { item_id: 'item-new', price_type: 'monthly' }, []);
    const bad = { ...draft, bands: [{ upTo: '100', rent: '4' }], tax: '101', labour: '' };
    const { errors } = validate(bad, context);
    expect(errors.tax).toBe('Enter a tax rate from 0 to 100.');
    expect(errors.labour).toBe('Enter a labour rate from 0 to 999999.');
    const oneTime = validate({ ...bad, priceType: 'one_time', tax: '5' }, context);
    expect(oneTime.errors.labour).toBeUndefined();
  });

  it('accepts a past day for a manager (item pricing is for managers)', () => {
    const manager = open('change', { item_id: CUMIN }, cuminRows, 'supervisor');
    expect(validate(startingOn(manager.draft, '2026-10-13'), manager.context).ok).toBe(true);
  });
});

describe('toReplaceInput', () => {
  it('Cumin Bold to 12.00 from 2027-01-01 is one call with one band', () => {
    const { draft, context } = open('change', { item_id: CUMIN, price_type: 'monthly' }, cuminRows);
    const typed = { ...startingOn(draft, '2027-01-01'), bands: [{ upTo: '100', rent: '12' }] };
    expect(toReplaceInput(typed, context)).toEqual({
      mode: 'change',
      item_id: CUMIN,
      customer_id: null,
      price_type: 'monthly',
      starts_on: '2027-01-01',
      seen_rows: cuminRows.map(r => r.id),
      bands: [{ weight_min: 0, weight_max: 100, unit_price: 12, labour_rate: 3, tax_percent: 5 }],
    });
  });

  it('sends two bands that follow on', () => {
    const { draft, context } = open('change', { item_id: GARLIC }, garlicRows);
    const input = toReplaceInput(startingOn(draft, '2026-10-14'), context);
    expect(input.bands.map(b => [b.weight_min, b.weight_max, b.unit_price])).toEqual([[0, 40, 6], [41, 100, 9.5]]);
  });

  it('a one-time rate always sends labour 0, even when the draft held 3', () => {
    const { draft, context } = open('change', { item_id: CUMIN, price_type: 'monthly' }, cuminRows);
    const oneTime = { ...startingOn(draft, '2027-01-01'), priceType: 'one_time' as const };
    expect(oneTime.labour).toBe('3.00');
    const input = toReplaceInput(oneTime, context);
    expect(input.price_type).toBe('one_time');
    expect(input.bands[0].labour_rate).toBe(0);
  });

  it('a customer rate carries the customer', () => {
    const { draft, context } = open('addCustomer', { item_id: ONION, customer_id: ORCH_A, customer_name: 'Review Orchard A', price_type: 'monthly' }, onionRows);
    expect(toReplaceInput(draft, context).customer_id).toBe(ORCH_A);
  });
});

describe('starting a new rate (prefill from data, never constants)', () => {
  it('add customer rate copies the default rate in force', () => {
    const { draft, context } = open('addCustomer', { item_id: ONION, customer_id: ORCH_A, customer_name: 'Review Orchard A' }, onionRows);
    expect(draft.priceType).toBe('monthly');
    expect(draft.bands).toEqual([{ upTo: '100', rent: '3.50' }]);
    expect(draft.labour).toBe('1.50');
    expect(draft.tax).toBe('5');
    expect(draft.startsOnChoice).toBe('today');
    expect(draft.startsOn).toBe(TODAY);
    expect(context.copied).toBe(true);
    // A customer with no rate of their own yet may choose Monthly or One-time (F24).
    expect(context.priceTypeChoosable).toBe(true);
  });

  it('a different item gets its own figures, not the first one', () => {
    const potato = [row('item-potato', null, 0, 100, 4, 2, 0, '2025-01-01', null)];
    const { draft } = open('addCustomer', { item_id: 'item-potato', customer_id: ORCH_A }, potato);
    expect(draft.tax).toBe('0');
    expect(draft.bands[0].rent).toBe('4.00');
  });

  it('add one-time rate to an item with only a monthly rate: fixed type, tax copied, rent empty', () => {
    const { draft, context } = open('add', { item_id: GINGER, price_type: 'one_time' }, gingerRows);
    expect(draft.priceType).toBe('one_time');
    expect(draft.tax).toBe('5');
    expect(draft.bands).toEqual([{ upTo: '100', rent: '' }]);
    expect(context.priceTypeChoosable).toBe(false);
  });

  it('an item with no rate at all may choose the type; it starts Monthly', () => {
    const { draft, context } = open('add', { item_id: 'item-new' }, []);
    expect(context.priceTypeChoosable).toBe(true);
    expect(draft.priceType).toBe('monthly');
  });

  it('only a rate that is not yet in force is copied from the day the new rate starts', () => {
    const later = [...onionRows, row(ONION, null, 0, 100, 4, 1.5, 5, '2027-01-01', null)];
    const { draft } = open('addCustomer', { item_id: ONION, customer_id: ORCH_A }, later);
    expect(draft.bands[0].rent).toBe('3.50');
  });
});

describe('modes that edit a rate in force', () => {
  it('correct: the start day is the rate\'s own and locked; admin only', () => {
    const admin = open('correct', { item_id: CUMIN, price_type: 'monthly' }, cuminRows, 'admin');
    expect(admin.context.mode).toBe('correct');
    expect(admin.context.managerOnly).toBe(false);
    expect(admin.draft.startsOn).toBe('2026-04-01');
    expect(admin.draft.startsOnChoice).toBe('fixed');
    expect(admin.draft.bands[0].rent).toBe('11.00');
    expect(toReplaceInput(admin.draft, admin.context).starts_on).toBe('2026-04-01');

    const staff = open('correct', { item_id: CUMIN, price_type: 'monthly' }, cuminRows, 'staff');
    expect(staff.context.managerOnly).toBe(true);
  });

  it('upcoming: shows the planned rate and its date as Other date', () => {
    const rows = [...cuminRows, row(CUMIN, null, 0, 100, 12, 3, 5, '2027-01-01', null)];
    const { draft, context } = open('upcoming', { item_id: CUMIN, price_type: 'monthly', starts_on: '2027-01-01' }, rows);
    expect(draft.startsOn).toBe('2027-01-01');
    expect(draft.startsOnChoice).toBe('other');
    expect(draft.bands[0].rent).toBe('12.00');
    expect(context.mode).toBe('upcoming');
  });

  it('shows what the rate is now beside the rent', () => {
    const { draft, context } = open('change', { item_id: GARLIC }, garlicRows);
    expect(nowText(draft, context, 1)).toBe('₹9.50');
    expect(nowText(draft, context, 0)).toBe('₹6.00');
  });
});

describe('hasChanges', () => {
  it('is false as opened and true after typing a rent or choosing a day', () => {
    const { draft } = open('change', { item_id: CUMIN }, cuminRows);
    expect(hasChanges(draft, draft)).toBe(false);
    expect(hasChanges({ ...draft, bands: [{ upTo: '100', rent: '12' }] }, draft)).toBe(true);
    expect(hasChanges(setStartsOn(draft, 'today', TODAY), draft)).toBe(true);
    expect(hasChanges(setPriceType(draft, 'one_time'), draft)).toBe(true);
    expect(hasChanges(appendEmptyBand(draft), draft)).toBe(true);
  });
});

describe('what the person is told', () => {
  beforeAll(() => setLanguage('en'));

  it('lots received from the new day get the new rate; earlier lots keep the old one', () => {
    const { draft, context } = open('change', { item_id: CUMIN }, cuminRows);
    const chosen = { ...setStartsOn(draft, 'april', '2027-04-01'), bands: [{ upTo: '100', rent: '12' }] };
    expect(lotsRule(chosen, context)).toBe(
      'Lots received from 1 Apr 2027 are charged the new rate. Lots received before keep ₹11.00.'
    );
    expect(summaryLines(chosen, context)).toEqual([
      'Until 31 Mar 2027: ₹11.00 per bag, per month',
      'From 1 Apr 2027: ₹12.00 per bag, per month',
    ]);
  });

  it('says nothing about an old rate when there was none', () => {
    const { draft, context } = open('add', { item_id: 'item-new', price_type: 'monthly' }, []);
    const chosen = { ...draft, bands: [{ upTo: '100', rent: '5' }] };
    expect(lotsRule(chosen, context)).toBe('Lots received from 14 Oct 2026 are charged this rate.');
    expect(summaryLines(chosen, context)).toEqual(['From 14 Oct 2026: ₹5.00 per bag, per month']);
  });

  it('with several bands, one line per band, and the old rates as a range', () => {
    const { draft, context } = open('change', { item_id: GARLIC }, garlicRows);
    const chosen = startingOn(draft, '2027-01-01');
    expect(lotsRule(chosen, context)).toContain('Lots received before keep ₹6.00–₹9.50.');
    expect(summaryLines(chosen, context)).toEqual([
      'Until 31 Dec 2026: ₹6.00–₹9.50 per bag, per month',
      'From 1 Jan 2027, 0–40 kg: ₹6.00 per bag, per month',
      'From 1 Jan 2027, 41–100 kg: ₹9.50 per bag, per month',
    ]);
  });

  it('a correction shows only the corrected line', () => {
    const { draft, context } = open('correct', { item_id: CUMIN }, cuminRows);
    const typed = { ...draft, bands: [{ upTo: '100', rent: '11.50' }] };
    expect(summaryLines(typed, context)).toEqual(['Corrected since 1 Apr 2026: ₹11.50 per bag, per month']);
    expect(lotsRule(typed, context)).toBeNull();
  });

  it('is empty until a rent is valid', () => {
    const { draft, context } = open('change', { item_id: CUMIN }, cuminRows);
    expect(summaryLines({ ...startingOn(draft, '2027-01-01'), bands: [{ upTo: '100', rent: '' }] }, context)).toEqual([]);
  });
});

describe('rowsInForce', () => {
  it('uses day strings: a rate ending today is in force today, not tomorrow', () => {
    const rows = [row(CUMIN, null, 0, 100, 10, 3, 5, '2026-01-01', '2026-10-14')];
    const scope = { customerId: null, priceType: 'monthly' as const };
    expect(rowsInForce(rows, scope, '2026-10-14')).toHaveLength(1);
    expect(rowsInForce(rows, scope, '2026-10-15')).toHaveLength(0);
    expect(rowsInForce(rows, scope, '2025-12-31')).toHaveLength(0);
  });
});

describe('the stop screen', () => {
  it('offers today, the end of this month and the end of this financial year', () => {
    expect(stopChips('2026-10-14')).toEqual([
      { id: 'today', day: '2026-10-14' },
      { id: 'monthEnd', day: '2026-10-31' },
      { id: 'yearEnd', day: '2027-03-31' },
    ]);
  });

  it('drops a chip that falls on a day already offered', () => {
    expect(stopChips('2026-10-31').map(c => c.id)).toEqual(['today', 'yearEnd']);
    expect(stopChips('2027-03-10').map(c => [c.id, c.day])).toEqual([['today', '2027-03-10'], ['monthEnd', '2027-03-31']]);
    expect(stopChips('2027-03-31').map(c => c.id)).toEqual(['today']);
    expect(stopChips('2026-04-01').map(c => c.day)).toEqual(['2026-04-01', '2026-04-30', '2027-03-31']);
  });

  it('a customer stop falls back to the default rate only where the default holds all the customer weights', () => {
    const own = [row(ONION, ORCH_B, 0, 100, 3, 1.5, 5, '2026-01-01', null)];
    const covers = [...own, row(ONION, null, 0, 100, 3.5, 1.5, 5, '2025-01-01', null)];
    expect(rateAfterCustomerStop(covers, ORCH_B, 'monthly', TODAY)).toEqual([3.5]);
    const partly = [...own, row(ONION, null, 0, 40, 3.5, 1.5, 5, '2025-01-01', null)];
    expect(rateAfterCustomerStop(partly, ORCH_B, 'monthly', TODAY)).toBeNull();
    const split = [...own, row(ONION, null, 0, 40, 3.5, 1.5, 5, '2025-01-01', null), row(ONION, null, 41, 100, 4.5, 1.5, 5, '2025-01-01', null)];
    expect(rateAfterCustomerStop(split, ORCH_B, 'monthly', TODAY)).toEqual([3.5, 4.5]);
    expect(rateAfterCustomerStop(own, ORCH_B, 'monthly', TODAY)).toBeNull();
  });
});
