/**
 * The full list of recently dispatched orders (app/recent-dispatched.tsx), opened by "See all N →" on the order queue:
 * every dispatch made from an order, newest first, 20 at a time with load-more, the section's own cards, a tap opens the
 * dispatch. For administrators, supervisors and staff only.
 */
import React from 'react';

import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import RecentDispatchedScreen from '../../../app/recent-dispatched';
import { getRecentDispatchedOrders } from '@/services/dispatch-service';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

let mockRole: string | undefined = 'supervisor';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/dispatch-service', () => ({ getRecentDispatchedOrders: jest.fn() }));
jest.mock('@/components/list-items/RecentDispatchedOrderCard', () => ({ RecentDispatchedOrderCard: 'RecentDispatchedOrderCard' }));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: 'ListSkeletonCard' }));
jest.mock('@/components/list/ListEmptyState', () => ({ ListEmptyState: 'ListEmptyState' }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: 'HeaderBackButton' }));
// A FlatList draws only its first rows in a test: this stand-in draws the header, every row, the empty state and the
// footer, and keeps the list's props on a host element (its refresh control and its end are reached through them).
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const ReactActual = jest.requireActual('react');
  const draw = (Part: any) => (!Part ? null : ReactActual.isValidElement(Part) ? Part : ReactActual.createElement(Part));
  function FlatList(props: Record<string, any>) {
    const data = props.data ?? [];
    return ReactActual.createElement(
      'FlatList',
      props,
      draw(props.ListHeaderComponent),
      data.length === 0 ? draw(props.ListEmptyComponent) : data.map((item: unknown, index: number) =>
        ReactActual.createElement(ReactActual.Fragment, { key: props.keyExtractor ? props.keyExtractor(item, index) : index }, props.renderItem({ item, index }))),
      draw(props.ListFooterComponent)
    );
  }
  return { __esModule: true, default: FlatList };
});

const read = jest.mocked(getRecentDispatchedOrders);
const rowOf = (n: number): RecentDispatchedOrder => ({
  dispatch_id: `dispatch-${n}`,
  disp_no: `D${String(n).padStart(4, '0')}`,
  disp_date: '2026-10-21',
  customer_id: 'c1',
  customer_name: 'Green Valley Traders',
  order_id: `order-${n}`,
  order_no: `O${String(n).padStart(4, '0')}`,
  item_count: 1,
  total_qty: 5,
  registration: null,
  created_by_name: 'Ravi Example',
  items: [],
});
/** The page of `size` rows that starts at `offset` in a list of `total`, newest (highest number) first. */
const page = (offset: number, size: number, total: number) => {
  const count = Math.max(0, Math.min(size, total - offset));
  return {
    success: true as const,
    data: { total_count: total, has_more: offset + count < total, dispatches: Array.from({ length: count }, (_, i) => rowOf(total - offset - i)) },
  };
};
const serve = (total: number) => read.mockImplementation(async (limit = 10, offset = 0) => page(offset, limit, total) as never);

