/**
 * R1 + R4 (performance review 2026-10-13), end to end through the real live updates
 * hook and the real subscription service: leaving an order screen and coming back
 * costs exactly one load in total. The order editor's one load is the hook's catch-up;
 * the orders list's and queue's is their own return load. The first join of the new
 * subscription adds nothing; a later rejoin still catches up. Fix round 1 (M1): a trip
 * to the background while shown also costs exactly one load, for the lists too.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create } from 'react-test-renderer';
import { createClient } from '@supabase/supabase-js';
import OrderManagement from '@/components/OrderManagement';
import OrderFlashList from '@/components/lists/OrderFlashList';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { OrderService } from '@/services/order-service';
import type { Order } from '@/types/order.types';
import { resetScreenFocus, setScreenFocused } from './focusHarness';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
  useIsFocused: () => require('./focusHarness').isScreenFocused(),
}));
type MockChannel = { on: jest.Mock; subscribe: jest.Mock };
// Each realtime client hands its channel's status callback and change handler to the test.
const mockSockets: Array<{ status: (status: string) => void; change: () => void; system: (payload: { status: string }) => void }> = [];
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const socket = { status: (_: string) => {}, change: () => {}, system: (_: { status: string }) => {} };
    mockSockets.push(socket);
    const channel: MockChannel = {
      on: jest.fn((event: string, _filter: unknown, callback: (payload: { status: string }) => void) => {
        if (event === 'postgres_changes') socket.change = () => callback({ status: 'change' });
        if (event === 'system') socket.system = callback;
        return channel;
      }),
      subscribe: jest.fn((callback: (status: string) => void) => { socket.status = callback; return channel; }),
    };
    return { channel: () => channel, realtime: { disconnect: jest.fn() }, removeAllChannels: jest.fn().mockResolvedValue([]) };
  }),
}));
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:18000', anonKey: 'public-key' }),
  ensureValidTokens: jest.fn().mockResolvedValue(true),
  getStoredToken: jest.fn().mockResolvedValue({ isValid: true, authToken: 'fictional-token' }),
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }) }));
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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
// A join as the server sends it: SUBSCRIBED, then a system ok once the change feed is ready.
const join = (socket: number) => {
  mockSockets[socket].status('SUBSCRIBED');
  mockSockets[socket].system({ status: 'ok' });
};
// Past the 150 ms debounce of the subscription service.
const settle = () => act(async () => { await jest.advanceTimersByTimeAsync(200); });
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
  mockSockets.length = 0;
  jest.mocked(createClient).mockClear();
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
  it('costs one load per return, one for each first join, one for a rejoin', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element()); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(1);
    expect(mockSockets).toHaveLength(1);
    await act(async () => { join(0); });
    await settle();
    // The first join loads once more: a change before the subscription was registered gives no event.
    expect(loads()).toHaveBeenCalledTimes(2);

    // Another screen covers this one: the subscription ends, a change reaches nobody.
    await act(async () => { setScreenFocused(false); renderer.update(element()); });
    await act(async () => { mockSockets[0].change(); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(2);

    // Back: one catch-up load, and the new subscription's first join adds one.
    await act(async () => { setScreenFocused(true); renderer.update(element()); });
    await settle();
    expect(mockSockets).toHaveLength(2);
    await act(async () => { join(1); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(4);

    // A rejoin after a dropped socket still catches up, once.
    await act(async () => { mockSockets[1].status('CHANNEL_ERROR'); join(1); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(5);
    await act(async () => { renderer.unmount(); });
  });

  it('costs one load for a trip to the background while shown, one for each first join', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element()); });
    await settle();
    await act(async () => { join(0); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(2);

    // In the background the subscription ends and a change reaches nobody.
    await appState('background');
    await act(async () => { mockSockets[0].change(); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(2);

    // Back in the foreground: one catch-up load, and the new first join adds one.
    await appState('active');
    await settle();
    expect(mockSockets).toHaveLength(2);
    await act(async () => { join(1); });
    await settle();
    expect(loads()).toHaveBeenCalledTimes(4);
    await act(async () => { renderer.unmount(); });
  });
});
