/**
 * The silent refresh of the order lists asks for at most 200 rows (the server holds a page to 200, backend migration 135)
 * and keeps the rows beyond them, merged by id, instead of the list shrinking to 200.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderFlashList from '@/components/lists/OrderFlashList';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { OrderService } from '@/services/order-service';
import type { Order } from '@/types/order.types';
import { resetScreenFocus } from './focusHarness';

// The "Waiting for the connection…" text reads the network state from NetInfo (a native module): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
  useIsFocused: () => require('./focusHarness').isScreenFocused(),
}));
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:18000', anonKey: 'public-key' }),
  ensureValidTokens: jest.fn().mockResolvedValue(true),
  getStoredToken: jest.fn().mockResolvedValue({ isValid: true, authToken: 'fictional-token' }),
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }), useIsOffline: () => false }));
jest.mock('@/services/order-service', () => ({
  OrderService: { getOrCreateOrder: jest.fn(), getCustomerOrder: jest.fn(), getOrderWithItems: jest.fn(), getOrdersList: jest.fn() },
}));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/components/OrderItemCard', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/RecentDispatchesSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/CustomerOrderSummary', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ItemCatalogBrowser', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/RecentDispatchedOrdersSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/list-items/CustomerOrderGroupCard', () => ({ CustomerOrderGroupCard: 'CustomerOrderGroupCard' }));
jest.mock('@/components/list-items', () => ({ MemoizedOrderItem: () => null }));
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list/ListEmptyState', () => ({ ListEmptyState: () => null }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/features/filters/configs', () => ({ ORDER_FILTERS: { listKey: 'order-list' }, ORDER_QUEUE_FILTERS: { listKey: 'order-queue' } }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({}),
}));
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => ({ request: {}, values: {} }) }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'admin', name: 'Fictional Administrator' } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));


const service = jest.mocked(OrderService);
const orders = (from: number, to: number, mark = 'old'): Order[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    id: `order-${from + i}`, customer_id: 'c1', created_at: '2026-10-01T08:00:00Z', mark, item_count: 1,
    customer: { id: 'c1', name: 'Fictional Farms' }, items: [{ id: `l${from + i}`, order_id: `order-${from + i}`, grn_item_id: 'lot', requested_quantity: 1, created_at: '' }],
  }) as unknown as Order);
/** The order rows of the list, whatever its row wrapper (headers and groups are left out). */
const rowsOf = (data: unknown[]): (Order & { mark: string })[] =>
  data.map(row => ((row as { data?: unknown }).data ?? row) as Order & { mark: string }).filter(row => typeof row.id === 'string' && row.id.startsWith('order-'));
const settle = () => act(async () => { await jest.advanceTimersByTimeAsync(200); });
const interval = () => act(async () => { await jest.advanceTimersByTimeAsync(15_000); });

let originalState: typeof AppState.currentState;
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => undefined }));
  originalState = AppState.currentState;
  AppState.currentState = 'active';
  resetScreenFocus();
  service.getOrdersList.mockReset();
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe.each([
  ['orders list', () => <OrderFlashList />],
  ['order queue', () => <SupervisorOrderQueueList />],
])('%s', (_name, element) => {
  it('refreshes 300 shown rows with a request for 200, and keeps the other 100', async () => {
    service.getOrdersList
      .mockResolvedValueOnce({ success: true, data: orders(1, 200), metadata: { has_more: true, total_count: 300 } } as never)
      .mockResolvedValueOnce({ success: true, data: orders(201, 300), metadata: { has_more: false, total_count: 300 } } as never);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element()); });
    await settle();
    const list = () => renderer.root.findByType('FlashList' as never);
    await act(async () => { list().props.onEndReached(); });
    await settle();
    expect(rowsOf(list().props.data)).toHaveLength(300);

    service.getOrdersList.mockResolvedValue({ success: true, data: orders(1, 200, 'new'), metadata: { has_more: true, total_count: 300 } } as never);
    await interval();

    const refresh = service.getOrdersList.mock.calls.at(-1)![0] as { limit: number; offset: number };
    expect(refresh).toMatchObject({ limit: 200, offset: 0 });
    const data = rowsOf(list().props.data);
    expect(data).toHaveLength(300);
    expect(data[0].mark).toBe('new');
    expect(data[199].mark).toBe('new');
    expect(data[200]).toMatchObject({ id: 'order-201', mark: 'old' });
    // The next refresh still asks for 200, not for the 300 shown.
    await interval();
    expect((service.getOrdersList.mock.calls.at(-1)![0] as { limit: number }).limit).toBe(200);
    expect(rowsOf(list().props.data)).toHaveLength(300);
    await act(async () => { renderer.unmount(); });
  });

  it('asks for exactly the rows shown while that is 200 or fewer', async () => {
    service.getOrdersList.mockResolvedValue({ success: true, data: orders(1, 60), metadata: { has_more: false, total_count: 60 } } as never);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element()); });
    await settle();
    await interval();
    expect((service.getOrdersList.mock.calls.at(-1)![0] as { limit: number }).limit).toBe(60);
    expect(rowsOf(renderer.root.findByType('FlashList' as never).props.data)).toHaveLength(60);
    await act(async () => { renderer.unmount(); });
  });
});
