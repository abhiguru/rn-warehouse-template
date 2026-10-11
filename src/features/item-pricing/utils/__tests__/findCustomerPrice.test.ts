import type { ItemStoragePrice } from '@/types/item-pricing.types';
import { findCustomerPrice } from '../findCustomerPrice';

const ITEM = 'item-1';
const CUSTOMER = 'customer-1';

const price = (overrides: Partial<ItemStoragePrice>): ItemStoragePrice => ({
  id: 'p1',
  item_id: ITEM,
  item_name: 'Example Potatoes',
  customer_id: CUSTOMER,
  customer_name: 'Example Traders',
  price_type: 'monthly',
  unit_price: 5,
  weight_min: 0,
  weight_max: 50,
  labour_rate: 2,
  tax_percent: 5,
  effective_from: '2026-04-01',
  effective_to: null,
  created_at: '2026-04-01T00:00:00Z',
  created_by: 'u1',
  ...overrides,
});

const wanted = { item_id: ITEM, customer_id: CUSTOMER, weight: 50, price_type: 'monthly' as const, today: '2026-10-10' };

describe("the customer's own price for an invoice line", () => {
  it('is the row for this item, customer, price type and weight that is in force today', () => {
    expect(findCustomerPrice([price({})], wanted)?.id).toBe('p1');
  });

  it.each([
    ['another customer', { customer_id: 'customer-2' }],
    ['the general price list', { customer_id: null }],
    ['another item', { item_id: 'item-2' }],
    ['the other price type', { price_type: 'one_time' as const }],
    ['a lighter weight band', { weight_max: 40 }],
    ['a heavier weight band', { weight_min: 60, weight_max: 100 }],
    ['a price that starts tomorrow', { effective_from: '2026-10-11' }],
    ['a price that ended yesterday', { effective_to: '2026-10-09' }],
  ])('is not a row for %s', (_name, overrides) => {
    expect(findCustomerPrice([price(overrides)], wanted)).toBeUndefined();
  });

  it('is the narrowest weight band when several fit, as the server chooses', () => {
    const rows = [price({ id: 'wide', weight_min: 0, weight_max: 100 }), price({ id: 'narrow', weight_min: 40, weight_max: 60 })];

    expect(findCustomerPrice(rows, wanted)?.id).toBe('narrow');
  });

  it('counts a price that ends today as in force', () => {
    expect(findCustomerPrice([price({ effective_to: '2026-10-10' })], wanted)?.id).toBe('p1');
  });
});
