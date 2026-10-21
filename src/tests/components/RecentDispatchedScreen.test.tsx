/**
 * The full list of recently dispatched orders (app/recent-dispatched.tsx), opened by "See all N →" on the order queue:
 * every dispatch made from an order, newest first, 20 at a time with load-more, the section's own cards, a tap opens the
 * dispatch. For administrators, supervisors and staff only.
 */
import React from 'react';
import { FlatList, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/dispatch-service', () => ({ getRecentDispatchedOrders: jest.fn() }));
jest.mock('@/components/list-items/RecentDispatchedOrderCard', () => ({ RecentDispatchedOrderCard: 'RecentDispatchedOrderCard' }));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: 'ListSkeletonCard' }));
jest.mock('@/components/list/ListEmptyState', () => ({ ListEmptyState: 'ListEmptyState' }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: 'HeaderBackButton' }));

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

let tree: ReactTestRenderer;
const open = async () => { await act(async () => { tree = create(<RecentDispatchedScreen />); }); };
const list = () => tree.root.findByType(FlatList);
const cards = () => tree.root.findAllByType('RecentDispatchedOrderCard' as never);
// A FlatList draws only its first rows in a test: the rows it holds are its data.
const rows = () => list().props.data as RecentDispatchedOrder[];
const numbers = () => rows().map((row) => row.disp_no);
const texts = () => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
const press = (id: string) => tree.root.find((node) => node.props?.testID === id && typeof node.props?.onPress === 'function');
const endReached = async () => { await act(async () => { list().props.onEndReached(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  read.mockReset();
  mockRole = 'supervisor';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
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
    expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
  });
});

describe('the list', () => {
  it('shows the section\'s cards, newest first, with the count of all of them under the title', async () => {
    serve(37);
    await open();

    expect(read).toHaveBeenCalledTimes(1);
    expect(numbers().slice(0, 3)).toEqual(['D0037', 'D0036', 'D0035']);
    expect(texts()).toContain('Recently dispatched');
    expect(tree.root.findByProps({ testID: 'recent-dispatched-count' }).props.children).toBe('37 dispatches');
  });

  it('a tap on a card opens that dispatch', async () => {
    serve(3);
    await open();

    act(() => cards()[1].props.onPress(cards()[1].props.dispatch));

    expect(router.push).toHaveBeenCalledWith('/dispatch-details/dispatch-2');
  });

  it('says so when there are none', async () => {
    serve(0);
    await open();
    expect(tree.root.findAllByType('ListEmptyState' as never)).toHaveLength(1);
  });
});

describe('load more', () => {
  it('asks for the next 20 at the end of the list, and adds them under the first, newest first', async () => {
    serve(37);
    await open();
    expect(rows()).toHaveLength(20);

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
    expect(rows()).toHaveLength(25);

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
    expect(new Set(all).size).toBe(all.length);
  });

  it('a page that fails keeps the rows and offers Try again, which asks for that page again', async () => {
    read.mockResolvedValueOnce(page(0, 20, 37) as never).mockResolvedValueOnce({ success: false, error: 'offline' });
    await open();

    await endReached();

    expect(rows()).toHaveLength(20);
    expect(texts()).toContain("Couldn't load more recent dispatches. Check your connection and try again.");
    // Scrolling does not ask again by itself: the button does.
    await endReached();
    expect(read).toHaveBeenCalledTimes(2);

    read.mockResolvedValueOnce(page(20, 20, 37) as never);
    await act(async () => { press('recent-dispatched-load-more').props.onPress(); });

    expect(read).toHaveBeenLastCalledWith(20, 20);
    expect(rows()).toHaveLength(37);
  });
});

describe('a first page that fails', () => {
  it('is an error with Try again, not an empty list', async () => {
    read.mockResolvedValueOnce({ success: false, error: 'No connection' });
    await open();

    expect(cards()).toHaveLength(0);
    expect(tree.root.findAllByType('ListEmptyState' as never)).toHaveLength(0);
    expect(texts()).toContain('No connection');

    serve(5);
    await act(async () => { press('recent-dispatched-retry').props.onPress(); });
    expect(rows()).toHaveLength(5);
  });
});

describe('pull to refresh', () => {
  it('reads the first page again and replaces the rows', async () => {
    serve(30);
    await open();
    serve(31);

    await act(async () => { list().props.refreshControl.props.onRefresh(); });

    expect(read).toHaveBeenLastCalledWith(20, 0);
    expect(numbers()[0]).toBe('D0031');
    expect(rows()).toHaveLength(20);
  });

  it('a refresh that fails keeps the rows on screen and says so in a line', async () => {
    serve(30);
    await open();
    read.mockResolvedValueOnce({ success: false, error: 'offline' });

    await act(async () => { list().props.refreshControl.props.onRefresh(); });

    expect(rows()).toHaveLength(20);
    expect(tree.root.findAllByProps({ testID: 'recent-dispatched-refresh-error' }).length).toBeGreaterThan(0);
  });

  it('the answer of an older read never replaces the rows of a newer one', async () => {
    serve(30);
    await open();
    // A first pull is slow; a second one (the list changed: 40 now) answers before it.
    let finishSlow!: (value: unknown) => void;
    read.mockReturnValueOnce(new Promise((resolve) => { finishSlow = resolve; }) as never);
    await act(async () => { list().props.refreshControl.props.onRefresh(); });
    read.mockResolvedValueOnce(page(0, 20, 40) as never);
    await act(async () => { list().props.refreshControl.props.onRefresh(); });
    expect(numbers()[0]).toBe('D0040');

    await act(async () => { finishSlow(page(0, 20, 5)); });

    expect(rows()).toHaveLength(20);
    expect(numbers()[0]).toBe('D0040');
  });
});
