import type { GRNHeaderData } from '@/store/slices/grnFormSlice';
import { submissionIdempotencyKey } from '@/utils/submissionIdempotency';
import { createGRN } from '../grnFormService';
import { setLanguage, t } from '@/i18n';

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
  submissionIdempotencyKey: jest.fn(async () => 'warehouse-grn-fictional-key'),
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const ITEM_ID = '66666666-2222-4333-8444-555555555555';
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
  item_table_id: ITEM_ID,
  item_name: 'Garlic',
  packaging: 'Bag',
  qty: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [],
}];
const saved = { data: { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010', item_mapping: [{ index: 0, item_id: LINE_ID }] } }, error: null };
// The connection dropped after the request went out (nothing says it did not leave), and before it left.
const dropped = { message: 'TypeError: Network request failed', code: '' };
const neverSent = { message: 'Error: fetch failed: connect timed out', code: '' };
const callsOf = (name: string) => mockRpc.mock.calls.filter(([fn]) => fn === name);
// What the PostgREST client hands back for the gateway's answer while the server is upgraded: the body's code and
// message, and the HTTP status next to them.
const upgrading = {
  data: null,
  error: { code: 'upgrading', message: "The facility's server is being updated. Try again in a few minutes." },
  status: 503,
};
// A gateway that gave up on the request (Kong's 502): the request reached it, the save may have landed.
const badGateway = { data: null, error: { code: '', message: 'An invalid response was received from the upstream server' }, status: 502 };

beforeEach(() => {
  mockRpc.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); setLanguage('en'); });

describe('a GRN save while the facility\'s server is being upgraded', () => {
  it('is NOT a lost answer: nothing was saved, so the screen is not sent to the check, and it says the server is being updated', async () => {
    mockRpc.mockResolvedValueOnce(upgrading);
    const result = await createGRN({ header, items, nonce: 'nonce-of-this-form' });
    expect(result.success).toBe(false);
    expect(result.lostAnswer).toBeUndefined();
    expect(result.error).toBe(t('components.upgrading.message'));
    expect(callsOf('save_grn')).toHaveLength(1);
  });

  it('says it in Gujarati too', async () => {
    setLanguage('gu');
    mockRpc.mockResolvedValueOnce(upgrading);
    const result = await createGRN({ header, items, nonce: 'nonce-of-this-form' });
    expect(result.error).toBe(t('components.upgrading.message'));
    expect(result.error).not.toMatch(/being updated/);
  });

  it('a gateway that gave up (502) is still a lost answer', async () => {
    mockRpc.mockResolvedValueOnce(badGateway);
    const result = await createGRN({ header, items, nonce: 'nonce-of-this-form' });
    expect(result.lostAnswer).toBeDefined();
  });

  it('a RESEND refused with the upgrading answer stays unsettled: the original may have landed, so the screen goes back to the check', async () => {
    mockRpc.mockResolvedValueOnce(badGateway);
    const first = await createGRN({ header, items, nonce: 'nonce-of-this-form' });
    mockRpc.mockResolvedValueOnce(upgrading);
    const again = await createGRN({ header, items, nonce: 'nonce-of-this-form', resend: first.lostAnswer });
    expect(again.lostAnswer).toBeDefined();
  });
});
