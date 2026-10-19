/**
 * Low stock on a facility without backend migration 98 (code review 2026-10-18, R1-07 and R3-02).
 *
 * That facility answers `stock_status: 'low_stock'` wrongly (the staff list returns every line, the customer
 * list none). The app learns from the list's own answers whether the facility pages by receipt, which only
 * migration 98 does, and offers Low stock only then.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GRN_FILTERS } from '../configs';
import { grnLinesHidden } from '../configs/grn';
import { describeValue, normalizeValues, visibleOptions } from '../filterModel';
import type { ChoiceField, FilterContext } from '../types';
import { useFilterContext } from '../useListFilters';
import {
  facilityPagesGrnsByReceipt,
  noteGrnPagingUnit,
  resetFacilityGrnPaging,
} from '@/config/facilityGrnPaging';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
let mockProfile: unknown = { role: 'staff' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfile } }),
}));
let mockServer: { origin: string; instanceId: string } | null = { origin: 'https://one.example', instanceId: 'one' };
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));

const stock = GRN_FILTERS.fields.find(field => field.key === 'stock') as ChoiceField;
const staff = (pagesByReceipt?: boolean): FilterContext => ({ role: 'staff', isWarehouseRole: true, assignedCustomers: [], pagesByReceipt });
const valuesOf = (ctx: FilterContext) => ['all', 'in_stock', 'low_stock', 'out_of_stock'].filter(value => visibleOptions(stock, ctx).some(option => option.value === value));

beforeEach(() => {
  mockServer = { origin: 'https://one.example', instanceId: 'one' };
  mockProfile = { role: 'staff' };
  act(() => resetFacilityGrnPaging());
});

describe('the Stock filter', () => {
  it('offers All, In stock and Fully dispatched only, until the facility is known to page by receipt', () => {
    expect(valuesOf(staff())).toEqual(['all', 'in_stock', 'out_of_stock']);
    expect(valuesOf(staff(false))).toEqual(['all', 'in_stock', 'out_of_stock']);
    expect(valuesOf(staff(true))).toEqual(['all', 'in_stock', 'low_stock', 'out_of_stock']);
  });

  it('does not use or show a stored Low stock on such a facility: no chip, nothing sent', () => {
    const stored = { stock: 'low_stock' };
    const old = normalizeValues(GRN_FILTERS, stored, staff(false));
    expect(old).toEqual({});
    expect(JSON.stringify(GRN_FILTERS.toRequest(old, undefined, staff(false)))).not.toContain('low_stock');

    const current = normalizeValues(GRN_FILTERS, stored, staff(true));
    expect(current).toEqual({ stock: 'low_stock' });
    expect(GRN_FILTERS.toRequest(current, undefined, staff(true)).p_filters).toEqual({ stock_status: 'low_stock' });
    expect(describeValue(stock, current.stock)).toBe('Low stock');
  });

  it('keeps In stock and Fully dispatched on every facility', () => {
    expect(normalizeValues(GRN_FILTERS, { stock: 'in_stock' }, staff(false))).toEqual({ stock: 'in_stock' });
    expect(normalizeValues(GRN_FILTERS, { stock: 'out_of_stock' }, staff(false))).toEqual({ stock: 'out_of_stock' });
  });
});

describe('what the app knows about the facility', () => {
  const probe = () => {
    const seen: (boolean | undefined)[] = [];
    const Probe = () => {
      seen.push(useFilterContext().pagesByReceipt);
      return null;
    };
    act(() => { TestRenderer.create(<Probe />); });
    return seen;
  };

  it('is unknown until an answer in receipts comes, then the filter context says so', () => {
    expect(facilityPagesGrnsByReceipt()).toBe(false);
    const seen = probe();
    expect(seen[seen.length - 1]).toBe(false);

    act(() => noteGrnPagingUnit('receipt'));
    expect(facilityPagesGrnsByReceipt()).toBe(true);
    expect(seen[seen.length - 1]).toBe(true);

    act(() => noteGrnPagingUnit('line'));
    expect(seen[seen.length - 1]).toBe(false);
  });

  it('is kept per server and forgotten on a server switch', () => {
    act(() => noteGrnPagingUnit('receipt'));
    expect(facilityPagesGrnsByReceipt()).toBe(true);

    mockServer = { origin: 'https://two.example', instanceId: 'two' };
    expect(facilityPagesGrnsByReceipt()).toBe(false);
    act(() => noteGrnPagingUnit('line'));
    // Back on the first server: what it answered before the switch is forgotten, not kept.
    mockServer = { origin: 'https://one.example', instanceId: 'one' };
    expect(facilityPagesGrnsByReceipt()).toBe(false);
  });

  it('is not known with no active server', () => {
    mockServer = null;
    act(() => noteGrnPagingUnit('receipt'));
    expect(facilityPagesGrnsByReceipt()).toBe(false);
  });
});

describe('lines hidden by a filter (R1-02)', () => {
  const hidden = (values: Parameters<typeof GRN_FILTERS.toRequest>[0]) => grnLinesHidden(GRN_FILTERS.toRequest(values, undefined, staff(true)));

  it('is false with no filter, and for filters that keep whole GRNs (Stock All, Customer, Date, GRN number)', () => {
    expect(grnLinesHidden({})).toBe(false);
    expect(hidden({})).toBe(false);
    expect(hidden({ stock: 'all' })).toBe(false);
    expect(hidden({ customers: [{ id: 'c1', label: 'A' }] })).toBe(false);
    expect(hidden({ date: { preset: 'today' } })).toBe(false);
    expect(hidden({ numberRange: { from: 'RV1', to: 'RV9' } })).toBe(false);
  });

  it('is true for Stock other than All, Item, Weight each, Package and the search text', () => {
    expect(hidden({ stock: 'in_stock' })).toBe(true);
    expect(hidden({ stock: 'low_stock' })).toBe(true);
    expect(hidden({ stock: 'out_of_stock' })).toBe(true);
    expect(hidden({ items: [{ id: 'i1', label: 'Garlic' }] })).toBe(true);
    expect(hidden({ weight: { min: 50 } })).toBe(true);
    expect(hidden({ weight: { max: 40 } })).toBe(true);
    expect(hidden({ package: 'Crate' })).toBe(true);
    expect(hidden({ search: 'garlic' })).toBe(true);
  });
});
