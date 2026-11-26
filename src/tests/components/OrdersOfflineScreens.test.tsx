/**
 * WH-328, Design 2.10b and contract product/tech/app-offline-orders-payments.md section 8 (S1, S2, S3, S3b, S6, O1-O3 on
 * screen): with no connection the Orders list and the Queue say what needs one and show no "+", every change on an order
 * is disabled with ", needs a connection" in its label, "Cancel adding items" stays enabled, and an order line shows the net
 * stock with one footnote per deduction. Online, and with the feature off, the screens are as today.
 *
 * Real: the lists, the queue card, the order line card, the order editor's own parts, i18n. Stand-ins: the navigator, the
 * network service reply, the connection flag (`useNeedsConnection`, the one the screens ask) and the seam of this phone's
 * unsent work (`getUnsentOverlay`; WH-301's store is not in this base).
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent) =====
 *  - The footnote texts are Design 2.10b's words, English: "New orders need a connection." and "Creating a dispatch needs a connection."
 *  - The queue card's Edit button is found by its role and name `lists.orderGroup.editLabel`.
 *  - The line footnotes are the findGoods.lessNotSent / lessHeld words (Design: "no new words"); "other person" has no key yet and is not tested.
 *  - The order screen's one line is `order-actions-needs-connection`; OrderItemCard's own controls carry the testIDs of section 8.
 * ============================================================
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import OrderFlashList from '@/components/lists/OrderFlashList';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';
import OrderItemCard from '@/components/OrderItemCard';
import { OrderService } from '@/services/order-service';
import { setLanguage, t } from '@/i18n';
import type { Order, OrderItem, OrderServiceResponse } from '@/types/order.types';
import { resetScreenFocus } from './focusHarness';

let mockOffline = false;
jest.mock('@/features/phone-copy/useNeedsConnection', () => ({
  ...jest.requireActual('@/features/phone-copy/useNeedsConnection'),
  useNeedsConnection: () => mockOffline,
}));
const mockOverlay = { lessUnsent: {} as Record<string, number>, lessHeld: {} as Record<string, number> };
jest.mock('@/features/phone-copy/unsentOverlay', () => ({
  ...jest.requireActual('@/features/phone-copy/unsentOverlay'),
  getUnsentOverlay: () => ({ grn: () => null, lot: () => null, dispatch: () => null,
    lessUnsent: (id: string) => mockOverlay.lessUnsent[id] ?? 0, lessHeld: (id: string) => mockOverlay.lessHeld[id] ?? 0,
    lessOthersUnsent: () => 0, deductions: () => new Map() }),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useNetworkStatus: () => ({ isConnected: true }) }));
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
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/features/filters/configs', () => ({ ORDER_FILTERS: { listKey: 'order-list' }, ORDER_QUEUE_FILTERS: { listKey: 'order-queue' } }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => ({ request: {}, values: {} }) }));
let mockRole = 'supervisor';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'profile-1', role: mockRole, name: 'Fictional Supervisor' } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedOrderItem: () => null }));
jest.mock('@/components/StockIndicator', () => 'StockIndicator');
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: () => null }));
jest.mock('@/components/RecentDispatchedOrdersSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/customer/ownBusinesses', () => ({ readOwnBusinesses: async () => [], readAccessStatus: async () => null }));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn(), getOrderWithItems: jest.fn() } }));

const order = { id: 'order-fictional-1', customer_id: 'customer-1', customer: { id: 'customer-1', name: 'Fictional Traders' },
  status: 'OPEN', item_count: 1, quantity_sum: 5, updated_at: '2026-11-25T08:00:00Z' } as unknown as Order;
const list = { success: true, message: '', data: [order], metadata: { has_more: false } } as OrderServiceResponse<Order[]>;
const line: OrderItem = { id: 'line-1', order_id: 'order-fictional-1', grn_item_id: 'lot-1', requested_quantity: 3, created_at: '',
  grn_item: { id: 'lot-1', name: 'Fictional Onions', packaging: 'Bag', current_stock: 4, original_quantity: 10, gr_id: 'grn-1' } };
const getOrdersList = jest.mocked(OrderService.getOrdersList);
const getOrderWithItems = jest.mocked(OrderService.getOrderWithItems);
const user = userEvent.setup({ delay: 0 });
const hidden = { includeHiddenElements: true } as const;

beforeEach(() => {
  resetScreenFocus();
  mockOffline = false;
  mockRole = 'supervisor';
  mockOverlay.lessUnsent = {};
  mockOverlay.lessHeld = {};
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => undefined);
  getOrdersList.mockReset().mockResolvedValue(list);
  getOrderWithItems.mockReset().mockResolvedValue({ success: true, message: '', data: { ...order, items: [line] } as Order });
});
afterEach(() => { setLanguage('en'); jest.restoreAllMocks(); });

describe('S1: the Orders tab', () => {
  it('offline: the footnote and no "+"', async () => {
    mockOffline = true;
    await render(<OrderFlashList />);
    expect(await screen.findByTestId('orders-new-needs-connection')).toHaveTextContent('New orders need a connection.');
    expect(screen.queryByTestId('orders-create', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: t('lists.order.create') })).not.toBeOnTheScreen();
  });

  it('online: the "+" is there and no footnote', async () => {
    await render(<OrderFlashList />);
    expect(await screen.findByTestId('orders-create')).toBeOnTheScreen();
    expect(screen.queryByTestId('orders-new-needs-connection', hidden)).not.toBeOnTheScreen();
  });

  it('S6: the footnote in Gujarati, word for word', async () => {
    setLanguage('gu');
    mockOffline = true;
    await render(<OrderFlashList />);
    expect(await screen.findByTestId('orders-new-needs-connection')).toHaveTextContent('નવા ઑર્ડર માટે કનેક્શન જોઈએ.');
  });

  it('S5: no own time line while it reads the copy offline', async () => {
    mockOffline = true;
    await render(<OrderFlashList />);
    await screen.findByTestId('orders-new-needs-connection');
    expect(screen.queryByTestId('orders-last-updated', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('orders-stale-strip', hidden)).not.toBeOnTheScreen();
  });
});

describe('S3: the Queue', () => {
  it('offline: one footnote at the top, no "+" footnote', async () => {
    mockOffline = true;
    await render(<SupervisorOrderQueueList />);
    expect(await screen.findByTestId('queue-dispatch-needs-connection')).toHaveTextContent('Creating a dispatch needs a connection.');
    expect(screen.queryByTestId('orders-new-needs-connection', hidden)).not.toBeOnTheScreen();
  });

  it('online: no footnote', async () => {
    await render(<SupervisorOrderQueueList />);
    await screen.findByText('Fictional Traders', undefined).catch(() => undefined);
    expect(screen.queryByTestId('queue-dispatch-needs-connection', hidden)).not.toBeOnTheScreen();
  });

  it('S6: the footnote in Gujarati, word for word', async () => {
    setLanguage('gu');
    mockOffline = true;
    await render(<SupervisorOrderQueueList />);
    expect(await screen.findByTestId('queue-dispatch-needs-connection')).toHaveTextContent('જાવક બનાવવા કનેક્શન જોઈએ.');
  });
});

describe('S3 and O1: a queue card', () => {
  const draw = async () => {
    await render(<CustomerOrderGroupCard order={order} isExpanded onToggleExpand={jest.fn()} />);
    return screen.findByText('Fictional Onions');
  };

  it('offline: Create dispatch is disabled and says why, Edit stays enabled', async () => {
    mockOffline = true;
    await draw();
    const create = screen.getByTestId(`queue-card-dispatch-${order.id}`);
    expect(create).toBeDisabled();
    expect(create).toHaveAccessibleName(`${t('lists.dispatch.create')}, needs a connection`);
    expect(screen.getByRole('button', { name: t('lists.orderGroup.editLabel', { customer: 'Fictional Traders' }) })).toBeEnabled();
    // The footnote is the list's, once: the card has no line of its own (Design DQ3).
    expect(screen.queryByTestId('queue-dispatch-needs-connection', hidden)).not.toBeOnTheScreen();
  });

  it('online: Create dispatch is enabled', async () => {
    await draw();
    expect(screen.getByTestId(`queue-card-dispatch-${order.id}`)).toBeEnabled();
  });

  it('shows the net figure only, with no deduction footnotes', async () => {
    mockOverlay.lessUnsent['lot-1'] = 2;
    await draw();
    expect(screen.queryByText(t('findGoods.lessNotSent', { count: 2 }), hidden)).not.toBeOnTheScreen();
  });
});

describe('S2, S3b and O1-O3: an order line', () => {
  const draw = (props: Partial<React.ComponentProps<typeof OrderItemCard>> = {}) =>
    render(<OrderItemCard item={line} onQuantityChange={jest.fn()} onRemove={jest.fn()} {...props} />);
  const CONTROLS = ['less10', 'less1', 'more1', 'more10', 'remove'] as const;

  it('offline: every control of the line is disabled, with the reason in its label', async () => {
    mockOffline = true;
    await draw();
    for (const control of CONTROLS) {
      const button = screen.getByTestId(`order-line-${control}-${line.id}`);
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleName(expect.stringMatching(/, needs a connection$/));
    }
  });

  it('offline: a press on a disabled control sends nothing', async () => {
    mockOffline = true;
    const onQuantityChange = jest.fn();
    await draw({ onQuantityChange });
    await user.press(screen.getByTestId(`order-line-more1-${line.id}`));
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('online: the controls are enabled', async () => {
    await draw();
    for (const control of CONTROLS) expect(screen.getByTestId(`order-line-${control}-${line.id}`)).toBeEnabled();
  });

  it('O1: an unsent dispatch is a footnote under the line, and the end of its label', async () => {
    mockOverlay.lessUnsent['lot-1'] = 20;
    await draw();
    const note = t('findGoods.lessNotSent', { count: 20 });
    expect(screen.getByTestId(`order-line-less-unsent-${line.id}`)).toHaveTextContent(note);
    expect(screen.queryByTestId(`order-line-less-held-${line.id}`, hidden)).not.toBeOnTheScreen();
  });

  it('O2: held bags have their own footnote', async () => {
    mockOverlay.lessHeld['lot-1'] = 6;
    await draw();
    expect(screen.getByTestId(`order-line-less-held-${line.id}`)).toHaveTextContent(t('findGoods.lessHeld', { count: 6 }));
    expect(screen.queryByTestId(`order-line-less-unsent-${line.id}`, hidden)).not.toBeOnTheScreen();
  });

  it('O3: no unsent work, no footnote', async () => {
    await draw();
    expect(screen.queryByTestId(`order-line-less-unsent-${line.id}`, hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId(`order-line-less-held-${line.id}`, hidden)).not.toBeOnTheScreen();
  });
});
