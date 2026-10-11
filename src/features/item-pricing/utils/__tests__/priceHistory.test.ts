import { priceHistoryChanges, truncatedPriceCount } from '../priceHistory';
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

  it('shows both prices when the kind itself changes', () => {
    const after = monthly(0, { price_type: 'one_time', unit_price: 5, unit_price_one_time: 5 });
    expect(priceHistoryChanges('update', monthly(5), after)).toEqual([
      { field: 'priceType', before: 'monthly', after: 'one_time' },
      { field: 'monthlyPrice', before: 5, after: 0 },
      { field: 'oneTimePrice', before: 0, after: 5 },
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

  it('lists a price of the other kind that is not 0 (a price made with the older two-price form)', () => {
    const changes = priceHistoryChanges('insert', null, monthly(6, { unit_price_one_time: 40 }));
    expect(changes.map((change) => change.field)).toContain('oneTimePrice');
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
    expect(priceHistoryValueText('monthlyPrice', 1250.5)).toBe('₹1,250.5');
    expect(priceHistoryValueText('labourRate', 2)).toBe('₹2');
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
    expect(priceHistoryValueText('monthlyPrice', 6)).toBe('₹૬');
    expect(priceHistoryValueText('tax', 18)).toBe('૧૮%');
    expect(priceHistoryValueText('weightBand', { min: 0, max: 100 })).toBe('૦–૧૦૦ કિલો');
    expect(priceHistoryValueText('effectiveFrom', '2026-01-01')).toBe('૧ જાન્યુ ૨૦૨૬');
    expect(priceHistoryAuthor({ changed_by: 'u1', changed_by_name: 'Meera Joshi', changed_by_role: 'staff' })).toBe('Meera Joshi (સ્ટાફ)');
    expect(priceHistoryAuthor({ changed_by: null, changed_by_name: null, changed_by_role: null })).toBe('ઍપનો યુઝર નથી');
  });
});
