import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';
import { groupBySave, groupChanges, priceHistoryChanges, priceHistorySides, truncatedPriceCount } from '../priceHistory';
import { priceHistoryAuthor, priceHistoryActionLabel, priceHistoryFieldLabel, priceHistoryValueText } from '../priceHistoryLabels';
import { setLanguage } from '@/i18n';

afterEach(() => setLanguage('en'));

/** A monthly price as the server keeps it: unit_price repeats the price of its own kind. */
const monthly = (price: number, more: Record<string, unknown> = {}) => ({
  price_type: 'monthly',
  unit_price: price,
  unit_price_monthly: price,
  unit_price_one_time: 0,
  labour_rate: 2,
  tax_percent: 5,
  weight_min: 0,
  weight_max: 100,
  effective_from: '2026-01-01',
  effective_to: null,
  ...more,
});

describe('update', () => {
  it('lists only the fields that differ, with the old and the new value', () => {
    expect(priceHistoryChanges('update', monthly(5), monthly(5, { labour_rate: 3, effective_to: '2026-12-31' }))).toEqual([
      { field: 'labourRate', before: 2, after: 3 },
      { field: 'effectiveTo', before: null, after: '2026-12-31' },
    ]);
  });

  it('shows a changed price once: unit_price and the column of its kind are one field', () => {
    expect(priceHistoryChanges('update', monthly(5), monthly(6))).toEqual([{ field: 'monthlyPrice', before: 5, after: 6 }]);
    const oneTime = (price: number) => monthly(0, { price_type: 'one_time', unit_price: price, unit_price_one_time: price });
    expect(priceHistoryChanges('update', oneTime(40), oneTime(45))).toEqual([{ field: 'oneTimePrice', before: 40, after: 45 }]);
  });

  it('reads unit_price as the price of its kind when the column of that kind lags behind', () => {
    const before = monthly(5);
    const after = { ...monthly(5), unit_price: 7 };
    expect(priceHistoryChanges('update', before, after)).toEqual([{ field: 'monthlyPrice', before: 5, after: 7 }]);
  });

  it('is an empty list when nothing a person sees differs', () => {
    expect(priceHistoryChanges('update', monthly(5), monthly(5))).toEqual([]);
    // 5 and 5.00 are one number, also when one arrives as text.
    expect(priceHistoryChanges('update', monthly(5), monthly(5, { unit_price: '5.00', unit_price_monthly: '5.00' }))).toEqual([]);
  });

  it('treats the weight band as one field', () => {
    expect(priceHistoryChanges('update', monthly(5), monthly(5, { weight_max: 200 }))).toEqual([
      { field: 'weightBand', before: { min: 0, max: 100 }, after: { min: 0, max: 200 } },
    ]);
  });

  it('shows the old price under the old kind and the new price under the new kind when the kind itself changes', () => {
    const after = monthly(0, { price_type: 'one_time', unit_price: 7, unit_price_one_time: 7 });
    expect(priceHistoryChanges('update', monthly(5), after)).toEqual([
      { field: 'priceType', before: 'monthly', after: 'one_time' },
      { field: 'monthlyPrice', before: 5, after: null, only: 'before' },
      { field: 'oneTimePrice', before: null, after: 7, only: 'after' },
    ]);
    // The old kind comes first, whichever it is, and an equal number is still shown under both labels.
    expect(priceHistoryChanges('update', after, monthly(7))).toEqual([
      { field: 'priceType', before: 'one_time', after: 'monthly' },
      { field: 'oneTimePrice', before: 7, after: null, only: 'before' },
      { field: 'monthlyPrice', before: null, after: 7, only: 'after' },
    ]);
  });

  // Billing reads unit_price only. The column of the other kind is a compatibility copy that is
  // not always 0: the default-pricing routine writes all three equal, and the next update of
  // such a price sets the other kind's column to 0.
  it('never shows the column of the other kind as a price', () => {
    const allEqual = monthly(91.5, { unit_price_one_time: 91.5 });
    expect(priceHistoryChanges('update', allEqual, monthly(91.5, { labour_rate: 3 }))).toEqual([
      { field: 'labourRate', before: 2, after: 3 },
    ]);
    expect(priceHistoryChanges('update', allEqual, monthly(91.5))).toEqual([]);
    const oneTime = monthly(40, { price_type: 'one_time', unit_price_one_time: 40, unit_price_monthly: 40 });
    expect(priceHistoryChanges('update', oneTime, { ...oneTime, unit_price_monthly: 0, tax_percent: 12 })).toEqual([
      { field: 'tax', before: 5, after: 12 },
    ]);
  });

  it('reads a value that is missing or null as "not there" on that side', () => {
    const before = { price_type: 'monthly', unit_price: 5, tax_percent: null };
    const after = { price_type: 'monthly', unit_price: 5, tax_percent: 18, effective_from: '2026-04-01' };
    expect(priceHistoryChanges('update', before, after)).toEqual([
      { field: 'tax', before: null, after: 18 },
      { field: 'effectiveFrom', before: null, after: '2026-04-01' },
    ]);
  });
});

