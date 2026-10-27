/**
 * What createGRN reports to error reporting (src/utils/reportOutcome.ts): one redacted line per outcome, of the kind
 * that fits. Only codes and the request code leave; never a message or a name.
 */
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
  submissionIdempotencyKey: async () => 'warehouse-grn-0123abcd',
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
const mockSentryMessage = jest.fn();
jest.mock('@sentry/react-native', () => ({ captureMessage: (...args: unknown[]) => mockSentryMessage(...args) }));
jest.mock('@/config/lanTransport', () => ({ getConnectionPath: () => 'public' }));

const header: GRNHeaderData = {
  gr_no: 'Z0011',
  registration: 'GJ01AB1234',
  date: '2026-10-21',
  sender_id: '',
  sender_name: 'Fictional Farms',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Hilltop Fresh Mart',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Ravi Example',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [],
};
const items = [{
  item_table_id: '66666666-2222-4333-8444-555555555555',
  item_name: 'Potatoes',
  packaging: 'Jute bag',
  qty: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [],
}];
const messages = () => mockSentryMessage.mock.calls.map(([text]) => text as string);
const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

beforeEach(() => {
  mockRpc.mockReset();
  mockSentryMessage.mockReset();
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@errors.example.org/1';
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
});

describe('createGRN outcomes', () => {
  it('reports save_refused for a refusal of the server', async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, error_code: 'WH409', reason: 'POSSIBLE_DUPLICATE', error: 'GRN Z0010 for Hilltop Fresh Mart exists', existing_id: 'x', existing_number: 'Z0010' },
      error: null,
    });
    await createGRN({ header, items });
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatch(/^outcome save_refused path=public key=warehouse-grn-0123abcd$/);
  });

  it('reports save_failed for a failure of the call', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom for Hilltop Fresh Mart', code: 'XX000' } });
    await createGRN({ header, items });
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatch(/^outcome save_failed path=public key=warehouse-grn-0123abcd$/);
    expect(messages()[0]).not.toMatch(/Hilltop|boom/);
  });

  it('reports lost_answer with the request code when the answer is lost', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
    const result = await createGRN({ header, items });
    expect(result.lostAnswer).toBeDefined();
    expect(messages()).toEqual(['outcome lost_answer path=public key=warehouse-grn-0123abcd']);
  });
});
