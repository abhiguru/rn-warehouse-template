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
import { act, render, screen, userEvent } from '@testing-library/react-native';
import DispatchFlashList from '@/components/lists/DispatchFlashList';
import { getAssignedCustomerDispatchList, getDispatchListWithItems } from '@/services/dispatch-service';
import { resetFlashListWindow, setFlashListWindow } from '@/tests/helpers/windowedFlashListMock';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
// The windowed stand-in, with a list ref that has the scroll methods the screen calls (the stand-in's own ref would be the host element).
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const windowed = require('@/tests/helpers/windowedFlashListMock');
  const FlashList = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ scrollToOffset: () => {}, scrollToIndex: () => {} }));
    return React.createElement(windowed.FlashList, props);
  });
  return { ...windowed, FlashList };
});
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/filters/configs', () => ({ DISPATCH_FILTERS: { listKey: 'dispatch-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
// The header is the shared one; here it is a stand-in that draws its Expand all button and calls the screen's own handler.
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: ({ expand }: { expand: { expanded: boolean; onToggle: () => void } }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Expand all" accessibilityState={{ expanded: expand.expanded }} onPress={expand.onToggle}>
        <Text>Expand all</Text>
      </Pressable>
    );
  },
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

async function renderList() {
  await render(<DispatchFlashList />);
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
afterEach(() => {
  jest.restoreAllMocks();
});

const user = userEvent.setup({ delay: 0 });
const byId = (testID: string) => screen.queryByTestId(testID);
const card = (n: number) => byId(`dispatch-card-d${n}`);
const toggle = (n: number) => screen.queryByTestId(`dispatch-card-toggle-d${n}`);
const isOpen = (n: number) => Boolean(toggle(n)?.props.accessibilityState?.expanded);
const press = async (node: ReturnType<typeof screen.getByTestId>) => { await user.press(node); };
/** The list the stand-in FlashList draws, with the props the screen gave it; it has no name or test id, so it is found by its host type. */
const list = () => {
  const found = screen.root!.queryAll((node) => (node.type as unknown) === 'FlashList');
  if (found.length !== 1) throw new Error(`Expected one list, found ${found.length}`);
  return found[0];
};
const noList = () => screen.root!.queryAll((node) => (node.type as unknown) === 'FlashList').length;
const refresh = () => act(async () => { await list().props.refreshControl.props.onRefresh(); });
const endReached = () => act(async () => { await list().props.onEndReached(); });
const texts = () => screen.queryAllByText(/[\s\S]*/).map((node) => [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join(''));

describe('load errors (style guide 14.9)', () => {
  it('a failed refresh keeps the rows under a strip, and Try again loads them again', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await refresh();

    expect(byId('dispatch-stale-strip')).toBeOnTheScreen();
    // The strip says it once; a snackbar would say it a second time.
    expect(screen.getAllByText("Couldn't refresh dispatches.")).toHaveLength(1);
    expect(card(1)).toBeOnTheScreen();

    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never);
    await press(screen.getByTestId('dispatch-stale-strip-retry'));
    expect(byId('dispatch-stale-strip')).not.toBeOnTheScreen();
    expect(card(1)).toBeOnTheScreen();
  });

  it('a refresh answered only from the list saved on the phone is a failed refresh: strip, and the time of the real load', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(new Date('2026-10-18T18:26:00').getTime());
    jest.mocked(getDispatchListWithItems)
      .mockResolvedValueOnce(answer([dispatchOf(1)]) as never)
      .mockResolvedValueOnce({ ...answer([dispatchOf(1)]), fromCache: true } as never);
    await renderList();
    now.mockReturnValue(new Date('2026-10-18T18:31:00').getTime());
    await refresh();

    expect(byId('dispatch-stale-strip')).toBeOnTheScreen();
    expect(screen.getByText("Couldn't refresh dispatches.")).toBeOnTheScreen();
    expect(texts().some((text) => /6:26/.test(text) && /loaded at/.test(text))).toBe(true);
    expect(texts().some((text) => /6:31/.test(text))).toBe(false);
    expect(card(1)).toBeOnTheScreen();
  });

  it('a failed first page is the error state with Try again', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(failure as never);
    await renderList();

    expect(screen.getByText("Couldn't load dispatches")).toBeOnTheScreen();
    expect(card(1)).not.toBeOnTheScreen();

    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never);
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(card(1)).toBeOnTheScreen();
  });

  it('a failed new filter does not pass the old rows off as its answer', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    expect(card(1)).toBeOnTheScreen();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_search: 'onion' } };
    await screen.rerender(<DispatchFlashList />);

    expect(card(1)).not.toBeOnTheScreen();
    expect(byId('dispatch-stale-strip')).not.toBeOnTheScreen();
    expect(screen.getByText("Couldn't load dispatches")).toBeOnTheScreen();
  });

  it('a failed next page is the last row with Try again, which asks for the same page', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)], true) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await endReached();

    expect(byId('dispatch-load-more-error')).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load more dispatches.")).toBeOnTheScreen();
    // The footer is the way to retry: reaching the end again does not loop on a dead connection.
    await endReached();
    expect(jest.mocked(getDispatchListWithItems)).toHaveBeenCalledTimes(2);

    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(2)]) as never);
    await user.press(screen.getByRole('button', { name: 'Try loading more dispatches again' }));

    const offsets = jest.mocked(getDispatchListWithItems).mock.calls.map(([params]) => params?.offset);
    expect(offsets).toEqual([0, 1, 1]);
    expect(card(2)).toBeOnTheScreen();
    expect(byId('dispatch-load-more-error')).not.toBeOnTheScreen();
  });

  it('offline, a list sorted by number says at its top when the dispatches were loaded', async () => {
    mockOffline = true;
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1)]) as never);
    await renderList();

    expect(byId('dispatch-last-updated')).toBeOnTheScreen();
  });

  it('offline, a list with date headings says it under the first heading only', async () => {
    mockFilters = { ...mockFilters, request: { p_sort_field: 'disp_date' }, sort: { field: 'disp_date', order: 'desc' } };
    mockOffline = true;
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1, '2026-10-02'), dispatchOf(2, '2026-10-01')]) as never);
    await renderList();

    expect(screen.queryAllByTestId('dispatch-last-updated')).toHaveLength(1);
  });

  it('online, there is no last-updated line', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1)]) as never);
    await renderList();

    expect(byId('dispatch-last-updated')).not.toBeOnTheScreen();
  });
});