describe('insert and delete', () => {
  const ALL_OF_A_MONTHLY_PRICE = ['priceType', 'monthlyPrice', 'weightBand', 'labourRate', 'tax', 'effectiveFrom', 'effectiveTo'];

  it('an insert lists the new price, without the price of the other kind while it is 0', () => {
    const changes = priceHistoryChanges('insert', null, monthly(6));
    expect(changes.map((change) => change.field)).toEqual(ALL_OF_A_MONTHLY_PRICE);
    expect(changes.every((change) => change.before === null)).toBe(true);
    expect(changes.find((change) => change.field === 'monthlyPrice')?.after).toBe(6);
    expect(changes.find((change) => change.field === 'weightBand')?.after).toEqual({ min: 0, max: 100 });
  });

  it('a delete lists the old price', () => {
    const changes = priceHistoryChanges('delete', monthly(6, { effective_to: '2026-06-30' }), null);
    expect(changes.map((change) => change.field)).toEqual(ALL_OF_A_MONTHLY_PRICE);
    expect(changes.every((change) => change.after === null)).toBe(true);
    expect(changes.find((change) => change.field === 'effectiveTo')?.before).toBe('2026-06-30');
  });

  it('lists only the price of its own kind, also when the column of the other kind is not 0', () => {
    const allEqual = monthly(91.5, { unit_price_one_time: 91.5 });
    expect(priceHistoryChanges('insert', null, allEqual).map((change) => change.field)).toEqual(ALL_OF_A_MONTHLY_PRICE);
    expect(priceHistoryChanges('delete', allEqual, null).map((change) => change.field)).toEqual(ALL_OF_A_MONTHLY_PRICE);
    const oneTime = monthly(40, { price_type: 'one_time', unit_price_one_time: 40, unit_price_monthly: 40 });
    const fields = priceHistoryChanges('insert', null, oneTime).map((change) => change.field);
    expect(fields).toContain('oneTimePrice');
    expect(fields).not.toContain('monthlyPrice');
  });

  it('reads the price from unit_price, not from the column of its kind', () => {
    const changes = priceHistoryChanges('insert', null, monthly(6, { unit_price_monthly: 4 }));
    expect(changes.find((change) => change.field === 'monthlyPrice')?.after).toBe(6);
  });

  it('ignores a side the action does not have', () => {
    expect(priceHistoryChanges('insert', monthly(1), monthly(6)).every((change) => change.before === null)).toBe(true);
    expect(priceHistoryChanges('delete', monthly(6), monthly(1)).every((change) => change.after === null)).toBe(true);
  });

  it('is an empty list when the values are missing', () => {
    expect(priceHistoryChanges('insert', null, null)).toEqual([]);
    expect(priceHistoryChanges('delete', undefined, undefined)).toEqual([]);
    expect(priceHistoryChanges('update', null, null)).toEqual([]);
  });
});

describe('which side an entry has', () => {
  it('goes by the values that are present, within what the action allows', () => {
    expect(priceHistorySides('update', monthly(5), monthly(6))).toBe('both');
    expect(priceHistorySides('insert', null, monthly(6))).toBe('after');
    expect(priceHistorySides('delete', monthly(6), null)).toBe('before');
    // An update that arrives with one side only.
    expect(priceHistorySides('update', monthly(5), null)).toBe('before');
    expect(priceHistorySides('update', null, monthly(6))).toBe('after');
    expect(priceHistorySides('insert', monthly(1), monthly(6))).toBe('after');
    expect(priceHistorySides('delete', monthly(6), monthly(1))).toBe('before');
    expect(priceHistorySides('update', null, null)).toBe('none');
    expect(priceHistorySides('truncate', { rows: 3 }, null)).toBe('none');
  });

  it('an update with only its old values lists them as a delete does', () => {
    const changes = priceHistoryChanges('update', monthly(5), null);
    expect(changes.map((change) => change.field)).toEqual(
      ['priceType', 'monthlyPrice', 'weightBand', 'labourRate', 'tax', 'effectiveFrom', 'effectiveTo']
    );
    expect(changes.find((change) => change.field === 'monthlyPrice')).toEqual({ field: 'monthlyPrice', before: 5, after: null });
  });
});

