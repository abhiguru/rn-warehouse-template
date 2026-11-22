/**
 * R1 (performance review 2026-10-13): the dispatch list has one loading owner.
 * A search, filter or sort change loads once with the kept history (fresh=false);
 * only a real return to the screen (blur, then focus) or pull to refresh reads the
 * server again (fresh=true).
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import DispatchFlashList from '@/components/lists/DispatchFlashList';
import { getAssignedCustomerDispatchList, getDispatchListWithItems } from '@/services/dispatch-service';
import { resetScreenFocus, setScreenFocused } from './focusHarness';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
// Stand-ins that draw a view the test can find; pulling the list calls the refresh handler the screen gives it.
jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: { refreshControl?: { props: { onRefresh: () => void } } }) =>
    require('react').createElement(require('react-native').View, { testID: 'dispatch-list', onRefresh: props.refreshControl?.props.onRefresh }),
}));
jest.mock('react-native-paper', () => ({ ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => require('react').createElement(require('react-native').View, { testID: 'list-skeleton' }) }));
jest.mock('@/components/list-items', () => ({ MemoizedDispatchItem: () => null }));
jest.mock('@/components/list/ListEmptyState', () => ({ ListEmptyState: () => require('react').createElement(require('react-native').View, { testID: 'list-empty' }) }));
jest.mock('@/components/ErrorBoundary', () => ({ ErrorStateView: () => null }));
jest.mock('@/features/filters/configs', () => ({ DISPATCH_FILTERS: { listKey: 'dispatch-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({}),
}));
const mockFilters: { request: Record<string, unknown>; sort?: { field: string; order: string }; values: object } = {
  request: { p_sort_field: 'disp_date', p_sort_direction: 'desc' },
  values: {},
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/services/dispatch-service', () => ({
  CUSTOMER_DISPATCH_MAX: 500,
  getDispatchListWithItems: jest.fn(),
  getAssignedCustomerDispatchList: jest.fn(),
}));
const mockAccess = { canManageOrders: false, assignedCustomerIds: ['customer-fictional-1'] };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'customer', assignedCustomers: [{ id: 'customer-fictional-1', name: 'Fictional Farms' }] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const answer = {
  success: true,
  message: '',
  data: { dispatches: [{ dispatch_id: 'dispatch-fictional-1', id: 'dispatch-fictional-1', disp_date: '2026-10-01' }], pagination: { has_more: false } },
};

beforeEach(() => {
  resetScreenFocus();
  mockFilters.request = { p_sort_field: 'disp_date', p_sort_direction: 'desc' };
  jest.mocked(getDispatchListWithItems).mockReset().mockResolvedValue(answer as never);
  jest.mocked(getAssignedCustomerDispatchList).mockReset().mockResolvedValue(answer as never);
});

describe.each([
  ['customer account', false],
  ['warehouse role', true],
])('%s', (_name, warehouse) => {
  const service = () => jest.mocked(warehouse ? getDispatchListWithItems : getAssignedCustomerDispatchList);
  // The request each call was made with; for a customer account also whether it bypassed the kept history.
  const calls = () => service().mock.calls.map(call => {
    const params = (warehouse ? call[0] : call[1]) as Record<string, unknown>;
    return warehouse ? { search: params.p_search, sort: params.p_sort_field } : { search: params.p_search, sort: params.p_sort_field, fresh: params.p_fresh };
  });
  const fresh = (value: boolean) => (warehouse ? {} : { fresh: value });

  beforeEach(() => { mockAccess.canManageOrders = warehouse; });

  it('loads once per mount, search, filter and sort change, and once fresh on a real return', async () => {
    await render(<DispatchFlashList />);
    expect(calls()).toEqual([{ search: undefined, sort: 'disp_date', ...fresh(false) }]);

    mockFilters.request = { ...mockFilters.request, p_search: 'onion' };
    await screen.rerender(<DispatchFlashList />);
    expect(calls()).toHaveLength(2);
    expect(calls()[1]).toEqual({ search: 'onion', sort: 'disp_date', ...fresh(false) });

    mockFilters.request = { ...mockFilters.request, p_financial_year: 2026 };
    await screen.rerender(<DispatchFlashList />);
    expect(calls()).toHaveLength(3);
    expect(calls()[2]).toEqual({ search: 'onion', sort: 'disp_date', ...fresh(false) });

    mockFilters.request = { ...mockFilters.request, p_sort_field: 'disp_no' };
    await screen.rerender(<DispatchFlashList />);
    expect(calls()).toHaveLength(4);
    expect(calls()[3]).toEqual({ search: 'onion', sort: 'disp_no', ...fresh(false) });

    await act(async () => { setScreenFocused(false); });
    expect(calls()).toHaveLength(4);
    await act(async () => { setScreenFocused(true); });
    expect(calls()).toHaveLength(5);
    expect(calls()[4]).toEqual({ search: 'onion', sort: 'disp_no', ...fresh(true) });

    // Pull to refresh still reads the server.
    await fireEvent(screen.getByTestId('dispatch-list'), 'refresh');
    expect(calls()).toHaveLength(6);
    expect(calls()[5]).toEqual({ search: 'onion', sort: 'disp_no', ...fresh(true) });
  });

  it('loads a change made while hidden once on the return from the kept history, and a plain revisit fresh', async () => {
    await render(<DispatchFlashList />);
    await act(async () => { setScreenFocused(false); });
    mockFilters.request = { ...mockFilters.request, p_search: 'garlic' };
    await screen.rerender(<DispatchFlashList />);
    expect(calls()).toHaveLength(1);
    await act(async () => { setScreenFocused(true); });
    expect(calls()).toEqual([
      { search: undefined, sort: 'disp_date', ...fresh(false) },
      { search: 'garlic', sort: 'disp_date', ...fresh(false) },
    ]);

    // Away and back with nothing changed: a genuine revisit reads the server again.
    await act(async () => { setScreenFocused(false); });
    await act(async () => { setScreenFocused(true); });
    expect(calls()).toHaveLength(3);
    expect(calls()[2]).toEqual({ search: 'garlic', sort: 'disp_date', ...fresh(true) });
  });
});

it('shows the skeleton, not the empty state, while a new search with no rows on screen is pending', async () => {
  mockAccess.canManageOrders = false;
  const empty = { success: true, message: '', data: { dispatches: [], pagination: { has_more: false } } };
  jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(empty as never);
  await render(<DispatchFlashList />);
  const shown = (id: string) => screen.queryAllByTestId(id).length;
  expect(shown('list-empty')).toBe(1);

  let finish!: (value: never) => void;
  jest.mocked(getAssignedCustomerDispatchList).mockImplementationOnce(() => new Promise(resolve => { finish = resolve as (value: never) => void; }));
  mockFilters.request = { ...mockFilters.request, p_search: 'onion' };
  await screen.rerender(<DispatchFlashList />);
  expect(shown('list-skeleton')).toBe(1);
  expect(shown('list-empty')).toBe(0);
  await act(async () => { finish(empty as never); });
  expect(shown('list-empty')).toBe(1);
});
