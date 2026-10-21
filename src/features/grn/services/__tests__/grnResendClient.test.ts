/**
 * Every send of a GRN create or save, a resend after a lost answer included, asks for the CURRENT authenticated client:
 * the resend is a new call of the service (the screen's loop in GrnReviewStep), so a sign-in token renewed meanwhile is
 * the one it goes out with. (The dispatch services loop inside the call and are tested separately.)
 */
import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { createGRN, updateGRN } from '../grnFormService';

const mockGetClient = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: () => mockGetClient(),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: jest.fn(async () => 'warehouse-grn-fictional-key'),
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => {}),
  forgetUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));

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
const items = [{ item_table_id: '66666666-2222-4333-8444-555555555555', item_name: 'Garlic', packaging: 'Bag', qty: 10, weight: 50, rack: '', package_mark: '', trl_images: [] }];
const lines = [{ ...items[0], grn_trl_id: LINE_ID, stock: 10 }];
const dropped = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
const created = { data: { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010', item_mapping: [] } }, error: null };
const updated = { data: { success: true, gr_id: GRN_ID, grn: { images: [] }, item_mapping: [] }, error: null };

const clientAnswering = (answer: unknown) => ({ rpc: jest.fn(async () => answer), storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) } });

beforeEach(() => {
  mockGetClient.mockReset();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('the resend of a GRN create goes out on the client the session has now', async () => {
  const before = clientAnswering(dropped);
  const after = clientAnswering(created);
  mockGetClient.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

  const first = await createGRN({ header, items });
  const again = await createGRN({ header, items, resend: first.lostAnswer });

  expect(first.lostAnswer).toBeDefined();
  expect(again.success).toBe(true);
  expect(before.rpc).toHaveBeenCalledTimes(1);
  expect(after.rpc).toHaveBeenCalledTimes(1);
  expect(after.rpc.mock.calls[0]).toEqual(before.rpc.mock.calls[0]);
});

it('the resend of a GRN save goes out on the client the session has now', async () => {
  const before = clientAnswering(dropped);
  const after = clientAnswering(updated);
  mockGetClient.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

  const first = await updateGRN(GRN_ID, { header, items: lines });
  const again = await updateGRN(GRN_ID, { header, items: lines }, { resend: first.lostAnswer });

  expect(first.lostAnswer).toBeDefined();
  expect(again.success).toBe(true);
  expect(before.rpc).toHaveBeenCalledTimes(1);
  expect(after.rpc).toHaveBeenCalledTimes(1);
});
