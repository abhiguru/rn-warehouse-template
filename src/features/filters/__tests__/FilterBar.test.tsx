/**
 * The filter bar: which chips it shows, in what order, for which account, and
 * that each chip changes only its own filter. Rendered in all four themes.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, radius, space, touchTarget, type Mode } from '@/theme/tokens';
import { ChoiceChips } from '../components/ChoiceChips';
import { FilterBar } from '../components/FilterBar';
import { CHIP_HEIGHT, CHIP_INSET } from '../components/FilterBarChip';
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

type El = ReturnType<typeof screen.getByRole>;
const user = userEvent.setup({ delay: 0 });

/** Every host element at or below `node`, in drawing order. Nothing else lists elements by style. */
const allBelow = (node: El): El[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : allBelow(child as El))),
];
const styleOf = (node: El) => StyleSheet.flatten(node.props.style) ?? {};
/** The Views of the screen (the old test looked at View elements only). */
const views = () => allBelow(screen.root as El).filter((node) => node.type === 'View');

async function renderBar(filters: Filters, onOpenAll: (() => void) | undefined = jest.fn()) {
  await render(<FilterBar config={config} filters={filters} onOpenAll={onOpenAll} />);
  return {
    labels: () => screen.getAllByRole('button').map((node) => node.props.accessibilityLabel as string),
    press: (label: string) => user.press(screen.getByRole('button', { name: label })),
  };
}

describe('FilterBar chips', () => {
  beforeEach(() => {
    mockState = { theme: { preference: 'light', brand: 'orange' } };
  });

  it('shows Filters, the sort, then the fast filters when nothing is applied', async () => {
    const bar = await renderBar(makeFilters({}));
    expect(bar.labels()).toEqual([
      'Filters. Open sort and filter',
      'Sorted by GRN number, highest number first. Change sort',
      'Filter by stock',
      'Filter by period',
      'Filter by customer',
    ]);
  });

  it('puts active filters after the sort, then the unused fast filters, then Clear all', async () => {
    const bar = await renderBar(
      makeFilters({ stock: 'in_stock', weight: { min: 50 } }, staff, { field: 'date', order: 'asc' })
    );
    expect(bar.labels()).toEqual([
      'Filters, 2 applied. Open sort and filter',
      'Sorted by Date, oldest first. Change sort',
      'Stock: In stock. Change',
      'Remove filter Stock In stock',
      'Weight each: 50 kg or more. Change',
      'Remove filter Weight each 50 kg or more',
      'Filter by period',
      'Filter by customer',
      'Clear all filters and the search',
    ]);
  });

  it('removes only the filter whose close button was pressed', async () => {
    const filters = makeFilters({ stock: 'in_stock', weight: { min: 50 } });
    const bar = await renderBar(filters);
    await bar.press('Remove filter Weight each 50 kg or more');
    expect(filters.setField.mock.calls).toEqual([['weight', undefined]]);
    expect(filters.clear).not.toHaveBeenCalled();
  });

  it('clears everything from Clear all, and opens the page from Filters', async () => {
    const filters = makeFilters({ stock: 'in_stock' });
    const onOpenAll = jest.fn();
    const bar = await renderBar(filters, onOpenAll);
    await bar.press('Clear all filters and the search');
    expect(filters.clear).toHaveBeenCalledTimes(1);
    expect(filters.setField).not.toHaveBeenCalled();
    await bar.press('Filters, 1 applied. Open sort and filter');
    expect(onOpenAll).toHaveBeenCalledTimes(1);
  });

  it('offers Clear all for a search alone, without counting it as a filter', async () => {
    const bar = await renderBar(makeFilters({ search: 'garlic' }));
    expect(bar.labels()[0]).toBe('Filters. Open sort and filter');
    expect(bar.labels()).toContain('Clear all filters and the search');
  });

  it('shows a date read from the search as a chip that turns it back into text', async () => {
    const filters = makeFilters({ search: 'garlic 7 oct 2021' });
    const bar = await renderBar(filters);
    const chip = bar.labels().find(label => label.startsWith('Date '));
    expect(chip).toBe('Date 7 Oct 2021, read from your search. Search for these words as text instead');
    await bar.press(chip!);
    expect(filters.searchAsText).toHaveBeenCalledTimes(1);
    expect(filters.setField).not.toHaveBeenCalled();
  });

  it('shows a number range read from the search as a chip', async () => {
    const bar = await renderBar(makeFilters({ search: 'A0010-A0012' }));
    expect(bar.labels()).toContain('Numbers A0010 to A0012, read from your search. Search for these words as text instead');
  });

  it('has no Filters chip on a list without a full page', async () => {
    await render(<FilterBar config={config} filters={makeFilters({})} />);
    const labels = screen.getAllByRole('button').map(node => node.props.accessibilityLabel as string);
    expect(labels[0]).toBe('Sorted by GRN number, highest number first. Change sort');
  });
});