describe('answers from the list saved on the phone (R6-6, R6-7)', () => {
  const saved = (dispatches: ReturnType<typeof dispatchOf>[], at = new Date('2026-10-18T18:26:00').getTime(), more = false) =>
    ({ ...answer(dispatches, more), fromCache: true, cachedAt: at }) as never;

  it('a new sort answered from the saved list shows its rows: no error state, no strip', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)]) as never).mockResolvedValueOnce(saved([dispatchOf(2)]));
    await renderList();
    mockOffline = true;
    mockFilters = { ...mockFilters, request: { p_sort_field: 'disp_date', p_sort_direction: 'asc' }, sort: { field: 'disp_date', order: 'asc' } };
    await screen.rerender(<DispatchFlashList />);

    expect(card(2)).toBeOnTheScreen();
    expect(card(1)).not.toBeOnTheScreen();
    expect(screen.queryByText("Couldn't load dispatches")).not.toBeOnTheScreen();
    expect(byId('dispatch-stale-strip')).not.toBeOnTheScreen();
  });

  it('a next page answered from the saved list is added to the rows: no Try again row', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1)], true) as never).mockResolvedValueOnce(saved([dispatchOf(2)]));
    await renderList();
    await endReached();

    expect(card(1)).toBeOnTheScreen();
    expect(card(2)).toBeOnTheScreen();
    expect(byId('dispatch-load-more-error')).not.toBeOnTheScreen();
  });

  it('a first load and a new sort answered from the saved list say when it was saved, not now', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(new Date('2026-10-18T18:30:00').getTime());
    mockOffline = true;
    jest.mocked(getDispatchListWithItems)
      .mockResolvedValueOnce(saved([dispatchOf(1)], new Date('2026-10-18T18:26:00').getTime()))
      .mockResolvedValueOnce(saved([dispatchOf(2)], new Date('2026-10-18T18:27:00').getTime()));
    await renderList();
    const updated = () => texts().filter((text) => /Last updated/.test(text)).join('|');

    expect(updated()).toMatch(/6:26/);
    expect(updated()).not.toMatch(/6:30/);
    mockFilters = { ...mockFilters, request: { p_sort_field: 'disp_date', p_sort_direction: 'asc' }, sort: { field: 'disp_date', order: 'asc' } };
    await screen.rerender(<DispatchFlashList />);
    expect(card(2)).toBeOnTheScreen();
    expect(updated()).toMatch(/6:27/);
    expect(updated()).not.toMatch(/6:30/);
  });
});

describe('a customer account whose history is capped', () => {
  it('sees the footnote at the top of the list while it applies, and no snackbar', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([dispatchOf(1)], false, true) as never);
    await renderList();

    expect(byId('dispatch-history-limited')).toBeOnTheScreen();
    expect(texts().some((text) => text.startsWith('Only the newest 500 dispatches'))).toBe(true);
    // The footnote is the only place that says it; a snackbar would say it a second time.
    expect(screen.getAllByText(/^Only the newest 500 dispatches/)).toHaveLength(1);
  });

  it('does not see it when the history is not capped', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([dispatchOf(1)]) as never);
    await renderList();

    expect(byId('dispatch-history-limited')).not.toBeOnTheScreen();
  });
});

