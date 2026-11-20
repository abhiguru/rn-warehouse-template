/**
 * The one report layout, in every state and in all four themes: what is on
 * screen while loading, after a failure, with rows, with none, with none
 * matching, and when the rows on screen are older than was asked for.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { countable } from '@/features/filters/configs';
import { REPORT_DATE_PRESETS } from '@/features/filters/datePresets';
import { countActiveFilters, currentSort, hasAnyFilter, visibleFields } from '@/features/filters/filterModel';
import type { FilterContext, FilterListConfig, FilterValues } from '@/features/filters/types';
import type { useListFilters } from '@/features/filters/useListFilters';
import type { ReportQuery } from '@/features/reports/useReportQuery';
import { BRANDS, getTokens, layout, space, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import { ReportScaffold, type ReportEmptyAction } from '../ReportScaffold';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

type Query = Pick<ReportQuery<unknown>, 'phase' | 'isRefreshing' | 'isFetching' | 'error' | 'refresh' | 'retry' | 'updatedAt'> &
  Partial<Pick<ReportQuery<unknown>, 'isKeptCopy'>>;
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

async function draw(
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
  await render(
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
  return { filters, state };
}

/** What the screen shows as text, hidden or not (a text the old tree walk saw is a text here). */
const shows = (text: string | RegExp) => screen.queryByText(text, { includeHiddenElements: true });
const showsLabel = (label: string | RegExp) => screen.queryAllByLabelText(label, { includeHiddenElements: true });

