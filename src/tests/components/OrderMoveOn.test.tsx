/**
 * Every order write goes to the order it was made for (backlog 2026-10-14, review L2).
 * When the order screen moves from one business to another, a quantity still waiting to be
 * saved is saved to the OLD order (not dropped, not sent to the new one), and an Add items
 * save stops sending lots once the screen has moved on. Run through the real route and the
 * real editor and line cards: the editor unmounts there (the route shows its spinner), as
 * well as in the editor mounted on its own with a new customerId.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomerOrderScreen from '../../../app/orders/[customerId]';
import OrderManagement from '@/components/OrderManagement';
import { OrderService } from '@/services/order-service';
import type { Order, OrderItem } from '@/types/order.types';
import type { PickerChange, PickerResult } from '@/features/orders/pickerDraft';

const mockParams: { customerId?: string } = { customerId: 'customer-a' };
// The "Waiting for the connection…" text reads the network state from NetInfo (a native module): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Surface: 'Surface', ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/components/ChangeLogBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/change-log-service', () => ({ ChangeLogService: { getCustomerChangeLog: jest.fn() } }));
jest.mock('@/components/StockIndicator', () => 'StockIndicator');
jest.mock('@/components/RecentDispatchesSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/CustomerOrderSummary', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: () => undefined }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true, type: 'wifi' }) }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Fictional Farms', active: true, deleted_at: null }, error: null }) }) }) }),
  })),
}));
type PickerProps = { onAddItems: (changes: PickerChange[]) => Promise<PickerResult[]> };
const mockPicker: { props?: PickerProps } = {};
jest.mock('@/components/ItemCatalogBrowser', () => ({
  __esModule: true,
  default: (props: PickerProps) => { mockPicker.props = props; return null; },
}));
jest.mock('@/services/order-service', () => ({
  OrderService: {
    getOrCreateOrder: jest.fn(),
    getOrderWithItems: jest.fn(),
    updateOrderItemQuantity: jest.fn(),
    removeItemFromOrder: jest.fn(),
    addItemToOrder: jest.fn(),
  },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({
    theme: { preference: 'light', brand: 'orange' },
    auth: { userProfile: { id: 'p', role: 'staff' }, user: { id: 'u' }, session: { access_token: 't' } },
  }),
}));

const line = (orderId: string, lot: string, quantity: number): OrderItem => ({
  id: `line-${orderId}`,
  order_id: orderId,
  grn_item_id: lot,
  requested_quantity: quantity,
  item_status: 'pending',
  created_at: '2026-10-01T08:00:00Z',
  grn_item: { id: lot, name: 'Fictional Onions', packaging: 'Bag', current_stock: 50, original_quantity: 50, gr_id: 'grn' },
});
const orderOf = (orderId: string, customerId: string): Order => ({
  id: orderId,
  customer_id: customerId,
  customer: { id: customerId, name: customerId } as Order['customer'],
  created_at: '2026-10-01T08:00:00Z',
  items: [line(orderId, 'lot-1', 5)],
});
const service = jest.mocked(OrderService);
let renderer: ReactTestRenderer | undefined;
let logged: jest.SpyInstance;

beforeEach(() => {
  mockParams.customerId = 'customer-a';
  mockPicker.props = undefined;
  const orders: Record<string, Order> = { 'order-a': orderOf('order-a', 'customer-a'), 'order-b': orderOf('order-b', 'customer-b') };
  service.getOrCreateOrder.mockReset().mockImplementation((async (customerId: string) =>
    ({ success: true, data: { cart_id: customerId === 'customer-a' ? 'order-a' : 'order-b' } })) as never);
  service.getOrderWithItems.mockReset().mockImplementation((async (id: string) =>
    ({ success: true, data: JSON.parse(JSON.stringify(orders[id])) })) as never);
  service.updateOrderItemQuantity.mockReset().mockResolvedValue({ success: true, message: '' } as never);
  service.addItemToOrder.mockReset().mockResolvedValue({ success: true, message: '' } as never);
  service.removeItemFromOrder.mockReset().mockResolvedValue({ success: true, message: '' } as never);
  logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  logged.mockRestore();
});

const press = (label: string) =>
  renderer!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
const settle = () => act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
function waiting<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>(resolve => { answer = resolve; });
  return { promise, answer };
}

describe('through the route (the editor unmounts)', () => {
  it('saves a quantity still waiting to the old order, and nothing to the new one', async () => {
    await act(async () => { renderer = create(<CustomerOrderScreen />); });
    await settle();
    await act(async () => { press('Increase Fictional Onions by 1'); });
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();

    mockParams.customerId = 'customer-b';
    await act(async () => { renderer!.update(<CustomerOrderScreen />); });
    await settle();

    expect(service.updateOrderItemQuantity.mock.calls).toEqual([['line-order-a', 'order-a', 6]]);
  });

  it('stops an Add items save once the screen has moved on', async () => {
    await act(async () => { renderer = create(<CustomerOrderScreen />); });
    await settle();
    const first = waiting<never>();
    service.addItemToOrder.mockReturnValueOnce(first.promise as never);
    let results: PickerResult[] | undefined;
    // Open the picker so its props are known.
    await act(async () => { press('Add items to order'); });
    expect(mockPicker.props).toBeDefined();
    const save = mockPicker.props!.onAddItems;
    await act(async () => {
      void save([{ grnItemId: 'lot-x', quantity: 1, expected: 0 }, { grnItemId: 'lot-y', quantity: 1, expected: 0 }]).then(r => { results = r; });
    });
    await settle();
    expect(service.addItemToOrder.mock.calls).toEqual([['order-a', 'lot-x', 1]]);

    mockParams.customerId = 'customer-b';
    await act(async () => { renderer!.update(<CustomerOrderScreen />); });
    await act(async () => { first.answer({ success: true, message: '' } as never); });
    await settle();

    // The second lot was never sent, to either order.
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(results?.map(r => r.ok)).toEqual([true, false]);
  });
});

describe('in the editor mounted on its own (a new customerId)', () => {
  it('saves a quantity still waiting to the old order, and nothing to the new one', async () => {
    await act(async () => { renderer = create(<OrderManagement customerId="customer-a" />); });
    await settle();
    await act(async () => { press('Increase Fictional Onions by 1'); });
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();

    await act(async () => { renderer!.update(<OrderManagement customerId="customer-b" />); });
    await settle();

    expect(service.updateOrderItemQuantity.mock.calls).toEqual([['line-order-a', 'order-a', 6]]);
  });
});
