/**
 * A report's period in the filter kit (docs/STYLE_GUIDE.md §14.5, §14.10): its
 * quick ranges, and a date range that always has a value. Such a range is shown
 * next to the sort, cannot be removed, is not counted as a filter, survives
 * "Clear all", and takes a quick range on the tap.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { getDateDaysAgo } from '@/services/reporting/reportDates';
import { applyListFilters, clearListFilters } from '@/store/slices/listFilterSlice';
import { toLocalISODate, todayInIST } from '@/utils/formatters';
import { ApplyFiltersButton } from '../components/ApplyFiltersButton';
import { FilterBar } from '../components/FilterBar';
import { SingleFilterSheet, type OpenFilter } from '../components/SingleFilterSheet';
import { countable } from '../configs';
import { DATE_PRESETS, REPORT_DATE_PRESETS, presetLabel, presetRange } from '../datePresets';
import { countActiveFilters, currentSort, describeValue, hasAnyFilter, visibleFields } from '../filterModel';
import type { DateRangeField, FilterContext, FilterListConfig, FilterValues, SortState } from '../types';
import { useFilterResultCount, type FilterResultCount } from '../useFilterResultCount';
import { useListFilters } from '../useListFilters';

const mockDispatch = jest.fn();
let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn(), logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

type Request = { values: FilterValues; sort?: SortState };
const PERIOD: DateRangeField = {
  key: 'period',
  kind: 'dateRange',
  label: 'Period',
  icon: 'calendar-range',
  presets: REPORT_DATE_PRESETS,
  required: true,
  applyPresetOnTap: true,
};
const STATUS = {
  key: 'status',
  kind: 'choice' as const,
  label: 'Status',
  icon: 'tag-outline',
  defaultValue: 'all',
  options: [{ value: 'all', label: 'All' }, { value: 'paid', label: 'Paid' }],
};
const REPORT: FilterListConfig<Request> = {
  listKey: 'test-report',
  title: 'Test report',
  noun: ['item', 'items'],
  sort: { options: [{ field: 'date', label: 'Date', kind: 'date' }], default: { field: 'date', order: 'desc' } },
  fields: [PERIOD, STATUS],
  fastFilters: ['status'],
  toRequest: (values, sort) => ({ values, sort }),
};
const PLAIN: FilterListConfig<Request> = { ...REPORT, listKey: 'test-plain', fields: [STATUS] };
const config = countable(REPORT);
const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };

type Filters = ReturnType<typeof useListFilters>;
function makeFilters(values: FilterValues) {
  const filters = {
    ctx: staff,
    fields: visibleFields(config, staff),
    values,
    sort: currentSort(config, undefined),
    request: {},
    search: '',
    activeCount: countActiveFilters(config, values, staff),
    hasAny: hasAnyFilter(config, values, staff),
    apply: jest.fn(),
    setField: jest.fn(),
    setSearch: jest.fn(),
    searchAsText: jest.fn(),
    setSort: jest.fn(),
    clear: jest.fn(),
  };
  return filters as unknown as Filters & typeof filters;
}

beforeEach(() => {
  mockDispatch.mockClear();
  mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'staff' } }, listFilters: { lists: {} } };
});
afterEach(() => jest.useRealTimers());

describe('report periods', () => {
  it('counts "last N days" with today as one of the days, as the report services do', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0) });
    expect(presetRange('last120', new Date())).toEqual({ from: '2026-06-15', to: '2026-10-12' });
    for (const [id, days] of [['last120', 120], ['last240', 240], ['last364', 364], ['last420', 420]] as const) {
      expect(presetRange(id, new Date())).toEqual({ from: getDateDaysAgo(days), to: '2026-10-12' });
    }
  });

  it('runs the financial year from 1 April to 31 March', () => {
    expect(presetRange('thisFinancialYear', new Date(2026, 2, 31))).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(presetRange('thisFinancialYear', new Date(2026, 3, 1))).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });

  it('takes the day from India, so the year turns over at midnight there', () => {
    expect(toLocalISODate(todayInIST(new Date('2026-03-31T18:29:00Z')))).toBe('2026-03-31');
    expect(toLocalISODate(todayInIST(new Date('2026-03-31T18:30:00Z')))).toBe('2026-04-01');
  });

  it('names a quick range from either set, and leaves the lists with their own five', () => {
    expect(DATE_PRESETS.map(preset => preset.id)).toEqual(['today', 'yesterday', 'last7', 'thisMonth', 'lastMonth']);
    expect(REPORT_DATE_PRESETS.map(preset => preset.label)).toEqual([
      'Last 120 days',
      'Last 240 days',
      'Last 364 days',
      'Last 420 days',
      'This month',
      'Last month',
      'This financial year',
    ]);
    expect(presetLabel('today')).toBe('Today');
    expect(describeValue(PERIOD, { preset: 'last364' })).toBe('Last 364 days');
    // Days of another year carry it; days of this year do not.
    expect(describeValue(PERIOD, { from: '2024-01-01', to: '2024-01-31' })).toBe('1 Jan 2024 – 31 Jan 2024');
  });
});

describe('a range that always has a value', () => {
  it('is not counted as a filter', () => {
    expect(countActiveFilters(config, { period: { preset: 'last120' } }, staff)).toBe(0);
    expect(hasAnyFilter(config, { period: { preset: 'last120' } }, staff)).toBe(false);
    expect(countActiveFilters(config, { period: { preset: 'last120' }, status: 'paid' }, staff)).toBe(1);
  });

  function barLabels(values: FilterValues) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilterBar config={config} filters={makeFilters(values)} />);
    });
    return renderer.root
      .findAll(
        node =>
          typeof node.type !== 'string' &&
          node.props.accessibilityRole === 'button' &&
          typeof node.props.accessibilityLabel === 'string' &&
          node.parent?.props.accessibilityLabel !== node.props.accessibilityLabel
      )
      .map(node => node.props.accessibilityLabel as string);
  }

  it('is drawn after the sort with no remove target, and alone offers no Clear all', () => {
    expect(barLabels({ period: { preset: 'last120' } })).toEqual([
      'Sorted by Date, newest first. Change sort',
      'Period: Last 120 days. Change',
      'Filter by status',
    ]);
  });

  it('stays in place when a filter is on, and only the filter can be removed', () => {
    expect(barLabels({ period: { preset: 'last120' }, status: 'paid' })).toEqual([
      'Sorted by Date, newest first. Change sort',
      'Period: Last 120 days. Change',
      'Status: Paid. Change',
      'Remove filter Status Paid',
      'Clear all filters and the search',
    ]);
  });

  function clearOf(list: FilterListConfig<Request>) {
    let clear!: () => void;
    const Probe = () => {
      clear = useListFilters(list).clear;
      return null;
    };
    act(() => {
      TestRenderer.create(<Probe />);
    });
    return clear;
  }

  it('survives Clear all, which still empties a list that has none', () => {
    mockState.listFilters = {
      lists: {
        'test-report': { values: { period: { preset: 'last240' }, status: 'paid' } },
        'test-plain': { values: { status: 'paid' } },
      },
    };
    clearOf(REPORT)();
    expect(mockDispatch.mock.calls).toEqual([[applyListFilters({ key: 'test-report', values: { period: { preset: 'last240' } } })]]);
    mockDispatch.mockClear();
    clearOf(PLAIN)();
    expect(mockDispatch.mock.calls).toEqual([[clearListFilters({ key: 'test-plain' })]]);
  });
});

describe('the period sheet', () => {
  function setup(values: FilterValues) {
    const filters = makeFilters(values);
    const onClose = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    const element = (open: OpenFilter) => <SingleFilterSheet config={config} filters={filters} open={open} onClose={onClose} />;
    act(() => {
      renderer = TestRenderer.create(element(null));
    });
    act(() => renderer.update(element({ type: 'field', key: 'period' })));
    const pressables = (label: string) =>
      renderer.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    return {
      filters,
      onClose,
      has: (label: string) => pressables(label).length > 0,
      press: (label: string) => act(() => pressables(label)[0].props.onPress()),
      applyButton: () => renderer.root.findByType(ApplyFiltersButton).props as { disabled?: boolean; result: FilterResultCount },
    };
  }

  it('applies a quick range on the tap and closes', () => {
    const sheet = setup({ period: { preset: 'last120' } });
    sheet.press('Last 240 days');
    expect(sheet.filters.setField.mock.calls).toEqual([['period', { preset: 'last240' }]]);
    expect(sheet.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the quick range in effect when it is tapped again, and offers no Reset', () => {
    const sheet = setup({ period: { preset: 'last120' } });
    expect(sheet.has('Reset')).toBe(false);
    sheet.press('Last 120 days');
    expect(sheet.filters.setField.mock.calls).toEqual([['period', { preset: 'last120' }]]);
  });

  it('needs both days of a typed range, and shows no count where nothing counts', () => {
    expect(setup({ period: { from: '2026-01-01' } }).applyButton().disabled).toBe(true);
    const complete = setup({ period: { from: '2026-01-01', to: '2026-01-31' } }).applyButton();
    expect(complete.disabled).toBe(false);
    expect(complete.result).toEqual({ count: null, loading: false });
  });
});

describe('a list with nothing to count with', () => {
  it('never loads a count', () => {
    jest.useFakeTimers();
    let latest!: FilterResultCount;
    const Probe = () => {
      latest = useFilterResultCount(config, {}, undefined, staff);
      return null;
    };
    act(() => {
      TestRenderer.create(<Probe />);
    });
    expect(latest).toEqual({ count: null, loading: false });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(latest).toEqual({ count: null, loading: false });
  });
});
