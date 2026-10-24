/**
 * R1 + R4 (performance review 2026-10-13), end to end through the real live updates
 * hook: leaving an order screen and coming back costs exactly one load in total. The
 * order editor's one load is the hook's catch-up; the orders list's and queue's is
 * their own return load. A screen that is not shown, or an app in the background,
 * reads nothing on the 15 s timer. A trip to the background while shown also costs
 * exactly one load, for the lists too.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderManagement from '@/components/OrderManagement';
import OrderFlashList from '@/components/lists/OrderFlashList';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { OrderService } from '@/services/order-service';
import type { Order } from '@/types/order.types';
import { resetScreenFocus, setScreenFocused } from './focusHarness';

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
  OrderService: { getOrCreateOrder: jest.fn(), getOrderWithItems: jest.fn(), getOrdersList: jest.fn() },
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

const order = {
  id: 'order-fictional-1', customer_id: 'customer-fictional-1', created_at: '2026-10-01T08:00:00Z',
  customer: { id: 'customer-fictional-1', name: 'Fictional Farms' },
  items: [{ id: 'line-1', order_id: 'order-fictional-1', grn_item_id: 'lot-1', requested_quantity: 2, created_at: '' }],
} as Order;
const service = jest.mocked(OrderService);
// Past the 150 ms of a load; the timer of the hook is not reached.
const settle = () => act(async () => { await jest.advanceTimersByTimeAsync(200); });
// One 15 s interval of the order screens' timer.
const interval = () => act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
let originalState: typeof AppState.currentState;
// The app's AppState listeners; appState() is the app moving to that state.
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const appState = (state: AppStateStatus) => act(async () => {
  appStateListeners.forEach(listener => listener(state));
});

beforeEach(() => {
  jest.useFakeTimers();
  appStateListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => { appStateListeners.delete(listener); } };
  });
  resetScreenFocus();
  service.getOrCreateOrder.mockReset().mockResolvedValue({ success: true, data: { cart_id: order.id } } as never);
  service.getOrderWithItems.mockReset().mockResolvedValue({ success: true, data: order } as never);
  service.getOrdersList.mockReset().mockResolvedValue({ success: true, data: [order], metadata: { has_more: false } } as never);
  originalState = AppState.currentState;
  AppState.currentState = 'active';
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe.each([
  ['order editor', () => <OrderManagement customerId="customer-fictional-1" />, () => service.getOrderWithItems],
  ['orders list', () => <OrderFlashList />, () => service.getOrdersList],
  ['order queue', () => <SupervisorOrderQueueList />, () => service.getOrdersList],
])('%s', (_name, element, loads) => {
  it('costs one load per return and one per interval while shown', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element()); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(1);
    // Shown: the timer reads again after 15 s.
    await interval();
    expect(loads()).toHaveBeenCalledTimes(2);

    // Another screen covers this one: nothing is read, however long it stays covered.
    await act(async () => { setScreenFocused(false); renderer.update(element()); });
    await interval();
    await interval();
    expect(loads()).toHaveBeenCalledTimes(2);

    // Back: exactly one load for the return, then the timer goes on.
    await act(async () => { setScreenFocused(true); renderer.update(element()); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(3);
    await interval();
    expect(loads()).toHaveBeenCalledTimes(4);
    await act(async () => { renderer.unmount(); });
    await interval();
    expect(loads()).toHaveBeenCalledTimes(4);
  });

  it('costs one load for a trip to the background while shown', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element()); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(1);

    // In the background nothing is read.
    await appState('background');
    await interval();
    await interval();
    expect(loads()).toHaveBeenCalledTimes(1);

    // Back in the foreground: one catch-up load, then the timer goes on.
    await appState('active');
    await settle();
    expect(loads()).toHaveBeenCalledTimes(2);
    await interval();
    expect(loads()).toHaveBeenCalledTimes(3);
    await act(async () => { renderer.unmount(); });
  });
});
