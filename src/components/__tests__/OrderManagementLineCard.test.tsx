/**
 * What the order editor does when a line card changes or removes its line (review 2026-10-20, A12 and M6).
 * The cards are stand-ins that hand their props to the test.
 *
 *  - A line that is gone ("Order item not found", or a customer login's "Customer access denied" on an older
 *    facility when the read of the order no longer has the line) is told as one clear message, not as "no
 *    permission", and the order is read again. Without that read "Customer access denied" is a permission text.
 *  - Any other failed write is followed by a read too, so the card shows what is stored.
 *  - A removal asks first, answers true only when the line is gone, and false for Cancel or a failure.
 *  - A change or removal whose answer was lost (owner decision D22, 2026-10-20) locks the line, waits for the
 *    server (the 10 s wait is stubbed here), reads the order, and answers with what the server has. Nothing
 *    is sent again.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import OrderManagement from '../OrderManagement';
import { OrderService } from '@/services/order-service';
import { askAlert, showAlert } from '@/utils/alert';
import type { Order, OrderItem } from '@/types/order.types';
import { waitForServer } from '@/utils/lostAnswer';

type CardProps = {
  item: OrderItem;
  onQuantityChange: (itemId: string, newQuantity: number, orderId?: string) => Promise<boolean>;
  onRemove: (itemId: string) => Promise<boolean | 'unknown'>;
  checking?: 'save' | 'remove';
};
const mockCards: { byId: Record<string, CardProps> } = { byId: {} };
jest.mock('../OrderItemCard', () => ({
  __esModule: true,
  default: (props: CardProps) => {
    mockCards.byId[props.item.id] = props;
    return null;
  },
}));
jest.mock('../ItemCatalogBrowser', () => ({ __esModule: true, default: () => null }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: () => undefined }));
// The wait for the server reads the network state from NetInfo (a native module): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
// The 10 s wait of a lost answer belongs to lostAnswer.ts; here it ends at once (a test that wants to see the wait replaces it).
jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  waitForServer: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true, type: 'wifi' }) }));
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
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('../RecentDispatchesSection', () => ({ __esModule: true, default: () => null }));
jest.mock('../CustomerOrderSummary', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-paper', () => ({ Surface: 'Surface', ActivityIndicator: 'ActivityIndicator' }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
const mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const ORDER_ID = 'order-fictional-1';
const LINE = 'line-lot-open';
const line = (lot: string, quantity: number): OrderItem => ({
  id: `line-${lot}`,
  order_id: ORDER_ID,
  grn_item_id: lot,
  requested_quantity: quantity,
  item_status: 'pending',
  created_at: '2026-10-01T08:00:00Z',
  grn_item: { id: lot, name: `Fictional ${lot}`, packaging: 'Bag', current_stock: 50, original_quantity: 50, gr_id: 'grn-fictional' },
});
const makeOrder = (): Order => ({
  id: ORDER_ID,
  customer_id: 'customer-fictional-1',
  customer: { id: 'customer-fictional-1', name: 'Fictional Farms' } as Order['customer'],
  created_at: '2026-10-01T08:00:00Z',
  items: [line('lot-kept', 2), line('lot-open', 5)],
});
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const saved = { success: true, message: '' } as never;
const refusal = (message: string, error: unknown = 'API_ERROR') => ({ success: false, message, error }) as never;
// A failure whose own text is in `error`, under the app's text for the action: how OrderService hands back an
// exception the server raised (the 42501 refusals).
const raised = (error: string) => ({ success: false, message: "Couldn't change the item.", error }) as never;

const GONE_TITLE = 'This item is no longer on the order';
const GONE_MESSAGE = 'Someone else removed it, or it was dispatched. The order is shown again as it is now.';

const service = jest.mocked(OrderService);
let renderer: ReactTestRenderer | undefined;
let logged: jest.SpyInstance;
const settle = () => act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });

async function openOrder() {
  await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" />); });
  await settle();
  expect(mockCards.byId[LINE]).toBeDefined();
  return mockCards.byId[LINE];
}
const reads = () => service.getOrderWithItems.mock.calls.length;

beforeEach(() => {
  mockCards.byId = {};
  service.getOrCreateOrder.mockReset().mockResolvedValue({ success: true, data: { cart_id: ORDER_ID } } as never);
  service.getOrderWithItems.mockReset().mockImplementation(async () => ({ success: true, data: copy(makeOrder()) }) as never);
  service.updateOrderItemQuantity.mockReset().mockResolvedValue(saved);
  service.removeItemFromOrder.mockReset().mockResolvedValue(saved);
  jest.mocked(showAlert).mockReset();
  jest.mocked(waitForServer).mockClear();
  jest.mocked(askAlert).mockReset().mockResolvedValue('remove' as never);
  logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  logged.mockRestore();
});

describe('a change of the quantity of a line', () => {
  it('is saved: the order is read again and the card is told true', async () => {
    const card = await openOrder();
    const before = reads();
    let answer!: boolean;
    await act(async () => { answer = await card.onQuantityChange(LINE, 6, ORDER_ID); });
    expect(answer).toBe(true);
    expect(service.updateOrderItemQuantity).toHaveBeenCalledWith(LINE, ORDER_ID, 6);
    expect(reads()).toBe(before + 1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  // The next read of the order has no line `LINE`.
  const readWithoutLine = () =>
    service.getOrderWithItems.mockImplementationOnce(async () => ({ success: true, data: { ...copy(makeOrder()), items: [line('lot-kept', 2)] } }) as never);

  it.each([
    ['"Order item not found"', refusal('Order item not found'), false],
    ['"Customer access denied" (an older facility, a customer login) when the read no longer has the line', raised('Customer access denied'), true],
  ])('a line that is gone, answered %s, is one clear message and a new read, never "no permission"', async (_name, failure, withoutLine) => {
    const card = await openOrder();
    service.updateOrderItemQuantity.mockResolvedValueOnce(failure);
    if (withoutLine) readWithoutLine();
    const before = reads();
    let answer!: boolean;
    await act(async () => { answer = await card.onQuantityChange(LINE, 6, ORDER_ID); });
    await settle();
    expect(answer).toBe(false);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(GONE_TITLE, GONE_MESSAGE);
    expect(reads()).toBe(before + 1);
  });

  it('"Customer access denied" while the read still has the line is a refusal of permission, not a line gone', async () => {
    const card = await openOrder();
    service.updateOrderItemQuantity.mockResolvedValueOnce(raised('Customer access denied'));
    const before = reads();
    let answer!: boolean;
    await act(async () => { answer = await card.onQuantityChange(LINE, 6, ORDER_ID); });
    await settle();
    expect(answer).toBe(false);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith("Couldn't change the quantity", 'You do not have permission to perform this action.');
    expect(reads()).toBe(before + 1);
  });

  it('while the card is taking the line off, a save that finds it gone says nothing', async () => {
    const card = await openOrder();
    let finishQuestion!: (answer: string) => void;
    jest.mocked(askAlert).mockImplementationOnce((() => new Promise(resolve => { finishQuestion = resolve as (answer: string) => void; })) as never);
    let removal!: Promise<boolean | 'unknown'>;
    await act(async () => { removal = card.onRemove(LINE) as Promise<boolean | 'unknown'>; });
    service.updateOrderItemQuantity.mockResolvedValueOnce(refusal('Order item not found'));
    await act(async () => { await card.onQuantityChange(LINE, 6, ORDER_ID); });
    expect(showAlert).not.toHaveBeenCalled();
    await act(async () => { finishQuestion('cancel'); await removal; });
  });

  it('any other refusal keeps its own title and is followed by a read as well', async () => {
    const card = await openOrder();
    service.updateOrderItemQuantity.mockResolvedValueOnce(refusal('Quantity cannot be below the 4 already dispatched'));
    const before = reads();
    let answer!: boolean;
    await act(async () => { answer = await card.onQuantityChange(LINE, 3, ORDER_ID); });
    await settle();
    expect(answer).toBe(false);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe("Couldn't change the quantity");
    expect(reads()).toBe(before + 1);
  });
});

describe('the removal of a line', () => {
  const remove = async (card: CardProps) => {
    let answer!: boolean | 'unknown';
    await act(async () => { answer = await card.onRemove(LINE); });
    return answer;
  };

  it('asks first; Cancel removes nothing and answers false', async () => {
    const card = await openOrder();
    jest.mocked(askAlert).mockResolvedValueOnce('cancel' as never);
    expect(await remove(card)).toBe(false);
    expect(askAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(askAlert).mock.calls[0][0]).toBe('Remove Fictional lot-open?');
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a closed question (Back, the scrim) is Cancel', async () => {
    const card = await openOrder();
    // askAlert answers with the value it was given for "dismissed": cancel.
    jest.mocked(askAlert).mockImplementationOnce((async (_title: string, _message: string, _choices: unknown, dismissed: unknown) => dismissed) as never);
    expect(await remove(card)).toBe(false);
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
  });

  it('removes the line, reads the order again and answers true', async () => {
    const card = await openOrder();
    const before = reads();
    expect(await remove(card)).toBe(true);
    expect(service.removeItemFromOrder).toHaveBeenCalledWith(LINE, ORDER_ID);
    expect(reads()).toBe(before + 1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a line that "Order item not found" says is gone: one clear message, a new read, and the card is told true', async () => {
    const card = await openOrder();
    service.removeItemFromOrder.mockResolvedValueOnce(refusal('Order item not found'));
    const before = reads();
    expect(await remove(card)).toBe(true);
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(GONE_TITLE, GONE_MESSAGE);
    expect(reads()).toBe(before + 1);
  });

  it('a customer login\'s "Customer access denied" (an older facility) says the line is gone only when the read no longer has it', async () => {
    const card = await openOrder();
    service.removeItemFromOrder.mockResolvedValueOnce(raised('Customer access denied'));
    service.getOrderWithItems.mockImplementationOnce(async () => ({ success: true, data: { ...copy(makeOrder()), items: [line('lot-kept', 2)] } }) as never);
    const before = reads();
    expect(await remove(card)).toBe(true);
    await settle();
    expect(showAlert).toHaveBeenCalledWith(GONE_TITLE, GONE_MESSAGE);
    expect(reads()).toBe(before + 1);
  });

  it('"Customer access denied" while the read still has the line is a refusal: a permission text, and the card is told false', async () => {
    const card = await openOrder();
    service.removeItemFromOrder.mockResolvedValueOnce(raised('Customer access denied'));
    const before = reads();
    expect(await remove(card)).toBe(false);
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith("Couldn't remove the item", 'You do not have permission to perform this action.');
    expect(reads()).toBe(before + 1);
  });

  it('a removal that got no answer is checked, not answered \'unknown\': the order is read, and a line that is gone answers true', async () => {
    const card = await openOrder();
    service.removeItemFromOrder.mockResolvedValueOnce({ success: false, message: "Couldn't remove the item.", error: 'TimeoutError: Request timeout', lostAnswer: true } as never);
    service.getOrderWithItems.mockImplementationOnce(async () => ({ success: true, data: { ...copy(makeOrder()), items: [line('lot-kept', 2)] } }) as never);
    const before = reads();
    expect(await remove(card)).toBe(true);
    // Sent once, never again; the wait for the server was asked for; one read, which shows the line is gone.
    expect(service.removeItemFromOrder).toHaveBeenCalledTimes(1);
    expect(waitForServer).toHaveBeenCalledTimes(1);
    expect(reads()).toBe(before + 1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a removal that got no answer, with the line still on the order: says it was not removed and answers false', async () => {
    const card = await openOrder();
    service.removeItemFromOrder.mockResolvedValueOnce({ success: false, message: "Couldn't remove the item.", error: 'TimeoutError: Request timeout', lostAnswer: true } as never);
    expect(await remove(card)).toBe(false);
    expect(service.removeItemFromOrder).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith("Couldn't remove the item", 'The server did not remove the item. It is still on the order.');
  });

  it('any other failure says so, reads the order again and answers false', async () => {
    const card = await openOrder();
    service.removeItemFromOrder.mockResolvedValueOnce(refusal('Failed to remove item'));
    const before = reads();
    expect(await remove(card)).toBe(false);
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe("Couldn't remove the item");
    expect(reads()).toBe(before + 1);
  });
});

describe('a line whose answer was lost', () => {
  const lost = { success: false, message: "Couldn't change the item.", error: 'TimeoutError: Request timeout', lostAnswer: true } as never;

  it('is locked while it is checked: the card is told, and a change or removal of it sends nothing', async () => {
    const card = await openOrder();
    expect(mockCards.byId[LINE].checking).toBeUndefined();
    let release!: () => void;
    jest.mocked(waitForServer).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    service.updateOrderItemQuantity.mockResolvedValueOnce(lost);
    let change!: Promise<boolean>;
    await act(async () => { change = card.onQuantityChange(LINE, 6, ORDER_ID); });
    await settle();
    // Waiting for the server: the card is told to show it is checking, and nothing was read yet.
    expect(mockCards.byId[LINE].checking).toBe('save');
    expect(mockCards.byId['line-lot-kept'].checking).toBeUndefined();

    let again!: boolean;
    let removal!: boolean | 'unknown';
    await act(async () => { again = await card.onQuantityChange(LINE, 7, ORDER_ID); });
    await act(async () => { removal = await card.onRemove(LINE); });
    expect(again).toBe(false);
    expect(removal).toBe(false);
    expect(service.updateOrderItemQuantity).toHaveBeenCalledTimes(1);
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(askAlert).not.toHaveBeenCalled();

    await act(async () => { release(); await change; });
    expect(mockCards.byId[LINE].checking).toBeUndefined();
  });

  it('a change the server did apply is saved: the card is told true and no message is shown', async () => {
    const card = await openOrder();
    service.updateOrderItemQuantity.mockResolvedValueOnce(lost);
    service.getOrderWithItems.mockImplementationOnce(async () => ({
      success: true,
      data: { ...copy(makeOrder()), items: [line('lot-kept', 2), line('lot-open', 6)] },
    }) as never);
    let answer!: boolean;
    await act(async () => { answer = await card.onQuantityChange(LINE, 6, ORDER_ID); });
    expect(answer).toBe(true);
    expect(service.updateOrderItemQuantity).toHaveBeenCalledTimes(1);
    expect(waitForServer).toHaveBeenCalledTimes(1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a change the server did not apply says so and the card is told checked (it shows what the server has)', async () => {
    const card = await openOrder();
    service.updateOrderItemQuantity.mockResolvedValueOnce(lost);
    const before = reads();
    let answer!: boolean | string;
    await act(async () => { answer = await card.onQuantityChange(LINE, 6, ORDER_ID); });
    expect(answer).toBe('checked');
    expect(service.updateOrderItemQuantity).toHaveBeenCalledTimes(1);
    expect(reads()).toBe(before + 1);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith("Couldn't change the quantity", 'The server did not save the change. The order shows what is saved now.');
  });

  it('a line taken off the order meanwhile is told as that, and the card is told checked', async () => {
    const card = await openOrder();
    service.updateOrderItemQuantity.mockResolvedValueOnce(lost);
    service.getOrderWithItems.mockImplementationOnce(async () => ({ success: true, data: { ...copy(makeOrder()), items: [line('lot-kept', 2)] } }) as never);
    let answer!: boolean | string;
    await act(async () => { answer = await card.onQuantityChange(LINE, 6, ORDER_ID); });
    expect(answer).toBe('checked');
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(GONE_TITLE, GONE_MESSAGE);
  });

  it('is not checked when the call never left the phone: the usual failure, no wait', async () => {
    const card = await openOrder();
    service.updateOrderItemQuantity.mockResolvedValueOnce(
      { success: false, message: "Couldn't change the item.", error: 'Network request failed: session refresh unavailable' } as never
    );
    let answer!: boolean;
    await act(async () => { answer = await card.onQuantityChange(LINE, 6, ORDER_ID); });
    expect(answer).toBe(false);
    expect(waitForServer).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledTimes(1);
  });
});
