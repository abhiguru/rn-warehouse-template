import { createGRN } from '@/features/grn/services/grnFormService';
import { createDispatch } from '@/features/dispatch/services/dispatchFormService';
import { EMPTY_DISPATCH_HEADER } from '@/types/dispatch.types';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('@/features/grn/services/imageUploadService', () => ({ savePendingImageMetadata: jest.fn(), uploadDeferredImages: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));
jest.mock('expo-crypto', () => {
  const { createHash } = jest.requireActual('node:crypto');
  return { CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, text: string) => createHash('sha256').update(text).digest('hex') };
});

describe('numbered document service retries after a lost response', () => {
  beforeEach(() => { mockRpc.mockReset(); jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());
  it('resubmits the same GRN body/key instead of inventing a second operation', async () => {
    const payload: Parameters<typeof createGRN>[0] = {
      header: { gr_no: 'FXF01', date: '2026-09-30', customer_id: 'fixture-a', customer_name: 'Fictional A',
        registration: 'TEST', sender_id: '', sender_name: '', supervisor_id: '', supervisor_name: '', note: '', leon: false, pricing_mode: 'MONTHLY', gr_images: [] },
      items: [],
    };
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Response lost' } })
      .mockResolvedValueOnce({ data: { success: true, data: { grn_id: 'saved-fixture-grn', gr_no: 'FXF01' } }, error: null });
    expect((await createGRN(payload)).success).toBe(false);
    expect((await createGRN(JSON.parse(JSON.stringify(payload)))).success).toBe(true);
    expect(mockRpc.mock.calls[0][0]).toBe('save_grn');
    expect(mockRpc.mock.calls[1][1]).toEqual(mockRpc.mock.calls[0][1]);
    expect(mockRpc.mock.calls[0][1].p_idempotency_key).toMatch(/^warehouse-grn-[a-f0-9]{64}$/);
  });
  it('resubmits the same dispatch body/key so the backend can return its cached result', async () => {
    const payload = { header: { ...EMPTY_DISPATCH_HEADER, disp_no: 'FXF02', disp_date: '2026-09-30', registration: 'TEST' }, items: [] };
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Response lost' } })
      .mockResolvedValueOnce({ data: { success: true, dispatch_id: 'saved-fixture-dispatch' }, error: null });
    expect((await createDispatch(payload)).success).toBe(false);
    expect((await createDispatch(JSON.parse(JSON.stringify(payload)))).success).toBe(true);
    expect(mockRpc.mock.calls[0][0]).toBe('create_dispatch_with_stock_check');
    expect(mockRpc.mock.calls[1][1]).toEqual(mockRpc.mock.calls[0][1]);
    expect(mockRpc.mock.calls[0][1].p_idempotency_key).toMatch(/^warehouse-dispatch-[a-f0-9]{64}$/);
  });
});
