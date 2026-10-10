/**
 * The filter bar: which chips it shows, in what order, for which account, and
 * that each chip changes only its own filter. Rendered in all four themes.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { FilterBar } from '../components/FilterBar';
import { FILTER_CONFIGS } from '../configs';
import { countActiveFilters, currentSort, hasAnyFilter, visibleFields } from '../filterModel';
import type { FilterContext, FilterValues, SortState } from '../types';
import type { useListFilters } from '../useListFilters';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const config = FILTER_CONFIGS['grn-list'];
const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const customerWithTwo: FilterContext = {
  role: 'customer',
  isWarehouseRole: false,
  assignedCustomers: [{ id: 'c1', label: 'Green Valley Traders' }, { id: 'c2', label: 'Riverbank Produce' }],
};
const customerWithOne: FilterContext = {
  role: 'customer',
  isWarehouseRole: false,
  assignedCustomers: [{ id: 'c1', label: 'Sunrise Agro Foods' }],
};

type Filters = ReturnType<typeof useListFilters>;

function makeFilters(values: FilterValues, ctx: FilterContext = staff, sort?: SortState) {
  const filters = {
    ctx,
    fields: visibleFields(config, ctx),
    values,
    sort: currentSort(config, sort),
    request: {},
    search: typeof values.search === 'string' ? values.search : '',
    activeCount: countActiveFilters(config, values, ctx),
    hasAny: hasAnyFilter(config, values, ctx),
    apply: jest.fn(),
    setField: jest.fn(),
    setSearch: jest.fn(),
    searchAsText: jest.fn(),
    setSort: jest.fn(),
    clear: jest.fn(),
  };
  return filters as unknown as Filters & typeof filters;
}

function renderBar(filters: Filters, onOpenAll: (() => void) | undefined = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<FilterBar config={config} filters={filters} onOpenAll={onOpenAll} />);
  });
  const buttons = () =>
    renderer.root.findAll(
      node =>
        typeof node.type !== 'string' &&
        node.props.accessibilityRole === 'button' &&
        typeof node.props.accessibilityLabel === 'string' &&
        // A pressable renders through several wrappers that repeat its props: keep the outermost.
        node.parent?.props.accessibilityLabel !== node.props.accessibilityLabel
    );
  return {
    renderer,
    labels: () => buttons().map(node => node.props.accessibilityLabel as string),
    press: (label: string) => act(() => buttons().find(node => node.props.accessibilityLabel === label)!.props.onPress()),
  };
}

describe('FilterBar chips', () => {
  beforeEach(() => {
    mockState = { theme: { preference: 'light', brand: 'orange' } };
  });

  it('shows Filters, the sort, then the fast filters when nothing is applied', () => {
    const bar = renderBar(makeFilters({}));
    expect(bar.labels()).toEqual([
      'Filters. Open sort and filter',
      'Sorted by GRN no., highest number first. Change sort',
      'Filter by stock',
      'Filter by date',
      'Filter by customer',
    ]);
  });

  it('puts active filters after the sort, then the unused fast filters, then Clear all', () => {
    const bar = renderBar(
      makeFilters({ stock: 'in_stock', weight: { min: 50 } }, staff, { field: 'date', order: 'asc' })
    );
    expect(bar.labels()).toEqual([
      'Filters, 2 applied. Open sort and filter',
      'Sorted by Date, oldest first. Change sort',
      'Stock: In stock. Change',
      'Remove filter Stock In stock',
      'Weight: 50 kg or more. Change',
      'Remove filter Weight 50 kg or more',
      'Filter by date',
      'Filter by customer',
      'Clear all filters and the search',
    ]);
  });

  it('removes only the filter whose close button was pressed', () => {
    const filters = makeFilters({ stock: 'in_stock', weight: { min: 50 } });
    const bar = renderBar(filters);
    bar.press('Remove filter Weight 50 kg or more');
    expect(filters.setField.mock.calls).toEqual([['weight', undefined]]);
    expect(filters.clear).not.toHaveBeenCalled();
  });

  it('clears everything from Clear all, and opens the page from Filters', () => {
    const filters = makeFilters({ stock: 'in_stock' });
    const onOpenAll = jest.fn();
    const bar = renderBar(filters, onOpenAll);
    bar.press('Clear all filters and the search');
    expect(filters.clear).toHaveBeenCalledTimes(1);
    expect(filters.setField).not.toHaveBeenCalled();
    bar.press('Filters, 1 applied. Open sort and filter');
    expect(onOpenAll).toHaveBeenCalledTimes(1);
  });

  it('offers Clear all for a search alone, without counting it as a filter', () => {
    const bar = renderBar(makeFilters({ search: 'garlic' }));
    expect(bar.labels()[0]).toBe('Filters. Open sort and filter');
    expect(bar.labels()).toContain('Clear all filters and the search');
  });

  it('shows a date read from the search as a chip that turns it back into text', () => {
    const filters = makeFilters({ search: 'garlic 7 oct 2021' });
    const bar = renderBar(filters);
    const chip = bar.labels().find(label => label.startsWith('Date '));
    expect(chip).toBe('Date 7 Oct 2021, read from your search. Search for these words as text instead');
    bar.press(chip!);
    expect(filters.searchAsText).toHaveBeenCalledTimes(1);
    expect(filters.setField).not.toHaveBeenCalled();
  });

  it('shows a number range read from the search as a chip', () => {
    const bar = renderBar(makeFilters({ search: 'A0010-A0012' }));
    expect(bar.labels()).toContain('Numbers A0010 to A0012, read from your search. Search for these words as text instead');
  });

  it('has no Filters chip on a list without a full page', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilterBar config={config} filters={makeFilters({})} />);
    });
    const labels = renderer.root
      .findAll(node => typeof node.type !== 'string' && node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
      .map(node => node.props.accessibilityLabel as string);
    expect(labels[0]).toBe('Sorted by GRN no., highest number first. Change sort');
  });
});

describe('FilterBar by account', () => {
  it('offers the customer filter to a customer account with several customers', () => {
    expect(renderBar(makeFilters({}, customerWithTwo)).labels()).toContain('Filter by customer');
  });

  it('hides the customer filter from a customer account with one customer', () => {
    expect(renderBar(makeFilters({}, customerWithOne)).labels()).toEqual([
      'Filters. Open sort and filter',
      'Sorted by GRN no., highest number first. Change sort',
      'Filter by stock',
      'Filter by date',
    ]);
  });
});

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('FilterBar in %s %s', (brand, mode) => {
  it('takes the active chip and the bar colours from the theme', () => {
    mockState = { theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    const { renderer } = renderBar(makeFilters({ stock: 'in_stock' }));
    const backgrounds = renderer.root
      .findAll(node => node.type === 'View')
      .map(node => (StyleSheet.flatten(node.props.style) ?? {}).backgroundColor);
    expect(backgrounds).toContain(t.surface.header);
    expect(backgrounds).toContain(t.brand.subtle);
    expect(backgrounds).toContain(t.surface.card);
  });
});
