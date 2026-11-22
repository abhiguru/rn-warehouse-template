/**
 * Load errors on the order queue are inline, never a snackbar (style guide §13.9; owner, 2026-10-17): a failed
 * refresh with orders on screen shows a strip with the load time and "Try again"; a failed next page says so in the
 * last row; offline, the top of the list says when the queue was loaded (§14.9).
 */
import React from 'react';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { OrderService } from '@/services/order-service';
import type { Order, OrderServiceResponse } from '@/types/order.types';

let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline, useNetworkStatus: () => ({ isConnected: !mockOffline }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
// A list stub that draws its header the way FlashList does, so a header remount shows.
jest.mock('@shopify/flash-list', () => {
  const ReactActual = jest.requireActual('react');
  // The stand-in draws the header and the footer (each in its own view, so a check can say which part a line is in), and keeps the list's props on a host element.
  const draw = (Part?: React.ComponentType | React.ReactElement) =>
    !Part ? null : ReactActual.isValidElement(Part) ? Part : ReactActual.createElement(Part);
  function FlashList(props: Record<string, any>) {
    return ReactActual.createElement('FlashList', props, ReactActual.createElement('View', { testID: 'list-header' }, draw(props.ListHeaderComponent)), ReactActual.createElement('View', { testID: 'list-footer' }, draw(props.ListFooterComponent)));
  }
  return { FlashList };
});
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
const mockLive: { refresh?: () => unknown; args?: unknown[] } = {};
jest.mock('@/hooks/useOrderLiveUpdates', () => ({
  useOrderLiveUpdates: (...args: unknown[]) => { mockLive.refresh = args[0] as () => unknown; mockLive.args = args; },
}));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/features/filters/configs', () => ({ ORDER_QUEUE_FILTERS: { listKey: 'order-queue' } }));
const mockHeader: { loading?: boolean } = {};
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  // The header's own `actions` slot (where the order-count badge sits) is drawn; the rest of the header is not.
  FilteredListHeader: (props: { loading?: boolean; actions?: React.ReactNode }) => { mockHeader.loading = props.loading; return props.actions ?? null; },
  filteredEmptyProps: () => ({}),
}));
const mockFilters: { request: { search?: string }; values: object } = { request: {}, values: {} };
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'supervisor', name: 'Fictional Supervisor' } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list/ListEmptyState', () => ({ ListEmptyState: () => null }));
jest.mock('@/components/list-items/CustomerOrderGroupCard', () => ({ CustomerOrderGroupCard: 'CustomerOrderGroupCard' }));
let mockRecentMounts = 0;
jest.mock('@/components/RecentDispatchedOrdersSection', () => {
  const ReactActual = jest.requireActual('react');
  return {
    __esModule: true,
    default: () => {
      ReactActual.useEffect(() => { mockRecentMounts += 1; }, []);
      return null;
    },
  };
});
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));

const getOrdersList = jest.mocked(OrderService.getOrdersList);
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) =>
  ({ id: `queue-order-${from + i}`, customer_id: 'customer-fictional-1', status: 'OPEN', item_count: 2 })) as Order[];
const answer = (data: Order[], more = false) => ({ success: true, message: '', data, metadata: { has_more: more } } as OrderServiceResponse<Order[]>);
const failure = { success: false, message: 'Warehouse connection unavailable' } as OrderServiceResponse<Order[]>;
const TIME = /\d{1,2}:\d{2} (am|pm)/;
const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const hosts = (type: string) => (screen.root ? [screen.root, ...screen.root.queryAll(() => true)] : []).filter(node => (node.type as unknown) === type);
// The list stand-in is a plain host element that keeps the list's props: the rows it was given and its refresh control
// have no role or text, so they are read from it.
const list = () => hosts('FlashList')[0];
const pullToRefresh = () => act(async () => { list().props.refreshControl.props.onRefresh(); });
const strip = (all = false) => screen.queryAllByTestId('queue-stale-strip', all ? hidden : undefined);
const startsWith = (prefix: string, all = false) => screen.queryAllByText(new RegExp(`^${prefix}`), all ? hidden : undefined);

beforeEach(() => {
  mockOffline = false;
  mockRecentMounts = 0;
  getOrdersList.mockReset();
});