describe('FilterBar by account', () => {
  it('offers the customer filter to a customer account with several customers', async () => {
    expect((await renderBar(makeFilters({}, customerWithTwo))).labels()).toContain('Filter by customer');
  });

  it('hides the customer filter from a customer account with one customer', async () => {
    expect((await renderBar(makeFilters({}, customerWithOne))).labels()).toEqual([
      'Filters. Open sort and filter',
      'Sorted by GRN number, highest number first. Change sort',
      'Filter by stock',
      'Filter by period',
    ]);
  });
});

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('FilterBar in %s %s', (brand, mode) => {
  it('takes the active chip and the bar colours from the theme', async () => {
    mockState = { theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    await renderBar(makeFilters({ stock: 'in_stock' }));
    const backgrounds = views().map(node => styleOf(node).backgroundColor);
    expect(backgrounds).toContain(t.surface.header);
    expect(backgrounds).toContain(t.brand.subtle);
    expect(backgrounds).toContain(t.surface.card);
  });

  // §11.2: React Native sends no touch outside a parent's bounds, so a hitSlop on a
  // pressable inside a 36 high pill gave a 36 high target. Each pressable is now the
  // whole target, with the 36 high pill drawn behind it in the theme's colours.
  it('makes every chip, and the remove button of an active one, a whole touch target', async () => {
    mockState = { theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    await renderBar(makeFilters({ stock: 'in_stock' }));
    const pressables = screen.getAllByRole('button').filter(node => node.props.style !== undefined);
    expect(pressables.length).toBeGreaterThanOrEqual(5);
    for (const pressable of pressables) {
      expect(pressable.props.hitSlop).toBeUndefined();
      expect(pressable).toHaveStyle({ minHeight: touchTarget });
    }
    // The close target of an active chip is a whole square, not a 36 wide strip (GRN list review 2026-10-18).
    const removes = pressables.filter(node => String(node.props.accessibilityLabel).startsWith('Remove filter'));
    expect(removes.length).toBeGreaterThanOrEqual(1);
    for (const remove of removes) expect(remove).toHaveStyle({ width: touchTarget });
    // The pills: 36 high inside the target, centred, outlined or filled from the theme.
    const pills = views().filter(node => styleOf(node).position === 'absolute' && styleOf(node).borderWidth === 1);
    expect(pills.length).toBeGreaterThanOrEqual(4);
    for (const pill of pills) {
      expect(pill).toHaveStyle({ top: CHIP_INSET, bottom: CHIP_INSET });
      expect(touchTarget - CHIP_INSET * 2).toBe(CHIP_HEIGHT);
    }
    const colours = pills.map(pill => styleOf(pill).backgroundColor);
    expect(colours).toContain(t.surface.card);
    expect(colours).toContain(t.brand.subtle);
  });

  it('keeps the bar one height with the pills where they were, whatever chips it shows', async () => {
    mockState = { theme: { preference: mode, brand } };
    const rowStyle = async (filters: Filters) => {
      await renderBar(filters);
      const rows = views().filter(node => styleOf(node).flexDirection === 'row' && styleOf(node).paddingHorizontal !== undefined && styleOf(node).gap !== undefined);
      // Exactly one such row, as the old `find` demanded.
      expect(rows).toHaveLength(1);
      const style = styleOf(rows[0]);
      await screen.unmount();
      return style;
    };
    for (const filters of [makeFilters({}), makeFilters({ stock: 'in_stock', search: 'A0010 to A0012' })]) {
      const row = await rowStyle(filters);
      // Padding + a touch target fills the row's fixed height exactly: no chip makes it taller.
      expect(row.paddingVertical * 2 + touchTarget).toBe(row.minHeight);
      expect(row.minHeight).toBe(CHIP_HEIGHT + space.sm * 2);
      // The pill sits `space.sm` from the edge, as before.
      expect(row.paddingVertical + CHIP_INSET).toBe(space.sm);
    }
  });

  it('makes each choice chip a whole touch target with its pill drawn inside', async () => {
    mockState = { theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    const onChange = jest.fn();
    await render(
      <ChoiceChips options={[{ value: 'desc', label: 'Newest first' }, { value: 'asc', label: 'Oldest first' }]} value="desc" onChange={onChange} accessibilityLabel="Order" />
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio.props.hitSlop).toBeUndefined();
      expect(radio).toHaveStyle({ minHeight: touchTarget });
    }
    const pillOf = (radio: El) => allBelow(radio).filter(node => node.type === 'View' && styleOf(node).borderRadius === radius.pill)[0];
    expect(pillOf(radios[0])).toHaveStyle({ minHeight: CHIP_HEIGHT, backgroundColor: t.brand.subtle, borderColor: t.brand.tint });
    expect(pillOf(radios[1])).toHaveStyle({ minHeight: CHIP_HEIGHT, backgroundColor: t.surface.card, borderColor: t.border.button });
    await user.press(radios[1]);
    expect(onChange).toHaveBeenCalledWith('asc');
  });
});

describe('FilterBar sort chip', () => {
  it('shows the short name on the chip and says the full one', async () => {
    const { labels } = await renderBar(makeFilters({}));
    expect(screen.getAllByText('GRN no.', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.queryByText('GRN number', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(labels()).toContain('Sorted by GRN number, highest number first. Change sort');
    expect(labels()).not.toContain('Sorted by GRN no., highest number first. Change sort');
  });
});

describe('FilterBar wording', () => {
  it('names an amount order without the word "number", and keeps "A to Z" as written', async () => {
    const invoices = FILTER_CONFIGS['invoice-list'];
    const labelFor = async (sort: SortState) => {
      const filters = { ...makeFilters({}), fields: visibleFields(invoices, staff), sort } as unknown as Filters;
      await render(<FilterBar config={invoices} filters={filters} />);
      const label = screen.getAllByLabelText(/^Sorted by/)[0].props.accessibilityLabel as string;
      await screen.unmount();
      return label;
    };
    expect(await labelFor({ field: 'total', order: 'desc' })).toBe('Sorted by Total, highest first. Change sort');
    expect(await labelFor({ field: 'total', order: 'asc' })).toBe('Sorted by Total, lowest first. Change sort');
    expect(await labelFor({ field: 'customer_name', order: 'asc' })).toBe('Sorted by Customer, A to Z. Change sort');
    expect(await labelFor({ field: 'inv_no', order: 'desc' })).toBe('Sorted by Invoice number, highest number first. Change sort');
  });

  it('names a switch that is on without repeating its label', async () => {
    const orders = FILTER_CONFIGS['order-list'];
    const filters = {
      ...makeFilters({ withItems: true }),
      fields: visibleFields(orders, staff),
      sort: undefined,
      activeCount: 1,
      hasAny: true,
    } as unknown as Filters;
    await render(<FilterBar config={orders} filters={filters} />);
    const labels = screen.getAllByRole('button').map(node => node.props.accessibilityLabel as string);
    expect(labels).toEqual(['With items, on. Turn off', 'Remove filter With items', 'Clear all filters and the search']);
  });
});
