/**
 * Code-review fixes of the rate editor's rules (CR-01, 02, 03, 09, 16): moving a planned rate,
 * keeping a scheduled stop, correcting without touching later rates, defaults that start at 0 kg
 * and the Correct rate sent as the correct mode.
 */
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { keptEnd, initialDraft, rateAfterCustomerStop, setStartsOn, setBandField, summaryLines, toReplaceInput, validate } from '../editModel';

const TODAY = '2026-10-14';
const CUSTOMER_B = 'cust-b';

let seq = 0;
const row = (
  customer_id: string | null,
  min: number,
  max: number,
  rent: number,
  from: string,
  to: string | null,
  price_type: PriceType = 'monthly',
): ItemStoragePrice => ({
  id: `cr-${(seq += 1)}`,
  item_id: 'cumin',
  item_name: 'Cumin',
  customer_id,
  customer_name: customer_id ? 'Orchard B' : null,
  price_type,
  unit_price: rent,
  weight_min: min,
  weight_max: max,
  labour_rate: 3,
  tax_percent: 5,
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
) => initialDraft({ mode, params: { mode, item_id: 'cumin', ...params } as never, rows, role, today: TODAY });

describe('CR-01: Edit new rate moves or corrects the planned rate', () => {
  const rows = [row(null, 0, 100, 11, '2026-04-01', '2026-12-31'), row(null, 0, 100, 12, '2027-01-01', null)];

  it('an unchanged start is a correction of that start', () => {
    const { draft, context } = open('upcoming', { price_type: 'monthly', starts_on: '2027-01-01' }, rows);
    const input = toReplaceInput(setBandField(draft, 0, 'rent', '13'), context);
    expect(input.mode).toBe('correct');
    expect(input.starts_on).toBe('2027-01-01');
    expect(input.move_from).toBeUndefined();
  });

  it('a moved start is a change that moves the rate from the old start', () => {
    const { draft, context } = open('upcoming', { price_type: 'monthly', starts_on: '2027-01-01' }, rows);
    const moved = setStartsOn(draft, 'other', '2027-02-01');
    const input = toReplaceInput(moved, context);
    expect(input.mode).toBe('change');
    expect(input.move_from).toBe('2027-01-01');
    expect(input.starts_on).toBe('2027-02-01');
    expect(summaryLines(moved, context)).toContain('Moves the new rate from 01/01/27 to 01/02/27');
  });
});

describe('CR-02: a scheduled stop is kept', () => {
  const stopped = [row(null, 0, 100, 11, '2026-04-01', '2027-03-31')];

  it('Correct this rate shows and keeps the stop', () => {
    const { draft, context } = open('correct', { price_type: 'monthly' }, stopped);
    expect(keptEnd(draft, context)).toBe('2027-03-31');
    expect(summaryLines(draft, context)).toContain('This rate still stops after 31/03/27.');
  });

  it('Change rate from today keeps the stop when it is on or after the start', () => {
    const { draft, context } = open('change', { price_type: 'monthly' }, stopped);
    expect(keptEnd(setStartsOn(draft, 'today', TODAY), context)).toBe('2027-03-31');
    expect(keptEnd(setStartsOn(draft, 'other', '2027-05-01'), context)).toBeNull();
  });

  it('no stop to keep when a rate starts after the new start', () => {
    const rows = [row(null, 0, 100, 11, '2026-04-01', '2026-12-31'), row(null, 0, 100, 12, '2027-01-01', null)];
    const { draft, context } = open('change', { price_type: 'monthly' }, rows);
    expect(keptEnd(setStartsOn(draft, 'today', TODAY), context)).toBeNull();
  });
});

describe('CR-03: a correction sends the correct mode', () => {
  const rows = [
    row(CUSTOMER_B, 0, 100, 10, '2026-01-01', '2026-03-31'),
    row(CUSTOMER_B, 0, 100, 11, '2026-04-01', null),
  ];

  it('Correct this rate on the item page sends the correct mode with the rate\'s own start', () => {
    const { draft, context } = open('correct', { customer_id: CUSTOMER_B, price_type: 'monthly', starts_on: '2026-04-01' }, rows);
    expect(toReplaceInput(draft, context)).toMatchObject({ mode: 'correct', starts_on: '2026-04-01' });
  });

  it('Change rate sends the change mode', () => {
    const { draft, context } = open('change', { customer_id: CUSTOMER_B, price_type: 'monthly' }, rows);
    expect(toReplaceInput(setStartsOn(draft, 'today', TODAY), context).mode).toBe('change');
  });
});

describe('CR-09: a default rate always starts at 0 kg', () => {
  const rows = [row(null, 1, 50, 5, '2026-01-01', null), row(null, 51, 100, 8, '2026-01-01', null)];

  it('loads the first band from 0 kg and says so', () => {
    const { draft, context } = open('change', { price_type: 'monthly' }, rows);
    expect(draft.firstFrom).toBe(0);
    expect(draft.firstBandZeroed).toBe(true);
    expect(toReplaceInput(setStartsOn(draft, 'today', TODAY), context).bands[0].weight_min).toBe(0);
  });

  it('a customer rate keeps its first band start', () => {
    const own = [row(CUSTOMER_B, 10, 50, 5, '2026-01-01', null)];
    const { draft } = open('change', { customer_id: CUSTOMER_B, price_type: 'monthly' }, own);
    expect(draft.firstFrom).toBe(10);
    expect(draft.firstBandZeroed).toBeUndefined();
  });
});

describe('CR-14: what a customer pays after the stop', () => {
  const rows = [
    row(null, 0, 100, 3.5, '2025-01-01', '2027-03-31'),
    row(null, 0, 100, 4.5, '2027-04-01', null),
    row(CUSTOMER_B, 0, 100, 3, '2026-01-01', null),
  ];

  it('is the default rate in force the day after the last day', () => {
    expect(rateAfterCustomerStop(rows, CUSTOMER_B, 'monthly', TODAY)).toEqual([3.5]);
    expect(rateAfterCustomerStop(rows, CUSTOMER_B, 'monthly', TODAY, '2027-04-01')).toEqual([4.5]);
  });
});
