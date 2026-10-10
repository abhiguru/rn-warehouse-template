import { GRN_FILTERS } from '../configs';
import { presetRange, resolveDateRange } from '../datePresets';
import {
  countActiveFilters,
  describeSort,
  describeValue,
  hasAnyFilter,
  isDefaultSort,
  isFieldActive,
  normalizeValues,
  readSearch,
  valuesEqual,
  visibleFields,
} from '../filterModel';
import type { FilterContext, FilterFieldDef } from '../types';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const oneCustomer: FilterContext = { role: 'customer', isWarehouseRole: false, assignedCustomers: [{ id: 'c1', label: 'A' }] };
const twoCustomers: FilterContext = {
  role: 'customer',
  isWarehouseRole: false,
  assignedCustomers: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }],
};
const field = (key: string) => GRN_FILTERS.fields.find(candidate => candidate.key === key) as FilterFieldDef;

describe('date presets', () => {
  // 1 March 2024 (leap year), 00:30 local time.
  const today = new Date(2024, 2, 1, 0, 30);
  it('resolves each preset to local calendar days', () => {
    expect(presetRange('today', today)).toEqual({ from: '2024-03-01', to: '2024-03-01' });
    expect(presetRange('yesterday', today)).toEqual({ from: '2024-02-29', to: '2024-02-29' });
    expect(presetRange('last7', today)).toEqual({ from: '2024-02-24', to: '2024-03-01' });
    expect(presetRange('thisMonth', today)).toEqual({ from: '2024-03-01', to: '2024-03-31' });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
  it('resolves a stored value, preset first', () => {
    expect(resolveDateRange({ preset: 'today', from: '2020-01-01' }, today)).toEqual({ from: '2024-03-01', to: '2024-03-01' });
    expect(resolveDateRange({ from: '2024-01-05' }, today)).toEqual({ from: '2024-01-05', to: undefined });
    expect(resolveDateRange(undefined, today)).toEqual({});
  });
});

describe('what counts as an active filter', () => {
  it('treats a default, an empty value and an empty range as no filter', () => {
    expect(isFieldActive(field('stock'), 'all')).toBe(false);
    expect(isFieldActive(field('stock'), 'in_stock')).toBe(true);
    expect(isFieldActive(field('customers'), [])).toBe(false);
    expect(isFieldActive(field('date'), {})).toBe(false);
    expect(isFieldActive(field('date'), { preset: 'today' })).toBe(true);
    expect(isFieldActive(field('weight'), {})).toBe(false);
    expect(isFieldActive(field('weight'), { min: 0 })).toBe(true);
    expect(isFieldActive(field('numberRange'), { from: '  ' })).toBe(false);
    expect(isFieldActive(field('package'), '   ')).toBe(false);
  });

  it('counts a range once and never counts a default', () => {
    const values = { stock: 'all', date: { from: '2026-10-01', to: '2026-10-07' }, weight: { min: 10, max: 50 } };
    expect(countActiveFilters(GRN_FILTERS, values, staff)).toBe(2);
  });

  it('stores only active, visible, known values', () => {
    const stored = normalizeValues(
      GRN_FILTERS,
      { stock: 'all', package: '  red  ', customers: [{ id: 'c9', label: 'X' }], unknown: 'x', search: '  garlic ' },
      oneCustomer
    );
    // The customer field is hidden for a single-customer account, so its value is dropped.
    expect(stored).toEqual({ package: 'red', search: 'garlic' });
  });
});

describe('role visibility', () => {
  it('shows the Customer filter to warehouse roles and to accounts with several customers only', () => {
    const has = (ctx: FilterContext) => visibleFields(GRN_FILTERS, ctx).some(candidate => candidate.key === 'customers');
    expect(has(staff)).toBe(true);
    expect(has(twoCustomers)).toBe(true);
    expect(has(oneCustomer)).toBe(false);
  });
});

describe('search read for a list', () => {
  const today = new Date(2026, 9, 10);
  it('recognises a date and a range, and counts them as filters', () => {
    const values = { search: 'garlic 7 oct A0010-A0020' };
    expect(readSearch(GRN_FILTERS, values, today)).toEqual({
      text: 'garlic',
      date: { from: '2026-10-07', to: '2026-10-07' },
      range: { from: 'A0010', to: 'A0020' },
    });
    expect(countActiveFilters(GRN_FILTERS, values, staff)).toBe(2);
    expect(hasAnyFilter(GRN_FILTERS, { search: 'garlic' }, staff)).toBe(true);
    expect(countActiveFilters(GRN_FILTERS, { search: 'garlic' }, staff)).toBe(0);
  });
  it('leaves the words as text when that filter is already set by hand', () => {
    expect(readSearch(GRN_FILTERS, { search: 'today', date: { preset: 'lastMonth' } }, today)).toEqual({ text: 'today' });
    expect(readSearch(GRN_FILTERS, { search: 'A1-A2', numberRange: { from: 'B1' } }, today)).toEqual({ text: 'A1-A2' });
  });
  it('treats everything as text once the recognition was dismissed', () => {
    expect(readSearch(GRN_FILTERS, { search: 'today foods', searchLiteral: true }, today)).toEqual({ text: 'today foods' });
  });
});

describe('chip text', () => {
  it('describes each kind of value briefly', () => {
    expect(describeValue(field('stock'), 'out_of_stock')).toBe('Out of stock');
    expect(describeValue(field('stock'), 'all')).toBe('Stock');
    expect(describeValue(field('customers'), [{ id: '1', label: 'Lakeview Spices' }])).toBe('Lakeview Spices');
    expect(describeValue(field('customers'), [{ id: '1', label: 'Lakeview Spices' }, { id: '2', label: 'B' }, { id: '3', label: 'C' }])).toBe('Lakeview Spices +2');
    expect(describeValue(field('date'), { preset: 'lastMonth' })).toBe('Last month');
    expect(describeValue(field('weight'), { min: 10, max: 50 })).toBe('10 – 50 kg');
    expect(describeValue(field('weight'), { min: 9000000 })).toBe('90,00,000 kg or more');
    expect(describeValue(field('weight'), { max: 5 })).toBe('Up to 5 kg');
    expect(describeValue(field('numberRange'), { from: 'A0010', to: 'A0020' })).toBe('A0010 – A0020');
    expect(describeValue(field('package'), ' red ')).toBe('Package: red');
  });
  it('names the sort and its direction in the words of the field', () => {
    expect(describeSort(GRN_FILTERS, undefined)).toEqual({ label: 'GRN no.', direction: 'Highest number first' });
    expect(describeSort(GRN_FILTERS, { field: 'date', order: 'asc' })).toEqual({ label: 'Date', direction: 'Oldest first' });
    expect(isDefaultSort(GRN_FILTERS, undefined)).toBe(true);
    expect(isDefaultSort(GRN_FILTERS, { field: 'gr_no', order: 'asc' })).toBe(false);
    // An unknown stored sort falls back to the default.
    expect(describeSort(GRN_FILTERS, { field: 'gone', order: 'asc' }).label).toBe('GRN no.');
  });
});

describe('valuesEqual', () => {
  it('ignores key order and undefined entries', () => {
    expect(valuesEqual({ a: 'x', date: { from: '1', to: '2' } }, { date: { to: '2', from: '1' }, a: 'x', b: undefined })).toBe(true);
    expect(valuesEqual({ a: 'x' }, { a: 'y' })).toBe(false);
    expect(valuesEqual({ items: [{ id: '1', label: 'a' }] }, { items: [] })).toBe(false);
  });
});
