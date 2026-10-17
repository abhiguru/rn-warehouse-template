/**
 * Load errors on the order queue are inline, never a snackbar (style guide §13.9; owner, 2026-10-17): a failed
 * refresh with orders on screen shows a strip with the load time and "Try again"; a failed next page says so in the
 * last row; offline, the top of the list says when the queue was loaded (§14.9).
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { OrderService } from '@/services/order-service';
import type { Order, OrderServiceResponse } from '@/types/order.types';
import { FlashList } from '@shopify/flash-list';

let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline, useNetworkStatus: () => ({ isConnected: !mockOffline }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
// A list stub that draws its header the way FlashList does, so a header remount shows.
jest.mock('@shopify/flash-list', () => {
  const ReactActual = jest.requireActual('react');
  function FlashList(props: { ListHeaderComponent?: React.ComponentType | React.ReactElement }) {
    const Header = props.ListHeaderComponent;
    if (!Header) return null;
    return ReactActual.isValidElement(Header) ? Header : ReactActual.createElement(Header);
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
  FilteredListHeader: (props: { loading?: boolean }) => { mockHeader.loading = props.loading; return null; },
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

type Tree = ReturnType<typeof create>;
const getOrdersList = jest.mocked(OrderService.getOrdersList);
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) =>
  ({ id: `queue-order-${from + i}`, customer_id: 'customer-fictional-1', status: 'OPEN', item_count: 2 })) as Order[];
const answer = (data: Order[], more = false) => ({ success: true, message: '', data, metadata: { has_more: more } } as OrderServiceResponse<Order[]>);
const failure = { success: false, message: 'Warehouse connection unavailable' } as OrderServiceResponse<Order[]>;
const TIME = /\d{1,2}:\d{2} (am|pm)/;
const texts = (tree: Tree) => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const list = (tree: Tree) => tree.root.findByType(FlashList as unknown as React.ElementType);
const pullToRefresh = (tree: Tree) => list(tree).props.refreshControl.props.onRefresh();
const strip = (tree: Tree) => tree.root.findAll(node => node.props.testID === 'queue-stale-strip');
const pressable = (tree: Tree, testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const draw = (element: React.ReactElement) => {
  let drawn!: Tree;
  act(() => { drawn = create(element); });
  return drawn;
};
const part = (tree: Tree, name: 'ListFooterComponent' | 'ListHeaderComponent') => {
  const Part = list(tree).props[name];
  if (!Part) return null;
  return draw(React.isValidElement(Part) ? Part : React.createElement(Part));
};

beforeEach(() => {
  mockOffline = false;
  mockRecentMounts = 0;
  getOrdersList.mockReset();
});

it('keeps the queue after a failed refresh in a strip with the load time and Try again, until a refresh works', async () => {
  getOrdersList.mockResolvedValueOnce(answer(page(0, 2)));
  let tree!: Tree;
  await act(async () => { tree = create(<SupervisorOrderQueueList />); });
  expect(strip(tree)).toHaveLength(0);

  getOrdersList.mockResolvedValueOnce(failure);
  await act(async () => { pullToRefresh(tree); });
  expect(texts(tree)).toContain("Couldn't refresh the order queue.");
  expect(texts(tree).find(text => text.startsWith('Showing the orders loaded at ')))
    .toMatch(new RegExp(`^Showing the orders loaded at ${TIME.source}\\.$`));
  expect(list(tree).props.data).toHaveLength(2);
  expect(tree.root.findAll(node => node.type === ('Snackbar' as unknown))).toHaveLength(0);

  const retry = pressable(tree, 'queue-stale-strip-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading the order queue again');
  getOrdersList.mockResolvedValueOnce(answer(page(0, 3)));
  await act(async () => { retry.props.onPress(); });
  expect(strip(tree)).toHaveLength(0);
  expect(list(tree).props.data).toHaveLength(3);
  await act(async () => { tree.unmount(); });
});

it('says a failed next page in the last row with Try again, and appends the page when it works', async () => {
  getOrdersList.mockResolvedValueOnce(answer(page(0, 20), true));
  let tree!: Tree;
  await act(async () => { tree = create(<SupervisorOrderQueueList />); });
  expect(part(tree, 'ListFooterComponent')).toBeNull();

  getOrdersList.mockResolvedValueOnce(failure);
  await act(async () => { await list(tree).props.onEndReached(); });
  const failed = part(tree, 'ListFooterComponent')!;
  expect(texts(failed)).toContain("Couldn't load more orders.");
  const retry = pressable(failed, 'queue-load-more-error-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading more orders again');

  getOrdersList.mockResolvedValueOnce(answer(page(20, 2)));
  await act(async () => { await retry.props.onPress(); });
  expect(list(tree).props.data).toHaveLength(22);
  expect(part(tree, 'ListFooterComponent')).toBeNull();
  await act(async () => { tree.unmount(); });
});

it('says when the queue was loaded at the top of the list only while offline', async () => {
  getOrdersList.mockResolvedValue(answer(page(0, 2)));
  let tree!: Tree;
  await act(async () => { tree = create(<SupervisorOrderQueueList />); });
  expect(texts(part(tree, 'ListHeaderComponent')!).some(text => text.startsWith('Last updated'))).toBe(false);

  mockOffline = true;
  await act(async () => { tree.update(<SupervisorOrderQueueList />); });
  expect(texts(part(tree, 'ListHeaderComponent')!).find(text => text.startsWith('Last updated')))
    .toMatch(new RegExp(`^Last updated ${TIME.source}$`));
  await act(async () => { tree.unmount(); });
});

it('keeps the recently dispatched section mounted when the offline line comes and goes', async () => {
  // A remount reloads the section, and offline that load fails: its count fell to 0 on the phone (2026-10-17).
  getOrdersList.mockResolvedValue(answer(page(0, 2)));
  let tree!: Tree;
  await act(async () => { tree = create(<SupervisorOrderQueueList />); });
  expect(mockRecentMounts).toBe(1);
  mockOffline = true;
  await act(async () => { tree.update(<SupervisorOrderQueueList />); });
  expect(texts(tree).some(text => text.startsWith('Last updated'))).toBe(true);
  mockOffline = false;
  await act(async () => { tree.update(<SupervisorOrderQueueList />); });
  expect(texts(tree).some(text => text.startsWith('Last updated'))).toBe(false);
  expect(mockRecentMounts).toBe(1);
  await act(async () => { tree.unmount(); });
});