describe('truncate', () => {
  it('has no fields; its old values are the number of prices removed', () => {
    expect(priceHistoryChanges('truncate', { rows: 12 }, null)).toEqual([]);
    expect(truncatedPriceCount({ rows: 12 })).toBe(12);
    expect(truncatedPriceCount({ rows: 0 })).toBe(0);
    expect(truncatedPriceCount(null)).toBeNull();
    expect(truncatedPriceCount({})).toBeNull();
  });
});

describe('words and formats', () => {
  it('uses the labels and formats of the pricing screens', () => {
    expect(priceHistoryFieldLabel('monthlyPrice')).toBe('Monthly price');
    expect(priceHistoryFieldLabel('weightBand')).toBe('Weight range');
    expect(priceHistoryValueText('priceType', 'one_time')).toBe('One-time');
    expect(priceHistoryValueText('monthlyPrice', 1250.5)).toBe('₹1,250.50');
    expect(priceHistoryValueText('labourRate', 2)).toBe('₹2.00');
    expect(priceHistoryValueText('tax', 18)).toBe('18%');
    expect(priceHistoryValueText('weightBand', { min: 0, max: 100 })).toBe('0–100 kg');
    expect(priceHistoryValueText('effectiveFrom', '2026-01-01')).toBe('1 Jan 2026');
    expect(priceHistoryValueText('effectiveTo', null)).toBe('No end date');
  });

  it('shows a dash for a value that is not there, never a stored word', () => {
    expect(priceHistoryValueText('monthlyPrice', null)).toBe('—');
    expect(priceHistoryValueText('weightBand', { min: 0, max: null })).toBe('—');
    expect(priceHistoryValueText('priceType', 'weekly')).toBe('—');
    expect(priceHistoryValueText('effectiveFrom', null)).toBe('—');
  });

  it('names the four actions', () => {
    expect(['insert', 'update', 'delete', 'truncate'].map(priceHistoryActionLabel)).toEqual([
      'Price added',
      'Price changed',
      'Price deleted',
      'All prices removed',
    ]);
  });

  it('names who made the change with the role in the app wording', () => {
    expect(priceHistoryAuthor({ changed_by: 'u1', changed_by_name: 'Meera Joshi', changed_by_role: 'supervisor' })).toBe('Meera Joshi (Supervisor)');
    expect(priceHistoryAuthor({ changed_by: 'u1', changed_by_name: null, changed_by_role: 'staff' })).toBe('Unknown user (Staff)');
    expect(priceHistoryAuthor({ changed_by: null, changed_by_name: null, changed_by_role: null })).toBe('Not an app user');
  });

  it('writes numbers and dates in Gujarati digits in Gujarati', () => {
    setLanguage('gu');
    expect(priceHistoryValueText('monthlyPrice', 6)).toBe('₹૬.૦૦');
    expect(priceHistoryValueText('tax', 18)).toBe('૧૮%');
    expect(priceHistoryValueText('weightBand', { min: 0, max: 100 })).toBe('૦–૧૦૦ કિલો');
    expect(priceHistoryValueText('effectiveFrom', '2026-01-01')).toBe('૧ જાન્યુ ૨૦૨૬');
    expect(priceHistoryAuthor({ changed_by: 'u1', changed_by_name: 'Meera Joshi', changed_by_role: 'staff' })).toBe('Meera Joshi (સ્ટાફ)');
    expect(priceHistoryAuthor({ changed_by: null, changed_by_name: null, changed_by_role: null })).toBe('ઍપનો યુઝર નથી');
  });
});

