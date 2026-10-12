/**
 * The one report layout, in every state and in all four themes: what is on
 * screen while loading, after a failure, with rows, with none, with none
 * matching, and when the rows on screen are older than was asked for.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { countable } from '@/features/filters/configs';
import { REPORT_DATE_PRESETS } from '@/features/filters/datePresets';
import { countActiveFilters, currentSort, hasAnyFilter, visibleFields } from '@/features/filters/filterModel';
import type { FilterContext, FilterListConfig, FilterValues } from '@/features/filters/types';
import type { useListFilters } from '@/features/filters/useListFilters';
import type { ReportQuery } from '@/features/reports/useReportQuery';
import { BRANDS, getTokens, space, type Mode } from '@/theme/tokens';
import { KPICard } from '../KPICard';
import { KPIGrid } from '../KPIGrid';
import { ReportScaffold, type ReportEmptyAction } from '../ReportScaffold';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
let mockBottomInset = 0;
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: mockBottomInset, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn(), logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const REPORT: FilterListConfig<unknown> = {
  listKey: 'report-scaffold-test',
  title: 'Test report',
  noun: ['item', 'items'],
  search: { placeholder: 'Search GRNs', dates: false, range: null },
  sort: { options: [{ field: 'date', label: 'Date', kind: 'date' }], default: { field: 'date', order: 'desc' } },
  fields: [{ key: 'period', kind: 'dateRange', label: 'Period', icon: 'calendar-range', presets: REPORT_DATE_PRESETS, required: true, applyPresetOnTap: true }],
  fastFilters: [],
  toRequest: values => values,
};
const config = countable(REPORT);

function makeFilters(values: FilterValues) {
  const filters = {
    ctx: staff,
    fields: visibleFields(config, staff),
    values,
    sort: currentSort(config, undefined),
    request: {},
    search: typeof values.search === 'string' ? values.search : '',
    activeCount: countActiveFilters(config, values, staff),
    hasAny: hasAnyFilter(config, values, staff),
    apply: jest.fn(),
    setField: jest.fn(),
    setSearch: jest.fn(),
    searchAsText: jest.fn(),
    setSort: jest.fn(),
    clear: jest.fn(),
  };
  return filters as unknown as ReturnType<typeof useListFilters> & typeof filters;
}

type Query = Pick<ReportQuery<unknown>, 'phase' | 'isRefreshing' | 'isFetching' | 'error' | 'refresh' | 'retry' | 'updatedAt'>;
const query = (over: Partial<Query>): Query => ({
  phase: 'ready',
  isRefreshing: false,
  isFetching: false,
  error: null,
  refresh: jest.fn(),
  retry: jest.fn(),
  // 10:42 this morning, local time: the status line gives the time alone for today.
  updatedAt: new Date(new Date().setHours(10, 42, 0, 0)).getTime(),
  ...over,
});

// The loading skeleton animates for as long as it is mounted: every tree is taken down after its test.
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
});

function render(
  over: {
    query?: Partial<Query>;
    rows?: string[];
    values?: FilterValues;
    description?: string | null;
    action?: ReportEmptyAction;
    searchIsServerSide?: boolean;
    kpiPlaceholders?: number;
  } = {}
) {
  const filters = makeFilters({ period: { preset: 'last120' }, ...over.values });
  const state = query(over.query ?? {});
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ReportScaffold<string>
        title="GRN activity"
        subtitle="All customers"
        filters={{ config, state: filters }}
        searchIsServerSide={over.searchIsServerSide}
        query={state}
        kpis={[{ icon: 'package-variant', value: 12, label: 'GRNs' }]}
        kpiPlaceholders={over.kpiPlaceholders}
        status={{ range: { from: '2024-06-15', to: '2024-10-12' }, shown: over.rows?.length ?? 2, total: 5 }}
        rows={over.rows ?? ['GRN A0010', 'GRN A0011']}
        renderRow={row => <Text>{row}</Text>}
        keyExtractor={row => row}
        noun="GRNs"
        empty={{
          icon: 'package-variant-closed',
          title: 'No GRNs in this period',
          description: over.description === null ? undefined : 'Choose a longer period.',
          action: over.action,
        }}
        footer={<Text>Total 2 GRNs</Text>}
      />
    );
  });
  mounted.push(tree);
  const text = () =>
    tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
  const labelled = (label: string) =>
    tree.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  return { tree, text, labelled, filters, state };
}

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('report layout, %s %s', (brand, mode) => {
  beforeEach(() => {
    mockState = { theme: { preference: mode, brand } };
  });

  it('keeps the title, search and filter bar on screen in every state', () => {
    for (const state of [{ phase: 'loading' as const }, { phase: 'error' as const, error: 'Staff access required' }, {}]) {
      const { text, tree, labelled } = render({ query: state });
      expect(text()).toEqual(expect.arrayContaining(['GRN activity', 'All customers']));
      expect(tree.root.findAll(node => node.props.placeholder === 'Search GRNs').length).toBeGreaterThan(0);
      expect(labelled('Period: Last 120 days. Change').length).toBeGreaterThan(0);
      expect(StyleSheet.flatten(tree.root.findAllByType('View' as never)[0].props.style).backgroundColor).toBe(getTokens(brand, mode).background.base);
    }
  });

  it('shows the figures, what they cover, the rows and the totals', () => {
    const { text } = render();
    expect(text()).toEqual(expect.arrayContaining(['GRNs', 'GRN A0010', 'GRN A0011', 'Total 2 GRNs']));
    expect(text()).toContain('15 Jun 2024 – 12 Oct 2024 · Showing 2 of 5 · Last updated 10:42 am');
  });

  it('shows a skeleton while loading: no rows, no "nothing here"', () => {
    const { text, tree } = render({ query: { phase: 'loading', updatedAt: undefined } });
    expect(text()).not.toContain('GRN A0010');
    expect(text()).not.toContain('No GRNs in this period');
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Loading list' && node.props.accessibilityState?.busy).length).toBeGreaterThan(0);
  });

  it('says why it failed and retries', () => {
    const { text, labelled, state } = render({ query: { phase: 'error', error: 'Staff access required', updatedAt: undefined } });
    expect(text()).toEqual(expect.arrayContaining(['Something went wrong', 'Staff access required']));
    act(() => labelled('Try again')[0].props.onPress());
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it('keeps earlier rows on screen and says they are not current', () => {
    const { text, labelled, state, tree } = render({ query: { error: 'Could not reach the facility' } });
    expect(text()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", 'Could not reach the facility', 'GRN A0010']));
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'alert').length).toBeGreaterThan(0);
    act(() => labelled('Try again')[0].props.onPress());
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing, with the figures still shown and pull to refresh', () => {
    const { text, tree, state } = render({ rows: [] });
    expect(text()).toEqual(expect.arrayContaining(['No GRNs in this period', 'Choose a longer period.', 'GRNs']));
    act(() => tree.root.findByType('FlashList' as never).props.refreshControl.props.onRefresh());
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows no borrowed wording when there is nothing and the report gives no description', () => {
    const { text } = render({ rows: [], description: null });
    expect(text()).toContain('No GRNs in this period');
    expect(text()).not.toContain('Items you create appear here.');
  });

  it('insets the figures as far as the rows, not twice as far', () => {
    for (const state of [{ phase: 'loading' as const }, {}]) {
      const { tree } = render({ query: state });
      const grid = tree.root.findByType(KPIGrid);
      let node = grid.parent;
      while (node) {
        if (typeof node.type === 'string') {
          const style = StyleSheet.flatten(node.props.style) ?? {};
          expect([style.padding, style.paddingHorizontal, style.paddingLeft, style.marginHorizontal, style.marginLeft].filter(Boolean)).toEqual([]);
        }
        node = node.parent;
      }
    }
  });

  it('names the search when nothing matches it, and clears it', () => {
    const { text, labelled, filters } = render({ rows: [], values: { search: 'garlic' } });
    expect(text()).toContain('No GRNs match "garlic"');
    expect(text()).not.toContain('No GRNs in this period');
    act(() => labelled('Clear search and filters')[0].props.onPress());
    expect(filters.clear).toHaveBeenCalledTimes(1);
  });

  it('offers the way out the empty state names, as its button, in the theme', () => {
    const onPress = jest.fn();
    const { labelled, tree } = render({ rows: [], action: { label: 'Choose period', onPress } });
    const [button] = labelled('Choose period');
    expect(button).toBeDefined();
    expect(StyleSheet.flatten(button.props.style({ pressed: false })).backgroundColor).toBe(getTokens(brand, mode).brand.fill);
    expect(tree.root.findAll(node => (node.type as unknown) === 'Icon' && node.props.name === 'calendar-range').length).toBeGreaterThan(0);
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('report layout, accessibility and fit', () => {
  afterEach(() => {
    mockBottomInset = 0;
  });

  it('reads the loading figures as one "Loading figures", the placeholder tiles hidden', () => {
    const { tree } = render({ query: { phase: 'loading', updatedAt: undefined }, kpiPlaceholders: 3 });
    const group = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessible && node.props.accessibilityLabel === 'Loading figures');
    expect(group).toHaveLength(1);
    expect(group[0].props.accessibilityState).toEqual({ busy: true });
    // Every tile sits under a view that hides it from the screen reader (Android and iOS).
    const tiles = tree.root.findAllByType(KPICard);
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      let node = tile.parent;
      let hidden = false;
      while (node) {
        if (node.props.importantForAccessibility === 'no-hide-descendants' && node.props.accessibilityElementsHidden) hidden = true;
        node = node.parent;
      }
      expect(hidden).toBe(true);
    }
  });

  it('offers no empty-state button unless the report gives one, and none when a search narrows the rows', () => {
    expect(render({ rows: [] }).tree.root.findAll(node => node.props.accessibilityLabel === 'Create' && typeof node.props.onPress === 'function')).toEqual([]);
    const { labelled } = render({ rows: [], values: { search: 'garlic' }, action: { label: 'Choose period', onPress: jest.fn() } });
    expect(labelled('Choose period')).toEqual([]);
    expect(labelled('Clear search and filters').length).toBeGreaterThan(0);
  });

  it('keeps the last row clear of the system navigation bar', () => {
    mockBottomInset = 48;
    const { tree } = render();
    expect(StyleSheet.flatten(tree.root.findByType('FlashList' as never).props.contentContainerStyle).paddingBottom).toBe(space.xxl + 48);
  });

  it('keeps the clear button during a background fetch of a search made on the phone', () => {
    const { tree } = render({ values: { search: 'garlic' }, query: { isFetching: true } });
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Clear search' && typeof node.props.onPress === 'function').length).toBeGreaterThan(0);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Searching')).toEqual([]);
  });

  it('shows the spinner while a server search is fetched', () => {
    const { tree } = render({ values: { search: 'garlic' }, query: { isFetching: true }, searchIsServerSide: true });
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Searching').length).toBeGreaterThan(0);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Clear search' && typeof node.props.onPress === 'function')).toEqual([]);
  });

  it('shows the spinner over the skeleton of a server search not answered yet', () => {
    const { tree } = render({ values: { search: 'garlic' }, query: { phase: 'loading', updatedAt: undefined, isFetching: true }, searchIsServerSide: true });
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Searching').length).toBeGreaterThan(0);
  });
});
