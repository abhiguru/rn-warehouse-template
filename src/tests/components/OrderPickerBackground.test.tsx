/**
 * The Add items picker keeps what was chosen through a trip to the background
 * (phone review 2026-10-14, OI-01: one second on the Home screen turned "Add (1)"
 * into "Add"). End to end on the harness of OrderRefocusRefreshTotal: the real
 * order editor, the real live updates hook and subscription service, and the real
 * picker; only the bottom sheet library and the network are stand-ins.
 *
 * The order has no saved lines, so a picker that re-seeded its selection from the
 * order on the second read would show "Add", not "Add (1)".
 *
 * On the same harness: a save that timed out although the server applied it
 * (review 2026-10-14). The editor reads the order again after the failure, so the
 * next Add finds the lot saved, sends nothing and closes the picker.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import OrderManagement from '@/components/OrderManagement';
import { OrderService } from '@/services/order-service';
import type { Order, OrderItem } from '@/types/order.types';
import { resetScreenFocus } from './focusHarness';

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
  OrderService: {
    getOrCreateOrder: jest.fn(),
    getOrderWithItems: jest.fn(),
    getAvailableItems: jest.fn(),
    searchCustomerItemsForOrder: jest.fn(),
    addItemToOrder: jest.fn(),
    updateOrderItemQuantity: jest.fn(),
    removeItemFromOrder: jest.fn(),
  },
}));
jest.mock('@/services/stock-service', () => ({ StockService: {
  getCustomerGRNItems: jest.fn(() => Promise.resolve({ success: true, data: { items: [] } })),
} }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: {
  loadRecentlyAddedItems: jest.fn(() => Promise.resolve([])),
  cleanupExpiredItems: jest.fn(() => Promise.resolve()),
  saveRecentlyAddedItems: jest.fn(() => Promise.resolve()),
} }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn() } }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
jest.mock('@/components/OrderItemCard', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/RecentDispatchesSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/CustomerOrderSummary', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/RecentItemsQuickAdd', () => 'RecentItemsQuickAdd');
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React.createElement('BottomSheet', null, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetFlatList: (props: any) => React.createElement('CatalogList', null,
      props.ListHeaderComponent, props.data.map((item: any) =>
        React.createElement('CatalogItem', { key: item.id, testID: `catalog-item-${item.id}` }, props.renderItem({ item })))),
  };
});
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('react-native-paper', () => ({ Surface: 'Surface', ActivityIndicator: 'ActivityIndicator' }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'customer', name: 'Fictional Customer' } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const lot = (id: string, name: string) => ({
  id, name, packaging: 'Bag', package_mark: 'FX', current_stock: 40, original_quantity: 50,
  catalog_id: null, rack: '', weight: 50, gr_id: 'grn-fictional', grn_number: 'FXG001', grn_date: '2026-09-30',
});
const LOTS = [lot('lot-a', 'Fictional potatoes'), lot('lot-b', 'Fictional onions')];
const service = jest.mocked(OrderService);
// The order on the server; every read answers with new objects.
let server: Order;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// A join as the server sends it: SUBSCRIBED, then a system ok once the change feed is ready.
const join = (socket: number) => {
  mockSockets[socket].status('SUBSCRIBED');
  mockSockets[socket].system({ status: 'ok' });
};
// Past the 150 ms debounce of the subscription service.
const settle = () => act(async () => { await jest.advanceTimersByTimeAsync(200); });
let originalState: typeof AppState.currentState;
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const appState = (state: AppStateStatus) => act(async () => {
  appStateListeners.forEach(listener => listener(state));
});

let renderer: ReactTestRenderer | undefined;
const node = (testID: string): ReactTestInstance => renderer!.root.findAll(candidate => candidate.props.testID === testID)[0];
const textOf = (instance: ReactTestInstance): string =>
  instance.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const addButtonText = () => textOf(node('catalog-add'));
const isSelected = (name: string) =>
  renderer!.root.findAll(candidate => candidate.props.accessibilityLabel === `1 bag of ${name} selected`).length > 0;

beforeEach(() => {
  jest.useFakeTimers();
  appStateListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => { appStateListeners.delete(listener); } };
  });
  resetScreenFocus();
  mockSockets.length = 0;
  server = {
    id: 'order-fictional-1', customer_id: 'customer-fictional-1', created_at: '2026-10-01T08:00:00Z',
    customer: { id: 'customer-fictional-1', name: 'Fictional Farms' } as Order['customer'], items: [],
  };
  service.getOrCreateOrder.mockReset().mockResolvedValue({ success: true, data: { cart_id: server.id } } as never);
  service.getOrderWithItems.mockReset().mockImplementation(async () => ({ success: true, data: copy(server) }) as never);
  service.getAvailableItems.mockReset().mockResolvedValue({ success: true, message: '', data: LOTS } as never);
  service.searchCustomerItemsForOrder.mockReset().mockResolvedValue({ success: true, message: '', data: [] } as never);
  service.addItemToOrder.mockReset();
  service.updateOrderItemQuantity.mockReset();
  service.removeItemFromOrder.mockReset();
  originalState = AppState.currentState;
  AppState.currentState = 'active';
});
afterEach(async () => {
  // A tree left mounted logs after the test is over.
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  AppState.currentState = originalState;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('still reads "Add (1)" after the app went to the background and came back, and after later order reads', async () => {
  await act(async () => {
    renderer = create(<OrderManagement customerId="customer-fictional-1" itemCatalogOpen onCloseItemCatalog={jest.fn()} />);
  });
  await settle();
  await act(async () => { join(0); });
  // The first join of the live channel reads the order once more (nothing missed between the load and the join).
  await settle();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(2);

  // Start state: the picker is open on an order with no lines, nothing chosen.
  expect(addButtonText()).toBe('Add');
  await act(async () => {
    renderer!.root.findAll(candidate =>
      candidate.props.accessibilityLabel === 'Add 1 bag of Fictional potatoes' && typeof candidate.props.onPress === 'function')[0].props.onPress();
  });
  expect(addButtonText()).toBe('Add (1)');
  expect(isSelected('Fictional potatoes')).toBe(true);

  // Home and back: the editor reads the order a second time.
  await appState('background');
  await settle();
  await appState('active');
  await settle();
  expect(mockSockets).toHaveLength(2);
  await act(async () => { join(1); });
  await settle();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(4);
  expect(addButtonText()).toBe('Add (1)');
  expect(isSelected('Fictional potatoes')).toBe(true);

  // A change to some order arrives over the live connection: one more read.
  await act(async () => { mockSockets[1].change(); });
  await settle();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(5);
  expect(addButtonText()).toBe('Add (1)');

  // Another user saves a lot on this order: one more read. The picker marks that
  // lot "In order" and leaves the user's own choice alone.
  server.items = [{
    id: 'line-other', order_id: server.id, grn_item_id: 'lot-b', requested_quantity: 6, item_status: 'pending',
    created_at: '2026-10-01T09:00:00Z', grn_item: LOTS[1],
  } as OrderItem];
  await act(async () => { mockSockets[1].change(); });
  await settle();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(6);
  expect(textOf(node('catalog-item-lot-b'))).toContain('In order');
  expect(addButtonText()).toBe('Add (1)');
  expect(isSelected('Fictional potatoes')).toBe(true);
  expect(isSelected('Fictional onions')).toBe(false);
});

it('closes on the next Add when the save that timed out was in fact applied', async () => {
  const onClose = jest.fn();
  await act(async () => {
    renderer = create(<OrderManagement customerId="customer-fictional-1" itemCatalogOpen onCloseItemCatalog={onClose} />);
  });
  await settle();
  await act(async () => { join(0); });
  await settle();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(2);
  const pressAdd = async () => {
    await act(async () => { node('catalog-add').props.onPress(); });
    await settle();
  };

  await act(async () => {
    renderer!.root.findAll(candidate =>
      candidate.props.accessibilityLabel === 'Add 1 bag of Fictional potatoes' && typeof candidate.props.onPress === 'function')[0].props.onPress();
  });
  expect(addButtonText()).toBe('Add (1)');

  // The server stores the line; its answer never arrives and the write times out.
  service.addItemToOrder.mockImplementationOnce(async (orderId, lotId, quantity) => {
    server.items = [{
      id: 'line-own', order_id: orderId, grn_item_id: lotId, requested_quantity: quantity, item_status: 'pending',
      created_at: '2026-10-01T09:00:00Z', grn_item: LOTS[0],
    } as OrderItem];
    return { success: false, message: "Couldn't add the item.", error: 'TimeoutError: Request timeout' } as never;
  });
  // The failure is logged for the developer; it is not a test failure.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await pressAdd();

  // The picker stays open with the lot and its reason, and the order was read again.
  expect(onClose).not.toHaveBeenCalled();
  expect(service.addItemToOrder.mock.calls).toEqual([['order-fictional-1', 'lot-a', 1]]);
  expect(textOf(node('catalog-reason-lot-a'))).toBe('Not saved. Check your connection and try again.');
  expect(addButtonText()).toBe('Add (1)');
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(3);
  expect(textOf(node('catalog-item-lot-a'))).toContain('In order');

  // Add again: the lot is in the order with that quantity, so nothing is sent and the picker closes.
  await pressAdd();
  expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
  expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
  expect(service.removeItemFromOrder).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});
