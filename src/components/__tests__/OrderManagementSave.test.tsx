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
 *  - A call that could not be sent (no connection, no session) or that threw ends
 *    the save; the lots not sent come back not saved.
 *  - A call whose answer was lost (owner decision D22, 2026-10-20) is not a failure:
 *    the lot is locked and named to the picker, the save waits for the server (the
 *    10 s wait is stubbed here) and reads the order, gives the lot the server's
 *    state, sends nothing again, and goes on with the next lot.
 *  - The order is read again after any call, saved or not.
 *  - That read is waited for when the server answered every call, and only
 *    started when the save ended for want of a connection.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import OrderManagement from '../OrderManagement';
import { OrderService } from '@/services/order-service';
import { showAlert } from '@/utils/alert';
import type { Order, OrderItem } from '@/types/order.types';
import type { AddItemsOptions, PickerChange, PickerLine, PickerResult } from '@/features/orders/pickerDraft';
import { abortedError, waitForServer } from '@/utils/lostAnswer';

type PickerProps = {
  onAddItems: (changes: PickerChange[], onProgress?: (position: number, total: number) => void, options?: AddItemsOptions) => Promise<PickerResult[]>;
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
const mockSession = { generation: 1 };
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => mockSession.generation }));
// What the phone reports about its network; read when the editor renders.
const mockNetwork: { isConnected: boolean; type: string | null } = { isConnected: true, type: 'wifi' };
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockNetwork.isConnected, type: mockNetwork.type }) }));
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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
// `lostAnswer` is the flag executeRPC computed (it knew the HTTP status and the SQL code) and OrderService passes on:
// the call went out and no answer came.
const failedWith = (error: string, lostAnswer = false) =>
  ({ success: false, message: "Couldn't save the item.", error, ...(lostAnswer ? { lostAnswer: true } : {}) }) as never;
// A call that went out and got no answer (a timeout, a dropped connection): the lot may be on the order already.
const timedOut = failedWith('TimeoutError: Request timeout', true);
// A call that never left the phone (no session could be renewed for want of a connection): nothing was sent.
const notSent = failedWith('Network request failed: session refresh unavailable');
const NOT_SAVED = 'Not saved. Check your connection and try again.';

const service = jest.mocked(OrderService);
let server: Order;
let renderer: ReactTestRenderer | undefined;
let logged: jest.SpyInstance;

const editor = () => <OrderManagement customerId="customer-fictional-1" itemCatalogOpen onCloseItemCatalog={jest.fn()} />;
async function openPicker() {
  await act(async () => { renderer = create(editor()); });
  expect(mockPicker.props).toBeDefined();
  return mockPicker.props!;
}
// A change as the picker sends it. `expected` is what the picker saw saved when it
// opened (makeOrder: lot-kept 2, lot-open 5, anything else not in the order).
type Ask = Omit<PickerChange, 'expected'> & { expected?: number };
const OPENED_WITH: Record<string, number> = { 'lot-kept': 2, 'lot-open': 5 };
const asked = (changes: Ask[]): PickerChange[] =>
  changes.map(change => ({ ...change, expected: change.expected ?? OPENED_WITH[change.grnItemId] ?? 0 }));
async function send(changes: Ask[], onProgress?: (position: number, total: number) => void, options?: AddItemsOptions) {
  let results!: PickerResult[];
  await act(async () => { results = await mockPicker.props!.onAddItems(asked(changes), onProgress, options); });
  return results;
}
// Lets everything that is not waiting for a call run to its end.
const settle = () => act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
// Starts a save without waiting for it: `results` is there once the save has answered.
async function start(changes: Ask[], options?: AddItemsOptions) {
  const save: { results?: PickerResult[] } = {};
  await act(async () => { void mockPicker.props!.onAddItems(asked(changes), undefined, options).then(results => { save.results = results; }); });
  await settle();
  return save;
}
// A call that answers when the test says so.
function waiting<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>(resolve => { answer = resolve; });
  return { promise, answer };
}

