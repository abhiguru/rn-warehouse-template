/**
 * The Add items picker keeps what was chosen through a trip to the background
 * (phone review 2026-10-14, OI-01: one second on the Home screen turned "Add (1)"
 * into "Add"). End to end on the harness of OrderRefocusRefreshTotal: the real
 * order editor, the real live updates hook (a 15 s timer), and the real
 * picker; only the bottom sheet library and the network are stand-ins.
 *
 * The order has no saved lines, so a picker that re-seeded its selection from the
 * order on the second read would show "Add", not "Add (1)".
 *
 * On the same harness: a save that timed out although the server applied it
 * (review 2026-10-14; owner decision D22, 2026-10-20). The lot is locked and named
 * as being checked, the editor waits until 10 s have passed since the request,
 * reads the order, finds the lot saved, sends nothing again and closes the picker.
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
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:18000', anonKey: 'public-key' }),
  ensureValidTokens: jest.fn().mockResolvedValue(true),
  getStoredToken: jest.fn().mockResolvedValue({ isValid: true, authToken: 'fictional-token' }),
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }) }));
// The wait for the server reads the network state from NetInfo (a native module): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
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

// Past the 150 ms of a load; the timer of the hook is not reached.
const settle = () => act(async () => { await jest.advanceTimersByTimeAsync(200); });
// One 15 s interval of the order screen's timer: the editor reads the order again.
const interval = () => act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
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
  // The editor loaded the order once; the timer has not read it again yet.
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(1);

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
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(2);
  expect(addButtonText()).toBe('Add (1)');
  expect(isSelected('Fictional potatoes')).toBe(true);

  // The 15 s timer reads the order again: one more read.
  await interval();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(3);
  expect(addButtonText()).toBe('Add (1)');

  // Another user saves a lot on this order: one more read. The picker marks that
  // lot "In order" and leaves the user's own choice alone.
  server.items = [{
    id: 'line-other', order_id: server.id, grn_item_id: 'lot-b', requested_quantity: 6, item_status: 'pending',
    created_at: '2026-10-01T09:00:00Z', grn_item: LOTS[1],
  } as OrderItem];
  await interval();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(4);
  expect(textOf(node('catalog-item-lot-b'))).toContain('In order');
  expect(addButtonText()).toBe('Add (1)');
  expect(isSelected('Fictional potatoes')).toBe(true);
  expect(isSelected('Fictional onions')).toBe(false);
});

it('closes when the save that timed out is found applied: the lot is locked and checked first, and nothing is sent again', async () => {
  const onClose = jest.fn();
  await act(async () => {
    renderer = create(<OrderManagement customerId="customer-fictional-1" itemCatalogOpen onCloseItemCatalog={onClose} />);
  });
  await settle();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(1);

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
    return { success: false, message: "Couldn't add the item.", error: 'TimeoutError: Request timeout', lostAnswer: true } as never;
  });
  // The failure is logged for the developer; it is not a test failure.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => { node('catalog-add').props.onPress(); });
  await settle();

  // The request went out and no answer came: the picker stays open and locked, the lot says it is being checked,
  // and the server is not asked yet (10 s have not passed since the request).
  const CHECKING = 'No answer from the server. Checking whether it was saved…';
  expect(onClose).not.toHaveBeenCalled();
  expect(service.addItemToOrder.mock.calls).toEqual([['order-fictional-1', 'lot-a', 1]]);
  expect(textOf(node('catalog-checking-lot-a'))).toBe(CHECKING);
  expect(textOf(node('catalog-checking-summary'))).toBe(CHECKING);
  expect(addButtonText()).toBe('Saving 1 of 1…');
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(1);

  // Ten seconds after the request the order is read: the lot is there with that quantity, so it counts as saved,
  // nothing is sent again, and the picker closes.
  await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
  await settle();
  expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
  expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
  expect(service.removeItemFromOrder).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  // The check read the order once, and the save read it once more at its end.
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(3);
  expect(textOf(node('catalog-item-lot-a'))).toContain('In order');
});
