/**
 * "Recently dispatched" on the order queue: the newest `limit` (10) dispatches made from orders, under a header that counts
 * ALL of them (the server's total_count), and "See all N →" at the end of the list when there are more than are listed. It
 * is read again on a pull to refresh, and quietly when the queue is returned to (a dispatch made from an order meanwhile
 * must show without a pull): the rows and the count stay on screen while the read runs, and a read that fails leaves them
 * as they are. The answer of an older read never replaces the rows of a newer one.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import RecentDispatchedOrdersSection from '@/components/RecentDispatchedOrdersSection';
import { setLanguage } from '@/i18n';
import { getRecentDispatchedOrders } from '@/services/dispatch-service';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({
  __esModule: true,
  default: { configureNext: jest.fn(), Presets: { easeInEaseOut: {} } },
}));
jest.mock('@/services/dispatch-service', () => ({ getRecentDispatchedOrders: jest.fn() }));
jest.mock('@/components/list-items/RecentDispatchedOrderCard', () => ({ RecentDispatchedOrderCard: 'RecentDispatchedOrderCard' }));
jest.mock('@/components/ui/SectionHeader', () => ({ SectionHeader: 'SectionHeader' }));

const dispatchOf = (n: number): RecentDispatchedOrder => ({
  dispatch_id: `dispatch-${n}`,
  disp_no: `D00${n}`,
  disp_date: '2026-10-21',
  customer_id: 'c1',
  customer_name: 'Green Valley Traders',
  order_id: `order-${n}`,
  order_no: `O00${n}`,
  item_count: 1,
  total_qty: 5,
  registration: null,
  created_by_name: 'Ravi Example',
  items: [],
});
/** `count` rows, newest first; `total` is the server's count of all the order dispatches (default: no more than the rows). */
const answer = (count: number, total: number = count) => ({
  success: true as const,
  data: { total_count: total, has_more: total > count, dispatches: Array.from({ length: count }, (_, i) => dispatchOf(total - i)) },
});

const read = jest.mocked(getRecentDispatchedOrders);
let tree: ReactTestRenderer;
const header = () => tree.root.findByType('SectionHeader' as never);
const expand = async () => { await act(async () => { header().props.action.onPress(); }); };
const seeAll = () => tree.root.findAll((node) => node.props?.testID === 'recent-dispatched-see-all' && typeof node.props?.onPress === 'function');
const cards = () => tree.root.findAllByType('RecentDispatchedOrderCard' as never);
const render = async (props: Partial<React.ComponentProps<typeof RecentDispatchedOrdersSection>> = {}) => {
  await act(async () => { tree = create(<RecentDispatchedOrdersSection limit={10} {...props} />); });
};
const update = async (props: Partial<React.ComponentProps<typeof RecentDispatchedOrdersSection>>) => {
  await act(async () => { tree.update(<RecentDispatchedOrdersSection limit={10} {...props} />); });
};

beforeEach(() => {
  read.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

it('reads once on mount and shows the count of the rows it got', async () => {
  read.mockResolvedValue(answer(3));
  await render();

  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(10, 0);
  expect(header().props.count).toBe(3);
});

it('a pull to refresh (refreshTrigger) reads again and hides the count while it runs', async () => {
  read.mockResolvedValue(answer(3));
  await render({ refreshTrigger: 0 });
  let finish!: (value: ReturnType<typeof answer>) => void;
  read.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }) as never);

  await update({ refreshTrigger: 1 });

  expect(read).toHaveBeenCalledTimes(2);
  expect(header().props.count).toBeUndefined();
  await act(async () => { finish(answer(4)); });
  expect(header().props.count).toBe(4);
});

describe('a quiet refresh on a return to the queue', () => {
  it('does not read again on mount, only when the trigger changes', async () => {
    read.mockResolvedValue(answer(3));
    await render({ quietRefreshTrigger: 0 });
    expect(read).toHaveBeenCalledTimes(1);

    await update({ quietRefreshTrigger: 0 });
    expect(read).toHaveBeenCalledTimes(1);
    await update({ quietRefreshTrigger: 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps the rows and the count on screen while it reads, then shows the new dispatch', async () => {
    read.mockResolvedValue(answer(3));
    await render({ quietRefreshTrigger: 0 });
    expect(header().props.count).toBe(3);
    let finish!: (value: ReturnType<typeof answer>) => void;
    read.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }) as never);

    await update({ quietRefreshTrigger: 1 });

    // No loading state: the count is still the old one.
    expect(header().props.count).toBe(3);
    await act(async () => { finish(answer(4)); });
    expect(header().props.count).toBe(4);
  });

  it('leaves the rows as they are when the read fails, with no error shown', async () => {
    read.mockResolvedValueOnce(answer(3)).mockResolvedValueOnce({ success: false, error: 'offline' });
    await render({ quietRefreshTrigger: 0 });

    await update({ quietRefreshTrigger: 1 });

    expect(header().props.count).toBe(3);
    expect(tree.root.findAllByType('Text' as never)).toHaveLength(0);
  });

  it('leaves the rows as they are when the read throws', async () => {
    read.mockResolvedValueOnce(answer(3)).mockRejectedValueOnce(new Error('offline'));
    await render({ quietRefreshTrigger: 0 });

    await update({ quietRefreshTrigger: 1 });

    expect(header().props.count).toBe(3);
  });
});