describe('rows written by one save', () => {
  const at = '2026-10-14T05:00:00.123456+00:00';
  const entry = (id: number, more: Partial<ItemPriceHistoryEntry>): ItemPriceHistoryEntry => ({
    id,
    changed_at: at,
    action: 'update',
    price_id: `p${id}`,
    item_id: 'cumin',
    item_name: 'Review Cumin Bold',
    customer_id: null,
    customer_name: null,
    old_values: null,
    new_values: null,
    changed_by: 'u1',
    changed_by_name: 'Meera Joshi',
    changed_by_role: 'admin',
    ...more,
  });
  // Job (b): the rate in force is ended on 31 Dec 2026 and the new one is added from 1 Jan 2027.
  const ended = (id: number, extra: Partial<ItemPriceHistoryEntry> = {}) =>
    entry(id, { action: 'update', old_values: monthly(11, { effective_from: '2026-04-01' }), new_values: monthly(11, { effective_from: '2026-04-01', effective_to: '2026-12-31' }), ...extra });
  const added = (id: number, rent: number, extra: Partial<ItemPriceHistoryEntry> = {}) =>
    entry(id, { action: 'insert', new_values: monthly(rent, { effective_from: '2027-01-01' }), ...extra });

  it('three rows with the same time and person are one group', () => {
    const groups = groupBySave([added(3, 12), ended(2), entry(1, { action: 'update', old_values: monthly(9), new_values: monthly(9, { effective_to: '2026-12-31' }), price_id: 'p-other' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map(e => e.id)).toEqual([3, 2, 1]);
  });

  it('a second apart, or another person, or another item or customer, is another group', () => {
    const later = '2026-10-14T05:00:01.123456+00:00';
    expect(groupBySave([added(3, 12, { changed_at: later }), ended(2)])).toHaveLength(2);
    expect(groupBySave([added(3, 12, { changed_by: 'u2' }), ended(2)])).toHaveLength(2);
    expect(groupBySave([added(3, 12, { item_id: 'garlic' }), ended(2)])).toHaveLength(2);
    expect(groupBySave([added(3, 12, { customer_id: 'c1' }), ended(2)])).toHaveLength(2);
  });

  it('keeps the order of the feed and puts a row that comes later in the page into the group it belongs to', () => {
    const other = ended(9, { changed_at: '2026-10-13T05:00:00+00:00' });
    const groups = groupBySave([added(5, 12), other, ended(4)]);
    expect(groups.map(g => g.entries.map(e => e.id))).toEqual([[5, 4], [9]]);
  });

  it('a truncate and a row without an item are never joined', () => {
    const t1 = entry(7, { action: 'truncate', item_id: null, old_values: { rows: 3 } });
    const t2 = entry(8, { action: 'truncate', item_id: null, old_values: { rows: 4 } });
    expect(groupBySave([t1, t2])).toHaveLength(2);
  });

  it('describes job (b): rate changed from 1 Jan 2027, 11 to 12 on the price only', () => {
    const [group] = groupBySave([added(3, 12), ended(2)]);
    const view = groupChanges(group.entries);
    expect(view).toMatchObject({ kind: 'changed', day: '2027-01-01' });
    expect(view.bands).toHaveLength(1);
    expect(view.bands[0].band).toEqual({ min: 0, max: 100 });
    expect(view.bands[0].changes.map(c => [c.field, c.before, c.after])).toEqual([['monthlyPrice', 11, 12]]);
  });

  it('shows labour and tax too when they changed, and nothing that stayed', () => {
    const [group] = groupBySave([added(3, 12, { new_values: monthly(12, { effective_from: '2027-01-01', labour_rate: 3, tax_percent: 12 }) }), ended(2)]);
    expect(groupChanges(group.entries).bands[0].changes.map(c => c.field)).toEqual(['monthlyPrice', 'labourRate', 'tax']);
  });

  it('a save that only ended the rate reads "stopped after"', () => {
    const [group] = groupBySave([ended(2), ended(1, { old_values: monthly(9, { effective_from: '2026-04-01' }), new_values: monthly(9, { effective_from: '2026-04-01', effective_to: '2026-12-31' }) })]);
    expect(groupChanges(group.entries)).toMatchObject({ kind: 'stopped', day: '2026-12-31', bands: [] });
  });

  it('a new band with no old one is shown whole, an old band that went is not', () => {
    const [group] = groupBySave([
      added(4, 6, { new_values: monthly(6, { effective_from: '2027-01-01', weight_min: 0, weight_max: 40 }) }),
      added(3, 9.5, { new_values: monthly(9.5, { effective_from: '2027-01-01', weight_min: 41, weight_max: 100 }) }),
      ended(2, { old_values: monthly(11, { effective_from: '2026-04-01', weight_min: 0, weight_max: 100 }), new_values: monthly(11, { effective_from: '2026-04-01', weight_min: 0, weight_max: 100, effective_to: '2026-12-31' }) }),
    ]);
    const view = groupChanges(group.entries);
    expect(view.bands.map(b => b.band)).toEqual([{ min: 0, max: 40 }, { min: 41, max: 100 }]);
    // The old 0-100 band is not the same band: both new bands are shown with all their values.
    expect(view.bands[0].changes.map(c => c.field)).toEqual(['monthlyPrice', 'weightBand', 'labourRate', 'tax']);
    expect(view.bands[0].changes[0]).toMatchObject({ before: null, after: 6 });
  });

  it('a group of rows that cannot be told apart as a save is described as none', () => {
    const [group] = groupBySave([entry(2, { action: 'delete', old_values: monthly(5) }), entry(1, { action: 'delete', old_values: monthly(6) })]);
    expect(groupChanges(group.entries).kind).toBe('other');
  });
});
