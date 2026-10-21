/**
 * createDispatch and the duplicate warning (backend migration 124, opt-in):
 * - a direct dispatch asks for the check (`p_dispatch_data.warn_duplicate: true`); "Save anyway" sends false, which is
 *   another body and so another request code; a dispatch made from an order sends no flag (it is never checked);
 * - POSSIBLE_DUPLICATE is a warning: nothing was saved, the refusal goes to the screen with the earlier dispatch's facts,
 *   also when it answers the RESEND after a lost answer.
 */
import { forgetUnfinishedSave } from '@/services/unfinishedSaves';
import { possibleDuplicateOf } from '@/utils/possibleDuplicate';
import { createDispatch } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: async (operation: string, body: unknown) => `${operation}:${JSON.stringify(body)}`,
}));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => {}),
  forgetUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fictional-uuid' }));
const mockCheckSubmission = jest.fn();
jest.mock('@/utils/lostAnswer', () => ({
  ...jest.requireActual('@/utils/lostAnswer'),
  isLostAnswer: (error: { message?: string; code?: string }) => !error.code && /Network request failed/i.test(error.message ?? ''),
  checkSubmission: (...args: unknown[]) => mockCheckSubmission(...args),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));

const header = {
  disp_no: 'D0042',
  disp_date: '2026-10-21',
  registration: 'gj01ab1234',
  customer_id: 'c1',
  customer_name: 'Green Valley Traders',
  supervisor_id: 's1',
  supervisor_name: 'Fictional Supervisor',
  note: '',
};
const direct = {
  header,
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
  images: [],
  submissionNonce: 'form-a',
} as unknown as Parameters<typeof createDispatch>[0];
const fromOrder = { ...direct, header: { ...header, source_order_id: 'o1', source_order_no: 'O0007' } } as unknown as Parameters<typeof createDispatch>[0];
const duplicateBody = {
  success: false,
  error_code: 'WH409',
  reason: 'POSSIBLE_DUPLICATE',
  error: 'Dispatch D0041 for Green Valley Traders was created 4 minutes ago with the same lots and vehicle.',
  message: 'Dispatch D0041 for Green Valley Traders was created 4 minutes ago with the same lots and vehicle.',
  kind: 'dispatch',
  existing_id: '77777777-2222-4333-8444-555555555555',
  existing_number: 'D0041',
  existing_created_at: '2026-10-21T10:26:00Z',
  existing_created_by: null,
  customer_name: 'Green Valley Traders',
  items: [{ gr_no: 'A0010', item_name: 'Potatoes', packaging: 'Jute bag' }],
  vehicle: 'GJ01AB1234',
  window_minutes: 30,
};
const duplicate = { data: duplicateBody, error: null };
const saved = { data: { success: true, dispatch_id: 'd1' }, error: null };
const lost = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
const sentBody = (n = 0) => mockRpc.mock.calls[n][1];

beforeEach(() => {
  mockRpc.mockReset();
  mockCheckSubmission.mockReset();
  jest.mocked(forgetUnfinishedSave).mockClear();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('asking for the check', () => {
  it('a direct dispatch sends warn_duplicate: true inside p_dispatch_data', async () => {
    mockRpc.mockResolvedValue(saved);
    await createDispatch(direct);
    expect(mockRpc.mock.calls[0][0]).toBe('create_dispatch_with_stock_check');
    expect(sentBody().p_dispatch_data.warn_duplicate).toBe(true);
  });

  it('"Save anyway" sends warn_duplicate: false, under a request code of its own', async () => {
    mockRpc.mockResolvedValue(saved);
    await createDispatch(direct);
    await createDispatch({ ...direct, warnDuplicate: false });

    expect(sentBody(1).p_dispatch_data.warn_duplicate).toBe(false);
    expect(sentBody(1).p_idempotency_key).not.toBe(sentBody(0).p_idempotency_key);
  });

  it('a dispatch from an order sends no flag at all', async () => {
    mockRpc.mockResolvedValue(saved);
    await createDispatch(fromOrder);
    expect('warn_duplicate' in sentBody().p_dispatch_data).toBe(false);
  });
});

describe('a possible duplicate', () => {
  it('is a warning: nothing was saved, and the refusal carries the earlier dispatch', async () => {
    mockRpc.mockResolvedValueOnce(duplicate);

    const result = await createDispatch(direct);

    expect(result).toMatchObject({ success: false, reason: 'POSSIBLE_DUPLICATE' });
    expect(possibleDuplicateOf(result, 'dispatch')).toMatchObject({
      kind: 'dispatch',
      existingNumber: 'D0041',
      customerName: 'Green Valley Traders',
      createdBy: undefined,
      vehicle: 'GJ01AB1234',
      items: [{ grNo: 'A0010', itemName: 'Potatoes', packaging: 'Jute bag' }],
    });
    expect(result.aborted).toBeUndefined();
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(sentBody().p_idempotency_key);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('Save anyway after it creates the dispatch', async () => {
    mockRpc.mockResolvedValueOnce(duplicate).mockResolvedValueOnce(saved);

    const first = await createDispatch(direct);
    const again = await createDispatch({ ...direct, warnDuplicate: false });

    expect(first.success).toBe(false);
    expect(again).toMatchObject({ success: true, dispatch_id: 'd1' });
  });

  it('answering the RESEND after a lost answer: the warning, not a lost answer', async () => {
    mockRpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(duplicate);
    mockCheckSubmission.mockResolvedValue({ found: false });
    const onLostAnswer = jest.fn();

    const result = await createDispatch(direct, { onLostAnswer });

    expect(onLostAnswer).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    // The identical request: the same body, the same flag, the same code.
    expect(sentBody(1)).toEqual(sentBody(0));
    expect(sentBody(1).p_dispatch_data.warn_duplicate).toBe(true);
    expect(result).toMatchObject({ success: false, reason: 'POSSIBLE_DUPLICATE' });
    expect(possibleDuplicateOf(result, 'dispatch')?.existingNumber).toBe('D0041');
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(sentBody().p_idempotency_key);
  });

  it('an older server that ignores the flag simply saves', async () => {
    mockRpc.mockResolvedValueOnce(saved);
    expect((await createDispatch(direct)).success).toBe(true);
  });
});
