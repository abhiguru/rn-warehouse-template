/** customerRows: who has an own rate of an item on a day, and what the entry shows. */
import { customerItemRows, customerRows } from '../customerRates';
import { row } from '@/tests/helpers/ratesFixtures';

const A = { id: 'cust-a', name: 'Review Orchard A' };
const B = { id: 'cust-b', name: 'Review Orchard B' };
const C = { id: 'cust-c', name: 'Review Orchard C' };
const DAY = '2026-10-14';
const own = (customer: { id: string; name: string }, rent: number, from: string, to: string | null = null, type: 'monthly' | 'one_time' = 'monthly') =>
  row({ item_id: 'onion', customer_id: customer.id, customer_name: customer.name, weight_min: 0, weight_max: 100, unit_price: rent, labour_rate: 1.5, price_type: type, effective_from: from, effective_to: to });
const defaultRate = () => row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, labour_rate: 1.5, effective_from: '2025-01-01' });

it('has no entry when no customer has an own rate, and ignores the default rate', () => {
  expect(customerRows([], DAY)).toEqual([]);
  expect(customerRows([defaultRate()], DAY)).toEqual([]);
});

it('one entry per customer, by name, with the bands in force', () => {
  const rows = [own(B, 3, '2026-01-01'), own(A, 3.25, '2026-02-01'), defaultRate()];
  const entries = customerRows(rows, DAY);
  expect(entries.map(e => [e.id, e.name, e.bands.map(b => b.unit_price), e.newRateFrom, e.priceType])).toEqual([
    ['cust-a', 'Review Orchard A', [3.25], null, 'monthly'],
    ['cust-b', 'Review Orchard B', [3], null, 'monthly'],
  ]);
});

it('a customer whose only rate starts later shows that rate and when it starts', () => {
  const [entry] = customerRows([own(C, 3.2, '2027-01-01')], DAY);
  expect(entry).toMatchObject({ id: 'cust-c', newRateFrom: '2027-01-01' });
  expect(entry.bands.map(b => b.unit_price)).toEqual([3.2]);
});

it('a customer with a rate in force and a later one shows the one in force and the start of the later', () => {
  const [entry] = customerRows([own(A, 3, '2026-01-01'), own(A, 3.4, '2027-01-01')], DAY);
  expect(entry.bands.map(b => b.unit_price)).toEqual([3]);
  expect(entry.newRateFrom).toBe('2027-01-01');
});

it('a customer whose rates all ended has no entry, but is back when the day is one they were in force', () => {
  const rows = [own(A, 3, '2026-01-01', '2026-06-30')];
  expect(customerRows(rows, DAY)).toEqual([]);
  expect(customerRows(rows, '2026-03-01').map(e => e.id)).toEqual(['cust-a']);
});

it('shows the monthly rate before a one-time rate of the same customer', () => {
  const [entry] = customerRows([own(A, 9, '2026-01-01', null, 'one_time'), own(A, 3, '2026-01-01')], DAY);
  expect(entry.priceType).toBe('monthly');
  expect(entry.bands.map(b => b.unit_price)).toEqual([3]);
});

describe('customerItemRows: the items a customer has an own rate for', () => {
  const ITEMS = [
    { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' },
    { id: 'cumin', name: 'Review Cumin Bold', packaging: 'Bag' },
    { id: 'garlic', name: 'Review Garlic Desi', packaging: 'Bag' },
  ];
  const mine = (itemId: string, rent: number, from: string, to: string | null = null, over: Record<string, unknown> = {}) =>
    row({ item_id: itemId, customer_id: A.id, customer_name: A.name, weight_min: 0, weight_max: 100, unit_price: rent, effective_from: from, effective_to: to, ...over });
  const dflt = (itemId: string, rent: number, over: Record<string, unknown> = {}) =>
    row({ item_id: itemId, weight_min: 0, weight_max: 100, unit_price: rent, effective_from: '2025-01-01', ...over });

  it('has no entry when the customer has no own rate (another customer\'s rate and the default do not count)', () => {
    expect(customerItemRows([], ITEMS, A.id, DAY)).toEqual([]);
    expect(customerItemRows([dflt('onion', 3.5), { ...own(B, 3, '2026-01-01') }], ITEMS, A.id, DAY)).toEqual([]);
  });

  it('one entry per item, sorted by item name, with the bands in force, since when, and the default beside it', () => {
    const rates = [mine('onion', 3, '2026-02-01'), dflt('onion', 3.5), mine('cumin', 11, '2026-04-01'), dflt('cumin', 12), own(B, 9, '2026-01-01')];
    const entries = customerItemRows(rates, ITEMS, A.id, DAY);
    expect(entries.map(e => [e.itemId, e.name, e.bands.map(b => b.unit_price), e.defaultBands.map(b => b.unit_price), e.since, e.priceType, e.newRateFrom, e.rateEnds])).toEqual([
      ['cumin', 'Review Cumin Bold', [11], [12], '2026-04-01', 'monthly', null, null],
      ['onion', 'Review Onion Red', [3], [3.5], '2026-02-01', 'monthly', null, null],
    ]);
  });

  it('lists every band of a several-band rate, and the default of the same price type only', () => {
    const rates = [
      mine('garlic', 6, '2026-01-01'),
      mine('garlic', 9.5, '2026-01-01', null, { weight_min: 101, weight_max: 200 }),
      dflt('garlic', 7),
      dflt('garlic', 40, { price_type: 'one_time' }),
    ];
    const [entry] = customerItemRows(rates, ITEMS, A.id, DAY);
    expect(entry.bands.map(b => [b.weight_min, b.weight_max, b.unit_price])).toEqual([[0, 100, 6], [101, 200, 9.5]]);
    expect(entry.defaultBands.map(b => b.unit_price)).toEqual([7]);
  });

  it('an item without a default rate has no default bands', () => {
    const [entry] = customerItemRows([mine('onion', 3, '2026-02-01')], ITEMS, A.id, DAY);
    expect(entry.defaultBands).toEqual([]);
  });

  it('a rate that stops shows when; a rate that begins later shows that rate and when it starts', () => {
    const rates = [mine('onion', 3, '2026-02-01', '2026-12-31'), mine('cumin', 11, '2026-04-01'), mine('cumin', 12, '2027-01-01')];
    const entries = customerItemRows(rates, ITEMS, A.id, DAY);
    expect(entries.map(e => [e.itemId, e.rateEnds, e.newRateFrom, e.bands.map(b => b.unit_price)])).toEqual([
      ['cumin', null, '2027-01-01', [11]],
      ['onion', '2026-12-31', null, [3]],
    ]);
    const [later] = customerItemRows([mine('onion', 3.2, '2027-03-01')], ITEMS, A.id, DAY);
    expect(later).toMatchObject({ newRateFrom: '2027-03-01', since: '2027-03-01' });
    expect(later.bands.map(b => b.unit_price)).toEqual([3.2]);
  });

  it('an item whose rate ended has no entry, and an item that is not active has none either', () => {
    const rates = [mine('onion', 3, '2026-01-01', '2026-06-30'), mine('retired', 5, '2026-01-01'), mine('cumin', 11, '2026-04-01')];
    expect(customerItemRows(rates, ITEMS, A.id, DAY).map(e => e.itemId)).toEqual(['cumin']);
  });

  it('shows the monthly rate before a one-time one', () => {
    const rates = [mine('onion', 20, '2026-01-01', null, { price_type: 'one_time' }), mine('onion', 3, '2026-01-01')];
    expect(customerItemRows(rates, ITEMS, A.id, DAY)[0]).toMatchObject({ priceType: 'monthly' });
  });
});
