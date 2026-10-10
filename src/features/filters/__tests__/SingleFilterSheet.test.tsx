import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { SingleFilterSheet, type OpenFilter } from '../components/SingleFilterSheet';
import { FILTER_CONFIGS } from '../configs';
import { currentSort, visibleFields } from '../filterModel';
import type { FilterContext, FilterValues } from '../types';
import type { useListFilters } from '../useListFilters';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const config = { ...FILTER_CONFIGS['grn-list'], countResults: jest.fn(() => Promise.resolve(24)) };
const ctx: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };

function setup(values: FilterValues) {
  const filters = {
    ctx,
    fields: visibleFields(config, ctx),
    values,
    sort: currentSort(config, undefined),
    setField: jest.fn(),
    setSort: jest.fn(),
  };
  const onClose = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  const element = (open: OpenFilter) => (
    <SingleFilterSheet config={config} filters={filters as unknown as ReturnType<typeof useListFilters>} open={open} onClose={onClose} />
  );
  act(() => {
    renderer = TestRenderer.create(element(null));
  });
  const input = (label: string) =>
    renderer.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === label)[0];
  const press = (label: string) =>
    act(() =>
      renderer.root
        .findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]
        .props.onPress()
    );
  return { filters, onClose, input, press, open: (open: OpenFilter) => act(() => renderer.update(element(open))) };
}

describe('single filter sheet', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens a typed field with the value in effect', () => {
    const sheet = setup({ weight: { min: 50 } });
    sheet.open({ type: 'field', key: 'weight' });
    expect(sheet.input('Weight, minimum, in kg').props.value).toBe('50');
    expect(sheet.input('Weight, maximum, in kg').props.value).toBe('');
  });

  it('shows the value of the filter just opened, not of the one before', () => {
    const sheet = setup({ weight: { min: 50 }, package: 'Crate' });
    sheet.open({ type: 'field', key: 'package' });
    expect(sheet.input('Package').props.value).toBe('Crate');
    sheet.open(null);
    sheet.open({ type: 'field', key: 'weight' });
    expect(sheet.input('Weight, minimum, in kg').props.value).toBe('50');
  });

  it('empties the field on Reset and changes nothing until the button', () => {
    const sheet = setup({ weight: { min: 50 } });
    sheet.open({ type: 'field', key: 'weight' });
    sheet.press('Reset');
    expect(sheet.input('Weight, minimum, in kg').props.value).toBe('');
    expect(sheet.filters.setField).not.toHaveBeenCalled();
  });

  it('applies a choice on tap and closes', () => {
    const sheet = setup({});
    sheet.open({ type: 'field', key: 'stock' });
    sheet.press('In stock');
    expect(sheet.filters.setField.mock.calls).toEqual([['stock', 'in_stock']]);
    expect(sheet.onClose).toHaveBeenCalledTimes(1);
  });
});
