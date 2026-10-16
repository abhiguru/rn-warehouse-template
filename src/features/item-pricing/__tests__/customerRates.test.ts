/** customerRows: who has an own rate of an item on a day, and what the entry shows. */
import { customerRows } from '../customerRates';
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
