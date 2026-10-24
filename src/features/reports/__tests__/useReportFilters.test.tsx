/**
 * A report's filters: the period and the sort are remembered with the report
 * choices, the search and the other filters stay with the session, and
 * "Clear all" touches neither the period nor the sort.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { REPORT_DATE_PRESETS } from '@/features/filters/datePresets';
import type { FilterListConfig, FilterValues, SortState } from '@/features/filters/types';
import { applyListFilters, clearListFilters } from '@/store/slices/listFilterSlice';
import { useReportFilters } from '../useReportFilters';

const mockDispatch = jest.fn();
let mockState: Record<string, unknown> = {};
let mockServer: { origin: string; instanceId: string } | null = null;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn(), logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

type Request = { values: FilterValues; sort?: SortState };
const STATUS = {
  key: 'status',
  kind: 'choice' as const,
  label: 'Status',
  icon: 'tag-outline' as const,
  defaultValue: 'all',
  options: [{ value: 'all', label: 'All' }, { value: 'paid', label: 'Paid' }],
};
const REPORT: FilterListConfig<Request> = {
  listKey: 'report-test',
  title: 'Test report',
  noun: ['item', 'items'],
  sort: {
    options: [{ field: 'date', label: 'Date', kind: 'date' }, { field: 'bags', label: 'Bags', kind: 'number' }],
    default: { field: 'date', order: 'desc' },
  },
  fields: [
    { key: 'period', kind: 'dateRange', label: 'Period', icon: 'calendar-range', presets: REPORT_DATE_PRESETS, required: true, applyPresetOnTap: true },
    STATUS,
  ],
  fastFilters: ['status'],
  toRequest: (values, sort) => ({ values, sort }),
};
const NO_PERIOD: FilterListConfig<Request> = { ...REPORT, listKey: 'report-no-period', fields: [STATUS] };
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);

function use(config: FilterListConfig<Request>) {
  let filters!: ReturnType<typeof useReportFilters<Request>>;
  const Probe = () => {
    filters = useReportFilters(config);
    return null;
  };
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return filters;
}
const actions = () => mockDispatch.mock.calls.map(([action]) => action as { type: string; payload: Record<string, unknown> });

beforeEach(() => {
  mockDispatch.mockClear();
  mockServer = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
  mockState = {
    auth: { userProfile: { id: 'user-a', role: 'staff' } },
    listFilters: { lists: {} },
    reportPrefs: { byScope: {} },
  };
});

describe('report filters', () => {
  it('starts on the last 120 days and the report\'s own sort, with nothing counted as a filter', () => {
    const filters = use(REPORT);
    expect(filters.values).toEqual({ period: { preset: 'last120' } });
    expect(filters.sort).toEqual({ field: 'date', order: 'desc' });
    expect(filters.request).toEqual({ values: { period: { preset: 'last120' } }, sort: { field: 'date', order: 'desc' } });
    expect(filters.activeCount).toBe(0);
    expect(filters.hasAny).toBe(false);
  });

  it('reads the period and the sort this account chose before, and the session\'s filters', () => {
    mockState.reportPrefs = {
      byScope: {
        [SCOPE]: { period: { preset: 'thisFinancialYear' }, sort: { 'report-test': { field: 'bags', order: 'asc' } }, pinned: [], recent: [], lastCustomer: {}, usedAt: 1 },
        [JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-b'])]: { period: { preset: 'last420' }, sort: {}, pinned: [], recent: [], lastCustomer: {}, usedAt: 2 },
      },
    };
    mockState.listFilters = { lists: { 'report-test': { values: { status: 'paid' } } } };
    const filters = use(REPORT);
    expect(filters.values).toEqual({ status: 'paid', period: { preset: 'thisFinancialYear' } });
    expect(filters.sort).toEqual({ field: 'bags', order: 'asc' });
    expect(filters.activeCount).toBe(1);
    expect(filters.hasAny).toBe(true);
  });

  it('remembers a new period and a new sort with the report choices, not with the session', () => {
    const filters = use(REPORT);
    filters.setField('period', { preset: 'last240' });
    filters.setSort({ field: 'bags', order: 'desc' });
    expect(actions()).toEqual([
      { type: 'reportPrefs/setReportPeriod', payload: expect.objectContaining({ scope: SCOPE, period: { preset: 'last240' } }) },
      { type: 'reportPrefs/setReportSort', payload: expect.objectContaining({ scope: SCOPE, listKey: 'report-test', sort: { field: 'bags', order: 'desc' } }) },
    ]);
  });

  it('never removes the period, and keeps another filter with the session', () => {
    const filters = use(REPORT);
    filters.setField('period', undefined);
    expect(actions()).toEqual([]);
    filters.setField('status', 'paid');
    expect(actions()).toEqual([applyListFilters({ key: 'report-test', values: { status: 'paid' } })]);
  });

  it('clears the search and filters only: the period and the sort stay', () => {
    mockState.listFilters = { lists: { 'report-test': { values: { status: 'paid' } } } };
    use(REPORT).clear();
    expect(actions()).toEqual([clearListFilters({ key: 'report-test' })]);
  });

  it('applies several at once, each to where it is kept', () => {
    use(REPORT).apply({ period: { from: '2026-04-01', to: '2026-04-30' }, status: 'paid' }, { field: 'bags', order: 'asc' });
    expect(actions()).toEqual([
      { type: 'reportPrefs/setReportPeriod', payload: expect.objectContaining({ period: { from: '2026-04-01', to: '2026-04-30' } }) },
      { type: 'reportPrefs/setReportSort', payload: expect.objectContaining({ listKey: 'report-test', sort: { field: 'bags', order: 'asc' } }) },
      applyListFilters({ key: 'report-test', values: { status: 'paid' } }),
    ]);
  });

  it('gives a report without a period no period', () => {
    const filters = use(NO_PERIOD);
    expect(filters.values).toEqual({});
    expect(filters.request).toEqual({ values: {}, sort: { field: 'date', order: 'desc' } });
  });

  it('remembers nothing while no facility is selected', () => {
    mockServer = null;
    const filters = use(REPORT);
    expect(filters.values).toEqual({ period: { preset: 'last120' } });
    filters.setField('period', { preset: 'last240' });
    filters.setSort({ field: 'bags', order: 'desc' });
    expect(actions()).toEqual([]);
  });
});
