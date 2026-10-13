/**
 * A saved GRN marks every report out of date, once; a failed or refused save does not
 * (review 2026-10-13, SR-10).
 */
import { invalidateReportQueries } from '@/lib/queryClient';
import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { createGRN, updateGRN } from '../grnFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => ({
    rpc: mockRpc,
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
  }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: async () => 'warehouse-grn-fictional-key',
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

const invalidate = jest.mocked(invalidateReportQueries);
const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const header: GRNHeaderData = {
  gr_no: 'A0010',
  registration: 'GJ01AB1234',
  date: '2026-10-01',
  sender_id: '',
  sender_name: 'Fictional Farms',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Green Valley Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Ravi Example',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [],
};
const items = [{
  grn_trl_id: LINE_ID,
  item_table_id: '66666666-2222-4333-8444-555555555555',
  item_name: 'Garlic',
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [],
}];

beforeEach(() => {
  mockRpc.mockReset();
  invalidate.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const failures = [
  ['a transport error', { data: null, error: { message: 'Network request failed', code: 'P0001' } }],
  ['success: false', { data: { success: false, message: 'Refused' }, error: null }],
] as const;

describe('createGRN', () => {
  it('marks the reports out of date once after the save', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010', item_ids: [LINE_ID], item_mapping: [{ index: 0, item_id: LINE_ID }] } }, error: null });
    const result = await createGRN({ header, items });
    expect(result.success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(failures)('marks nothing after %s', async (_name, answer) => {
    mockRpc.mockResolvedValue(answer);
    const result = await createGRN({ header, items });
    expect(result.success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('marks nothing when the request throws', async () => {
    mockRpc.mockRejectedValue(new Error('Network request failed'));
    expect((await createGRN({ header, items })).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('updateGRN', () => {
  it('marks the reports out of date once after the save', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, gr_id: GRN_ID, message: 'Saved', stats: {} }, error: null });
    const result = await updateGRN(GRN_ID, { header, items });
    expect(result.success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(failures)('marks nothing after %s', async (_name, answer) => {
    mockRpc.mockResolvedValue(answer);
    const result = await updateGRN(GRN_ID, { header, items });
    expect(result.success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