const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const hosts = (type: string) => screen.container.queryAll(node => (node.type as unknown) === type);
// The read is a promise: the screen is looked at once it has been answered.
const open = async () => {
  await render(<RecentDispatchedScreen />);
  await act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
};
// The list stand-in (above) is a host element that keeps the list's props: its refresh control has no role or text.
const list = () => hosts('FlatList')[0];
// The cards are a plain host stand-in (RecentDispatchedOrderCard) that holds the dispatch it was given.
const cards = (all = false) => (all ? screen.container.queryAll(node => (node.type as unknown) === 'RecentDispatchedOrderCard') : hosts('RecentDispatchedOrderCard'));
const numbers = () => cards().map((card) => (card.props.dispatch as RecentDispatchedOrder).disp_no);
const has = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const endReached = async () => { await fireEvent(list(), 'endReached'); };
const refreshList = async () => { await act(async () => { list().props.refreshControl.props.onRefresh(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  read.mockReset();
  mockRole = 'supervisor';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('who may open it', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s: the first page is asked for', async (role) => {
    mockRole = role;
    serve(3);
    await open();
    expect(read).toHaveBeenCalledWith(20, 0);
  });

  it.each(['customer', undefined])('%s: nothing is asked for and no dispatch is shown', async (role) => {
    mockRole = role;
    serve(3);
    await open();
    expect(read).not.toHaveBeenCalled();
    expect(hosts('FlatList')).toHaveLength(0);
    expect(cards(true)).toHaveLength(0);
  });
});

describe('the list', () => {
  it('shows the section\'s cards, newest first, with the count of all of them under the title', async () => {
    serve(37);
    await open();

    expect(read).toHaveBeenCalledTimes(1);
    expect(numbers().slice(0, 3)).toEqual(['D0037', 'D0036', 'D0035']);
    has('Recently dispatched');
    expect(screen.getByTestId('recent-dispatched-count')).toHaveTextContent('37 dispatches');
  });

  it('a tap on a card opens that dispatch', async () => {
    serve(3);
    await open();

    // The card is a plain host stand-in: its own press is its prop, called with the dispatch as the card calls it.
    const card = cards()[1];
    await act(async () => { card.props.onPress(card.props.dispatch); });

    expect(router.push).toHaveBeenCalledWith('/dispatch-details/dispatch-2');
  });

  it('says so when there are none', async () => {
    serve(0);
    await open();
    expect(hosts('ListEmptyState')).toHaveLength(1);
  });
});

describe('load more', () => {
  it('asks for the next 20 at the end of the list, and adds them under the first, newest first', async () => {
    serve(37);
    await open();
    expect(cards()).toHaveLength(20);

    await endReached();

    expect(read).toHaveBeenLastCalledWith(20, 20);
    expect(numbers()).toHaveLength(37);
    expect(numbers().slice(18, 22)).toEqual(['D0019', 'D0018', 'D0017', 'D0016']);
    expect(numbers()[numbers().length - 1]).toBe('D0001');
  });

  it('stops when the server says there are no more', async () => {
    serve(25);
    await open();
    await endReached();
    expect(cards()).toHaveLength(25);

    await endReached();
    await endReached();

    expect(read).toHaveBeenCalledTimes(2);
  });

  it('never shows a dispatch twice when new ones were made between the pages', async () => {
    read.mockResolvedValueOnce(page(0, 20, 30) as never);
    await open();
    // Two dispatches were made since: the second page starts two rows earlier, so two it already showed come again.
    read.mockResolvedValueOnce({
      success: true as const,
      data: { total_count: 32, has_more: false, dispatches: Array.from({ length: 12 }, (_, i) => rowOf(32 - 20 - i)) },
    } as never);

    await endReached();

    const all = numbers();
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all).size).toBe(all.length);
  });

  it('a page that fails keeps the rows and offers Try again, which asks for that page again', async () => {
    read.mockResolvedValueOnce(page(0, 20, 37) as never).mockResolvedValueOnce({ success: false, error: 'offline' });
    await open();

    await endReached();

    expect(cards()).toHaveLength(20);
    has("Couldn't load more recent dispatches. Check your connection and try again.");
    // Scrolling does not ask again by itself: the button does.
    await endReached();
    expect(read).toHaveBeenCalledTimes(2);

    read.mockResolvedValueOnce(page(20, 20, 37) as never);
    await user.press(screen.getByTestId('recent-dispatched-load-more'));

    expect(read).toHaveBeenLastCalledWith(20, 20);
    expect(cards()).toHaveLength(37);
  });
});

describe('a first page that fails', () => {
  it('is an error with Try again, not an empty list', async () => {
    read.mockResolvedValueOnce({ success: false, error: 'No connection' });
    await open();

    expect(cards(true)).toHaveLength(0);
    expect(hosts('ListEmptyState')).toHaveLength(0);
    has('No connection');

    serve(5);
    await user.press(screen.getByTestId('recent-dispatched-retry'));
    expect(cards()).toHaveLength(5);
  });
});

describe('pull to refresh', () => {
  it('reads the first page again and replaces the rows', async () => {
    serve(30);
    await open();
    serve(31);

    await refreshList();

    expect(read).toHaveBeenLastCalledWith(20, 0);
    expect(numbers()[0]).toBe('D0031');
    expect(cards()).toHaveLength(20);
  });

  it('a refresh that fails keeps the rows on screen and says so in a line', async () => {
    serve(30);
    await open();
    read.mockResolvedValueOnce({ success: false, error: 'offline' });

    await refreshList();

    expect(cards()).toHaveLength(20);
    expect(screen.queryAllByTestId('recent-dispatched-refresh-error').length).toBeGreaterThan(0);
  });

  it('the answer of an older read never replaces the rows of a newer one', async () => {
    serve(30);
    await open();
    // A first pull is slow; a second one (the list changed: 40 now) answers before it.
    let finishSlow!: (value: unknown) => void;
    read.mockReturnValueOnce(new Promise((resolve) => { finishSlow = resolve; }) as never);
    await refreshList();
    read.mockResolvedValueOnce(page(0, 20, 40) as never);
    await refreshList();
    expect(numbers()[0]).toBe('D0040');

    await act(async () => { finishSlow(page(0, 20, 5)); });

    expect(cards()).toHaveLength(20);
    expect(numbers()[0]).toBe('D0040');
  });
});

describe('screen-reader Refresh (WH-220)', () => {
  it('the title offers a Refresh action that reads the first page again', async () => {
    serve(3);
    await open();
    // No query finds an element by its actions, so the host elements that carry some are collected.
    const targets = screen.container.queryAll(node => typeof node.type === 'string'
      && Array.isArray(node.props.accessibilityActions) && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'refresh'));
    expect(targets).toHaveLength(1);
    const target = targets[0];
    expect(target.type).toBe('Text');
    expect(target.props.accessibilityActions).toContainEqual({ name: 'refresh', label: 'Refresh' });
    const before = read.mock.calls.length;
    await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
    expect(read.mock.calls.length).toBe(before + 1);
    expect(read).toHaveBeenLastCalledWith(20, 0);
  });
});
