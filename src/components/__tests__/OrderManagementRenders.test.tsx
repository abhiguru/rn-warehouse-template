/**
 * R6 (performance review 2026-10-13): the order editor re-renders only the lines
 * whose data changed. Starting a refresh, or getting the same lines back, renders no
 * card; a changed quantity renders that one card. The card callbacks are stable and
 * reach the service with the card's own line.
 */
import React from 'react';
import { RefreshControl } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderManagement from '../OrderManagement';
import { OrderService } from '@/services/order-service';
import { showAlert } from '@/utils/alert';
import type { Order, OrderItem } from '@/types/order.types';

// The card is a counting stand-in with the same shallow React.memo as the real one.
type CardProps = {
  item: OrderItem;
  onQuantityChange: (itemId: string, quantity: number) => Promise<boolean> | boolean | void;
  onRemove: (itemId: string) => void;
};
const mockCards = { renders: 0, props: new Map<string, CardProps>() };
jest.mock('../OrderItemCard', () => {
  const ReactActual = jest.requireActual('react');
  const Card = (props: CardProps) => {
    mockCards.renders += 1;
    mockCards.props.set(props.item.id, props);
    return null;
  };
  return { __esModule: true, default: ReactActual.memo(Card) };
});
const mockLive: { refresh?: () => Promise<void> | void } = {};
jest.mock('@/hooks/useOrderLiveUpdates', () => ({
  useOrderLiveUpdates: (refresh: () => Promise<void> | void) => { mockLive.refresh = refresh; },
}));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
// The editor asks whether the phone has a network before it saves the picker's changes.
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }) }));
jest.mock('@/services/order-service', () => ({
  OrderService: {
    getOrCreateOrder: jest.fn(),
    getOrderWithItems: jest.fn(),
    updateOrderItemQuantity: jest.fn(),
    removeItemFromOrder: jest.fn(),
    addItemToOrder: jest.fn(),
  },
}));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('../RecentDispatchesSection', () => ({ __esModule: true, default: () => null }));
jest.mock('../CustomerOrderSummary', () => ({ __esModule: true, default: () => null }));
jest.mock('../ItemCatalogBrowser', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-paper', () => ({ Surface: 'Surface', ActivityIndicator: 'ActivityIndicator' }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'customer', name: 'Fictional Customer' } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const LINES = 20;
const makeOrder = (): Order => ({
  id: 'order-fictional-1',
  customer_id: 'customer-fictional-1',
  customer: { id: 'customer-fictional-1', name: 'Fictional Farms' } as Order['customer'],
  created_at: '2026-10-01T08:00:00Z',
  items: Array.from({ length: LINES }, (_, i) => ({
    id: `line-${i}`,
    order_id: 'order-fictional-1',
    grn_item_id: `lot-${i}`,
    requested_quantity: 2,
    item_status: 'pending',
    created_at: '2026-10-01T08:00:00Z',
    grn_item: { id: `lot-${i}`, name: `Fictional Lot ${i}`, packaging: 'Bag', current_stock: 50, original_quantity: 50, gr_id: 'grn-1' },
  })) as OrderItem[],
});
// The server answers with new objects every time, even when nothing changed.
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const service = jest.mocked(OrderService);
let server: Order;

beforeEach(() => {
  mockCards.renders = 0;
  mockCards.props.clear();
  server = makeOrder();
  service.getOrCreateOrder.mockReset().mockResolvedValue({ success: true, data: { cart_id: 'order-fictional-1' } } as never);
  service.getOrderWithItems.mockReset().mockImplementation(async () => ({ success: true, data: copy(server) }) as never);
  service.updateOrderItemQuantity.mockReset().mockResolvedValue({ success: true } as never);
  service.removeItemFromOrder.mockReset().mockResolvedValue({ success: true } as never);
  jest.mocked(showAlert).mockReset();
});

async function open() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" />); });
  expect(mockCards.props.size).toBe(LINES);
  return renderer;
}

it('renders no card when a refresh starts or brings the same lines back, and one card for one changed line', async () => {
  const renderer = await open();
  expect(mockCards.renders).toBe(LINES);

  // A refresh in flight: the refreshing flag changes, the lines do not.
  let finish!: () => void;
  service.getOrderWithItems.mockImplementationOnce(() => new Promise(resolve => {
    finish = () => resolve({ success: true, data: copy(server) } as never);
  }));
  mockCards.renders = 0;
  let pending: Promise<void> | void;
  await act(async () => { pending = mockLive.refresh?.(); });
  expect(mockCards.renders).toBe(0);

  // Equal data back.
  await act(async () => { finish(); await pending; });
  expect(mockCards.renders).toBe(0);

  // One quantity changed on the server.
  server.items![3].requested_quantity = 7;
  await act(async () => { await mockLive.refresh?.(); });
  expect(mockCards.renders).toBe(1);
  expect(mockCards.props.get('line-3')?.item.requested_quantity).toBe(7);
  await act(async () => { renderer.unmount(); });
});

it('a timed refresh runs behind the lines with no spinner; pull-to-refresh shows it', async () => {
  const renderer = await open();
  const spinner = () => renderer.root.findByType(RefreshControl).props.refreshing as boolean;
  const hold = () => {
    let finish!: () => void;
    service.getOrderWithItems.mockImplementationOnce(() => new Promise(resolve => {
      finish = () => resolve({ success: true, data: copy(server) } as never);
    }));
    return () => finish();
  };
  expect(spinner()).toBe(false);

  // The timer's refresh (what the live-updates hook calls): silent.
  const finishTimed = hold();
  let timed: Promise<void> | void;
  await act(async () => { timed = mockLive.refresh?.(); });
  expect(service.getOrderWithItems).toHaveBeenCalled();
  expect(spinner()).toBe(false);
  await act(async () => { finishTimed(); await timed; });
  expect(spinner()).toBe(false);

  // The pull: the spinner shows until the answer.
  const finishPull = hold();
  let pulled: Promise<void> | void;
  await act(async () => { pulled = renderer.root.findByType(RefreshControl).props.onRefresh(); });
  expect(spinner()).toBe(true);
  await act(async () => { finishPull(); await pulled; });
  expect(spinner()).toBe(false);
  await act(async () => { renderer.unmount(); });
});

it('keeps one pair of card callbacks for every line and sends a change for the card\'s own line', async () => {
  const renderer = await open();
  const first = mockCards.props.get('line-5')!;
  expect(mockCards.props.get('line-9')!.onQuantityChange).toBe(first.onQuantityChange);
  expect(mockCards.props.get('line-9')!.onRemove).toBe(first.onRemove);

  let saved: unknown;
  await act(async () => { saved = await first.onQuantityChange(first.item.id, 5); });
  expect(saved).toBe(true);
  expect(service.updateOrderItemQuantity).toHaveBeenCalledWith('line-5', 'order-fictional-1', 5);

  // Removing asks first, names the line, then removes that line.
  await act(async () => { first.onRemove(first.item.id); });
  const [title, , buttons] = jest.mocked(showAlert).mock.calls[0];
  expect(title).toContain('Fictional Lot 5');
  const remove = (buttons as Array<{ style?: string; onPress?: () => Promise<void> }>).find(b => b.style === 'destructive')!;
  await act(async () => { await remove.onPress?.(); });
  expect(service.removeItemFromOrder).toHaveBeenCalledWith('line-5', 'order-fictional-1');
  await act(async () => { renderer.unmount(); });
});
