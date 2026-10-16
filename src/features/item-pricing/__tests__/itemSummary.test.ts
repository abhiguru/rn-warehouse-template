import { groupByItem, itemSummary } from '../rateModel';
import { F1, ITEMS, TODAY, row } from '@/tests/helpers/ratesFixtures';

const summaryOf = (id: string, filters = {}) => {
  const group = groupByItem(F1, ITEMS).find(g => g.item.id === id)!;
  return itemSummary(group, TODAY, filters);
};

describe('itemSummary (F1, 14 Oct 2026)', () => {
  it('Garlic Desi has two bands: 6.00 to 9.50, labour 2.50', () => {
    const s = summaryOf('garlic');
    expect([s.minRent, s.maxRent]).toEqual([6, 9.5]);
    expect(s.bands).toHaveLength(2);
    expect(s.labour).toBe(2.5);
    expect(s.priceType).toBe('monthly');
    expect(s.noRateToday).toBe(false);
  });

  it('Onion Red counts one customer rate', () => {
    const s = summaryOf('onion');
    expect(s.customerRateCount).toBe(1);
    expect([s.minRent, s.maxRent]).toEqual([3.5, 3.5]);
  });

  it('Cumin Bold shows 11.00 and the new rate from 1 Jan 2027, not 12.00', () => {
    const s = summaryOf('cumin');
    expect(s.maxRent).toBe(11);
    expect(s.upcomingFrom).toBe('2027-01-01');
    expect(s.noRateToday).toBe(false);
  });

  it('Onion Red Small has no rate today', () => {
    const s = summaryOf('onion-small');
    expect(s.noRateToday).toBe(true);
    expect(s.minRent).toBeNull();
    expect(s.priceType).toBeNull();
  });

  it('the row always shows the default rate; a customer\'s own rate only counts in customerRateCount', () => {
    const s = summaryOf('onion');
    expect(s.minRent).toBe(3.5);
    expect(s.customerRateCount).toBe(1);
    expect(s).not.toHaveProperty('ownRate');
    expect(s).not.toHaveProperty('ownRateCustomer');
  });

  it('reads another day', () => {
    const group = groupByItem(F1, ITEMS).find(g => g.item.id === 'cumin')!;
    expect(itemSummary(group, '2026-03-31').maxRent).toBe(10);
    expect(itemSummary(group, '2024-12-31').noRateToday).toBe(true);
  });

  it('shows the end day of a rate that stops', () => {
    const rows = F1.map(r => (r.item_id === 'potato' ? { ...r, effective_to: '2027-03-31' } : r));
    const group = groupByItem(rows, ITEMS).find(g => g.item.id === 'potato')!;
    expect(itemSummary(group, TODAY).rateEnds).toBe('2027-03-31');
  });

  it('takes a one-time rate when there is no monthly one, and filters by type', () => {
    const rows = [{ ...F1[0], price_type: 'one_time' as const, effective_to: null, item_id: 'cumin' }];
    const group = groupByItem(rows, ITEMS).find(g => g.item.id === 'cumin')!;
    expect(itemSummary(group, TODAY).priceType).toBe('one_time');
    expect(itemSummary(group, TODAY, { priceType: 'monthly' }).priceType).toBeNull();
  });

  // CR-11
  it('a default rate that is followed by the next one is not "ending"; one that stops is', () => {
    const followed = [
      row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3, effective_from: '2026-01-01', effective_to: '2026-10-31' }),
      row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 4, effective_from: '2026-11-01' }),
    ];
    const group = groupByItem(followed, ITEMS).find(g => g.item.id === 'onion')!;
    expect(itemSummary(group, TODAY).rateEnds).toBeNull();

    const stopping = [row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3, effective_from: '2026-01-01', effective_to: '2026-12-31' })];
    const g2 = groupByItem(stopping, ITEMS).find(g => g.item.id === 'onion')!;
    expect(itemSummary(g2, TODAY).rateEnds).toBe('2026-12-31');
  });
});
