/**
 * A report's period in the filter kit (docs/STYLE_GUIDE.md §14.5, §14.10): its
 * quick ranges, and a date range that always has a value. Such a range is shown
 * next to the sort, cannot be removed, is not counted as a filter, survives
 * "Clear all", and takes a quick range on the tap.
 */
import React from 'react';
import { act, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import { getDateDaysAgo } from '@/services/reporting/reportDates';
import { applyListFilters, clearListFilters } from '@/store/slices/listFilterSlice';
import { watchPhoneZone } from '@/tests/helpers/phoneZone';
import { formatDate, formatSpokenDate, toLocalISODate, todayInIST } from '@/utils/formatters';
import { FilterBar } from '../components/FilterBar';
import { SingleFilterSheet, type OpenFilter } from '../components/SingleFilterSheet';
import { DISPATCH_FILTERS, FILTER_CONFIGS, GRN_FILTERS, INVOICE_FILTERS, countable, type CountableFilterList } from '../configs';
import { REPORT_VIEW_CONFIGS } from '../configs/reports';
import { CUSTOMER_ACTIVITY_CUSTOMER } from '../configs/reports/customerActivity';
import { GRN_ACTIVITY_CUSTOMERS } from '../configs/reports/grnActivity';
import { OPERATIONS_DASHBOARD } from '../configs/reports/operationsDashboard';
import { PERIOD_FIELD, PERIOD_KEY } from '../configs/reports/shared';
import { DATE_PRESETS, REPORT_DATE_PRESETS, presetLabel, presetRange } from '../datePresets';
import { countActiveFilters, currentSort, describeValue, hasAnyFilter, visibleFields } from '../filterModel';
import type { DatePresetId, DateRangeField, FilterContext, FilterListConfig, FilterValues, SortState } from '../types';
import { useFilterResultCount } from '../useFilterResultCount';
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
  icon: 'tag-outline' as const,
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

  it('offers the daily-work periods first: today, yesterday and the last 7 days, today counted as one of them', () => {
    expect(REPORT_DATE_PRESETS.map(preset => preset.id).slice(0, 3)).toEqual(['today', 'yesterday', 'last7']);
    const monday = new Date(2026, 9, 12, 10, 0);
    expect(presetRange('today', monday)).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(presetRange('yesterday', monday)).toEqual({ from: '2026-10-11', to: '2026-10-11' });
    expect(presetRange('last7', monday)).toEqual({ from: '2026-10-06', to: '2026-10-12' });
  });

  it('takes the day from India, so the year turns over at midnight there', () => {
    expect(toLocalISODate(todayInIST(new Date('2026-03-31T18:29:00Z')))).toBe('2026-03-31');
    expect(toLocalISODate(todayInIST(new Date('2026-03-31T18:30:00Z')))).toBe('2026-04-01');
  });

  it('names a quick range from either set, and leaves the lists with their own five', () => {
    expect(DATE_PRESETS.map(preset => preset.id)).toEqual(['today', 'yesterday', 'last7', 'thisMonth', 'lastMonth']);
    expect(REPORT_DATE_PRESETS.map(preset => preset.label)).toEqual([
      'Today',
      'Yesterday',
      'Last 7 days',
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
    expect(describeValue(PERIOD, { from: '2024-01-01', to: '2024-01-31' })).toBe('01/01/24 – 31/01/24');
  });
});

describe('a range that always has a value', () => {
  it('is not counted as a filter', () => {
    expect(countActiveFilters(config, { period: { preset: 'last120' } }, staff)).toBe(0);
    expect(hasAnyFilter(config, { period: { preset: 'last120' } }, staff)).toBe(false);
    expect(countActiveFilters(config, { period: { preset: 'last120' }, status: 'paid' }, staff)).toBe(1);
  });

  // Every button of the bar, in drawing order, by the name a screen reader speaks.
  async function barLabels(values: FilterValues) {
    await render(<FilterBar config={config} filters={makeFilters(values)} />);
    return screen.getAllByRole('button').map(node => node.props.accessibilityLabel as string);
  }

  it('is drawn after the sort with no remove target, and alone offers no Clear all', async () => {
    expect(await barLabels({ period: { preset: 'last120' } })).toEqual([
      'Sorted by Date, newest first. Change sort',
      'Period: Last 120 days. Change',
      'Filter by status',
    ]);
  });

  it('stays in place when a filter is on, and only the filter can be removed', async () => {
    expect(await barLabels({ period: { preset: 'last120' }, status: 'paid' })).toEqual([
      'Sorted by Date, newest first. Change sort',
      'Period: Last 120 days. Change',
      'Status: Paid. Change',
      'Remove filter Status Paid',
      'Clear all filters and the search',
    ]);
  });

  async function clearOf(list: FilterListConfig<Request>) {
    const { result } = await renderHook(() => useListFilters(list).clear);
    return result.current;
  }

  it('survives Clear all, which still empties a list that has none', async () => {
    mockState.listFilters = {
      lists: {
        'test-report': { values: { period: { preset: 'last240' }, status: 'paid' } },
        'test-plain': { values: { status: 'paid' } },
      },
    };
    (await clearOf(REPORT))();
    expect(mockDispatch.mock.calls).toEqual([[applyListFilters({ key: 'test-report', values: { period: { preset: 'last240' } } })]]);
    mockDispatch.mockClear();
    (await clearOf(PLAIN))();
    expect(mockDispatch.mock.calls).toEqual([[clearListFilters({ key: 'test-plain' })]]);
  });
});

describe('the period sheet', () => {
  async function setup(values: FilterValues) {
    const filters = makeFilters(values);
    const onClose = jest.fn();
    const element = (open: OpenFilter) => <SingleFilterSheet config={config} filters={filters} open={open} onClose={onClose} />;
    await render(element(null));
    await screen.rerender(element({ type: 'field', key: 'period' }));
    const user = userEvent.setup({ delay: 0 });
    return {
      filters,
      onClose,
      pressQuickRange: (name: string) => user.press(screen.getByRole('radio', { name })),
      applyButton: () => screen.getByRole('button', { name: 'Show results' }),
    };
  }

  it('applies a quick range on the tap and closes', async () => {
    const sheet = await setup({ period: { preset: 'last120' } });
    await sheet.pressQuickRange('Last 240 days');
    expect(sheet.filters.setField.mock.calls).toEqual([['period', { preset: 'last240' }]]);
    expect(sheet.onClose).toHaveBeenCalledTimes(1);
  });

  it('applies Today with one tap, as it does the longer periods', async () => {
    const sheet = await setup({ period: { preset: 'last120' } });
    await sheet.pressQuickRange('Today');
    expect(sheet.filters.setField.mock.calls).toEqual([['period', { preset: 'today' }]]);
    expect(sheet.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the quick range in effect when it is tapped again, and offers no Reset', async () => {
    const sheet = await setup({ period: { preset: 'last120' } });
    expect(screen.queryByLabelText('Reset')).not.toBeOnTheScreen();
    await sheet.pressQuickRange('Last 120 days');
    expect(sheet.filters.setField.mock.calls).toEqual([['period', { preset: 'last120' }]]);
  });

  it('needs both days of a typed range, and shows no count where nothing counts', async () => {
    const incomplete = await setup({ period: { from: '2026-01-01' } });
    expect(incomplete.applyButton().props.accessibilityState).toMatchObject({ disabled: true });
    expect(incomplete.applyButton()).toBeDisabled();
    await screen.unmount();
    const complete = await setup({ period: { from: '2026-01-01', to: '2026-01-31' } });
    // Not disabled and not loading, with the plain label: no count is asked for or shown.
    expect(complete.applyButton().props.accessibilityState).toMatchObject({ disabled: false });
    expect(complete.applyButton()).toBeEnabled();
    expect(complete.applyButton()).not.toBeBusy();
  });
});

// A minute to either side of midnight in India (18:30 UTC): the afternoon in New York, the next
// morning in Kiritimati. Not on a quarter of an hour, so midnight in no zone (see watchPhoneZone).
const at = (utc: string) => new Date(`${utc}:07Z`);
const SUNDAY_NIGHT = at('2026-10-11T18:29'); // 11 October, 23:59 in India
const MONDAY_MORNING = at('2026-10-11T18:31'); // 12 October, 00:01 in India
const MONTH_END = at('2026-09-30T18:29'); // 30 September, 23:59 in India
const MONTH_START = at('2026-09-30T18:31'); // 1 October, 00:01 in India
const YEAR_END = at('2026-03-31T18:29'); // 31 March, 23:59 in India: the last minute of the financial year
const YEAR_START = at('2026-03-31T18:31'); // 1 April, 00:01 in India

/** The From and To days a sheet shows for a value of one field, as its two buttons say them. */
async function shownDays(list: CountableFilterList, key: string, values: FilterValues) {
  const filters = {
    ctx: staff,
    fields: visibleFields(list, staff),
    values,
    sort: currentSort(list, undefined),
    setField: jest.fn(),
    setSort: jest.fn(),
  } as unknown as Filters;
  const element = (open: OpenFilter) => <SingleFilterSheet config={list} filters={filters} open={open} onClose={jest.fn()} />;
  await render(element(null));
  await screen.rerender(element({ type: 'field', key }));
  const day = (start: string) => screen.getAllByRole('button', { name: new RegExp(`^${start}`) })[0].props.accessibilityLabel as string;
  const shown = { from: day('From date, '), to: day('To date, ') };
  await screen.unmount();
  return shown;
}

describe('the period sheet of a report shows the days its request asks for', () => {
  const report = countable(GRN_ACTIVITY_CUSTOMERS);
  const requested = (preset: DatePresetId) => GRN_ACTIVITY_CUSTOMERS.toRequest({ [PERIOD_KEY]: { preset } }, undefined, staff).period;
  const shown = (preset: DatePresetId) => shownDays(report, PERIOD_KEY, { [PERIOD_KEY]: { preset } });

  it('every report has the one period field, which counts from India\'s today', () => {
    const withPeriod = [...REPORT_VIEW_CONFIGS.map(entry => entry.config), OPERATIONS_DASHBOARD, CUSTOMER_ACTIVITY_CUSTOMER].filter(list =>
      list.fields.some(field => field.kind === 'dateRange')
    );
    expect(withPeriod.length).toBeGreaterThanOrEqual(8);
    for (const list of withPeriod) expect(list.fields.filter(field => field.kind === 'dateRange')).toEqual([PERIOD_FIELD]);
    expect(PERIOD_FIELD.today).toBe(todayInIST);
  });

  it('counts the last 120 days from the day it is in India, a minute before midnight there and a minute after', async () => {
    jest.useFakeTimers({ now: SUNDAY_NIGHT });
    expect(requested('last120')).toEqual({ from: '2026-06-14', to: '2026-10-11' });
    expect(await shown('last120')).toEqual({ from: 'From date, 14 Jun 2026', to: 'To date, 11 Oct 2026' });
    jest.setSystemTime(MONDAY_MORNING);
    expect(requested('last120')).toEqual({ from: '2026-06-15', to: '2026-10-12' });
    expect(await shown('last120')).toEqual({ from: 'From date, 15 Jun 2026', to: 'To date, 12 Oct 2026' });
  });

  it('asks for India\'s today, yesterday and last 7 days half an hour after midnight there, when it is still the day before in UTC', async () => {
    // 19:00 UTC on 12 October is 00:30 on 13 October in India.
    jest.useFakeTimers({ now: new Date('2026-10-12T19:00:07Z') });
    expect(requested('today')).toEqual({ from: '2026-10-13', to: '2026-10-13' });
    expect(requested('yesterday')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(requested('last7')).toEqual({ from: '2026-10-07', to: '2026-10-13' });
    expect(await shown('today')).toEqual({ from: 'From date, 13 Oct 2026', to: 'To date, 13 Oct 2026' });
  });

  it('turns the month and the financial year over at midnight in India', async () => {
    jest.useFakeTimers({ now: MONTH_END });
    expect(await shown('thisMonth')).toEqual({ from: 'From date, 1 Sep 2026', to: 'To date, 30 Sep 2026' });
    expect(await shown('lastMonth')).toEqual({ from: 'From date, 1 Aug 2026', to: 'To date, 31 Aug 2026' });
    jest.setSystemTime(MONTH_START);
    expect(await shown('thisMonth')).toEqual({ from: 'From date, 1 Oct 2026', to: 'To date, 31 Oct 2026' });
    expect(await shown('lastMonth')).toEqual({ from: 'From date, 1 Sep 2026', to: 'To date, 30 Sep 2026' });
    jest.setSystemTime(YEAR_END);
    expect(await shown('thisFinancialYear')).toEqual({ from: 'From date, 1 Apr 2025', to: 'To date, 31 Mar 2026' });
    jest.setSystemTime(YEAR_START);
    expect(await shown('thisFinancialYear')).toEqual({ from: 'From date, 1 Apr 2026', to: 'To date, 31 Mar 2027' });
  });

  it('shows, for every quick range and at each of those moments, the two days the request sends', async () => {
    jest.useFakeTimers({ now: SUNDAY_NIGHT });
    for (const now of [SUNDAY_NIGHT, MONDAY_MORNING, MONTH_END, MONTH_START, YEAR_END, YEAR_START]) {
      jest.setSystemTime(now);
      for (const preset of REPORT_DATE_PRESETS) {
        const period = requested(preset.id);
        expect({ now: now.toISOString(), preset: preset.id, ...(await shown(preset.id)) }).toEqual({
          now: now.toISOString(),
          preset: preset.id,
          from: `From date, ${formatSpokenDate(period.from)}`,
          to: `To date, ${formatSpokenDate(period.to)}`,
        });
      }
    }
  });

  it('does not read the clock in the zone of the phone', async () => {
    // The suite's zone is India's, so a sheet that counted from the phone's today would show the
    // same days here. It would have to read the clock with the phone's calendar to do so.
    jest.useFakeTimers({ now: SUNDAY_NIGHT });
    const watch = watchPhoneZone([SUNDAY_NIGHT, MONDAY_MORNING]);
    try {
      expect(await shown('last120')).toEqual({ from: 'From date, 14 Jun 2026', to: 'To date, 11 Oct 2026' });
      jest.setSystemTime(MONDAY_MORNING);
      expect(await shown('thisMonth')).toEqual({ from: 'From date, 1 Oct 2026', to: 'To date, 31 Oct 2026' });
      expect(watch.reads).toEqual([]);
    } finally {
      watch.restore();
    }
  });
});

describe('a list\'s date sheet shows the days its request asks for', () => {
  // The lists count "Today" from the phone's own today, in the request and in the sheet alike. Their
  // field gives no today of its own; if a list's request moves to India's today, its field must too.
  const lists: [string, CountableFilterList, (values: FilterValues) => { from?: unknown; to?: unknown }][] = [
    ['dispatch', FILTER_CONFIGS['dispatch-list'], values => {
      const filters = DISPATCH_FILTERS.toRequest(values, undefined, staff).p_filters;
      return { from: filters?.date_from, to: filters?.date_to };
    }],
    ['GRN', FILTER_CONFIGS['grn-list'], values => {
      const request = GRN_FILTERS.toRequest(values, undefined, staff);
      return { from: request.p_date_from, to: request.p_date_to };
    }],
    ['invoice', FILTER_CONFIGS['invoice-list'], values => {
      const request = INVOICE_FILTERS.toRequest(values, undefined, staff);
      return { from: request.p_date_from, to: request.p_date_to };
    }],
  ];

  it.each(lists)('the %s list', async (_name, list, requested) => {
    const field = list.fields.find(candidate => candidate.key === 'date') as DateRangeField;
    expect(field.today).toBeUndefined();
    jest.useFakeTimers({ now: SUNDAY_NIGHT });
    for (const now of [SUNDAY_NIGHT, MONDAY_MORNING, MONTH_END, MONTH_START]) {
      jest.setSystemTime(now);
      for (const preset of DATE_PRESETS) {
        const values = { date: { preset: preset.id } };
        const sent = requested(values);
        // The request names each day with India's offset: the day is the text before the time.
        expect({ now: now.toISOString(), preset: preset.id, ...(await shownDays(list, 'date', values)) }).toEqual({
          now: now.toISOString(),
          preset: preset.id,
          from: `From date, ${formatSpokenDate(String(sent.from).slice(0, 10))}`,
          to: `To date, ${formatSpokenDate(String(sent.to).slice(0, 10))}`,
        });
      }
    }
  });
});

describe('a list with nothing to count with', () => {
  it('never loads a count', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useFilterResultCount(config, {}, undefined, staff));
    expect(result.current).toEqual({ count: null, loading: false });
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toEqual({ count: null, loading: false });
  });
});
