/**
 * The Dispatch tab after the 2026-10-18 list review (style guide 13.6, 14.9):
 *
 *  - A failed refresh keeps the rows under a strip; a failed first page or new filter is the error state;
 *    a failed next page is the last row with Try again; offline, the first heading (or the top of a flat
 *    list) says when the rows were loaded. No snackbar.
 *  - A customer account's capped history is a footnote at the top of the list, while it applies.
 *  - Which cards are open is kept by the list: a card that leaves the screen and comes back keeps its
 *    state, and no other card takes it. Expand all also opens the cards loaded later.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import DispatchFlashList from '@/components/lists/DispatchFlashList';
import { getAssignedCustomerDispatchList, getDispatchListWithItems } from '@/services/dispatch-service';
import { resetFlashListWindow, setFlashListWindow } from '@/tests/helpers/windowedFlashListMock';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/features/filters/configs', () => ({ DISPATCH_FILTERS: { listKey: 'dispatch-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
// The header is the shared one; here it is a host element that keeps its props.
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: (props: object) => require('react').createElement('FilteredListHeader', props),
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
let mockFilters = {
  request: { p_sort_field: 'disp_no', p_sort_direction: 'desc' } as Record<string, unknown>,
  sort: { field: 'disp_no', order: 'desc' },
  values: {},
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/services/dispatch-service', () => ({
  CUSTOMER_DISPATCH_MAX: 500,
  getDispatchListWithItems: jest.fn(),
  getAssignedCustomerDispatchList: jest.fn(),
}));
const mockAccess = { canManageOrders: true, assignedCustomerIds: ['customer-fictional-1'] };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'staff', assignedCustomers: [{ id: 'customer-fictional-1', name: 'Fictional Farms' }] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

/** Dispatch `n` with one line. */
const dispatchOf = (n: number, date = '2026-10-01') => ({
  id: `d${n}`,
  dispatch_id: `d${n}`,
  disp_no: `DD${String(n).padStart(4, '0')}`,
  disp_date: date,
  customer_id: 'customer-fictional-1',
  customer_name: 'Fictional Farms',
  total_qty: 5,
  total_items: 1,
  items: [{ grn_item_id: `d${n}-line`, item_name: `Fictional item ${n}`, disp_qty: 5, grn_qty: 10, gr_no: 'RV1', weight: 50, rack: null, package_mark: null }],
});
const answer = (dispatches: ReturnType<typeof dispatchOf>[], more = false, limited = false) => ({
  success: true,
  message: '',
  data: { dispatches, pagination: { has_more: more, history_limit_reached: limited } },
});
const failure = { success: false, message: 'Network unavailable', data: null };

const mounted: ReactTestRenderer[] = [];
async function renderList() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<DispatchFlashList />);
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getDispatchListWithItems).mockReset();
  jest.mocked(getAssignedCustomerDispatchList).mockReset();
  resetFlashListWindow();
  mockFilters = { ...mockFilters, request: { p_sort_field: 'disp_no', p_sort_direction: 'desc' }, sort: { field: 'disp_no', order: 'desc' } };
  mockAccess.canManageOrders = true;
  mockOffline = false;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

const host = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0];
const card = (tree: ReactTestRenderer, n: number) => host(tree, `dispatch-card-d${n}`);
const pressable = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const toggle = (tree: ReactTestRenderer, n: number) => pressable(tree, `dispatch-card-toggle-d${n}`);
const isOpen = (tree: ReactTestRenderer, n: number) => Boolean(toggle(tree, n)?.props.accessibilityState?.expanded);
const press = (node: ReactTestInstance) => act(async () => { await node.props.onPress(); });
const list = (tree: ReactTestRenderer) => tree.root.findByType('FlashList' as never);
const header = (tree: ReactTestRenderer) => tree.root.findByType('FilteredListHeader' as never);
const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join(''));

describe('load errors (style guide 14.9)', () => {
  it('a failed refresh keeps the rows under a strip, and Try again loads them again', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.refreshControl.props.onRefresh(); });

    expect(host(tree, 'dispatch-stale-strip')).toBeDefined();
    expect(texts(tree)).toContain("Couldn't refresh dispatches.");
    expect(card(tree, 1)).toBeDefined();
    expect(host(tree, 'Snackbar')).toBeUndefined();

    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never);
    await press(pressable(tree, 'dispatch-stale-strip-retry'));
    expect(host(tree, 'dispatch-stale-strip')).toBeUndefined();
    expect(card(tree, 1)).toBeDefined();
  });

  it('a failed first page is the error state with Try again', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(failure as never);
    const tree = await renderList();

    expect(texts(tree)).toContain("Couldn't load dispatches");
    expect(card(tree, 1)).toBeUndefined();

    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never);
    const errorView = tree.root.findAll((node) => node.props.presentation === 'inline' && typeof node.props.onRetry === 'function')[0];
    await act(async () => { await errorView.props.onRetry(); });
    expect(card(tree, 1)).toBeDefined();
  });

  it('a failed new filter does not pass the old rows off as its answer', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    expect(card(tree, 1)).toBeDefined();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_search: 'onion' } };
    await act(async () => { tree.update(<DispatchFlashList />); });

    expect(card(tree, 1)).toBeUndefined();
    expect(host(tree, 'dispatch-stale-strip')).toBeUndefined();
    expect(texts(tree)).toContain("Couldn't load dispatches");
  });

  it('a failed next page is the last row with Try again, which asks for the same page', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)], true) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(host(tree, 'dispatch-load-more-error')).toBeDefined();
    expect(texts(tree)).toContain("Couldn't load more dispatches.");
    // The footer is the way to retry: reaching the end again does not loop on a dead connection.
    await act(async () => { await list(tree).props.onEndReached(); });
    expect(jest.mocked(getDispatchListWithItems)).toHaveBeenCalledTimes(2);

    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(2)]) as never);
    await press(tree.root.findAll((node) => node.props.accessibilityLabel === 'Try loading more dispatches again' && typeof node.props.onPress === 'function')[0]);

    const offsets = jest.mocked(getDispatchListWithItems).mock.calls.map(([params]) => params?.offset);
    expect(offsets).toEqual([0, 1, 1]);
    expect(card(tree, 2)).toBeDefined();
    expect(host(tree, 'dispatch-load-more-error')).toBeUndefined();
  });

  it('offline, a list sorted by number says at its top when the dispatches were loaded', async () => {
    mockOffline = true;
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1)]) as never);
    const tree = await renderList();

    expect(host(tree, 'dispatch-last-updated')).toBeDefined();
  });

  it('offline, a list with date headings says it under the first heading only', async () => {
    mockFilters = { ...mockFilters, request: { p_sort_field: 'disp_date' }, sort: { field: 'disp_date', order: 'desc' } };
    mockOffline = true;
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1, '2026-10-02'), dispatchOf(2, '2026-10-01')]) as never);
    const tree = await renderList();

    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'dispatch-last-updated')).toHaveLength(1);
  });

  it('online, there is no last-updated line', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1)]) as never);
    const tree = await renderList();

    expect(host(tree, 'dispatch-last-updated')).toBeUndefined();
  });
});

