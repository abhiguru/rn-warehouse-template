/**
 * An order write (opening the customer's order, adding an item, changing a quantity, removing an
 * item) marks every report out of date once, as the other five write services do: Operations
 * counts the open orders ("Pending orders"). A failed or refused write marks nothing (review
 * 2026-10-13, Step 3 L5).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { invalidateReportQueries } from '@/lib/queryClient';
import {
  addItemToOrder,
  getOrCreateOrder,
  getOrderWithItems,
  removeItemFromOrder,
  updateOrderItemQuantity,
} from '../order-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getStoredToken: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/utils/authTokenUtils', () => ({
  getAuthToken: jest.fn(async () => ({ token: 'fictional-access-credential' })),
  getRefreshToken: jest.fn(async () => 'fictional-refresh-credential'),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const invalidate = jest.mocked(invalidateReportQueries);
const rpc = jest.fn();

beforeEach(() => {
  invalidate.mockClear();
  rpc.mockReset();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const writes: [string, () => Promise<{ success: boolean }>, unknown][] = [
  ['opening the order', () => getOrCreateOrder('customer-a'), 'order-a'],
  ['adding an item', () => addItemToOrder('order-a', 'grn-item-a', 5), { success: true, order_item_id: 'item-a' }],
  ['changing a quantity', () => updateOrderItemQuantity('item-a', 'order-a', 3), { success: true, id: 'item-a' }],
  ['changing a quantity to 0 (removes it)', () => updateOrderItemQuantity('item-a', 'order-a', 0), { success: true }],
  ['removing an item', () => removeItemFromOrder('item-a', 'order-a'), { success: true }],
];

describe.each(writes)('%s', (_name, write, answer) => {
  it('marks the reports out of date once after the write', async () => {
    rpc.mockResolvedValue({ data: answer, error: null });
    expect((await write()).success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('marks nothing after a transport error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Network request failed', code: '' } });
    expect((await write()).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('marks nothing when the server refuses (success: false)', async () => {
    rpc.mockResolvedValue({ data: { success: false, message: 'Refused', error: 'REFUSED' }, error: null });
    expect((await write()).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

it('reading an order marks nothing', async () => {
  rpc.mockResolvedValue({ data: { success: true, data: {} }, error: null });
  await getOrderWithItems('order-a');
  expect(invalidate).not.toHaveBeenCalled();
});
