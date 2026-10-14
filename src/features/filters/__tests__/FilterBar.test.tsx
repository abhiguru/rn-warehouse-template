/**
 * The filter bar: which chips it shows, in what order, for which account, and
 * that each chip changes only its own filter. Rendered in all four themes.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BRANDS, getTokens, radius, space, touchTarget, type Mode } from '@/theme/tokens';
import { ChoiceChips } from '../components/ChoiceChips';
import { FilterBar } from '../components/FilterBar';
import { CHIP_HEIGHT, CHIP_INSET } from '../components/FilterBarChip';
import { FILTER_CONFIGS } from '../configs';
import { countActiveFilters, currentSort, hasAnyFilter, visibleFields } from '../filterModel';
import type { FilterContext, FilterValues, SortState } from '../types';
import type { useListFilters } from '../useListFilters';

// The mocked react-native components are plain strings in the tree, so the tag names are cast
// to the element type the renderer's nodes carry (as in OperatorServerSelectionKeyboard.test.tsx).
const tag = (name: string) => name as unknown as React.ElementType;
const VIEW = tag('View');

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
      'Sorted by GRN number, highest number first. Change sort',
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
      'Weight each: 50 kg or more. Change',
      'Remove filter Weight each 50 kg or more',
      'Filter by date',
      'Filter by customer',
      'Clear all filters and the search',
    ]);
  });

  it('removes only the filter whose close button was pressed', () => {
    const filters = makeFilters({ stock: 'in_stock', weight: { min: 50 } });
    const bar = renderBar(filters);
    bar.press('Remove filter Weight each 50 kg or more');
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
    expect(labels[0]).toBe('Sorted by GRN number, highest number first. Change sort');
  });
});

describe('FilterBar by account', () => {
  it('offers the customer filter to a customer account with several customers', () => {
    expect(renderBar(makeFilters({}, customerWithTwo)).labels()).toContain('Filter by customer');
  });

  it('hides the customer filter from a customer account with one customer', () => {
    expect(renderBar(makeFilters({}, customerWithOne)).labels()).toEqual([
      'Filters. Open sort and filter',
      'Sorted by GRN number, highest number first. Change sort',
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
      .findAll(node => node.type === VIEW)
      .map(node => (StyleSheet.flatten(node.props.style) ?? {}).backgroundColor);
    expect(backgrounds).toContain(t.surface.header);
    expect(backgrounds).toContain(t.brand.subtle);
    expect(backgrounds).toContain(t.surface.card);
  });

  // §11.2: React Native sends no touch outside a parent's bounds, so a hitSlop on a
  // pressable inside a 36 high pill gave a 36 high target. Each pressable is now the
  // whole target, with the 36 high pill drawn behind it in the theme's colours.
  it('makes every chip, and the remove button of an active one, a whole touch target', () => {
    mockState = { theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    const { renderer } = renderBar(makeFilters({ stock: 'in_stock' }));
    const pressables = renderer.root.findAll(
      node => typeof node.type !== 'string' && node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' && node.props.style !== undefined
    );
    expect(pressables.length).toBeGreaterThanOrEqual(5);
    for (const pressable of pressables) {
      expect(pressable.props.hitSlop).toBeUndefined();
      expect(StyleSheet.flatten(pressable.props.style).minHeight).toBe(touchTarget);
    }
    // The pills: 36 high inside the target, centred, outlined or filled from the theme.
    const pills = renderer.root.findAll(node => (node.type as unknown) === 'View' && StyleSheet.flatten(node.props.style)?.position === 'absolute' && StyleSheet.flatten(node.props.style)?.borderWidth === 1);
    expect(pills.length).toBeGreaterThanOrEqual(4);
    for (const pill of pills) {
      const style = StyleSheet.flatten(pill.props.style);
      expect(style).toMatchObject({ top: CHIP_INSET, bottom: CHIP_INSET });
      expect(touchTarget - CHIP_INSET * 2).toBe(CHIP_HEIGHT);
    }
    const colours = pills.map(pill => StyleSheet.flatten(pill.props.style).backgroundColor);
    expect(colours).toContain(t.surface.card);
    expect(colours).toContain(t.brand.subtle);
  });

  it('keeps the bar one height with the pills where they were, whatever chips it shows', () => {
    mockState = { theme: { preference: mode, brand } };
    const rowStyle = (filters: Filters) => {
      const { renderer } = renderBar(filters);
      const row = renderer.root.find(node => (node.type as unknown) === 'View' && StyleSheet.flatten(node.props.style)?.flexDirection === 'row' && StyleSheet.flatten(node.props.style)?.paddingHorizontal !== undefined && StyleSheet.flatten(node.props.style)?.gap !== undefined);
      return StyleSheet.flatten(row.props.style);
    };
    for (const filters of [makeFilters({}), makeFilters({ stock: 'in_stock', search: 'A0010 to A0012' })]) {
      const row = rowStyle(filters);
      // Padding + a touch target fills the row's fixed height exactly: no chip makes it taller.
      expect(row.paddingVertical * 2 + touchTarget).toBe(row.minHeight);
      expect(row.minHeight).toBe(CHIP_HEIGHT + space.sm * 2);
      // The pill sits `space.sm` from the edge, as before.
      expect(row.paddingVertical + CHIP_INSET).toBe(space.sm);
    }
  });

  it('makes each choice chip a whole touch target with its pill drawn inside', () => {
    mockState = { theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    const onChange = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ChoiceChips options={[{ value: 'desc', label: 'Newest first' }, { value: 'asc', label: 'Oldest first' }]} value="desc" onChange={onChange} accessibilityLabel="Order" />
      );
    });
    const radios = renderer.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio.props.hitSlop).toBeUndefined();
      expect(StyleSheet.flatten(radio.props.style).minHeight).toBe(touchTarget);
    }
    const pillOf = (radio: (typeof radios)[number]) =>
      StyleSheet.flatten(radio.findAll(node => (node.type as unknown) === 'View' && StyleSheet.flatten(node.props.style)?.borderRadius === radius.pill)[0].props.style);
    expect(pillOf(radios[0])).toMatchObject({ minHeight: CHIP_HEIGHT, backgroundColor: t.brand.subtle, borderColor: t.brand.tint });
    expect(pillOf(radios[1])).toMatchObject({ minHeight: CHIP_HEIGHT, backgroundColor: t.surface.card, borderColor: t.border.button });
    act(() => radios[1].props.onPress());
    expect(onChange).toHaveBeenCalledWith('asc');
  });
});

describe('FilterBar sort chip', () => {
  it('shows the short name on the chip and says the full one', () => {
    const { renderer, labels } = renderBar(makeFilters({}));
    const chipTexts = renderer.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
    expect(chipTexts).toContain('GRN no.');
    expect(chipTexts).not.toContain('GRN number');
    expect(labels()).toContain('Sorted by GRN number, highest number first. Change sort');
    expect(labels()).not.toContain('Sorted by GRN no., highest number first. Change sort');
  });
});

describe('FilterBar wording', () => {
  it('names an amount order without the word "number", and keeps "A to Z" as written', () => {
    const invoices = FILTER_CONFIGS['invoice-list'];
    const labelFor = (sort: SortState) => {
      const filters = { ...makeFilters({}), fields: visibleFields(invoices, staff), sort } as unknown as Filters;
      let renderer!: TestRenderer.ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(<FilterBar config={invoices} filters={filters} />);
      });
      return renderer.root
        .findAll(node => typeof node.type !== 'string' && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Sorted by'))[0]
        .props.accessibilityLabel as string;
    };
    expect(labelFor({ field: 'total', order: 'desc' })).toBe('Sorted by Total, highest first. Change sort');
    expect(labelFor({ field: 'total', order: 'asc' })).toBe('Sorted by Total, lowest first. Change sort');
    expect(labelFor({ field: 'customer_name', order: 'asc' })).toBe('Sorted by Customer, A to Z. Change sort');
    expect(labelFor({ field: 'inv_no', order: 'desc' })).toBe('Sorted by Invoice number, highest number first. Change sort');
  });

  it('names a switch that is on without repeating its label', () => {
    const orders = FILTER_CONFIGS['order-list'];
    const filters = {
      ...makeFilters({ withItems: true }),
      fields: visibleFields(orders, staff),
      sort: undefined,
      activeCount: 1,
      hasAny: true,
    } as unknown as Filters;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilterBar config={orders} filters={filters} />);
    });
    const labels = renderer.root
      .findAll(node => typeof node.type !== 'string' && node.props.accessibilityRole === 'button' && node.parent?.props.accessibilityLabel !== node.props.accessibilityLabel)
      .map(node => node.props.accessibilityLabel as string);
    expect(labels).toEqual(['With items, on. Turn off', 'Remove filter With items', 'Clear all filters and the search']);
  });
});
