/**
 * What the order editor does with the Add items picker's changes (phone review
 * 2026-10-14, OI-01). The picker is a stand-in that hands its props to the test.
 *
 *  - Only the lots the picker sends are touched: a line another user added while
 *    the picker was open is not removed.
 *  - Each change is resolved against the lines as they are saved now.
 *  - A refusal comes back on its lot with the app's reason; no alert is shown.
 *
 * And how long it may take (review 2026-10-14): the picker has no way out while
 * a save runs.
 *  - A refusal is an answer: the next lot is sent.
 *  - A call that got no answer (a timeout, no connection, a call that threw) ends
 *    the save; the lots not sent come back not saved.
 *  - The order is read again after any call, saved or not.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import OrderManagement from '../OrderManagement';
import { OrderService } from '@/services/order-service';
import { showAlert } from '@/utils/alert';
import type { Order, OrderItem } from '@/types/order.types';
import type { PickerChange, PickerLine, PickerResult } from '@/features/orders/pickerDraft';

type PickerProps = {
  onAddItems: (changes: PickerChange[], onProgress?: (position: number, total: number) => void) => Promise<PickerResult[]>;
  onClose: () => void;
  currentOrderItems: PickerLine[];
};
const mockPicker: { props?: PickerProps; mounts: number } = { mounts: 0 };
jest.mock('../ItemCatalogBrowser', () => {
  const ReactActual = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: PickerProps) => {
      mockPicker.props = props;
      ReactActual.useEffect(() => { mockPicker.mounts += 1; }, []);
      return null;
    },
  };
});
const mockLive: { refresh?: () => Promise<void> | void } = {};
jest.mock('@/hooks/useOrderLiveUpdates', () => ({
  useOrderLiveUpdates: (refresh: () => Promise<void> | void) => { mockLive.refresh = refresh; },
}));
const mockSession = { generation: 1 };
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => mockSession.generation }));
// What the phone reports about its network; read when the editor renders.
const mockNetwork = { isConnected: true };
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockNetwork.isConnected }) }));
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
jest.mock('../OrderItemCard', () => ({ __esModule: true, default: () => null }));
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
const line = (lot: string, quantity: number, status = 'pending'): OrderItem => ({
  id: `line-${lot}`,
  order_id: ORDER_ID,
  grn_item_id: lot,
  requested_quantity: quantity,
  item_status: status,
  created_at: '2026-10-01T08:00:00Z',
  grn_item: { id: lot, name: `Fictional ${lot}`, packaging: 'Bag', current_stock: 50, original_quantity: 50, gr_id: 'grn-fictional' },
});
const makeOrder = (): Order => ({
  id: ORDER_ID,
  customer_id: 'customer-fictional-1',
  customer: { id: 'customer-fictional-1', name: 'Fictional Farms' } as Order['customer'],
  created_at: '2026-10-01T08:00:00Z',
  items: [line('lot-kept', 2), line('lot-open', 5), line('lot-done', 6, 'fulfilled')],
});
// The server answers with new objects every time.
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const saved = { success: true, message: '' } as never;
const refusal = (message: string, error: unknown = 'API_ERROR') => ({ success: false, message, error }) as never;
// A failure whose own text is in `error`, under the app's text for the action: how
// OrderService hands back a call without an answer, and an exception the server raised.
const failedWith = (error: string) => ({ success: false, message: "Couldn't save the item.", error }) as never;
const timedOut = failedWith('TimeoutError: Request timeout');
const NOT_SAVED = 'Not saved. Check your connection and try again.';

const service = jest.mocked(OrderService);
let server: Order;
let renderer: ReactTestRenderer | undefined;
let logged: jest.SpyInstance;

async function openPicker() {
  await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" itemCatalogOpen onCloseItemCatalog={jest.fn()} />); });
  expect(mockPicker.props).toBeDefined();
  return mockPicker.props!;
}
async function send(changes: PickerChange[], onProgress?: (position: number, total: number) => void) {
  let results!: PickerResult[];
  await act(async () => { results = await mockPicker.props!.onAddItems(changes, onProgress); });
  return results;
}

beforeEach(() => {
  mockPicker.props = undefined;
  mockPicker.mounts = 0;
  mockSession.generation = 1;
  mockNetwork.isConnected = true;
  server = makeOrder();
  service.getOrCreateOrder.mockReset().mockResolvedValue({ success: true, data: { cart_id: ORDER_ID } } as never);
  service.getOrderWithItems.mockReset().mockImplementation(async () => ({ success: true, data: copy(server) }) as never);
  service.addItemToOrder.mockReset().mockResolvedValue(saved);
  service.updateOrderItemQuantity.mockReset().mockResolvedValue(saved);
  service.removeItemFromOrder.mockReset().mockResolvedValue(saved);
  jest.mocked(showAlert).mockReset();
  // A refusal is logged for the developer; it is not a test failure.
  logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  logged.mockRestore();
});

it('does not remove a line another user added while the picker was open', async () => {
  await openPicker();
  // Meanwhile someone else adds a lot, and the order is read again.
  server.items!.push(line('lot-other', 9));
  await act(async () => { await mockLive.refresh?.(); });
  const reads = service.getOrderWithItems.mock.calls.length;

  // The picker sends the one lot its user chose.
  const results = await send([{ grnItemId: 'lot-new', quantity: 3 }]);

  expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-new', 3]]);
  expect(service.removeItemFromOrder).not.toHaveBeenCalled();
  expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
  expect(results).toEqual([{ grnItemId: 'lot-new', ok: true }]);
  // The order is read again once, after the save.
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
  expect(showAlert).not.toHaveBeenCalled();
});

it('gives the picker the same saved lines until they change, and keeps it mounted', async () => {
  const first = (await openPicker()).currentOrderItems;
  expect(first.map(item => [item.grnItemId, item.quantity])).toEqual([['lot-kept', 2], ['lot-open', 5]]);
  // A read that brings the same lines back: the same array, not a new one.
  await act(async () => { await mockLive.refresh?.(); });
  expect(mockPicker.props!.currentOrderItems).toBe(first);
  // A changed line gives a new one.
  server.items![0].requested_quantity = 4;
  await act(async () => { await mockLive.refresh?.(); });
  expect(mockPicker.props!.currentOrderItems).not.toBe(first);
  expect(mockPicker.mounts).toBe(1);
});

it('puts a refusal on its lot with the app\'s reason and shows no alert', async () => {
  await openPicker();
  service.addItemToOrder
    .mockResolvedValueOnce(refusal('Insufficient stock. Available: 3, Requested: 10'))
    .mockResolvedValueOnce(saved);
  const reads = service.getOrderWithItems.mock.calls.length;

  const results = await send([{ grnItemId: 'lot-short', quantity: 10 }, { grnItemId: 'lot-fine', quantity: 1 }]);

  expect(results).toEqual([
    { grnItemId: 'lot-short', ok: false, reason: 'Only 3 bags in stock.' },
    { grnItemId: 'lot-fine', ok: true },
  ]);
  expect(showAlert).not.toHaveBeenCalled();
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
});

it('reads the order again after a refusal, also when nothing was saved', async () => {
  await openPicker();
  service.addItemToOrder.mockResolvedValue(refusal('Cannot add items to DISPATCHED orders', { code: 'ORDER_NOT_OPEN' }));
  const reads = service.getOrderWithItems.mock.calls.length;
  const results = await send([{ grnItemId: 'lot-new', quantity: 1 }]);
  expect(results).toEqual([{ grnItemId: 'lot-new', ok: false, reason: 'This order is closed. Go back and open it again.' }]);
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
  expect(showAlert).not.toHaveBeenCalled();
});

describe('each change against the lines saved now', () => {
  it('makes no call for a quantity that is already saved', async () => {
    await openPicker();
    const reads = service.getOrderWithItems.mock.calls.length;
    expect(await send([{ grnItemId: 'lot-open', quantity: 5 }])).toEqual([{ grnItemId: 'lot-open', ok: true }]);
    expect(service.addItemToOrder).not.toHaveBeenCalled();
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads);
  });

  it('changes the quantity of a line that exists, also one saved by someone else since the picker opened', async () => {
    await openPicker();
    server.items!.push(line('lot-other', 9));
    await act(async () => { await mockLive.refresh?.(); });
    // The picker opened without lot-other, so to it this is a new lot.
    const results = await send([{ grnItemId: 'lot-open', quantity: 8 }, { grnItemId: 'lot-other', quantity: 2 }]);
    expect(service.updateOrderItemQuantity.mock.calls).toEqual([
      ['line-lot-open', ORDER_ID, 8],
      ['line-lot-other', ORDER_ID, 2],
    ]);
    expect(service.addItemToOrder).not.toHaveBeenCalled();
    expect(results.every(result => result.ok)).toBe(true);
  });

  it('removes an open line, and counts a line that is already gone as done', async () => {
    await openPicker();
    service.removeItemFromOrder
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce(refusal('Order item not found'));
    const results = await send([{ grnItemId: 'lot-kept', quantity: 0 }, { grnItemId: 'lot-open', quantity: 0 }]);
    expect(service.removeItemFromOrder.mock.calls).toEqual([['line-lot-kept', ORDER_ID], ['line-lot-open', ORDER_ID]]);
    expect(results).toEqual([{ grnItemId: 'lot-kept', ok: true }, { grnItemId: 'lot-open', ok: true }]);
  });

  it('makes no call to remove a lot that has no line or whose line is no longer open', async () => {
    await openPicker();
    const results = await send([{ grnItemId: 'lot-never', quantity: 0 }, { grnItemId: 'lot-done', quantity: 0 }]);
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(results).toEqual([{ grnItemId: 'lot-never', ok: true }, { grnItemId: 'lot-done', ok: true }]);
  });

  it('puts a refused removal on its lot', async () => {
    await openPicker();
    service.removeItemFromOrder.mockResolvedValueOnce(refusal('Cannot remove items from DISPATCHED orders', { code: 'ORDER_NOT_OPEN' }));
    expect(await send([{ grnItemId: 'lot-open', quantity: 0 }])).toEqual([
      { grnItemId: 'lot-open', ok: false, reason: 'This order is closed. Go back and open it again.' },
    ]);
  });

  it('saves quantities before removals, one after another, and reports the lot being saved', async () => {
    await openPicker();
    const order: string[] = [];
    service.addItemToOrder.mockImplementation(async (_order, lot) => { order.push(`add ${lot}`); return saved; });
    service.updateOrderItemQuantity.mockImplementation(async id => { order.push(`change ${id}`); return saved; });
    service.removeItemFromOrder.mockImplementation(async id => { order.push(`remove ${id}`); return saved; });
    const progress = jest.fn();

    const changes = [
      { grnItemId: 'lot-kept', quantity: 0 },
      { grnItemId: 'lot-new', quantity: 4 },
      { grnItemId: 'lot-open', quantity: 7 },
    ];
    const results = await send(changes, progress);

    expect(order).toEqual(['add lot-new', 'change line-lot-open', 'remove line-lot-kept']);
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
    // The answers come back in the order the picker sent the lots.
    expect(results.map(result => result.grnItemId)).toEqual(['lot-kept', 'lot-new', 'lot-open']);
  });
});

describe('a call without an answer ends the save', () => {
  // Three kinds of call are waiting behind the first lot: an add, a change and a removal.
  const CHANGES = [
    { grnItemId: 'lot-kept', quantity: 0 },
    { grnItemId: 'lot-one', quantity: 1 },
    { grnItemId: 'lot-two', quantity: 1 },
    { grnItemId: 'lot-open', quantity: 7 },
  ];
  const noneSaved = CHANGES.map(change => ({ grnItemId: change.grnItemId, ok: false, reason: NOT_SAVED }));

  it.each([
    ['timed out', timedOut],
    ['could not be sent', failedWith('TypeError: Network request failed')],
    ['could not renew the session for want of a connection', failedWith('Network request failed: session refresh unavailable')],
  ])('a call that %s: nothing more is sent, every lot left comes back not saved, and the order is read again', async (_name, failure) => {
    await openPicker();
    service.addItemToOrder.mockResolvedValueOnce(failure);
    const reads = service.getOrderWithItems.mock.calls.length;
    const progress = jest.fn();

    const results = await send(CHANGES, progress);

    expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-one', 1]]);
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(results).toEqual(noneSaved);
    expect(progress.mock.calls).toEqual([[1, 4]]);
    // The one call may have been applied: the order is read again, once.
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('keeps what was saved before it, and stops at a change or a removal just the same', async () => {
    await openPicker();
    service.updateOrderItemQuantity.mockResolvedValueOnce(timedOut);
    const results = await send(CHANGES);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(2);
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(results).toEqual([
      { grnItemId: 'lot-kept', ok: false, reason: NOT_SAVED },
      { grnItemId: 'lot-one', ok: true },
      { grnItemId: 'lot-two', ok: true },
      { grnItemId: 'lot-open', ok: false, reason: NOT_SAVED },
    ]);

    service.removeItemFromOrder.mockReset().mockResolvedValueOnce(timedOut);
    expect(await send([{ grnItemId: 'lot-kept', quantity: 0 }, { grnItemId: 'lot-open', quantity: 0 }])).toEqual([
      { grnItemId: 'lot-kept', ok: false, reason: NOT_SAVED },
      { grnItemId: 'lot-open', ok: false, reason: NOT_SAVED },
    ]);
    expect(service.removeItemFromOrder).toHaveBeenCalledTimes(1);
  });

  it('never rejects: a call that throws is a lot not saved, and the rest is not sent', async () => {
    await openPicker();
    service.addItemToOrder
      .mockRejectedValueOnce(new Error('fictional failure'))
      .mockResolvedValueOnce(saved);
    const reads = service.getOrderWithItems.mock.calls.length;
    const results = await send([{ grnItemId: 'lot-one', quantity: 1 }, { grnItemId: 'lot-two', quantity: 1 }]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { grnItemId: 'lot-one', ok: false, reason: NOT_SAVED },
      { grnItemId: 'lot-two', ok: false, reason: NOT_SAVED },
    ]);
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('answers also when the read after it fails or throws', async () => {
    await openPicker();
    service.addItemToOrder.mockResolvedValue(timedOut);
    const reads = service.getOrderWithItems.mock.calls.length;
    service.getOrderWithItems.mockResolvedValueOnce({ success: false, message: '', error: 'TimeoutError: Request timeout' } as never);
    expect(await send([{ grnItemId: 'lot-one', quantity: 1 }])).toEqual([{ grnItemId: 'lot-one', ok: false, reason: NOT_SAVED }]);
    service.getOrderWithItems.mockRejectedValueOnce(new Error('fictional failure'));
    expect(await send([{ grnItemId: 'lot-one', quantity: 1 }])).toEqual([{ grnItemId: 'lot-one', ok: false, reason: NOT_SAVED }]);
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 2);
    // The editor still has its order: the next save is sent.
    service.addItemToOrder.mockResolvedValue(saved);
    expect(await send([{ grnItemId: 'lot-one', quantity: 1 }])).toEqual([{ grnItemId: 'lot-one', ok: true }]);
  });
});

describe('a refusal is an answer: the next lot is sent', () => {
  it.each([
    ['not enough stock', refusal('Insufficient stock. Available: 3, Requested: 10'), 'Only 3 bags in stock.'],
    ['already in the order', refusal('Item already exists in order'), 'This lot is already in the order.'],
    ['below what was dispatched', refusal('Quantity cannot be below the 4 already dispatched'), '4 bags already dispatched. Choose that many or more.'],
    ['the order is closed', refusal('Cannot add items to DISPATCHED orders', { code: 'ORDER_NOT_OPEN' }), 'This order is closed. Go back and open it again.'],
    ['access refused (raised 42501)', failedWith('Customer access denied'), 'You do not have permission to perform this action.'],
    ['database text', refusal('Error adding item: deadlock detected'), NOT_SAVED],
  ])('%s', async (_name, failure, reason) => {
    await openPicker();
    service.addItemToOrder.mockResolvedValueOnce(failure).mockResolvedValueOnce(saved);
    const results = await send([{ grnItemId: 'lot-one', quantity: 10 }, { grnItemId: 'lot-two', quantity: 1 }]);
    expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-one', 10], [ORDER_ID, 'lot-two', 1]]);
    expect(results).toEqual([{ grnItemId: 'lot-one', ok: false, reason }, { grnItemId: 'lot-two', ok: true }]);
  });
});

it('finds a lot saved on the next Add when the write that timed out was in fact applied', async () => {
  await openPicker();
  // The server stores the line; its answer never arrives.
  service.addItemToOrder.mockImplementationOnce(async (_order, lot, quantity) => {
    server.items!.push(line(lot, quantity));
    return timedOut;
  });
  const reads = service.getOrderWithItems.mock.calls.length;

  expect(await send([{ grnItemId: 'lot-new', quantity: 3 }])).toEqual([{ grnItemId: 'lot-new', ok: false, reason: NOT_SAVED }]);
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
  // The picker is told the lot is in the order now.
  expect(mockPicker.props!.currentOrderItems.map(item => [item.grnItemId, item.quantity])).toContainEqual(['lot-new', 3]);

  // Add again: the lot is there with that quantity, so nothing is sent and it counts as saved.
  expect(await send([{ grnItemId: 'lot-new', quantity: 3 }])).toEqual([{ grnItemId: 'lot-new', ok: true }]);
  expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
  expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
});

it('sends a change again as an add once the line someone else removed is known to be gone', async () => {
  await openPicker();
  // Someone else removed the line; this phone has not heard of it yet.
  server.items = server.items!.filter(item => item.grn_item_id !== 'lot-open');
  service.updateOrderItemQuantity.mockResolvedValueOnce(refusal('Order item not found'));

  expect(await send([{ grnItemId: 'lot-open', quantity: 8 }])).toEqual([{ grnItemId: 'lot-open', ok: false, reason: NOT_SAVED }]);
  expect(await send([{ grnItemId: 'lot-open', quantity: 8 }])).toEqual([{ grnItemId: 'lot-open', ok: true }]);
  expect(service.updateOrderItemQuantity).toHaveBeenCalledTimes(1);
  expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-open', 8]]);
});

describe('with no network at all', () => {
  it('sends nothing and answers at once: not saved, except what needs no call', async () => {
    mockNetwork.isConnected = false;
    await openPicker();
    const reads = service.getOrderWithItems.mock.calls.length;

    const results = await send([
      { grnItemId: 'lot-open', quantity: 5 },
      { grnItemId: 'lot-new', quantity: 3 },
      { grnItemId: 'lot-kept', quantity: 0 },
    ]);

    expect(service.addItemToOrder).not.toHaveBeenCalled();
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(results).toEqual([
      // Saved with that quantity already: true without asking the server.
      { grnItemId: 'lot-open', ok: true },
      { grnItemId: 'lot-new', ok: false, reason: NOT_SAVED },
      { grnItemId: 'lot-kept', ok: false, reason: NOT_SAVED },
    ]);
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads);
    expect(showAlert).not.toHaveBeenCalled();
  });
});

it('stops when the session changes: the lots not sent are not saved, and the order is not read', async () => {
  await openPicker();
  service.addItemToOrder.mockImplementationOnce(async () => {
    // A sign-out or a change of facility while the first lot is being saved.
    mockSession.generation += 1;
    return saved;
  });
  const reads = service.getOrderWithItems.mock.calls.length;
  const results = await send([{ grnItemId: 'lot-one', quantity: 1 }, { grnItemId: 'lot-two', quantity: 1 }]);
  expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
  expect(results).toEqual([
    { grnItemId: 'lot-one', ok: true },
    { grnItemId: 'lot-two', ok: false, reason: 'Not saved. Check your connection and try again.' },
  ]);
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads);
});
