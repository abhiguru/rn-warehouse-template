import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { OrderService } from '../order-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(() => { throw new Error('Anonymous business access'); }),
  getStoredToken: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
const mockServer = { origin: 'https://warehouse.example.test', instanceId: 'instance-0001', displayName: 'One', companyName: 'Example' };
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));

const rpc = jest.fn();
const LINE_VERSION = '2026-10-20T08:00:00Z';
const noFunction = { code: 'PGRST202', message: 'Could not find the function public.update_order_item_quantity(p_expected_updated_at) in the schema cache' };
let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  resetFacilityRelease();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  logs = ['log', 'warn', 'error'].map(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(() => logs.forEach(l => l.mockRestore()));

const update = () => OrderService.updateOrderItemQuantity('line-1', 'order-1', 3, LINE_VERSION);
const sentParams = (call: number) => rpc.mock.calls[call][1] as Record<string, unknown>;

describe('the concurrency check of an order line follows the backend release, not a failed call', () => {
  it('a backend older than migration 121 is sent the call without the version, once, and nothing is said', async () => {
    setFacilityRelease(mockServer, { backendRelease: 'v0.4.0', schemaHead: '00000000000120_x_y' });
    rpc.mockResolvedValue({ data: { success: true, data: { id: 'line-1' } }, error: null });
    const result = await update();
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sentParams(0)).not.toHaveProperty('p_expected_updated_at');
  });

  it('a current backend is sent the version; a PGRST202 from it is a real error, not sent again, and nothing is remembered', async () => {
    setFacilityRelease(mockServer, { backendRelease: 'v0.5.0', schemaHead: '00000000000126_sessions_and_source_limits' });
    rpc.mockResolvedValueOnce({ data: null, error: noFunction });
    const failed = await update();
    expect(failed.success).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sentParams(0)).toMatchObject({ p_expected_updated_at: LINE_VERSION });

    rpc.mockResolvedValueOnce({ data: { success: true, data: { id: 'line-1' } }, error: null });
    await update();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sentParams(1)).toMatchObject({ p_expected_updated_at: LINE_VERSION });
  });

  it('a backend that does not say which release it is counts as older: the call goes without the version, once, silently', async () => {
    setFacilityRelease(mockServer, { backendRelease: null, schemaHead: null });
    rpc.mockResolvedValue({ data: { success: true, data: { id: 'line-1' } }, error: null });
    const result = await update();
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sentParams(0)).not.toHaveProperty('p_expected_updated_at');
  });

  it('a facility nothing is known about yet (no release recorded) is treated the same way', async () => {
    rpc.mockResolvedValue({ data: { success: true, data: { id: 'line-1' } }, error: null });
    await update();
    expect(sentParams(0)).not.toHaveProperty('p_expected_updated_at');
  });

  it('removing a line follows the same rule', async () => {
    setFacilityRelease(mockServer, { backendRelease: 'v0.4.0', schemaHead: '00000000000120_x_y' });
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await OrderService.removeItemFromOrder('line-1', 'order-1', LINE_VERSION);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sentParams(0)).not.toHaveProperty('p_expected_updated_at');
    setFacilityRelease(mockServer, { backendRelease: 'v0.5.0', schemaHead: '00000000000126_sessions_and_source_limits' });
    await OrderService.removeItemFromOrder('line-1', 'order-1', LINE_VERSION);
    expect(sentParams(1)).toMatchObject({ p_expected_updated_at: LINE_VERSION });
  });
});
