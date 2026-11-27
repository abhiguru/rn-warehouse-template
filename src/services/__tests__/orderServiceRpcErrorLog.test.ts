/**
 * WH-328 (a): a refused or failed order call must not raise the dev red box. With the RPC answering an error,
 * getOrdersList, getOrderWithItems and getAvailableItems call no console.error, log the error's code only (never its
 * text) through the order logger, and still answer the caller each one's failure message.
 *
 * Real: the order service, its logger and its error handling. Faked at the edge: the Supabase client's RPC reply.
 * No phone copy is open, so the reads go to the server.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { OrderService } from '@/services/order-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(() => { throw new Error('Anonymous business access'); }),
  getStoredToken: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
let consoleLog: jest.Spied<typeof console.log>;
let consoleWarn: jest.Spied<typeof console.warn>;
let consoleError: jest.Spied<typeof console.error>;

/** A PostgREST error as the client hands it back. Its text names a fictional customer: the log must not carry it. */
const SECRET = 'Shreeji Fictional Traders';
const rpcError = (message = `canceling statement for ${SECRET}`) => ({
  message,
  details: `customer ${SECRET}`,
  hint: 'retry later',
  code: '57014',
});

/** Everything written to the console, as one text. */
const consoleText = () =>
  [consoleLog, consoleWarn, consoleError].flatMap(spy => spy.mock.calls.flat()).map(String).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as any);
  consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleLog.mockRestore();
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

/** The order logger's debug line for this failure: under [OrderService], with the code and not the text. */
function expectCodeOnlyDebugLine(what: string) {
  const line = consoleLog.mock.calls.find(call => String(call[0]).includes(what));
  expect(line?.map(String).join(' ')).toMatch(/DEBUG \[\[OrderService\]\].*"code": "57014"/s);
  expect(consoleText()).not.toContain(SECRET);
}

describe('getOrdersList: an RPC error', () => {
  it('answers "Failed to fetch orders" and calls no console.error', async () => {
    rpc.mockResolvedValue({ data: null, error: rpcError() });
    const result = await OrderService.getOrdersList({ has_items: true });
    expect(rpc).toHaveBeenCalledWith('get_orders_list', expect.objectContaining({ p_has_items: true }));
    expect(result).toMatchObject({ success: false, message: 'Failed to fetch orders' });
    expect(consoleError).not.toHaveBeenCalled();
    expectCodeOnlyDebugLine('The orders list was refused or failed');
  });

  it('a network failure answers the connection message and calls no console.error', async () => {
    rpc.mockResolvedValue({ data: null, error: rpcError('TypeError: Network request failed') });
    const result = await OrderService.getOrdersList({ has_items: true });
    expect(result).toMatchObject({
      success: false,
      message: 'Network connection error. Please check your internet connection and try again.',
    });
    expect(consoleError).not.toHaveBeenCalled();
    expectCodeOnlyDebugLine('The orders list was refused or failed');
  });
});

describe('getOrderWithItems: an RPC error', () => {
  it('answers "Failed to fetch order details" and calls no console.error', async () => {
    rpc.mockResolvedValue({ data: null, error: rpcError() });
    const result = await OrderService.getOrderWithItems('order-fictional-1');
    expect(rpc).toHaveBeenCalledWith('get_order_with_items', { p_order_id: 'order-fictional-1' });
    expect(result).toMatchObject({ success: false, message: 'Failed to fetch order details' });
    expect(consoleError).not.toHaveBeenCalled();
    expectCodeOnlyDebugLine('The order details were refused or failed');
  });
});

describe('getAvailableItems: an RPC error', () => {
  it('answers "Failed to fetch items" and calls no console.error', async () => {
    rpc.mockResolvedValue({ data: null, error: rpcError() });
    const result = await OrderService.getAvailableItems({ customer_id: 'customer-fictional-1' });
    expect(rpc).toHaveBeenCalledWith('get_customer_items_for_order_selection',
      expect.objectContaining({ p_customer_id: 'customer-fictional-1' }));
    expect(result).toMatchObject({ success: false, message: 'Failed to fetch items' });
    expect(consoleError).not.toHaveBeenCalled();
    expectCodeOnlyDebugLine('The available items were refused or failed');
  });
});
