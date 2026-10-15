/**
 * Creating a gap between the bands of a CUSTOMER rate (backlog item 2, F25 rest). Server rule:
 * find_storage_price falls back to the default rate for a weight no customer band holds;
 * replace_item_rates refuses a gap in a DEFAULT rate (BANDS_GAP). Fictional names; today = 2026-10-14.
 */
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { setLanguage } from '@/i18n';
import { fieldOrder, fromOf, gapBefore, hasChanges, initialDraft, setFirstFrom, setBandFrom, setStartsOn, setUpTo, appendEmptyBand, toReplaceInput, validate } from '../editModel';

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

describe('a gap typed into a customer rate', () => {
  const rows = [row(null, 0, 100, 3.5, '2025-01-01', null)];
  const start = () => {
    const { draft, context } = open('addCustomer', { customer_id: CUST, price_type: 'monthly' }, rows);
    // 0-40 and 41-100, rents filled in
    let d = appendEmptyBand(setUpTo(draft, 0, '40'));
    d = { ...d, bands: d.bands.map(b => ({ ...b, rent: '4.00' })) };
    d = setUpTo(d, 1, '100');
    return { d: setStartsOn(d, 'today', TODAY), context };
  };

  it('starts the second band above the end of the first, and sends the gap', () => {
    const { d, context } = start();
    expect(fromOf(d, 1)).toBe(41);
    const gap = setBandFrom(d, 1, '61');
    expect(fromOf(gap, 1)).toBe(61);
    expect(gapBefore(gap, 1)).toEqual({ from: 41, to: 60 });
    expect(validate(gap, context).errors['band.1.from']).toBeUndefined();
    expect(toReplaceInput(gap, context).bands.map(b => [b.weight_min, b.weight_max])).toEqual([[0, 40], [61, 100]]);
  });

  it('typing the end of the band before plus one is no gap', () => {
    const { d } = start();
    const back = setBandFrom(setBandFrom(d, 1, '61'), 1, '41');
    expect(back.bands[1].fromText).toBeUndefined();
    expect(gapBefore(back, 1)).toBeNull();
  });

  it('refuses a start inside the band before, or not a number', () => {
    const { d, context } = start();
    expect(validate(setBandFrom(d, 1, '40'), context).errors['band.1.from']).toBe('The band before ends at 40 kg. Start at 41 kg or more.');
    expect(validate(setBandFrom(d, 1, '4x'), context).errors['band.1.from']).toBeDefined();
  });

  it('refuses a gap in a default rate', () => {
    const { draft, context } = open('change', { price_type: 'monthly' }, rows);
    const split = appendEmptyBand(setUpTo(draft, 0, '80'));
    const gap = setBandFrom(split, 1, '70');
    expect(validate({ ...gap, bands: gap.bands.map(b => ({ ...b, rent: '4.00' })) }, context).errors['band.1.from']).toBe(
      'A default rate cannot have a gap: every weight needs a rate.',
    );
  });
});

describe('field order and the leave guard', () => {
  const rows = [row(null, 0, 100, 3.5, '2025-01-01', null), row(CUST, 0, 40, 3, '2026-01-01', null), row(CUST, 61, 100, 4, '2026-01-01', null)];

  it('a customer rate visits From before Up to on every band; a default rate has no From', () => {
    const { draft } = open('change', { customer_id: CUST, price_type: 'monthly' }, rows);
    expect(fieldOrder(draft, CUST)).toEqual([
      'firstFrom', 'band.0.upTo', 'band.0.rent', 'band.1.from', 'band.1.upTo', 'band.1.rent', 'labour', 'tax',
    ]);
    expect(fieldOrder(draft, null)).not.toContain('band.1.from');
  });

  it('retyping a stored gap\'s own start is not a change; a different start is', () => {
    const { draft } = open('change', { customer_id: CUST, price_type: 'monthly' }, rows);
    expect(draft.bands[1].gapFrom).toBe(61);
    expect(hasChanges(setBandFrom(draft, 1, '61'), draft)).toBe(false);
    expect(hasChanges(setBandFrom(draft, 1, '62'), draft)).toBe(true);
    expect(hasChanges(setFirstFrom(draft, '0'), draft)).toBe(false);
  });
});