describe('a customer account whose history is capped', () => {
  it('sees the footnote at the top of the list while it applies, and no snackbar', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([dispatchOf(1)], false, true) as never);
    const tree = await renderList();

    expect(host(tree, 'dispatch-history-limited')).toBeDefined();
    expect(texts(tree).some((text) => text.startsWith('Only the newest 500 dispatches'))).toBe(true);
    expect(tree.root.findAll((node) => (node.type as unknown) === 'Snackbar')).toHaveLength(0);
  });

  it('does not see it when the history is not capped', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([dispatchOf(1)]) as never);
    const tree = await renderList();

    expect(host(tree, 'dispatch-history-limited')).toBeUndefined();
  });
});

describe('a capped history with no rows', () => {
  it('still says the history is capped, in the empty state (code review 2026-10-18, R2-1)', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([], false, true) as never);
    const tree = await renderList();

    expect(host(tree, 'dispatch-history-limited')).toBeDefined();
    expect(texts(tree).some((text) => text.startsWith('Only the newest 500 dispatches'))).toBe(true);
    expect(tree.root.findAllByType('FlashList' as never)).toHaveLength(0);
  });

  it('says nothing when the empty answer is not capped', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([], false, false) as never);
    const tree = await renderList();

    expect(host(tree, 'dispatch-history-limited')).toBeUndefined();
  });
});

describe('paging (code review 2026-10-18, R2-2, R1-01)', () => {
  it('a failed refresh keeps the offset of the rows on screen: the next page asks after them', async () => {
    jest.mocked(getDispatchListWithItems)
      .mockResolvedValueOnce(answer([dispatchOf(1), dispatchOf(2)], true) as never)
      .mockResolvedValueOnce(answer([dispatchOf(3)], true) as never)
      .mockResolvedValueOnce(failure as never)
      .mockResolvedValueOnce(answer([dispatchOf(4)]) as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });
    await act(async () => { await list(tree).props.refreshControl.props.onRefresh(); });
    expect(host(tree, 'dispatch-stale-strip')).toBeDefined();
    await act(async () => { await list(tree).props.onEndReached(); });

    const offsets = jest.mocked(getDispatchListWithItems).mock.calls.map(([params]) => params?.offset);
    expect(offsets).toEqual([0, 2, 0, 3]);
  });

  it('a next page that repeats a dispatch does not show it twice, and the offset counts the raw page', async () => {
    jest.mocked(getDispatchListWithItems)
      .mockResolvedValueOnce(answer([dispatchOf(1), dispatchOf(2)], true) as never)
      .mockResolvedValueOnce(answer([dispatchOf(2), dispatchOf(3)], true) as never)
      .mockResolvedValueOnce(answer([dispatchOf(4)]) as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(list(tree).props.data.filter((row: { type: string }) => row.type === 'card').map((row: { key: string }) => row.key)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(jest.mocked(getDispatchListWithItems).mock.calls.map(([params]) => params?.offset)).toEqual([0, 2, 4]);
  });
});

describe('open cards', () => {
  it('a card keeps its state when it leaves the screen and comes back, and no other card takes it', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1), dispatchOf(2)]) as never);
    const tree = await renderList();
    await press(toggle(tree, 1));
    expect([isOpen(tree, 1), isOpen(tree, 2)]).toEqual([true, false]);

    // Dispatch 1 scrolls off the screen, then back.
    act(() => setFlashListWindow(1));
    expect(card(tree, 1)).toBeUndefined();
    expect(isOpen(tree, 2)).toBe(false);
    act(() => setFlashListWindow());

    expect([isOpen(tree, 1), isOpen(tree, 2)]).toEqual([true, false]);
  });

  it('Expand all opens every card, also those loaded later; one can then be closed on its own', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1), dispatchOf(2)], true) as never);
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(3)]) as never);
    const tree = await renderList();

    act(() => header(tree).props.expand.onToggle());
    expect(header(tree).props.expand.expanded).toBe(true);
    await act(async () => { await list(tree).props.onEndReached(); });
    expect([1, 2, 3].map((n) => isOpen(tree, n))).toEqual([true, true, true]);

    await press(toggle(tree, 2));
    expect([1, 2, 3].map((n) => isOpen(tree, n))).toEqual([true, false, true]);
  });
});