it('keeps the queue after a failed refresh in a strip with the load time and Try again, until a refresh works', async () => {
  getOrdersList.mockResolvedValueOnce(answer(page(0, 2)));
  await render(<SupervisorOrderQueueList />);
  expect(strip(true)).toHaveLength(0);

  getOrdersList.mockResolvedValueOnce(failure);
  await pullToRefresh();
  expect(screen.getByText("Couldn't refresh the order queue.")).toBeOnTheScreen();
  expect(screen.getByText(new RegExp(`^Showing the orders loaded at ${TIME.source}\\.$`))).toBeOnTheScreen();
  expect(list().props.data).toHaveLength(2);
  expect(hosts('Snackbar')).toHaveLength(0);

  const retry = screen.getByTestId('queue-stale-strip-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading the order queue again');
  getOrdersList.mockResolvedValueOnce(answer(page(0, 3)));
  await user.press(retry);
  expect(strip(true)).toHaveLength(0);
  expect(list().props.data).toHaveLength(3);
});

it('says a failed next page in the last row with Try again, and appends the page when it works', async () => {
  getOrdersList.mockResolvedValueOnce(answer(page(0, 20), true));
  await render(<SupervisorOrderQueueList />);
  expect(screen.queryByTestId('queue-load-more-error-retry', hidden)).not.toBeOnTheScreen();
  expect(screen.queryAllByText('Loading more orders…', hidden)).toHaveLength(0); // the old check was no footer at all

  getOrdersList.mockResolvedValueOnce(failure);
  await fireEvent(list(), 'endReached');
  expect(screen.getByText("Couldn't load more orders.")).toBeOnTheScreen();
  const retry = screen.getByTestId('queue-load-more-error-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading more orders again');

  getOrdersList.mockResolvedValueOnce(answer(page(20, 2)));
  await user.press(retry);
  expect(list().props.data).toHaveLength(22);
  expect(screen.queryByTestId('queue-load-more-error-retry', hidden)).not.toBeOnTheScreen();
  expect(screen.queryAllByText('Loading more orders…', hidden)).toHaveLength(0); // the old check was no footer at all
  expect(screen.queryByText("Couldn't load more orders.", hidden)).not.toBeOnTheScreen();
});

it('says when the queue was loaded at the top of the list only while offline', async () => {
  getOrdersList.mockResolvedValue(answer(page(0, 2)));
  await render(<SupervisorOrderQueueList />);
  expect(startsWith('Last updated', true)).toHaveLength(0);

  mockOffline = true;
  await screen.rerender(<SupervisorOrderQueueList />);
  expect(within(screen.getByTestId('list-header')).getByText(new RegExp(`^Last updated ${TIME.source}$`))).toBeOnTheScreen();
});

it('keeps the recently dispatched section mounted when the offline line comes and goes', async () => {
  // A remount reloads the section, and offline that load fails: its count fell to 0 on the phone (2026-10-17).
  getOrdersList.mockResolvedValue(answer(page(0, 2)));
  await render(<SupervisorOrderQueueList />);
  expect(mockRecentMounts).toBe(1);
  mockOffline = true;
  await screen.rerender(<SupervisorOrderQueueList />);
  expect(startsWith('Last updated')).not.toHaveLength(0);
  mockOffline = false;
  await screen.rerender(<SupervisorOrderQueueList />);
  expect(startsWith('Last updated', true)).toHaveLength(0);
  expect(mockRecentMounts).toBe(1);
});

it('offline, the line at the top shows the date as well as the time when the queue was loaded on an earlier day (WH-220)', async () => {
  getOrdersList.mockResolvedValue(answer(page(0, 2)));
  const real = Date.now();
  jest.useFakeTimers({ now: new Date(2026, 9, 9, 16, 5), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  try {
    await render(<SupervisorOrderQueueList />);
    jest.setSystemTime(real);
    mockOffline = true;
    await screen.rerender(<SupervisorOrderQueueList />);
    expect(within(screen.getByTestId('list-header')).getByText('Last updated 09/10/26, 4:05 pm')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

it('the list offers a screen-reader Refresh action that reloads the queue like a pull, and its header has no Refresh icon (WH-220)', async () => {
  getOrdersList.mockResolvedValue(answer(page(0, 2)));
  await render(<SupervisorOrderQueueList />);
  // The action sits on the order-count badge, which a screen reader focuses (a scroll container is not offered it).
  // No query finds an element by its actions, so the host elements that carry some are collected.
  const badge = (screen.root ? [screen.root, ...screen.root.queryAll(() => true)] : [])
    .filter(node => typeof node.type === 'string' && Array.isArray(node.props.accessibilityActions));
  expect(badge).toHaveLength(1);
  expect(badge[0].props.accessibilityActions).toEqual([{ name: 'refresh', label: 'Refresh' }]);
  expect(badge[0].props.accessibilityLabel).toBe('2 orders in the queue');
  expect(list().props.accessibilityActions).toBeUndefined();
  expect(getOrdersList).toHaveBeenCalledTimes(1);
  await fireEvent(badge[0], 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
  expect(getOrdersList).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText('Refresh order queue', hidden)).not.toBeOnTheScreen();
});
