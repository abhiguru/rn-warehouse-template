import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { createGRN, updateGRN } from '../grnFormService';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';

const mockGetClient = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: () => mockGetClient(),
}));
jest.mock('@/utils/serviceErrorHandler', () => ({ ...jest.requireActual('@/utils/serviceErrorHandler'), handleGlobalAuthError: jest.fn() }));
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
/**
 * A save answered "Session expired or revoked" (403) ends the sign-in, as a list read does, so the reason is kept and shown.
 */
const ended = { data: null, error: { message: 'Session expired or revoked', code: '42501' }, status: 403 };
const clientAnswering = (answer: unknown) => ({ rpc: jest.fn(async () => answer), storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) } });

beforeEach(() => {
  mockGetClient.mockReset();
  jest.mocked(handleGlobalAuthError).mockClear();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('save_grn answered 403 reports the ended session', async () => {
  mockGetClient.mockResolvedValue(clientAnswering(ended));
  await createGRN({ header, items }).catch(() => undefined);
  expect(handleGlobalAuthError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Session expired or revoked' }));
});

it('update_grn answered 403 reports the ended session', async () => {
  mockGetClient.mockResolvedValue(clientAnswering(ended));
  await updateGRN(GRN_ID, { header, items: lines }).catch(() => undefined);
  expect(handleGlobalAuthError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Session expired or revoked' }));
});
