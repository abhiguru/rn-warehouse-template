/**
 * WH-381 (superseding WH-328's offline orders/queue and unsent-dispatch stock deductions; Design Part 13.1-13.5, contract
 * product/tech/app-offline-scope-cut.md sections 3 & 4):
 *  - Orders (`OrderFlashList`) and Queue (`SupervisorOrderQueueList`) show whole-screen `ScreenNeedsConnection` when
 *    offline (`orders-needs-connection`, `order-queue-needs-connection`), both on cold-start offline and after visiting
 *    online then losing connection — with ZERO kept rows, no "+", no search/filters, no `orders-new-needs-connection` or
 *    `queue-dispatch-needs-connection`, no `LastUpdatedLine` / `StaleListStrip`, no "Try again", and automatic reload on
 *    reconnect.
 *  - Dispatch stock deduction footnotes (`lessNotSent`, `lessHeld`, `lessOtherPerson`) are removed from order lines.
 *  - Online: Orders, Queue, queue cards and order lines work as today.
 *
 * ===== AGREE WITH DEVELOPMENT (contract 4.4 says the lists gate rows; who draws the state is open) =====
 *  - `OrderFlashList` and `SupervisorOrderQueueList` themselves render `orders-needs-connection` /
 *    `order-queue-needs-connection` (Design 13.1 A keeps the tab header above it, which the tab owns). If Development draws
 *    the state in the tab instead, move these list checks to the tab; the tab-level checks are in ScopeCutOfflineScreens.
 *  - The mocked filter header's testID `mock-filtered-list-header` stands for search and filters (hidden offline).
 * ==================================
 *
 * Real: the lists, the queue card, the order line card, ScreenNeedsConnection, i18n. Stand-ins: the navigator, the
 * network service reply, the connection flag (`useNeedsConnection`), and the unsent overlay seam.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import OrderFlashList from '@/components/lists/OrderFlashList';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';
import OrderItemCard from '@/components/OrderItemCard';
import { OrderService } from '@/services/order-service';
import { setLanguage, t } from '@/i18n';
import type { Order, OrderItem, OrderServiceResponse } from '@/types/order.types';
import { resetScreenFocus } from './focusHarness';

const mockConn = {
  offline: false,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    mockConn.listeners.add(listener);
    return () => { mockConn.listeners.delete(listener); };
  },
  set(offline: boolean) {
    mockConn.offline = offline;
    for (const listener of [...mockConn.listeners]) listener();
  },
};
jest.mock('@/features/phone-copy/useNeedsConnection', () => {
  const { useSyncExternalStore } = require('react');
  const useOffline = () => useSyncExternalStore(mockConn.subscribe, () => mockConn.offline);
  return {
    ...jest.requireActual('@/features/phone-copy/useNeedsConnection'),
    useNeedsConnection: useOffline,
    useNeedsConnectionV3: useOffline,
  };
});
const mockOverlay = { lessUnsent: {} as Record<string, number>, lessHeld: {} as Record<string, number>, lessOthers: {} as Record<string, number> };
jest.mock('@/features/phone-copy/unsentOverlay', () => ({
  ...jest.requireActual('@/features/phone-copy/unsentOverlay'),
  getUnsentOverlay: () => ({ grn: () => null, lot: () => null, dispatch: () => null,
    lessUnsent: (id: string) => mockOverlay.lessUnsent[id] ?? 0, lessHeld: (id: string) => mockOverlay.lessHeld[id] ?? 0,
    lessOthersUnsent: (id: string) => mockOverlay.lessOthers[id] ?? 0, deductions: () => new Map() }),
}));
jest.mock('@/hooks/useNetworkStatus', () => {
  const { useSyncExternalStore } = require('react');
  const useOffline = () => useSyncExternalStore(mockConn.subscribe, () => mockConn.offline);
  return { useIsOffline: useOffline, useNetworkStatus: () => ({ isConnected: !useOffline() }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: () => {} }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1, onSessionChange: () => () => undefined }));
jest.mock('@/features/filters/configs', () => ({ ORDER_FILTERS: { listKey: 'order-list' }, ORDER_QUEUE_FILTERS: { listKey: 'order-queue' } }));
jest.mock('@/features/filters/components/FilteredListHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FilteredListHeader: () => React.createElement(View, { testID: 'mock-filtered-list-header' }),
    filteredEmptyProps: () => ({ activeFilterCount: 0 }),
  };
});
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => ({ request: {}, values: {} }) }));
let mockRole = 'supervisor';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'profile-1', role: mockRole, name: 'Fictional Supervisor' } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    MemoizedOrderItem: ({ order }: { order: { id: string; customer?: { name?: string } } }) =>
      React.createElement(Text, { testID: `order-row-${order.id}` }, order.customer?.name ?? order.id),
  };
});
jest.mock('@/components/StockIndicator', () => 'StockIndicator');
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: () => null }));
jest.mock('@/components/RecentDispatchedOrdersSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/customer/ownBusinesses', () => ({ readOwnBusinesses: async () => [], readAccessStatus: async () => null }));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn(), getOrderWithItems: jest.fn() } }));

const NEEDS_EN = 'This needs a connection. It will load when you reconnect.';
const NEEDS_GU = 'આ માટે કનેક્શન જોઈએ. ફરી જોડાશો ત્યારે લોડ થશે.';

const order = { id: 'order-fictional-1', customer_id: 'customer-1', customer: { id: 'customer-1', name: 'Fictional Traders' },
  status: 'OPEN', item_count: 1, quantity_sum: 5, updated_at: '2026-11-25T08:00:00Z' } as unknown as Order;
const list = { success: true, message: '', data: [order], metadata: { has_more: false } } as OrderServiceResponse<Order[]>;
const line: OrderItem = { id: 'line-1', order_id: 'order-fictional-1', grn_item_id: 'lot-1', requested_quantity: 3, created_at: '',
  grn_item: { id: 'lot-1', name: 'Fictional Onions', packaging: 'Bag', current_stock: 4, original_quantity: 10, gr_id: 'grn-1' } };
const getOrdersList = jest.mocked(OrderService.getOrdersList);
const getOrderWithItems = jest.mocked(OrderService.getOrderWithItems);
const hidden = { includeHiddenElements: true } as const;

const setOffline = async (offline: boolean) => {
  await act(async () => { mockConn.set(offline); });
};

beforeEach(() => {
  resetScreenFocus();
  mockConn.offline = false;
  mockRole = 'supervisor';
  mockOverlay.lessUnsent = {};
  mockOverlay.lessHeld = {};
  mockOverlay.lessOthers = {};
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => undefined);
  getOrdersList.mockReset().mockResolvedValue(list);
  getOrderWithItems.mockReset().mockResolvedValue({ success: true, message: '', data: { ...order, items: [line] } as Order });
});
afterEach(() => { setLanguage('en'); jest.restoreAllMocks(); });

describe('WH-381: the Orders list', () => {
  it('cold-start offline: whole-screen ScreenNeedsConnection, no rows, no "+", no search/filters, no removed footnote, no server call', async () => {
    mockConn.offline = true;
    await render(<OrderFlashList />);
    expect(await screen.findByTestId('orders-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByTestId('order-row-order-fictional-1', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-create', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: t('lists.order.create') })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-new-needs-connection', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('mock-filtered-list-header', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-last-updated', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-stale-strip', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(getOrdersList).not.toHaveBeenCalled();
  });

  it('visited online then connection drops: zero kept rows and clears automatically on reconnect', async () => {
    await render(<OrderFlashList />);
    expect(await screen.findByTestId('order-row-order-fictional-1')).toBeOnTheScreen();
    expect(screen.getByTestId('orders-create')).toBeOnTheScreen();
    expect(screen.queryByTestId('orders-needs-connection', hidden)).not.toBeOnTheScreen();

    await setOffline(true);
    expect(await screen.findByTestId('orders-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByTestId('order-row-order-fictional-1', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-create', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-stale-strip', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-last-updated', hidden)).not.toBeOnTheScreen();

    getOrdersList.mockClear();
    await setOffline(false);
    expect(await screen.findByTestId('order-row-order-fictional-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('orders-needs-connection', hidden)).not.toBeOnTheScreen();
    expect(getOrdersList).toHaveBeenCalled();
  });

  it('Gujarati offline: ScreenNeedsConnection wording, no removed footnote', async () => {
    setLanguage('gu');
    mockConn.offline = true;
    await render(<OrderFlashList />);
    expect(await screen.findByTestId('orders-needs-connection')).toHaveTextContent(NEEDS_GU);
    expect(screen.queryByTestId('orders-new-needs-connection', hidden)).not.toBeOnTheScreen();
  });

  it('online: the "+" is there and no needs-connection state', async () => {
    await render(<OrderFlashList />);
    expect(await screen.findByTestId('orders-create')).toBeOnTheScreen();
    expect(screen.queryByTestId('orders-needs-connection', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-new-needs-connection', hidden)).not.toBeOnTheScreen();
  });
});

describe('WH-381: the Queue', () => {
  it('cold-start offline: whole-screen ScreenNeedsConnection, no rows, no search/filters, no removed footnotes, no server call', async () => {
    mockConn.offline = true;
    await render(<SupervisorOrderQueueList />);
    expect(await screen.findByTestId('order-queue-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByText('Fictional Traders')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('queue-dispatch-needs-connection', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-new-needs-connection', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('mock-filtered-list-header', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(getOrdersList).not.toHaveBeenCalled();
  });

  it('visited online then connection drops: zero kept rows and clears automatically on reconnect', async () => {
    await render(<SupervisorOrderQueueList />);
    expect(await screen.findByText('Fictional Traders')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-queue-needs-connection', hidden)).not.toBeOnTheScreen();

    await setOffline(true);
    expect(await screen.findByTestId('order-queue-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByText('Fictional Traders')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('queue-dispatch-needs-connection', hidden)).not.toBeOnTheScreen();

    getOrdersList.mockClear();
    await setOffline(false);
    expect(await screen.findByText('Fictional Traders')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-queue-needs-connection', hidden)).not.toBeOnTheScreen();
    expect(getOrdersList).toHaveBeenCalled();
  });

  it('Gujarati offline: ScreenNeedsConnection wording, no removed footnote', async () => {
    setLanguage('gu');
    mockConn.offline = true;
    await render(<SupervisorOrderQueueList />);
    expect(await screen.findByTestId('order-queue-needs-connection')).toHaveTextContent(NEEDS_GU);
    expect(screen.queryByTestId('queue-dispatch-needs-connection', hidden)).not.toBeOnTheScreen();
  });
});

describe('WH-381: queue card and order line online (no dispatch deduction footnotes)', () => {
  it('queue card online: Create dispatch is enabled and has no deduction footnotes', async () => {
    mockOverlay.lessUnsent['lot-1'] = 2;
    await render(<CustomerOrderGroupCard order={order} isExpanded onToggleExpand={jest.fn()} />);
    await screen.findByText('Fictional Onions');
    expect(screen.getByTestId(`queue-card-dispatch-${order.id}`)).toBeEnabled();
    expect(screen.queryByText(t('findGoods.lessNotSent', { count: 2 }), hidden)).not.toBeOnTheScreen();
  });

  it('order line online: controls are enabled and no unsent/held/others dispatch deduction footnotes render', async () => {
    mockOverlay.lessUnsent['lot-1'] = 20;
    mockOverlay.lessHeld['lot-1'] = 6;
    mockOverlay.lessOthers['lot-1'] = 12;
    await render(<OrderItemCard item={line} onQuantityChange={jest.fn()} onRemove={jest.fn()} />);
    for (const control of ['less10', 'less1', 'more1', 'more10', 'remove'] as const) {
      expect(screen.getByTestId(`order-line-${control}-${line.id}`)).toBeEnabled();
    }
    expect(screen.queryByTestId(`order-line-less-unsent-${line.id}`, hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId(`order-line-less-held-${line.id}`, hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId(`order-line-less-others-${line.id}`, hidden)).not.toBeOnTheScreen();
  });
});
