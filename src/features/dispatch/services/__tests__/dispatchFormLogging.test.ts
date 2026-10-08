import { createDispatch, loadDispatchData, updateDispatch } from '../dispatchFormService';

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

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  mockRpc.mockReset(); mockFinish.mockClear();
  spies.push(jest.spyOn(console, 'log').mockImplementation(() => {}),
    jest.spyOn(console, 'error').mockImplementation(() => {}),
    jest.spyOn(console, 'warn').mockImplementation(() => {}));
});
afterEach(() => { spies.forEach(spy => spy.mockRestore()); spies.length = 0; });
const logOutput = () => JSON.stringify(spies.flatMap(spy => spy.mock.calls));

describe('create-dispatch console privacy', () => {
  function checkLogs() {
    const logs = logOutput();
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

describe('update-dispatch console privacy', () => {
  const updatePayload = payload as unknown as Parameters<typeof updateDispatch>[1];
  it('keeps the header, items and response out of logs while forwarding them to the RPC', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, dispatch_id: 'fictional-id', message: marker }, error: null });
    const result = await updateDispatch('fictional-dispatch-id', updatePayload);
    expect(result).toEqual({ success: true, dispatch_id: 'fictional-id', message: marker });
    expect(mockRpc).toHaveBeenCalledWith('update_dispatch_smart', expect.objectContaining({
      p_dispatch_id: 'fictional-dispatch-id',
      p_dispatch_data: expect.objectContaining({ customer_name: marker, note: marker }),
      p_dispatch_items: [{ gr_trl_id: 'fictional-lot', disp_qty: 2 }],
    }));
    expect(logOutput()).not.toContain(marker);
    expect(logOutput()).toContain('fictional-dispatch-id');
  });
  it.each(['transport', 'business', 'exception'])('returns the %s error to the caller without logging it', async kind => {
    if (kind === 'transport') mockRpc.mockResolvedValue({ data: null, error: { message: marker, code: 'P0001', details: marker, hint: marker } });
    else if (kind === 'business') mockRpc.mockResolvedValue({ data: { success: false, error: marker }, error: null });
    else mockRpc.mockRejectedValue(new Error(marker));
    const result = await updateDispatch('fictional-dispatch-id', updatePayload);
    expect(result.success).toBe(false);
    expect(result.error).toBe(marker);
    const logs = logOutput();
    expect(logs).not.toContain(marker);
    if (kind === 'transport') expect(logs).toContain('P0001');
  });
});

describe('load-dispatch console privacy', () => {
  const details = (items: unknown[]) => ({
    data: {
      success: true,
      data: {
        dispatch: {
          disp_no: 'FXF901', disp_date: '2026-10-01', registration: 'TEST FIXTURE', note: marker,
          customer_details: { id: 'fictional-customer', name: marker },
          supervisor_details: { id: 'fictional-supervisor', name: marker },
          items,
        },
      },
    },
    error: null,
  });
  const completeItem = {
    id: 'fictional-line', grn_item_id: 'fictional-lot', disp_qty: 2,
    grn_details: { id: 'fictional-grn', gr_no: 'FXG001', date: '2026-09-30', customer_name: marker },
    grn_item_details: { item_name: marker, qty: 5, stock: 3, package_mark: marker, rack: marker, weight: 10 },
    item_details: { id: 'fictional-item' },
  };
  it('returns the dispatch and its items without logging any of their data', async () => {
    mockRpc.mockResolvedValue(details([completeItem]));
    const result = await loadDispatchData('fictional-dispatch-id');
    expect(result.success).toBe(true);
    expect(result.data?.header.customer_name).toBe(marker);
    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.items[0].grnItems_item_name).toBe(marker);
    const logs = logOutput();
    expect(logs).not.toContain(marker);
    expect(logs).not.toContain('FXG001');
    expect(logs).toContain('fictional-dispatch-id');
  });
  it('warns about a line with missing GRN details using its identifier only', async () => {
    const incomplete = { id: 'fictional-orphan-line', disp_qty: 1, grn_item_details: { item_name: marker }, note: marker };
    mockRpc.mockResolvedValue(details([incomplete, completeItem]));
    const result = await loadDispatchData('fictional-dispatch-id');
    expect(result.success).toBe(true);
    expect(result.data?.items.map(item => item.unique_id)).toEqual(['fictional-line']);
    expect(console.warn).toHaveBeenCalledTimes(1);
    const warned = JSON.stringify(jest.mocked(console.warn).mock.calls);
    expect(warned).toContain('fictional-orphan-line');
    expect(warned).not.toContain(marker);
    expect(logOutput()).not.toContain(marker);
  });
  it.each(['transport', 'missing', 'exception'])('returns the %s failure to the caller without logging raw data', async kind => {
    if (kind === 'transport') mockRpc.mockResolvedValue({ data: null, error: { message: marker, code: 'PGRST301', details: marker } });
    else if (kind === 'missing') mockRpc.mockResolvedValue({ data: { success: false, message: marker }, error: null });
    else mockRpc.mockRejectedValue(new Error(marker));
    const result = await loadDispatchData('fictional-dispatch-id');
    expect(result.success).toBe(false);
    expect(result.error).toBe(marker);
    const logs = logOutput();
    expect(logs).not.toContain(marker);
    if (kind === 'transport') expect(logs).toContain('PGRST301');
  });
});
