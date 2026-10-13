import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Modal } from 'react-native';
import { SingleFilterSheet, type OpenFilter } from '../components/SingleFilterSheet';
import { FILTER_CONFIGS } from '../configs';
import { currentSort, visibleFields } from '../filterModel';
import type { FilterContext, FilterValues } from '../types';
import type { useListFilters } from '../useListFilters';

// The mocked react-native components are plain strings in the tree, so the tag names are cast
// to the element type the renderer's nodes carry (as in OperatorServerSelectionKeyboard.test.tsx).
const tag = (name: string) => name as unknown as React.ElementType;
const TEXT_INPUT = tag('TextInput');

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
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
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
    renderer.root.findAll(node => node.type === TEXT_INPUT && node.props.accessibilityLabel === label)[0];
  const press = (label: string) =>
    act(() =>
      renderer.root
        .findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]
        .props.onPress()
    );
  const modal = () => renderer.root.findAllByType(Modal).find(node => node.props.visible);
  return { filters, onClose, input, press, modal, open: (open: OpenFilter) => act(() => renderer.update(element(open))) };
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

  // §9: with Reduce Motion on, the sheet fades in instead of sliding up.
  it('slides up normally and fades in when Reduce Motion is on', () => {
    try {
      mockReduceMotion = false;
      const sliding = setup({});
      sliding.open({ type: 'field', key: 'stock' });
      expect(sliding.modal()?.props.animationType).toBe('slide');

      mockReduceMotion = true;
      const fading = setup({});
      fading.open({ type: 'field', key: 'stock' });
      expect(fading.modal()?.props.animationType).toBe('fade');
    } finally {
      mockReduceMotion = false;
    }
  });
});
