import { todayDay } from '../rateText';
import { applicableRate, rateState, scopeKey, scopeView } from '../rateModel';
import { F1, ITEMS, ORCHARD_B, TODAY, row } from '@/tests/helpers/ratesFixtures';

const rowsOf = (itemId: string) => F1.filter(r => r.item_id === itemId);

describe('rateModel', () => {
  it('works out in force, upcoming and ended for Cumin Bold on 14 Oct 2026 (P-10, P-12)', () => {
    const view = scopeView(rowsOf('cumin'), TODAY);
    expect(view.inForce.map(r => r.unit_price)).toEqual([11]);
    expect(view.upcoming?.startsOn).toBe('2027-01-01');
    expect(view.upcoming?.rows.map(r => r.unit_price)).toEqual([12]);
    expect(view.ended.map(r => r.unit_price)).toEqual([10]);
    expect(view.stopsAfter).toBeNull();
    expect(view.overlap).toBeNull();
  });

  it('shows the 10.00 rate on its last day and none before the first rate (P-14)', () => {
    expect(scopeView(rowsOf('cumin'), '2026-03-31').inForce.map(r => r.unit_price)).toEqual([10]);
    expect(scopeView(rowsOf('cumin'), '2026-04-01').inForce.map(r => r.unit_price)).toEqual([11]);
    const before = scopeView(rowsOf('cumin'), '2024-12-31');
    expect(before.inForce).toEqual([]);
    expect(before.upcoming?.startsOn).toBe('2025-01-01');
  });

  it('an item whose only rate starts later has nothing in force', () => {
    const only = [row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 12, effective_from: '2027-01-01' })];
    const view = scopeView(only, TODAY);
    expect(view.inForce).toEqual([]);
    expect(view.upcoming?.startsOn).toBe('2027-01-01');
  });

  it('compares days as strings: the last day is still in force, the day after is ended', () => {
    const r = row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 1, effective_from: '2026-01-01', effective_to: TODAY });
    expect(rateState(r, TODAY)).toBe('inForce');
    expect(rateState(r, '2026-10-15')).toBe('ended');
    expect(rateState(r, '2025-12-31')).toBe('upcoming');
  });

  it('at 01:00 in India a rate ending today is still in force and a rate ending yesterday is ended (P-12)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T01:00:00+05:30'));
    try {
      const day = todayDay();
      expect(day).toBe('2026-10-14');
      const lastDayToday = row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 1, effective_from: '2026-01-01', effective_to: '2026-10-14' });
      const lastDayYesterday = { ...lastDayToday, effective_to: '2026-10-13' };
      expect(rateState(lastDayToday, day)).toBe('inForce');
      expect(rateState(lastDayYesterday, day)).toBe('ended');
    } finally {
      jest.useRealTimers();
    }
  });

  it('finds the end day shared by every rate in force', () => {
    const stopping = [
      row({ item_id: 'garlic', weight_min: 0, weight_max: 40, unit_price: 6, effective_from: '2025-01-01', effective_to: '2027-03-31' }),
      row({ item_id: 'garlic', weight_min: 41, weight_max: 100, unit_price: 9.5, effective_from: '2025-01-01', effective_to: '2027-03-31' }),
    ];
    expect(scopeView(stopping, TODAY).stopsAfter).toBe('2027-03-31');
    stopping[1] = { ...stopping[1], effective_to: null };
    expect(scopeView(stopping, TODAY).stopsAfter).toBeNull();
  });

  it('a rate that the next one takes over from is not "stopping" (the server ends the old rate the day before)', () => {
    const rows = [
      row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 11, effective_from: '2026-04-01', effective_to: '2026-12-31' }),
      row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 12, effective_from: '2027-01-01' }),
    ];
    const view = scopeView(rows, TODAY);
    expect(view.stopsAfter).toBeNull();
    expect(view.upcoming?.startsOn).toBe('2027-01-01');
    // A gap before the next rate is still a stop.
    const gap = [rows[0], { ...rows[1], effective_from: '2027-02-01' }];
    expect(scopeView(gap, TODAY).stopsAfter).toBe('2026-12-31');
  });

  it('flags two open rates that cover the same weights, and applies the newer one', () => {
    const old = [
      row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2026-01-01' }),
      row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 6, effective_from: '2026-03-01' }),
    ];
    const view = scopeView(old, TODAY);
    expect(view.overlap?.map(r => r.unit_price).sort()).toEqual([5, 6]);
    const used = applicableRate(old, { customer_id: null, weight: 50, price_type: 'monthly', day: TODAY });
    expect(used?.unit_price).toBe(6);
  });

  it('prefers the narrower band, then the newer start', () => {
    const rows = [
      row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2026-01-01' }),
      row({ item_id: 'cumin', weight_min: 40, weight_max: 60, unit_price: 7, effective_from: '2025-01-01' }),
    ];
    expect(applicableRate(rows, { customer_id: null, weight: 50, price_type: 'monthly', day: TODAY })?.unit_price).toBe(7);
    expect(applicableRate(rows, { customer_id: null, weight: 30, price_type: 'monthly', day: TODAY })?.unit_price).toBe(5);
  });

  it('a customer rate applies per weight and the rest fall to the default', () => {
    const rows = [
      row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, effective_from: '2025-01-01' }),
      row({ item_id: 'onion', weight_min: 0, weight_max: 40, unit_price: 3, effective_from: '2026-01-01', ...ORCHARD_B }),
    ];
    const ask = (weight: number, customer_id: string | null) =>
      applicableRate(rows, { customer_id, weight, price_type: 'monthly', day: TODAY })?.unit_price;
    expect(ask(30, 'orchard-b')).toBe(3);
    expect(ask(60, 'orchard-b')).toBe(3.5);
    expect(ask(30, 'orchard-a')).toBe(3.5);
  });

  it('Onion Red for Orchard B weight 50 uses 3.00, for Orchard A 3.50 (F1)', () => {
    const ask = (customer_id: string) =>
      applicableRate(rowsOf('onion'), { customer_id, weight: 50, price_type: 'monthly', day: TODAY })?.unit_price;
    expect(ask('orchard-b')).toBe(3);
    expect(ask('orchard-a')).toBe(3.5);
  });

  it('keeps the price type apart', () => {
    const rows = [
      row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2026-01-01' }),
      row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 20, effective_from: '2026-01-01', price_type: 'one_time' }),
    ];
    expect(applicableRate(rows, { customer_id: null, weight: 10, price_type: 'one_time', day: TODAY })?.unit_price).toBe(20);
  });

  it('keys a scope by item, customer and type', () => {
    expect(scopeKey(rowsOf('cumin')[0])).toBe('cumin|default|monthly');
    expect(scopeKey(rowsOf('onion')[1])).toBe('onion|orchard-b|monthly');
  });
});