type Json = ReturnType<typeof screen.toJSON>;
type JsonNode = Exclude<Json, null | unknown[]>;
/** The rendered host elements, in order, from the screen's JSON (for what no query can reach: a list's own props, an icon's name). */
function hostNodes(): JsonNode[] {
  const out: JsonNode[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node as JsonNode);
    ((node as JsonNode).children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return out;
}
const flashList = () => hostNodes().find(node => node.type === 'FlashList')!;

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('report layout, %s %s', (brand, mode) => {
  beforeEach(() => {
    mockState = { theme: { preference: mode, brand } };
  });

  it('keeps the title, search and filter bar on screen in every state', async () => {
    for (const state of [{ phase: 'loading' as const }, { phase: 'error' as const, error: 'Staff access required' }, {}]) {
      await draw({ query: state });
      expect(screen.getByText('GRN activity')).toBeOnTheScreen();
      expect(screen.getByText('All customers')).toBeOnTheScreen();
      expect(screen.getByPlaceholderText('Search GRNs')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Period: Last 120 days. Change' })).toBeOnTheScreen();
      expect(screen.root).toHaveStyle({ backgroundColor: getTokens(brand, mode).background.base });
      await screen.unmount();
    }
  });

  it('shows the figures, what they cover, the rows and the totals', async () => {
    await draw();
    expect(screen.getByText('GRNs')).toBeOnTheScreen();
    expect(screen.getByText('GRN A0010')).toBeOnTheScreen();
    expect(screen.getByText('GRN A0011')).toBeOnTheScreen();
    expect(screen.getByText('Total 2 GRNs')).toBeOnTheScreen();
    expect(screen.getByText('15/06/24 – 12/10/24 · Showing 2 of 5 · Last updated 10:42 am')).toBeOnTheScreen();
  });

  it('shows a skeleton while loading: no rows, no "nothing here"', async () => {
    await draw({ query: { phase: 'loading', updatedAt: undefined } });
    expect(shows('GRN A0010')).not.toBeOnTheScreen();
    expect(shows('No GRNs in this period')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Loading list')).toBeBusy();
  });

  it('says why it failed and retries', async () => {
    const { state } = await draw({ query: { phase: 'error', error: 'Staff access required', updatedAt: undefined } });
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.getByText('Staff access required')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it('keeps earlier rows on screen and says they are not current', async () => {
    const { state } = await draw({ query: { error: 'Could not reach the facility' } });
    expect(screen.getByText("Couldn't update. These figures were loaded earlier.")).toBeOnTheScreen();
    expect(screen.getByText('Could not reach the facility')).toBeOnTheScreen();
    expect(screen.getByText('GRN A0010')).toBeOnTheScreen();
    // The banner is a live alert, but not an "accessible" element, so no role query finds it: look from its text up.
    const banner = screen.getByText("Couldn't update. These figures were loaded earlier.");
    let alert = banner.parent;
    while (alert && alert.props.accessibilityRole !== 'alert') alert = alert.parent;
    expect(alert).not.toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing, with the figures still shown and pull to refresh', async () => {
    const { state } = await draw({ rows: [] });
    expect(screen.getByText('No GRNs in this period')).toBeOnTheScreen();
    expect(screen.getByText('Choose a longer period.')).toBeOnTheScreen();
    expect(screen.getByText('GRNs')).toBeOnTheScreen();
    // The list host keeps its refresh control as a prop: nothing is drawn for it to query.
    await act(() => flashList().props.refreshControl.props.onRefresh());
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows no borrowed wording when there is nothing and the report gives no description', async () => {
    await draw({ rows: [], description: null });
    expect(screen.getByText('No GRNs in this period')).toBeOnTheScreen();
    expect(shows('Items you create appear here.')).not.toBeOnTheScreen();
  });

  it('insets the figures as far as the rows, not twice as far', async () => {
    for (const state of [{ phase: 'loading' as const }, {}]) {
      await draw({ query: state });
      // A figure's tile: the placeholder while loading, the label of the real one after.
      const tile = state.phase === 'loading' ? showsLabel(/, loading$/)[0] : screen.getByText('GRNs');
      // Every view around the figures: only the grid's own side margin may inset them, once.
      const insets: unknown[] = [];
      for (let node = tile.parent; node; node = node.parent) {
        if (typeof node.type === 'string') {
          const style = StyleSheet.flatten(node.props.style) ?? {};
          insets.push(...[style.padding, style.paddingHorizontal, style.paddingLeft, style.marginHorizontal, style.marginLeft].filter(Boolean));
        }
      }
      // The real tile pads its own text by space.sm; the placeholder is the tile itself.
      expect(insets).toEqual(state.phase === 'loading' ? [layout.marginCompact] : [space.sm, layout.marginCompact]);
      await screen.unmount();
    }
  });

  it('names the search when nothing matches it, and clears it', async () => {
    const { filters } = await draw({ rows: [], values: { search: 'garlic' } });
    expect(screen.getByText('No GRNs match "garlic"')).toBeOnTheScreen();
    expect(shows('No GRNs in this period')).not.toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(filters.clear).toHaveBeenCalledTimes(1);
  });

  it('offers the way out the empty state names, as its button, in the theme', async () => {
    const onPress = jest.fn();
    await draw({ rows: [], action: { label: 'Choose period', onPress } });
    const button = screen.getByRole('button', { name: 'Choose period' });
    // WH-215: the empty state's button is a ui/Button, tertiary: no fill, the label in the theme's brand tint.
    expect(button).toHaveStyle({ backgroundColor: 'transparent' });
    expect(screen.getByText('Choose period')).toHaveStyle({ color: getTokens(brand, mode).brand.tint });
    // The icons are drawn as host "Icon" elements, which have no role or text.
    expect(hostNodes().some(node => node.type === 'Icon' && node.props.name === 'calendar-range')).toBe(true);
    await userEvent.setup().press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('report layout, accessibility and fit', () => {
  afterEach(() => {
    mockBottomInset = 0;
  });

  it('reads the loading figures as one "Loading figures", the placeholder tiles hidden', async () => {
    await draw({ query: { phase: 'loading', updatedAt: undefined }, kpiPlaceholders: 3 });
    const group = screen.getAllByLabelText('Loading figures');
    expect(group).toHaveLength(1);
    expect(group[0]).toBeBusy();
    expect(group[0].props.accessible).toBe(true);
    // Every tile sits under a view that hides it from the screen reader (Android and iOS).
    const tiles = showsLabel(/, loading$/);
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      let hidden = false;
      for (let node = tile.parent; node; node = node.parent) {
        if (node.props.importantForAccessibility === 'no-hide-descendants' && node.props.accessibilityElementsHidden) hidden = true;
      }
      expect(hidden).toBe(true);
    }
    // And a screen reader's own queries do not find them.
    expect(screen.queryAllByLabelText(/, loading$/)).toEqual([]);
  });

  it('offers no empty-state button unless the report gives one, and none when a search narrows the rows', async () => {
    await draw({ rows: [] });
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeOnTheScreen();
    await screen.unmount();
    await draw({ rows: [], values: { search: 'garlic' }, action: { label: 'Choose period', onPress: jest.fn() } });
    expect(screen.queryByRole('button', { name: 'Choose period' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Clear search and filters' })).toBeOnTheScreen();
  });

  it('keeps the last row clear of the system navigation bar', async () => {
    mockBottomInset = 48;
    await draw();
    expect(StyleSheet.flatten(flashList().props.contentContainerStyle).paddingBottom).toBe(space.xxl + 48);
  });

  it('keeps the clear button during a background fetch of a search made on the phone', async () => {
    await draw({ values: { search: 'garlic' }, query: { isFetching: true } });
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Searching')).not.toBeOnTheScreen();
  });

  it('shows the spinner while a server search is fetched', async () => {
    await draw({ values: { search: 'garlic' }, query: { isFetching: true }, searchIsServerSide: true });
    expect(screen.getByLabelText('Searching')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeOnTheScreen();
  });

  it('shows the spinner over the skeleton of a server search not answered yet', async () => {
    await draw({ values: { search: 'garlic' }, query: { phase: 'loading', updatedAt: undefined, isFetching: true }, searchIsServerSide: true });
    expect(screen.getByLabelText('Searching')).toBeOnTheScreen();
  });
});

// SR-10: figures kept on the phone say so while the facility is asked again.
describe('report status line, the saved copy', () => {
  beforeEach(() => {
    mockState = { theme: { preference: 'light', brand: 'orange' } };
  });
  const LINE = '15/06/24 – 12/10/24 · Showing 2 of 5 · Saved copy, refreshing… · Last updated 10:42 am';
  const FRESH_LINE = '15/06/24 – 12/10/24 · Showing 2 of 5 · Last updated 10:42 am';

  it('says "Saved copy, refreshing…" beside the time while the kept copy is asked again', async () => {
    await draw({ query: { isKeptCopy: true, isFetching: true } });
    expect(screen.getByText(LINE)).toBeOnTheScreen();
  });

  it('says nothing of it once the facility has answered, or for a fresh answer being refreshed', async () => {
    await draw({ query: { isKeptCopy: false, isFetching: true } });
    expect(screen.getByText(FRESH_LINE)).toBeOnTheScreen();
    await screen.unmount();
    await draw({ query: { isKeptCopy: true, isFetching: false } });
    expect(shows(LINE)).not.toBeOnTheScreen();
  });

  it('leaves the failure to the banner: no "refreshing" once the request failed', async () => {
    await draw({ query: { isKeptCopy: true, isFetching: false, error: 'Could not reach the facility' } });
    expect(screen.getByText("Couldn't update. These figures were loaded earlier.")).toBeOnTheScreen();
    expect(screen.getByText(FRESH_LINE)).toBeOnTheScreen();
    expect(shows(/refreshing/)).not.toBeOnTheScreen();
  });

  it('says it in Gujarati in that language', async () => {
    setLanguage('gu');
    try {
      await draw({ query: { isKeptCopy: true, isFetching: true } });
      expect(shows(/સાચવેલી નકલ, અપડેટ થઈ રહી છે…/)).toBeOnTheScreen();
    } finally {
      setLanguage('en');
    }
  });
});

describe('report layout, figures in groups', () => {
  it('draws each group of figures under a heading of what it covers, in the order given, and leaves out an empty group', async () => {
    await render(
      <ReportScaffold<string>
        title="Operations dashboard"
        query={query({})}
        kpiGroups={[
          { title: 'In 01/09/26 – 30/09/26', items: [{ icon: 'package-down', value: 12, label: 'GRNs' }, { icon: 'truck-delivery-outline', value: 7, label: 'Dispatches' }] },
          { title: 'Nothing here', items: [] },
          { title: 'Right now', items: [{ icon: 'clipboard-list-outline', value: 3, label: 'Pending orders' }] },
        ]}
        rows={['GRN A0010']}
        renderRow={row => <Text>{row}</Text>}
        keyExtractor={row => row}
        noun="GRNs"
        empty={{ icon: 'history', title: 'No activity' }}
      />
    );
    // The headings are read as headers, in their own words; on screen they are capitals.
    const headers = screen.getAllByRole("header").filter(node => node.props.accessible);
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveAccessibleName('In 01/09/26 – 30/09/26');
    expect(headers[1]).toHaveAccessibleName('Right now');
    // Each group's figures are under its own heading, in order: not under the other.
    const texts = screen.getAllByText(/./, { includeHiddenElements: true }).map(node => [node.props.children].flat().join(''));
    const at = (words: string) => texts.indexOf(words);
    expect(at('IN 01/09/26 – 30/09/26')).toBeGreaterThan(-1);
    expect(at('IN 01/09/26 – 30/09/26')).toBeLessThan(at('GRNs'));
    expect(at('GRNs')).toBeLessThan(at('Dispatches'));
    expect(at('Dispatches')).toBeLessThan(at('RIGHT NOW'));
    expect(at('RIGHT NOW')).toBeLessThan(at('Pending orders'));
    expect(texts).not.toContain('NOTHING HERE');
  });
});

describe('report layout without filters', () => {
  it('needs no noun: a report with nothing to narrow its rows shows its rows, and its own empty state', async () => {
    const drawRows = (rows: string[]) =>
      render(
        <ReportScaffold<string>
          title="Temperature and humidity"
          query={query({})}
          kpis={[{ icon: 'thermometer', value: 2, label: 'Sensors' }]}
          rows={rows}
          renderRow={row => <Text>{row}</Text>}
          keyExtractor={row => row}
          empty={{ icon: 'thermometer-off', title: 'No sensors yet', description: 'Sensors set up for this facility appear here.' }}
        />
      );
    await drawRows(['North chamber probe']);
    expect(screen.getByText('Sensors')).toBeOnTheScreen();
    expect(screen.getByText('North chamber probe')).toBeOnTheScreen();
    await screen.unmount();
    await drawRows([]);
    expect(screen.getByText('No sensors yet')).toBeOnTheScreen();
    expect(screen.getByText('Sensors set up for this facility appear here.')).toBeOnTheScreen();
    // Nothing narrows the rows, so nothing speaks of a search or a filter.
    expect(shows(/match|filter/i)).not.toBeOnTheScreen();
  });
});
