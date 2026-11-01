import { itemIdsWithoutRate } from '../noRate';
import { row } from '@/tests/helpers/ratesFixtures';
import type { ActiveItem } from '@/types/item-pricing.types';

const item = (id: string): ActiveItem => ({ id, name: id, packaging: 'Bag' });
const DAY = '2026-10-14';
const ids = (items: string[], rates: ReturnType<typeof row>[]) => [...itemIdsWithoutRate(items.map(item), rates, DAY)].sort();
const make = (item_id: string, over: Record<string, unknown> = {}) =>
  row({ item_id, weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2026-01-01', ...over });

describe('items with no rate (the Items list tag and filter)', () => {
  it('an item with a standard rate in force has one; an item with none is listed', () => {
    expect(ids(['a', 'b'], [make('a')])).toEqual(['b']);
  });

  it('an item whose only standard rate is planned counts as rated (owner, 2026-11-01)', () => {
    expect(ids(['a'], [make('a', { effective_from: '2027-01-01' })])).toEqual([]);
  });

  it('a stopped rate that has ended is no rate, even with an earlier start', () => {
    expect(ids(['a'], [make('a', { effective_to: '2026-06-30' })])).toEqual(['a']);
  });

  it('an ended rate followed by a planned one is no rate today: the first rate is behind', () => {
    expect(ids(['a'], [make('a', { effective_to: '2026-06-30' }), make('a', { effective_from: '2027-01-01' })])).toEqual(['a']);
  });

  it('reaches back per price type: an ended monthly rate with a planned one-time rate is rated', () => {
    expect(ids(['a'], [make('a', { effective_to: '2026-06-30' }), make('a', { price_type: 'one_time', effective_from: '2027-01-01' })])).toEqual([]);
  });

  it("a customer's rate does not make the item rated, planned or not", () => {
    expect(ids(['a'], [make('a', { customer_id: 'orchard-b', customer_name: 'Orchard B' })])).toEqual(['a']);
    expect(ids(['a'], [make('a', { customer_id: 'orchard-b', customer_name: 'Orchard B', effective_from: '2027-01-01' })])).toEqual(['a']);
  });
});
