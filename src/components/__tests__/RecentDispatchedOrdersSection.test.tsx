/**
 * "Recently dispatched" on the order queue: the most recent dispatches made from orders (at most `limit`, so its count
 * stops at 10 when ten or more exist). It is read again on a pull to refresh, and quietly when the queue is returned to
 * (a dispatch made from an order meanwhile must show without a pull): the rows and the count stay on screen while the
 * read runs, and a read that fails leaves them as they are.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import RecentDispatchedOrdersSection from '@/components/RecentDispatchedOrdersSection';
import { getRecentDispatchedOrders } from '@/services/dispatch-service';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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
const answer = (count: number) => ({
  success: true as const,
  data: { total_count: count, has_more: false, dispatches: Array.from({ length: count }, (_, i) => dispatchOf(count - i)) },
});

const read = jest.mocked(getRecentDispatchedOrders);
let tree: ReactTestRenderer;
const header = () => tree.root.findByType('SectionHeader' as never);
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

it('shows at most the limit: ten dispatches stay "10" when another is made (the oldest drops out)', async () => {
  read.mockResolvedValue(answer(10));
  await render({ quietRefreshTrigger: 0 });
  expect(header().props.count).toBe(10);

  const newest = { ...answer(10), data: { total_count: 11, has_more: true, dispatches: [dispatchOf(11), ...answer(10).data.dispatches.slice(0, 9)] } };
  read.mockResolvedValueOnce(newest);
  await update({ quietRefreshTrigger: 1 });

  expect(header().props.count).toBe(10);
});