describe('a capped history with no rows', () => {
  it('still says the history is capped, in the empty state (code review 2026-10-18, R2-1)', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([], false, true) as never);
    await renderList();

    expect(byId('dispatch-history-limited')).toBeOnTheScreen();
    expect(texts().some((text) => text.startsWith('Only the newest 500 dispatches'))).toBe(true);
    expect(noList()).toBe(0);
  });

  it('says nothing when the empty answer is not capped', async () => {
    mockAccess.canManageOrders = false;
    jest.mocked(getAssignedCustomerDispatchList).mockResolvedValue(answer([], false, false) as never);
    await renderList();

    expect(byId('dispatch-history-limited')).not.toBeOnTheScreen();
  });
});

describe('paging (code review 2026-10-18, R2-2, R1-01)', () => {
  it('a failed refresh keeps the offset of the rows on screen: the next page asks after them', async () => {
    jest.mocked(getDispatchListWithItems)
      .mockResolvedValueOnce(answer([dispatchOf(1), dispatchOf(2)], true) as never)
      .mockResolvedValueOnce(answer([dispatchOf(3)], true) as never)
      .mockResolvedValueOnce(failure as never)
      .mockResolvedValueOnce(answer([dispatchOf(4)]) as never);
    await renderList();
    await endReached();
    await refresh();
    expect(byId('dispatch-stale-strip')).toBeOnTheScreen();
    await endReached();

    const offsets = jest.mocked(getDispatchListWithItems).mock.calls.map(([params]) => params?.offset);
    expect(offsets).toEqual([0, 2, 0, 3]);
  });

  it('a next page that repeats a dispatch does not show it twice, and the offset counts the raw page', async () => {
    jest.mocked(getDispatchListWithItems)
      .mockResolvedValueOnce(answer([dispatchOf(1), dispatchOf(2)], true) as never)
      .mockResolvedValueOnce(answer([dispatchOf(2), dispatchOf(3)], true) as never)
      .mockResolvedValueOnce(answer([dispatchOf(4)]) as never);
    await renderList();
    await endReached();
    await endReached();

    expect(list().props.data.filter((row: { type: string }) => row.type === 'card').map((row: { key: string }) => row.key)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(jest.mocked(getDispatchListWithItems).mock.calls.map(([params]) => params?.offset)).toEqual([0, 2, 4]);
  });
});

describe('open cards', () => {
  it('a card keeps its state when it leaves the screen and comes back, and no other card takes it', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValue(answer([dispatchOf(1), dispatchOf(2)]) as never);
    await renderList();
    await press(screen.getByTestId('dispatch-card-toggle-d1'));
    expect([isOpen(1), isOpen(2)]).toEqual([true, false]);

    // Dispatch 1 scrolls off the screen, then back.
    await act(async () => setFlashListWindow(1));
    expect(card(1)).not.toBeOnTheScreen();
    expect(isOpen(2)).toBe(false);
    await act(async () => setFlashListWindow());

    expect([isOpen(1), isOpen(2)]).toEqual([true, false]);
  });

  it('Expand all opens every card, also those loaded later; one can then be closed on its own', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(1), dispatchOf(2)], true) as never);
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(answer([dispatchOf(3)]) as never);
    await renderList();

    await user.press(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByRole('button', { name: 'Expand all' }).props.accessibilityState).toEqual({ expanded: true });
    await endReached();
    expect([1, 2, 3].map((n) => isOpen(n))).toEqual([true, true, true]);

    await press(screen.getByTestId('dispatch-card-toggle-d2'));
    expect([1, 2, 3].map((n) => isOpen(n))).toEqual([true, false, true]);
  });
});

describe('a list served from the phone\'s saved copy while the phone is online (WH-124)', () => {
  const OLD = new Date('2026-09-20T18:26:00').getTime();
  const saved = (dispatches: ReturnType<typeof dispatchOf>[]) => ({ ...answer(dispatches), fromCache: true, cachedAt: OLD }) as never;
  const updated = () => texts().filter((text) => /Last updated/.test(text)).join('|');

  it('says when the list was loaded, with its date, though the phone has a connection', async () => {
    mockOffline = false;
    jest.mocked(getDispatchListWithItems).mockResolvedValue(saved([dispatchOf(1)]));
    await renderList();

    expect(card(1)).toBeOnTheScreen();
    expect(byId('dispatch-last-updated')).toBeOnTheScreen();
    expect(updated()).toMatch(/20\/09\/26/);
    expect(updated()).toMatch(/6:26/);
  });

  it('the line goes when a later load succeeds', async () => {
    jest.mocked(getDispatchListWithItems).mockResolvedValueOnce(saved([dispatchOf(1)])).mockResolvedValueOnce(answer([dispatchOf(2)]) as never);
    await renderList();
    expect(byId('dispatch-last-updated')).toBeOnTheScreen();
    mockFilters = { ...mockFilters, request: { p_sort_field: 'disp_date', p_sort_direction: 'asc' }, sort: { field: 'disp_date', order: 'asc' } };
    await screen.rerender(<DispatchFlashList />);

    expect(card(2)).toBeOnTheScreen();
    expect(byId('dispatch-last-updated')).not.toBeOnTheScreen();
  });
});
