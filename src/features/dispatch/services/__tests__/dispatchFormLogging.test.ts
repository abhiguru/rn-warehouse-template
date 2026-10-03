import { createDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
const mockFinish = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => mockFinish,
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: async () => 'warehouse-dispatch-fictional-key' }));
jest.mock('@/utils/serviceErrorHandler', () => ({ executeRPC: jest.fn(), createErrorResponse: jest.fn() }));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));

const marker = 'FICTIONAL_PRIVATE_DISPATCH_SENTINEL';
const payload = {
  header: { disp_no: 'FXF901', disp_date: '2026-10-01', registration: 'TEST FIXTURE', customer_name: marker, customer_mobile: marker, note: marker },
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
} as unknown as Parameters<typeof createDispatch>[0];

describe('create-dispatch console privacy', () => {
  const spies: jest.SpyInstance[] = [];
  beforeEach(() => {
    mockRpc.mockReset(); mockFinish.mockClear();
    spies.push(jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}));
  });
  afterEach(() => { spies.forEach(spy => spy.mockRestore()); spies.length = 0; });
  function checkLogs() {
    const logs = JSON.stringify(spies.flatMap(spy => spy.mock.calls));
    expect(logs).not.toContain(marker);
    expect(logs).not.toContain('warehouse-dispatch-fictional-key');
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  }
  it('keeps payload and successful response out of logs without changing the RPC', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, dispatch_id: 'fictional-id', invoice_data: { privateNote: marker } }, error: null });
    const result = await createDispatch(payload);
    expect(result.success).toBe(true);
    expect(result.invoice_data).toEqual({ privateNote: marker });
    expect(mockRpc.mock.calls[0][1].p_dispatch_data.customer_name).toBe(marker);
    checkLogs();
  });
  it.each(['transport', 'business', 'exception'])('retains %s error for the caller without logging raw data', async kind => {
    if (kind === 'transport') mockRpc.mockResolvedValue({ data: null, error: { message: marker } });
    else if (kind === 'business') mockRpc.mockResolvedValue({ data: { success: false, error: marker }, error: null });
    else mockRpc.mockRejectedValue(new Error(marker));
    const result = await createDispatch(payload);
    expect(result.success).toBe(false);
    expect(result.error).toBe(marker);
    checkLogs();
  });
});
