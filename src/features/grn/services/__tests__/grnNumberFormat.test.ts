/** A GRN save refused with NUMBER_FORMAT (backend migration 127): nothing was saved, the refusal carries the pattern, no lost answer. */
import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { createGRN } from '../grnFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc, storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) } }),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: jest.fn(async () => 'warehouse-grn-fictional-key'),
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

const header: GRNHeaderData = {
  gr_no: 'Q-1', registration: 'GJ01AB1234', date: '2026-10-01', sender_id: '', sender_name: 'Fictional Farms',
  customer_id: '33333333-2222-4333-8444-555555555555', customer_name: 'Green Valley Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example',
  note: '', leon: false, pricing_mode: 'MONTHLY', gr_images: [],
};
const items = [{ item_table_id: '66666666-2222-4333-8444-555555555555', item_name: 'Garlic', packaging: 'Bag', qty: 10, weight: 50, rack: '', package_mark: '', trl_images: [] }];

beforeEach(() => {
  mockRpc.mockReset();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('returns the refusal with its pattern, is not a taken number and not a lost answer', async () => {
  mockRpc.mockResolvedValue({
    data: { success: false, error_code: 'WH409', reason: 'NUMBER_FORMAT', number: 'Q-1', document_type: 'grn', pattern: 'A####', error: "This number does not follow this facility's numbering (A####)", message: "This number does not follow this facility's numbering (A####)" },
    error: null,
  });
  const result = await createGRN({ header, items });
  expect(result.success).toBe(false);
  expect(result.refusal).toMatchObject({ reason: 'NUMBER_FORMAT', fields: { pattern: 'A####', number: 'Q-1' } });
  expect(result.numberTaken).toBeUndefined();
  expect(result.lostAnswer).toBeUndefined();
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

it.each([
  ['GRN_DATE_FUTURE', { date: '2026-12-01', today: '2026-10-31' }],
  ['GRN_NUMBER_SPACES', { gr_no: 'A 1' }],
])('returns %s as a refusal, not as a taken number and not as a lost answer (migration 130)', async (reason, fields) => {
  mockRpc.mockResolvedValue({
    data: { success: false, error_code: 'WH409', reason, error: 'Some English', message: 'Some English', ...fields },
    error: null,
  });
  const result = await createGRN({ header, items });
  expect(result.success).toBe(false);
  expect(result.refusal).toMatchObject({ reason, fields });
  expect(result.numberTaken).toBeUndefined();
  expect(result.lostAnswer).toBeUndefined();
});