describe('the count and the link to the full list', () => {
  it('the header counts all the order dispatches (the server\'s total), the list holds the newest 10', async () => {
    read.mockResolvedValue(answer(10, 37));
    await render({ limit: 10 });

    expect(header().props.count).toBe(37);
    await expand();
    expect(cards()).toHaveLength(10);
  });

  it('a new dispatch raises the count even when the list is full: 10 of 37 becomes 10 of 38, newest first', async () => {
    read.mockResolvedValueOnce(answer(10, 37));
    await render({ quietRefreshTrigger: 0 });
    expect(header().props.count).toBe(37);

    read.mockResolvedValueOnce(answer(10, 38));
    await update({ quietRefreshTrigger: 1 });

    expect(header().props.count).toBe(38);
    await expand();
    expect(cards()[0].props.dispatch.disp_no).toBe('D0038');
  });

  it('the link "See all 37 →" ends the opened list, has its own spoken label, and opens the full list', async () => {
    read.mockResolvedValue(answer(10, 37));
    await render();
    // Not while the section is closed.
    expect(seeAll()).toHaveLength(0);

    await expand();

    expect(seeAll().length).toBeGreaterThan(0);
    expect(seeAll()[0].props.accessibilityLabel).toBe('See all 37 recently dispatched orders');
    expect(tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))).toContain('See all 37 →');
    act(() => seeAll()[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/recent-dispatched');
  });

  it.each([
    ['ten of ten', answer(10, 10)],
    ['three of three', answer(3)],
  ])('is hidden when everything is listed (%s)', async (_name, rows) => {
    read.mockResolvedValue(rows);
    await render();
    await expand();

    expect(cards().length).toBeGreaterThan(0);
    expect(seeAll()).toHaveLength(0);
  });

  it('is hidden while the section reads again (the count is not known then) and for a failed read', async () => {
    read.mockResolvedValueOnce(answer(10, 37)).mockResolvedValueOnce({ success: false, error: 'offline' });
    await render({ refreshTrigger: 0 });
    await expand();
    expect(seeAll().length).toBeGreaterThan(0);

    await update({ refreshTrigger: 1 });

    expect(seeAll()).toHaveLength(0);
  });

  it('counts the rows it got when the server gives no total (an older server)', async () => {
    read.mockResolvedValue({ success: true as const, data: { has_more: false, dispatches: answer(4).data.dispatches } as never });
    await render();
    expect(header().props.count).toBe(4);
    await expand();
    expect(seeAll()).toHaveLength(0);
  });

  it('is in Gujarati, with Gujarati digits and the arrow', async () => {
    setLanguage('gu');
    read.mockResolvedValue(answer(10, 37));
    await render();
    await expand();

    expect(seeAll()[0].props.accessibilityLabel).toBe('તાજેતરમાં જાવક થયેલા બધા ૩૭ ઑર્ડર જુઓ');
    expect(tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))).toContain('બધી ૩૭ જુઓ →');
    setLanguage('en');
  });
});

describe('overlapping reads', () => {
  const later = () => {
    let resolve!: (value: ReturnType<typeof answer>) => void;
    const promise = new Promise<ReturnType<typeof answer>>((done) => { resolve = done; });
    return { promise, resolve };
  };

  it('the answer of an older read never replaces the rows of a newer one', async () => {
    const first = later();
    const second = later();
    read.mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    await render({ quietRefreshTrigger: 0 });
    await update({ quietRefreshTrigger: 1 });
    expect(read).toHaveBeenCalledTimes(2);

    await act(async () => { second.resolve(answer(5, 5)); });
    expect(header().props.count).toBe(5);
    // The older read answers late, with fewer rows: it is ignored.
    await act(async () => { first.resolve(answer(3, 3)); });

    expect(header().props.count).toBe(5);
  });

  it('a pull to refresh that is overtaken by a newer one does not end the newer one\'s loading early', async () => {
    read.mockResolvedValueOnce(answer(2, 2));
    await render({ refreshTrigger: 0 });
    const first = later();
    const second = later();
    read.mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    await update({ refreshTrigger: 1 });
    await update({ refreshTrigger: 2 });

    await act(async () => { first.resolve(answer(3, 3)); });
    // The newer read is still running: the count stays hidden.
    expect(header().props.count).toBeUndefined();

    await act(async () => { second.resolve(answer(4, 4)); });
    expect(header().props.count).toBe(4);
  });

  it('a quiet read that takes over from one still loading does its work: the section shows when it answers, and its failure is shown', async () => {
    const first = later();
    read.mockReturnValueOnce(first.promise as never).mockResolvedValueOnce({ success: false, error: 'offline' });
    await render({ quietRefreshTrigger: 0 });

    await update({ quietRefreshTrigger: 1 });

    // The first read was never answered; the quiet one failed, so the section shows its error rather than staying silent.
    expect(tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))).toEqual([]);
    await expand();
    expect(tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join('')).join(' ')).toContain("Couldn't load recent dispatches");
    await act(async () => { first.resolve(answer(2, 2)); });
    expect(tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join('')).join(' ')).toContain("Couldn't load recent dispatches");
  });
});
