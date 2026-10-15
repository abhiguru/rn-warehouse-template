/**
 * Fixes of the stopped bundle review (F11-F29, F62): the rate editor's rules, the dialog texts,
 * the history card model and the service answer. Fictional names; today = 2026-10-14.
 */
import type { ItemPriceHistoryEntry, ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { setLanguage } from '@/i18n';
import {
  dayInWindow,
  fromOf,
  initialDraft,
  keptEnd,
  resyncToday,
  savedStop,
  seenRowIds,
  setFirstFrom,
  setPriceType,
  setStartsOn,
  setUpTo,
  switchNewRateType,
  toReplaceInput,
  validate,
} from '../editModel';
import { laterDialogText, plannedOnDay } from '../laterRates';
import { cancelMessage } from '../cancelText';
import { scopeView, itemSummary } from '../rateModel';
import { percentRange, todayDay } from '../rateText';
import { groupChanges } from '../utils/priceHistory';

const TODAY = '2026-10-14';
const ITEM = 'onion';
const CUST = 'cust-a';

let seq = 0;
const row = (
  customer_id: string | null,
  min: number,
  max: number,
  rent: number,
  from: string,
  to: string | null,
  price_type: PriceType = 'monthly',
  labour = 1.5,
  tax = 5,
): ItemStoragePrice => ({
  id: `bf-${(seq += 1)}`,
  item_id: ITEM,
  item_name: 'Review Onion',
  customer_id,
  customer_name: customer_id ? 'Review Orchard A' : null,
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

const open = (
  mode: Parameters<typeof initialDraft>[0]['mode'],
  params: Record<string, string | undefined>,
  rows: ItemStoragePrice[],
  role = 'admin',
) => initialDraft({ mode, params: { mode, item_id: ITEM, ...params } as never, rows, role, today: TODAY });

afterEach(() => setLanguage('en'));

describe('F11 / F12: the replace question names every planned rate, and a rate on the first day', () => {
  const planned = [
    row(null, 0, 100, 7, '2026-11-01', '2027-03-31'),
    row(null, 0, 100, 8, '2027-04-01', null),
  ];

  it('F11: a planned rate that starts on the stop day plus one is found before sending', () => {
    const found = plannedOnDay([row(null, 0, 100, 6, '2025-01-01', '2026-10-31'), ...planned], { customerId: null, priceType: 'monthly' }, '2026-11-01', TODAY);
    expect(found.map(f => [f.effective_from, f.unit_price])).toEqual([['2026-11-01', 7]]);
    // Not asked about a rate that began already, or for a start today.
    expect(plannedOnDay(planned, { customerId: null, priceType: 'monthly' }, '2026-10-14', TODAY)).toEqual([]);
    // The rows an edit replaces are not "another rate".
    expect(plannedOnDay(planned, { customerId: null, priceType: 'monthly' }, '2026-11-01', TODAY, [planned[0].id])).toEqual([]);
  });

  it('F12: two planned rates are both named', () => {
    const later = planned.map(r => ({ effective_from: r.effective_from, weight_min: r.weight_min, weight_max: r.weight_max, unit_price: r.unit_price }));
    const text = laterDialogText(later, '2026-10-14', TODAY);
    expect(text.title).toBe('Replace 2 planned rates?');
    expect(text.message).toContain('1 Nov 2026 (₹7.00)');
    expect(text.message).toContain('1 Apr 2027 (₹8.00)');
  });

  it('F12: a multi-band planned rate shows its range of rents, one planned rate keeps the old wording', () => {
    const bands = [
      { effective_from: '2026-11-01', weight_min: 0, weight_max: 40, unit_price: 6 },
      { effective_from: '2026-11-01', weight_min: 41, weight_max: 100, unit_price: 9.5 },
    ];
    expect(laterDialogText(bands, '2026-10-14', TODAY).message).toBe('A rate from 1 Nov 2026 (₹6.00–₹9.50) comes after this date. Saving removes it.');
    expect(laterDialogText(bands, '2026-11-01', TODAY).message).toBe('Saving removes the rate planned from 1 Nov 2026 (₹6.00–₹9.50).');
  });
});

describe('F14: the invoice pencil with an own rate that does not hold the line weight', () => {
  const rows = [row(null, 0, 100, 3.5, '2025-01-01', null), row(CUST, 0, 40, 3, '2026-01-01', null)];
  const line = { customer_id: CUST, customer_name: 'Review Orchard A', grn_date: '2026-10-01', unit_price: '3.50', labour_rate: '1.75', tax_percent: '5', weight_max: '60' };

  it('does not correct the 0-40 band: it keeps it and adds a band for 60 kg', () => {
    const { draft, context } = open('invoice', line, rows);
    expect(context.mode).toBe('addCustomer');
    expect(draft.bands.map(b => [fromOf(draft, draft.bands.indexOf(b)), b.upTo, b.rent])).toEqual([[0, '40', '3.00'], [41, '60', '3.50']]);
    expect(draft.labour).toBe('1.75');
  });

  it('an own band that holds the weight is still corrected', () => {
    const { draft, context } = open('invoice', { ...line, weight_max: '30', unit_price: '3.25' }, rows);
    expect(context.mode).toBe('correct');
    expect(draft.bands[0].rent).toBe('3.25');
  });

  it('a weight below an own rate that starts higher gets the band before it', () => {
    const heavy = [row(null, 0, 100, 3.5, '2025-01-01', null), row(CUST, 51, 100, 4, '2026-01-01', null)];
    const { draft } = open('invoice', { ...line, weight_max: '30' }, heavy);
    expect(draft.firstFrom).toBe(0);
    expect(draft.bands.map(b => b.upTo)).toEqual(['50', '100']);
    expect(draft.bands[0].rent).toBe('3.50');
  });
});

describe('F15: Add monthly rate beside a one-time default', () => {
  it('asks for the labour instead of prefilling 0.00', () => {
    const rows = [row(null, 0, 100, 20, '2025-01-01', null, 'one_time', 0)];
    const { draft } = open('add', { price_type: 'monthly' }, rows);
    expect(draft.labour).toBe('');
    expect(validate(setStartsOn(draft, 'today', TODAY), open('add', { price_type: 'monthly' }, rows).context).errors.labour).toBeDefined();
  });
  it('also blanks the per-band labour of a one-time rate with bands of different tax', () => {
    const rows = [row(null, 0, 40, 20, '2025-01-01', null, 'one_time', 0, 0), row(null, 41, 100, 25, '2025-01-01', null, 'one_time', 0, 5)];
    const { draft } = open('add', { price_type: 'monthly' }, rows);
    expect(draft.bands.map(b => b.labour)).toEqual(['', '']);
  });
});

describe('F16: Cancel new rate when the current rate stops earlier', () => {
  const scope = (to: string | null) => ({
    priceType: 'monthly' as const,
    customerId: null,
    bands: [row(null, 0, 100, 11, '2026-04-01', to)],
    upcoming: { startsOn: '2027-06-01', rows: [row(null, 0, 100, 12, '2027-06-01', null)] },
    stopsAfter: to,
  });
  it('says the rate continues when it ends the day before', () => {
    expect(cancelMessage(scope('2027-05-31'), '₹11.00', '₹12.00')).toContain('continues after 31 May 2027');
  });
  it('says there is no rate after the stop when there is a gap', () => {
    const text = cancelMessage(scope('2027-03-31'), '₹11.00', '₹12.00');
    expect(text).not.toContain('continues');
    expect(text).toContain('stops after 31 Mar 2027');
  });
});

describe('F17: a rate that is followed by another one is not stopping', () => {
  const rows = [row(null, 0, 100, 11, '2026-04-01', '2026-12-31'), row(null, 0, 100, 12, '2027-01-01', null)];
  it('correcting R shows no stop', () => {
    const { draft, context } = open('correct', { price_type: 'monthly', starts_on: '2026-04-01' }, rows);
    expect(keptEnd(draft, context)).toBeNull();
    expect(savedStop('2026-12-31', draft, context)).toBeNull();
  });
  it('a true stop (a gap before the next rate) is still named', () => {
    const gap = [row(null, 0, 100, 11, '2026-04-01', '2026-12-31'), row(null, 0, 100, 12, '2027-03-01', null)];
    const { draft, context } = open('correct', { price_type: 'monthly', starts_on: '2026-04-01' }, gap);
    expect(keptEnd(draft, context)).toBe('2026-12-31');
  });
});

describe('F18: staff cannot move a planned rate to today', () => {
  const rows = [row(null, 0, 100, 11, '2026-04-01', '2026-10-31'), row(null, 0, 100, 12, '2026-11-01', null)];
  it('refuses today before saving, with its own words', () => {
    const { draft, context } = open('upcoming', { price_type: 'monthly', starts_on: '2026-11-01' }, rows, 'staff');
    const toToday = validate(setStartsOn(draft, 'today', TODAY), context);
    expect(toToday.errors.startsOn).toContain('only to a day after today');
    expect(validate(setStartsOn(draft, 'other', '2026-11-05'), context).ok).toBe(true);
  });
  it('an administrator may move it to today', () => {
    const { draft, context } = open('upcoming', { price_type: 'monthly', starts_on: '2026-11-01' }, rows, 'admin');
    expect(validate(setStartsOn(draft, 'today', TODAY), context).ok).toBe(true);
  });
});

describe('F19: the start window is the server window in days', () => {
  it('accepts exactly -1095 .. +730 days', () => {
    expect(dayInWindow('2023-10-15', TODAY)).toBe(true);
    expect(dayInWindow('2023-10-14', TODAY)).toBe(false);
    expect(dayInWindow('2028-10-13', TODAY)).toBe(true);
    expect(dayInWindow('2028-10-14', TODAY)).toBe(false);
  });
  it('validate refuses a day outside it before saving', () => {
    const { draft, context } = open('change', { price_type: 'monthly' }, [row(null, 0, 100, 11, '2026-04-01', null)]);
    expect(validate(setStartsOn(draft, 'other', '2028-10-14'), context).errors.startsOn).toBe('Choose a start date within two years after today.');
    // A day before the floor names the floor: the oldest GRN's day when the server sent it, else three years back.
    expect(validate(setStartsOn(draft, 'other', '2021-12-31'), { ...context, earliestStart: '2022-01-01' }).errors.startsOn).toBe('Choose a day on or after 1 Jan 2022, the date of your oldest GRN.');
    expect(validate(setStartsOn(draft, 'other', '2023-10-14'), context).errors.startsOn).toBe('Choose a day on or after 15 Oct 2023, the date of your oldest GRN.');
  });
});

describe('F20: today is the India day', () => {
  it('a phone on another day still gets the India day', () => {
    // 2026-10-14 20:00 UTC is 01:30 IST on 15 Oct whatever the phone zone is.
    expect(todayDay(new Date(Date.UTC(2026, 9, 14, 20, 0, 0)))).toBe('2026-10-15');
    expect(todayDay(new Date(Date.UTC(2026, 9, 14, 17, 0, 0)))).toBe('2026-10-14');
  });
  it('an editor left open past midnight moves Today to the new day', () => {
    const { draft, context } = open('change', { price_type: 'monthly' }, [row(null, 0, 100, 11, '2026-04-01', null)]);
    const moved = resyncToday(setStartsOn(draft, 'today', TODAY), context, '2026-10-15');
    expect(moved?.draft.startsOn).toBe('2026-10-15');
    expect(moved?.ctx.today).toBe('2026-10-15');
    expect(resyncToday(draft, context, TODAY)).toBeNull();
  });
});

describe('F24: a customer rate of either type', () => {
  const rows = [row(null, 0, 100, 3.5, '2025-01-01', null), row(null, 0, 100, 20, '2025-01-01', null, 'one_time', 0)];
  it('is choosable for a customer with no own rate and re-seeds from the other default', () => {
    const { draft, context } = open('addCustomer', { customer_id: CUST, customer_name: 'Review Orchard A' }, rows);
    expect(context.priceTypeChoosable).toBe(true);
    expect(draft.priceType).toBe('monthly');
    const next = switchNewRateType(draft, context, 'one_time');
    expect(next.draft.priceType).toBe('one_time');
    expect(next.draft.bands[0].rent).toBe('20.00');
    const sent = toReplaceInput(setUpTo(next.draft, 0, '100'), { ...context });
    expect(sent.price_type).toBe('one_time');
  });
  it('is fixed once the customer has a rate of the other type', () => {
    const own = [...rows, row(CUST, 0, 100, 3, '2026-01-01', null)];
    const { context } = open('addCustomer', { customer_id: CUST, customer_name: 'Review Orchard A', price_type: 'one_time' }, own);
    expect(context.priceTypeChoosable).toBe(false);
  });
  it('an item whose only default is one-time opens a customer rate as one-time', () => {
    const { draft } = open('addCustomer', { customer_id: CUST, customer_name: 'Review Orchard A' }, [rows[1]]);
    expect(draft.priceType).toBe('one_time');
  });
});

describe('F25: weights between a customer\'s bands and a first band above 0', () => {
  const rows = [row(null, 0, 100, 3.5, '2025-01-01', null), row(CUST, 0, 40, 3, '2026-01-01', null), row(CUST, 61, 100, 4, '2026-01-01', null)];
  it('keeps the gap, so 41-60 kg still pay the default', () => {
    const { draft, context } = open('change', { customer_id: CUST, price_type: 'monthly' }, rows);
    expect(fromOf(draft, 1)).toBe(61);
    const sent = toReplaceInput(setStartsOn(draft, 'today', TODAY), context);
    expect(sent.bands.map(b => [b.weight_min, b.weight_max])).toEqual([[0, 40], [61, 100]]);
  });
  it('a heavy-bags-only rate starts at the From the person typed', () => {
    const { draft, context } = open('addCustomer', { customer_id: CUST, price_type: 'monthly' }, [rows[0]]);
    const typed = setFirstFrom(draft, '51');
    expect(toReplaceInput(setStartsOn(typed, 'today', TODAY), context).bands[0]).toMatchObject({ weight_min: 51, weight_max: 100 });
    expect(validate(setFirstFrom(draft, '5x'), context).errors.firstFrom).toBeDefined();
  });
});

describe('F26: Edit new rate for a planned rate that is gone', () => {
  it('opens as gone, not as an empty change', () => {
    const rows = [row(null, 0, 100, 11, '2026-04-01', null)];
    const { context } = open('upcoming', { price_type: 'monthly', starts_on: '2026-11-01' }, rows);
    expect(context.plannedGone).toBe(true);
  });
  it('another planned rate on a different day is not silently edited instead', () => {
    const rows = [row(null, 0, 100, 11, '2026-04-01', '2026-12-31'), row(null, 0, 100, 12, '2027-01-01', null)];
    expect(open('upcoming', { price_type: 'monthly', starts_on: '2026-11-01' }, rows).context.plannedGone).toBe(true);
    expect(open('upcoming', { price_type: 'monthly', starts_on: '2027-01-01' }, rows).context.plannedGone).toBe(false);
  });
});

describe('F27: bands that differ in tax', () => {
  const rows = [row(null, 0, 50, 3, '2025-01-01', null, 'monthly', 1.5, 0), row(null, 51, 100, 4, '2025-01-01', null, 'monthly', 1.5, 5)];
  it('the list figures carry the range', () => {
    const summary = itemSummary({ item: { id: ITEM, name: 'Review Onion', packaging: null }, rows }, TODAY);
    expect([summary.tax, summary.taxMax]).toEqual([0, 5]);
    expect(percentRange(summary.tax as number, summary.taxMax as number)).toBe('0–5');
  });
  it('the rows in force still come from the scope view', () => {
    expect(scopeView(rows, TODAY).inForce).toHaveLength(2);
  });
});

describe('F28: a band that ends at 0 kg', () => {
  it('is refused', () => {
    const { draft, context } = open('change', { price_type: 'monthly' }, [row(null, 0, 100, 11, '2026-04-01', null)]);
    const zero = setStartsOn(setUpTo(draft, 0, '0'), 'today', TODAY);
    expect(validate(zero, context).errors['band.0.upTo']).toBe('Enter a weight of 1 kg or more.');
  });
});

describe('F29: the sent rows', () => {
  it('lists the ids of the rows of the scope that were loaded', () => {
    const rows = [row(null, 0, 100, 11, '2026-04-01', null), row(CUST, 0, 100, 3, '2026-01-01', null), row(null, 0, 100, 20, '2025-01-01', null, 'one_time', 0)];
    expect(seenRowIds(rows, null, 'monthly')).toEqual([rows[0].id]);
    expect(seenRowIds(rows, CUST, 'monthly')).toEqual([rows[1].id]);
  });
});

describe('F62: the server saying "no stop"', () => {
  it('null from the server is not replaced by the draft\'s guess', () => {
    const rows = [row(null, 0, 100, 11, '2026-04-01', '2026-12-31'), row(null, 0, 100, 12, '2027-01-01', '2027-03-31')];
    const { draft, context } = open('upcoming', { price_type: 'monthly', starts_on: '2027-01-01' }, rows);
    const moved = setStartsOn(draft, 'other', '2027-02-01');
    expect(keptEnd(moved, context)).toBe('2027-03-31');
    expect(savedStop(null, moved, context)).toBeNull();
    expect(savedStop(undefined, moved, context)).toBe('2027-03-31');
  });
});

describe('F23: rows a save deleted are listed in the history card', () => {
  const entry = (id: number, action: string, old_values: object | null, new_values: object | null): ItemPriceHistoryEntry =>
    ({
      id,
      action,
      old_values,
      new_values,
      changed_at: '2026-10-14T05:00:00+00:00',
      changed_by: 'u1',
      item_id: ITEM,
      customer_id: null,
    }) as unknown as ItemPriceHistoryEntry;
  const price = (rent: number, from: string, to: string | null, min = 0, max = 100) => ({
    price_type: 'monthly', unit_price: rent, labour_rate: 2, tax_percent: 5, weight_min: min, weight_max: max, effective_from: from, effective_to: to,
  });
  it('a deleted planned rate appears in removed', () => {
    const view = groupChanges([
      entry(3, 'insert', null, price(11, '2026-10-14', null)),
      entry(2, 'update', price(10, '2026-01-01', null), price(10, '2026-01-01', '2026-10-13')),
      entry(1, 'delete', price(12, '2026-12-01', null), null),
    ]);
    expect(view.kind).toBe('changed');
    expect(view.removed).toEqual([{ band: { min: 0, max: 100 }, field: 'monthlyPrice', price: 12, from: '2026-12-01' }]);
  });
  it('bands a correction dropped are listed', () => {
    const view = groupChanges([
      entry(3, 'insert', null, price(5, '2026-01-01', null, 0, 100)),
      entry(2, 'delete', price(5, '2026-01-01', null, 0, 40), null),
      entry(1, 'delete', price(6, '2026-01-01', null, 41, 100), null),
    ]);
    expect(view.removed.map(r => r.band)).toEqual([{ min: 0, max: 40 }, { min: 41, max: 100 }]);
  });
});

describe('F13/F15 helper unaffected: setPriceType keeps typed values', () => {
  it('switching with nothing to copy keeps the typed rent', () => {
    const { draft, context } = open('add', { item_id: 'fresh' }, []);
    const typed = { ...draft, bands: [{ upTo: '100', rent: '4' }] };
    expect(switchNewRateType(typed, context, 'one_time').draft.bands[0].rent).toBe('4');
    expect(setPriceType(typed, 'one_time').priceType).toBe('one_time');
  });
});
