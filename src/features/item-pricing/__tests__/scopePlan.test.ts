import { planScope } from '../scopePlan';
import { F1, TODAY, row } from '@/tests/helpers/ratesFixtures';

const of = (itemId: string) => F1.filter(r => r.item_id === itemId && r.customer_id === null);

describe('planScope', () => {
  it('Cumin Bold: one monthly card with the later rate under it and one old rate', () => {
    const plan = planScope(of('cumin'), TODAY);
    expect(plan.plans.map(p => p.priceType)).toEqual(['monthly']);
    expect(plan.plans[0].view.inForce.map(r => r.unit_price)).toEqual([11]);
    expect(plan.plans[0].view.upcoming?.rows.map(r => r.unit_price)).toEqual([12]);
    expect(plan.ended.map(r => r.unit_price)).toEqual([10]);
    expect(plan.endedOnly).toBe(false);
  });

  it('lists monthly before one-time', () => {
    const rows = [row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 20, effective_from: '2025-01-01', price_type: 'one_time' }), ...of('cumin')];
    expect(planScope(rows, TODAY).plans.map(p => p.priceType)).toEqual(['monthly', 'one_time']);
  });

  it('an item with only an ended rate is "ended only" with its last day', () => {
    const rows = [row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2025-01-01', effective_to: '2026-06-30' })];
    const plan = planScope(rows, TODAY);
    expect(plan.plans).toEqual([]);
    expect(plan.endedOnly).toBe(true);
    expect(plan.lastEnded).toBe('2026-06-30');
  });

  it('an item with no rows has nothing', () => {
    const plan = planScope([], TODAY);
    expect(plan).toEqual({ plans: [], ended: [], endedOnly: false, lastEnded: null });
  });
});