beforeEach(() => {
  mockPicker.props = undefined;
  mockPicker.mounts = 0;
  mockSession.generation = 1;
  mockNetwork.isConnected = true;
  mockNetwork.type = 'wifi';
  server = makeOrder();
  service.getOrCreateOrder.mockReset().mockResolvedValue({ success: true, data: { cart_id: ORDER_ID } } as never);
  service.getOrderWithItems.mockReset().mockImplementation(async () => ({ success: true, data: copy(server) }) as never);
  service.addItemToOrder.mockReset().mockResolvedValue(saved);
  service.updateOrderItemQuantity.mockReset().mockResolvedValue(saved);
  service.removeItemFromOrder.mockReset().mockResolvedValue(saved);
  jest.mocked(waitForServer).mockClear();
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
    // The picker was opened after lot-other was saved (it expects 9), so its change is knowing.
    const results = await send([{ grnItemId: 'lot-open', quantity: 8 }, { grnItemId: 'lot-other', quantity: 2, expected: 9 }]);
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

describe('a line changed by someone else is never overwritten unseen', () => {
  const sees = async () => { await act(async () => { await mockLive.refresh?.(); }); };

  it('answers a lot someone else added meanwhile with the saved quantity and no call; the next Add saves it', async () => {
    await openPicker();
    // The picker opened without lot-b; someone else adds 6 bags of it.
    server.items!.push(line('lot-b', 6));
    await sees();

    const first = await send([{ grnItemId: 'lot-b', quantity: 1, expected: 0 }]);
    expect(first).toEqual([{
      grnItemId: 'lot-b', ok: false, savedQuantity: 6,
      reason: 'Changed by someone else: now 6 bags in the order. Tap Add again to make it 1 bag.',
    }]);
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
    expect(service.addItemToOrder).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();

    // The picker now expects 6; the user taps Add again.
    expect(await send([{ grnItemId: 'lot-b', quantity: 1, expected: 6 }])).toEqual([{ grnItemId: 'lot-b', ok: true }]);
    expect(service.updateOrderItemQuantity.mock.calls).toEqual([['line-lot-b', ORDER_ID, 1]]);
  });

  it('answers a seeded lot that was changed elsewhere (5 to 8) without a call', async () => {
    await openPicker();
    server.items!.find(item => item.grn_item_id === 'lot-open')!.requested_quantity = 8;
    await sees();
    const results = await send([{ grnItemId: 'lot-open', quantity: 3 }]);
    expect(results).toEqual([{
      grnItemId: 'lot-open', ok: false, savedQuantity: 8,
      reason: 'Changed by someone else: now 8 bags in the order. Tap Add again to make it 3 bags.',
    }]);
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
  });

  it('says so when the line was removed elsewhere, and still answers a quantity already saved as done', async () => {
    await openPicker();
    server.items = server.items!.filter(item => item.grn_item_id !== 'lot-open');
    await sees();
    expect(await send([{ grnItemId: 'lot-open', quantity: 4 }])).toEqual([{
      grnItemId: 'lot-open', ok: false, savedQuantity: 0, reason: 'Removed by someone else. Tap Add again to add 4 bags.',
    }]);
    expect(service.addItemToOrder).not.toHaveBeenCalled();
    // Someone else already made it what the user asked for: nothing to do.
    expect(await send([{ grnItemId: 'lot-kept', quantity: 2, expected: 1 }])).toEqual([{ grnItemId: 'lot-kept', ok: true }]);
  });

  it('does not remove a line that was changed elsewhere (removal conflict); the next Add removes it', async () => {
    await openPicker();
    server.items!.find(item => item.grn_item_id === 'lot-open')!.requested_quantity = 8;
    await sees();
    expect(await send([{ grnItemId: 'lot-open', quantity: 0 }])).toEqual([{
      grnItemId: 'lot-open', ok: false, savedQuantity: 8,
      reason: 'Changed by someone else: now 8 bags in the order. Tap Add again to remove it.',
    }]);
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(await send([{ grnItemId: 'lot-open', quantity: 0, expected: 8 }])).toEqual([{ grnItemId: 'lot-open', ok: true }]);
    expect(service.removeItemFromOrder.mock.calls).toEqual([['line-lot-open', ORDER_ID]]);
  });

  it('does not take a fully dispatched line for a saved one: a closed line with the asked-for quantity still gets the call', async () => {
    await openPicker();
    // lot-done has a fulfilled line of 6; the picker never had it.
    const results = await send([{ grnItemId: 'lot-done', quantity: 6 }]);
    expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-done', 6]]);
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
    expect(results).toEqual([{ grnItemId: 'lot-done', ok: true }]);
  });

  it('reports a refusal for a fully dispatched line as a refusal, not as saved', async () => {
    await openPicker();
    service.addItemToOrder.mockResolvedValueOnce(refusal('Item already exists in order'));
    expect(await send([{ grnItemId: 'lot-done', quantity: 6 }])).toEqual([
      { grnItemId: 'lot-done', ok: false, reason: 'This lot is already in the order.' },
    ]);
  });
});

describe('a call that could not be sent ends the save', () => {
  // Three kinds of call are waiting behind the first lot: an add, a change and a removal.
  const CHANGES = [
    { grnItemId: 'lot-kept', quantity: 0 },
    { grnItemId: 'lot-one', quantity: 1 },
    { grnItemId: 'lot-two', quantity: 1 },
    { grnItemId: 'lot-open', quantity: 7 },
  ];
  const noneSaved = CHANGES.map(change => ({ grnItemId: change.grnItemId, ok: false, reason: NOT_SAVED }));

  it('a call that could not renew the session for want of a connection (nothing was sent): nothing more is sent, every lot comes back not saved, and the order is read again', async () => {
    await openPicker();
    service.addItemToOrder.mockResolvedValueOnce(notSent);
    const reads = service.getOrderWithItems.mock.calls.length;
    const progress = jest.fn();

    const results = await send(CHANGES, progress);

    expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-one', 1]]);
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(results).toEqual(noneSaved);
    expect(progress.mock.calls).toEqual([[1, 4]]);
    // The one call was never sent, but the order is read again, once, all the same.
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
    // Nothing was sent that could be lost: nothing is checked.
    expect(waitForServer).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('keeps what was saved before it, and stops at a change or a removal just the same', async () => {
    await openPicker();
    service.updateOrderItemQuantity.mockResolvedValueOnce(notSent);
    const results = await send(CHANGES);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(2);
    expect(service.removeItemFromOrder).not.toHaveBeenCalled();
    expect(results).toEqual([
      { grnItemId: 'lot-kept', ok: false, reason: NOT_SAVED },
      { grnItemId: 'lot-one', ok: true },
      { grnItemId: 'lot-two', ok: true },
      { grnItemId: 'lot-open', ok: false, reason: NOT_SAVED },
    ]);

    service.removeItemFromOrder.mockReset().mockResolvedValueOnce(notSent);
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
    service.addItemToOrder.mockResolvedValue(notSent);
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

// Owner decision D22 (2026-10-20): a call whose answer was lost is checked, not resent and not called a failure.
describe('a call whose answer was lost is checked', () => {
  // The order of sending is quantities first, removals last: lot-one (add), lot-two (add), lot-open (change), lot-kept (removal).
  const CHANGES = [
    { grnItemId: 'lot-kept', quantity: 0 },
    { grnItemId: 'lot-one', quantity: 1 },
    { grnItemId: 'lot-two', quantity: 1 },
    { grnItemId: 'lot-open', quantity: 7 },
  ];
  const NOT_SAVED_ONE = 'Checked: it was not saved. Tap Add again to add 1 bag.';

  it.each([
    ['timed out (it had gone out)', timedOut],
    ['broke the connection after it had gone out', failedWith('TypeError: Network request failed', true)],
  ])('a call that %s: the lot is named to the picker, the server is asked, the lot shows what it has, nothing is sent again, and the next lots are sent', async (_name, failure) => {
    await openPicker();
    // The server never stored the first lot.
    service.addItemToOrder.mockResolvedValueOnce(failure);
    const reads = service.getOrderWithItems.mock.calls.length;
    const progress = jest.fn();
    const onChecking = jest.fn();

    const results = await send(CHANGES, progress, { onChecking });

    // Each call was sent once: the lost one is not sent again, and the lots after it are sent.
    expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-one', 1], [ORDER_ID, 'lot-two', 1]]);
    expect(service.updateOrderItemQuantity.mock.calls).toEqual([['line-lot-open', ORDER_ID, 7]]);
    expect(service.removeItemFromOrder.mock.calls).toEqual([['line-lot-kept', ORDER_ID]]);
    expect(results).toEqual([
      { grnItemId: 'lot-kept', ok: true },
      { grnItemId: 'lot-one', ok: false, reason: NOT_SAVED_ONE, savedQuantity: 0 },
      { grnItemId: 'lot-two', ok: true },
      { grnItemId: 'lot-open', ok: true },
    ]);
    expect(progress.mock.calls).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    // The picker is told which lot is being checked, and when that is over.
    expect(onChecking.mock.calls).toEqual([[{ grnItemId: 'lot-one', removal: false }], [null]]);
    // The wait for the server (10 s, online) was asked for once, for that call.
    expect(waitForServer).toHaveBeenCalledTimes(1);
    // The check read the order once, and the save reads it once more at its end.
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 2);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a lot the server did apply is saved: the answer was lost, the lot is not', async () => {
    await openPicker();
    service.addItemToOrder.mockImplementationOnce(async (_order, lot, quantity) => {
      server.items!.push(line(lot, quantity));
      return timedOut;
    });
    const results = await send([{ grnItemId: 'lot-new', quantity: 3 }]);
    expect(results).toEqual([{ grnItemId: 'lot-new', ok: true }]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    // The picker is told the lot is in the order now.
    expect(mockPicker.props!.currentOrderItems.map(item => [item.grnItemId, item.quantity])).toContainEqual(['lot-new', 3]);
  });

  it('a change the server did apply is saved, and one it did not shows the quantity it has', async () => {
    await openPicker();
    service.updateOrderItemQuantity.mockImplementationOnce(async () => {
      server.items!.find(item => item.id === 'line-lot-open')!.requested_quantity = 7;
      return timedOut;
    });
    expect(await send([{ grnItemId: 'lot-open', quantity: 7 }])).toEqual([{ grnItemId: 'lot-open', ok: true }]);

    // Someone else made it 6 meanwhile; this change (to 9) never arrived.
    service.updateOrderItemQuantity.mockReset().mockImplementationOnce(async () => {
      server.items!.find(item => item.id === 'line-lot-open')!.requested_quantity = 6;
      return timedOut;
    });
    expect(await send([{ grnItemId: 'lot-open', quantity: 9, expected: 7 }])).toEqual([
      { grnItemId: 'lot-open', ok: false, reason: 'Checked: the order has 6 bags now. Tap Add again to make it 9 bags.', savedQuantity: 6 },
    ]);
  });

  it('a removal the server did apply is done, and one it did not says so and shows the quantity the line has', async () => {
    await openPicker();
    service.removeItemFromOrder.mockImplementationOnce(async () => {
      server.items = server.items!.filter(item => item.id !== 'line-lot-kept');
      return timedOut;
    });
    const onChecking = jest.fn();
    expect(await send([{ grnItemId: 'lot-kept', quantity: 0 }], undefined, { onChecking })).toEqual([{ grnItemId: 'lot-kept', ok: true }]);
    // A removal is told to the picker as one, so it says "deleted".
    expect(onChecking.mock.calls[0]).toEqual([{ grnItemId: 'lot-kept', removal: true }]);

    service.removeItemFromOrder.mockReset().mockResolvedValueOnce(timedOut);
    expect(await send([{ grnItemId: 'lot-open', quantity: 0 }])).toEqual([
      { grnItemId: 'lot-open', ok: false, reason: 'Checked: it was not removed. Tap Add again to remove it.', savedQuantity: 5 },
    ]);
  });

  it('waits for the server before it reads, and sends nothing while it waits', async () => {
    await openPicker();
    const wait = waiting<void>();
    jest.mocked(waitForServer).mockImplementationOnce(() => wait.promise);
    service.addItemToOrder.mockResolvedValueOnce(timedOut);
    const reads = service.getOrderWithItems.mock.calls.length;
    const onChecking = jest.fn();

    const save = await start([{ grnItemId: 'lot-one', quantity: 1 }, { grnItemId: 'lot-two', quantity: 1 }], { onChecking });

    // Waiting: the lot is named, the second lot is not sent, nothing was read, the save has not answered.
    expect(onChecking.mock.calls).toEqual([[{ grnItemId: 'lot-one', removal: false }]]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads);
    expect(save.results).toBeUndefined();
    // It was told when the request went out, and could be stopped.
    const [sentAt, signal] = jest.mocked(waitForServer).mock.calls[0];
    expect(typeof sentAt).toBe('number');
    expect(signal).toBeInstanceOf(AbortSignal);

    await act(async () => { wait.answer(); });
    await settle();
    expect(service.addItemToOrder).toHaveBeenCalledTimes(2);
    expect(save.results).toEqual([
      { grnItemId: 'lot-one', ok: false, reason: 'Checked: it was not saved. Tap Add again to add 1 bag.', savedQuantity: 0 },
      { grnItemId: 'lot-two', ok: true },
    ]);
    expect(onChecking.mock.calls).toEqual([[{ grnItemId: 'lot-one', removal: false }], [null]]);
  });

  it('is stopped when the picker is left: the lot is not known, the rest is not sent, nothing is resent', async () => {
    await openPicker();
    jest.mocked(waitForServer).mockImplementationOnce((_sentAt, signal) => new Promise<void>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(abortedError()));
    }));
    service.addItemToOrder.mockResolvedValueOnce(timedOut);
    const controller = new AbortController();
    const onChecking = jest.fn();

    const save = await start([{ grnItemId: 'lot-one', quantity: 1 }, { grnItemId: 'lot-two', quantity: 1 }], { onChecking, signal: controller.signal });
    expect(save.results).toBeUndefined();

    await act(async () => { controller.abort(); });
    await settle();

    expect(save.results).toEqual([
      { grnItemId: 'lot-one', ok: false, reason: 'It may have been saved. Check the list before entering it again.' },
      { grnItemId: 'lot-two', ok: false, reason: NOT_SAVED },
    ]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(onChecking.mock.calls).toEqual([[{ grnItemId: 'lot-one', removal: false }], [null]]);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('is stopped between lots when the person chose Leave anyway: the lots not yet sent come back not saved', async () => {
    await openPicker();
    const controller = new AbortController();
    // The first lot is answered while the person leaves.
    service.addItemToOrder.mockImplementationOnce(async () => {
      controller.abort();
      return saved;
    });

    const results = await send([{ grnItemId: 'lot-one', quantity: 1 }, { grnItemId: 'lot-two', quantity: 1 }], undefined, { signal: controller.signal });

    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ grnItemId: 'lot-one', ok: true }, { grnItemId: 'lot-two', ok: false, reason: NOT_SAVED }]);
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

  // The lot is checked, found, and answered as saved; the check read it, and the save read once more.
  expect(await send([{ grnItemId: 'lot-new', quantity: 3 }])).toEqual([{ grnItemId: 'lot-new', ok: true }]);
  expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 2);
  // The picker is told the lot is in the order now.
  expect(mockPicker.props!.currentOrderItems.map(item => [item.grnItemId, item.quantity])).toContainEqual(['lot-new', 3]);

  // Add again: the lot is there with that quantity, so nothing is sent and it counts as saved.
  expect(await send([{ grnItemId: 'lot-new', quantity: 3, expected: 3 }])).toEqual([{ grnItemId: 'lot-new', ok: true }]);
  expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
  expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
});

it('sends a change again as an add once the line someone else removed is known to be gone, after the user has been told', async () => {
  await openPicker();
  // Someone else removed the line; this phone has not heard of it yet.
  server.items = server.items!.filter(item => item.grn_item_id !== 'lot-open');
  service.updateOrderItemQuantity.mockResolvedValueOnce(refusal('Order item not found'));

  // The server's "Order item not found" is told at once as "removed by someone else", and the lot is back to "not in the order".
  expect(await send([{ grnItemId: 'lot-open', quantity: 8 }])).toEqual([
    { grnItemId: 'lot-open', ok: false, reason: 'Removed by someone else. Tap Add again to add 8 bags.', savedQuantity: 0 },
  ]);
  // The read has shown the line is gone: the picker expected 5, so this is a change it has not seen.
  expect(await send([{ grnItemId: 'lot-open', quantity: 8 }])).toEqual([
    { grnItemId: 'lot-open', ok: false, reason: 'Removed by someone else. Tap Add again to add 8 bags.', savedQuantity: 0 },
  ]);
  expect(service.addItemToOrder).not.toHaveBeenCalled();
  // The picker now expects 0, and the next Add adds.
  expect(await send([{ grnItemId: 'lot-open', quantity: 8, expected: 0 }])).toEqual([{ grnItemId: 'lot-open', ok: true }]);
  expect(service.updateOrderItemQuantity).toHaveBeenCalledTimes(1);
  expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-open', 8]]);
});

describe('the read after the save', () => {
  const TWO = [{ grnItemId: 'lot-one', quantity: 1 }, { grnItemId: 'lot-two', quantity: 1 }];
  // A read on a connection that stopped answering: it is started and never answers.
  const readNeverAnswers = () => service.getOrderWithItems.mockImplementationOnce(() => new Promise<never>(() => undefined));
  const orderRead = () => ({ success: true, data: copy(server) }) as never;

  it.each([
    ['could not be sent', () => service.addItemToOrder.mockResolvedValueOnce(notSent), NOT_SAVED],
    ['threw', () => service.addItemToOrder.mockRejectedValueOnce(new Error('fictional failure')), NOT_SAVED],
  ])('is started and not waited for when the first call %s: the save answers while the read is out', async (_name, fail, firstReason) => {
    await openPicker();
    fail();
    const reads = service.getOrderWithItems.mock.calls.length;
    readNeverAnswers();

    const save = await start(TWO);

    expect(save.results).toEqual([
      { grnItemId: 'lot-one', ok: false, reason: firstReason },
      { grnItemId: 'lot-two', ok: false, reason: NOT_SAVED },
    ]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('is not waited for when the phone lost its network after a lot was saved', async () => {
    await openPicker();
    const write = waiting<never>();
    service.addItemToOrder.mockImplementationOnce(() => write.promise);
    const reads = service.getOrderWithItems.mock.calls.length;
    readNeverAnswers();

    const save = await start(TWO);
    expect(save.results).toBeUndefined();
    // The phone reports no network while the first lot is being saved; then that lot's answer arrives.
    mockNetwork.isConnected = false;
    mockNetwork.type = 'none';
    await act(async () => { renderer!.update(editor()); });
    await act(async () => { write.answer(saved); });
    await settle();

    expect(save.results).toEqual([
      { grnItemId: 'lot-one', ok: true },
      { grnItemId: 'lot-two', ok: false, reason: NOT_SAVED },
    ]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
  });

  it.each([
    ['saved every lot', saved, [{ grnItemId: 'lot-one', ok: true }, { grnItemId: 'lot-two', ok: true }]],
    ['refused every lot', refusal('Item already exists in order'), [
      { grnItemId: 'lot-one', ok: false, reason: 'This lot is already in the order.' },
      { grnItemId: 'lot-two', ok: false, reason: 'This lot is already in the order.' },
    ]],
  ])('is waited for when the server %s: the save answers once the order has been read', async (_name, answer, expected) => {
    await openPicker();
    service.addItemToOrder.mockResolvedValue(answer);
    const reads = service.getOrderWithItems.mock.calls.length;
    const read = waiting<never>();
    service.getOrderWithItems.mockImplementationOnce(() => read.promise);

    const save = await start(TWO);
    // Both lots were sent and answered, the read is out, and the picker is still waiting.
    expect(service.addItemToOrder).toHaveBeenCalledTimes(2);
    expect(service.getOrderWithItems).toHaveBeenCalledTimes(reads + 1);
    expect(save.results).toBeUndefined();

    await act(async () => { read.answer(orderRead()); });
    await settle();
    expect(save.results).toEqual(expected);
  });

  it('a lost answer is checked before the save answers: the lot is locked until the order has been read', async () => {
    await openPicker();
    // The server stores the line; its answer never arrives.
    service.addItemToOrder.mockImplementationOnce(async (_order, lot, quantity) => {
      server.items!.push(line(lot, quantity));
      return timedOut;
    });
    const read = waiting<never>();
    service.getOrderWithItems.mockImplementationOnce(() => read.promise);
    const onChecking = jest.fn();

    const save = await start([{ grnItemId: 'lot-new', quantity: 3 }], { onChecking });
    // The read of the check is out: the lot is named to the picker, and the save has not answered.
    expect(save.results).toBeUndefined();
    expect(onChecking.mock.calls).toEqual([[{ grnItemId: 'lot-new', removal: false }]]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(mockPicker.props!.currentOrderItems.map(item => item.grnItemId)).not.toContain('lot-new');

    await act(async () => { read.answer(orderRead()); });
    await settle();
    // The server has the lot: it is saved, the picker is told, and nothing was sent again.
    expect(save.results).toEqual([{ grnItemId: 'lot-new', ok: true }]);
    expect(onChecking.mock.calls).toEqual([[{ grnItemId: 'lot-new', removal: false }], [null]]);
    expect(mockPicker.props!.currentOrderItems.map(item => [item.grnItemId, item.quantity])).toContainEqual(['lot-new', 3]);
    expect(service.addItemToOrder).toHaveBeenCalledTimes(1);
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
  });
});

describe('an unknown network reading', () => {
  // useNetworkStatus gives isConnected false and type 'unknown' while NetInfo has not decided.
  it.each([['unknown'], ['wifi'], [null]])('tries the save when the reading is not connected but the type is %s', async type => {
    mockNetwork.isConnected = false;
    mockNetwork.type = type;
    await openPicker();
    const results = await send([{ grnItemId: 'lot-new', quantity: 3 }]);
    expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-new', 3]]);
    expect(results).toEqual([{ grnItemId: 'lot-new', ok: true }]);
  });
});

describe('with no network at all', () => {
  it('sends nothing and answers at once: not saved, except what needs no call', async () => {
    mockNetwork.isConnected = false;
    mockNetwork.type = 'none';
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

// F63: a lot whose only line is dispatched is never rewritten; the quantity is ordered anew.
it.each([[6], [9], [2]])('does not rewrite the dispatched line of a lot when %i bags are chosen', async (quantity) => {
  await openPicker();
  await send([{ grnItemId: 'lot-done', quantity }]);

  expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
  expect(service.addItemToOrder.mock.calls).toEqual([[ORDER_ID, 'lot-done', quantity]]);
});

// F64: a read that started before another one is not applied after it.
it('keeps the newer lines when an older read answers last', async () => {
  await openPicker();
  const older = waiting<never>();
  const newer = waiting<never>();
  service.getOrderWithItems
    .mockImplementationOnce(() => older.promise)
    .mockImplementationOnce(() => newer.promise);
  const quantities = () => mockPicker.props!.currentOrderItems.map(item => [item.grnItemId, item.quantity]);
  const before = copy(server);
  const after = copy(server);
  after.items![0].requested_quantity = 7;

  await act(async () => { void mockLive.refresh?.(); });
  await act(async () => { void mockLive.refresh?.(); });
  await act(async () => { newer.answer({ success: true, data: after } as never); });
  await settle();
  expect(quantities()).toEqual([['lot-kept', 7], ['lot-open', 5]]);

  // The first read, which started before the write, answers last.
  await act(async () => { older.answer({ success: true, data: before } as never); });
  await settle();
  expect(quantities()).toEqual([['lot-kept', 7], ['lot-open', 5]]);
});

// Backlog 2026-10-14, item 1: another business in the same editor.
describe('when customerId changes while the editor is mounted', () => {
  it('drops the old order at once: no Add or quantity change reaches it, and the picker is closed', async () => {
    const onClose = jest.fn();
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" itemCatalogOpen onCloseItemCatalog={onClose} />); });
    const oldAdd = mockPicker.props!.onAddItems;
    // The next business's order never answers during the test.
    service.getOrCreateOrder.mockReturnValue(new Promise(() => undefined) as never);
    mockPicker.props = undefined;

    await act(async () => { renderer!.update(<OrderManagement customerId="customer-fictional-2" itemCatalogOpen onCloseItemCatalog={onClose} />); });

    // The picker of the old order is gone and the parent was told to close it.
    expect(mockPicker.props).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
    // A late tap on the old picker's Add sends nothing to the old order.
    let results!: PickerResult[];
    await act(async () => { results = await oldAdd(asked([{ grnItemId: 'lot-new', quantity: 3 }])); });
    expect(service.addItemToOrder).not.toHaveBeenCalled();
    expect(service.updateOrderItemQuantity).not.toHaveBeenCalled();
    expect(results).toEqual([{ grnItemId: 'lot-new', ok: false, reason: NOT_SAVED }]);
  });

  it('ignores the answer of the business it left', async () => {
    const slow = waiting<never>();
    service.getOrCreateOrder.mockReturnValueOnce(slow.promise as never);
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" itemCatalogOpen onCloseItemCatalog={jest.fn()} />); });
    expect(mockPicker.props).toBeUndefined();
    await act(async () => { renderer!.update(<OrderManagement customerId="customer-fictional-2" itemCatalogOpen onCloseItemCatalog={jest.fn()} />); });
    // The first business answers late; its order must not be shown.
    await act(async () => { slow.answer({ success: true, data: { cart_id: 'order-old' } } as never); });
    await settle();
    expect(service.getOrderWithItems.mock.calls.map(call => call[0])).not.toContain('order-old');
  });
});

// Open items 2026-10-15: the server now refuses only a DELETED business; a deactivated one orders as before.
describe('a business that is deleted or deactivated', () => {
  const deleted = { success: false, message: "Couldn't open the order.", error: 'Business is not active' } as never;
  const text = () => renderer!.root.findAll(node => node.type === 'Text' as never).map(node => [node.props.children].flat().join('')).join(' | ');
  const addButton = () => renderer!.root.findAll(node => node.props.accessibilityLabel === 'Add items to order' && 'disabled' in node.props)[0];

  it('shows the customer message for exactly the server refusal', async () => {
    service.getOrCreateOrder.mockResolvedValue(deleted);
    await act(async () => { renderer = create(editor()); });
    expect(text()).toContain('This business is no longer active. Ask your cold storage.');
    expect(showAlert).not.toHaveBeenCalled();
    expect(service.getOrderWithItems).not.toHaveBeenCalled();
  });

  it('gives staff the deactivated wording when they are refused, as the server only refuses deactivated or deleted', async () => {
    service.getOrCreateOrder.mockResolvedValue(deleted);
    const onBusinessDeleted = jest.fn();
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" staffView onBusinessDeleted={onBusinessDeleted} />); });
    expect(text()).toContain('This business is deactivated. Turn it on in Customers to take orders.');
    expect(text()).not.toContain('Ask your cold storage');
    expect(onBusinessDeleted).toHaveBeenCalledTimes(1);
  });

  it('older facility: staff refused for a business the record says is deactivated get the deactivated wording', async () => {
    service.getOrCreateOrder.mockResolvedValue(deleted);
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" staffView businessDeactivated />); });
    expect(text()).toContain('This business is deactivated. Turn it on in Customers to take orders.');
    expect(text()).not.toContain('was deleted');
  });

  it('older facility: a customer login refused for a deactivated business keeps the customer wording', async () => {
    service.getOrCreateOrder.mockResolvedValue(deleted);
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" businessDeactivated />); });
    expect(text()).toContain('This business is no longer active. Ask your cold storage.');
  });

  it('always asks the server, even when the record says deleted (an older facility marks deactivated businesses so)', async () => {
    server.items = [];
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" staffView businessDeactivated />); });
    expect(service.getOrCreateOrder).toHaveBeenCalledWith('customer-fictional-1');
    expect(service.getOrderWithItems).toHaveBeenCalled();
    expect(text()).toContain('Deactivated at the cold storage');
    expect(text()).toContain('No items in this order');
    expect(text()).not.toContain('was deleted');
  });

  it('gives staff the deactivated wording after a refusal whenever the record says active=false (deleted or not)', async () => {
    service.getOrCreateOrder.mockResolvedValue(deleted);
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" staffView businessDeactivated />); });
    expect(service.getOrCreateOrder).toHaveBeenCalledTimes(1);
    expect(text()).toContain('This business is deactivated. Turn it on in Customers to take orders.');
    expect(text()).not.toContain('was deleted');
  });

  it('gives staff the plain sentence, not "was deleted", when the record could not be read', async () => {
    service.getOrCreateOrder.mockResolvedValue(deleted);
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" staffView businessRecordUnread />); });
    expect(text()).toContain('This business is no longer active. Ask your cold storage.');
    expect(text()).not.toContain('was deleted');
  });

  it('opens a deactivated business for staff with the banner, and the empty-state Add button stays on', async () => {
    server.items = [];
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" staffView businessDeactivated />); });
    expect(text()).toContain('Deactivated at the cold storage');
    expect(text()).toContain('No new goods are taken in. Turn it on in Customers to change that.');
    expect(text()).toContain('No items in this order');
    expect(addButton().props.disabled).toBeFalsy();
  });

  it('opens a deactivated business for a customer login with the customer wording and Add on', async () => {
    server.items = [];
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" businessDeactivated />); });
    expect(text()).toContain('Deactivated at the cold storage');
    expect(text()).toContain('You can still order your goods out.');
    expect(text()).not.toContain('Turn it on in Customers');
    expect(addButton().props.disabled).toBeFalsy();
  });

  it('shows no banner for an active business', async () => {
    await act(async () => { renderer = create(<OrderManagement customerId="customer-fictional-1" staffView />); });
    expect(text()).not.toContain('Deactivated');
  });

  it('keeps the current handling for any other error', async () => {
    service.getOrCreateOrder.mockResolvedValue({ success: false, message: "Couldn't open the order.", error: 'permission denied' } as never);
    await act(async () => { renderer = create(editor()); });
    expect(text()).not.toContain('no longer active');
    expect(showAlert).toHaveBeenCalledTimes(1);
  });
});
