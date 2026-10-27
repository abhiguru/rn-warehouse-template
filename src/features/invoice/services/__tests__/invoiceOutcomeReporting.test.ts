/**
 * What createInvoice and updateInvoice report to error reporting (src/utils/reportOutcome.ts): one redacted line per
 * outcome, of the kind that fits: a refusal returned as a value, a refusal that is thrown, a failure, a lost answer.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { createInvoice, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
const mockSentryMessage = jest.fn();
jest.mock('@sentry/react-native', () => ({ captureMessage: (...args: unknown[]) => mockSentryMessage(...args) }));
jest.mock('@/config/lanTransport', () => ({ getConnectionPath: () => 'public' }));

const INVOICE = '33333333-3333-4444-8555-666666666666';
const KEY = 'warehouse-invoice-0123abcd';
const payload = {
  header: {
    customer_id: '22222222-3333-4444-8555-666666666666',
    customer_name: 'Example Traders',
    gr_id: '11111111-2222-4333-8444-555555555555',
    gr_no: 'A0010',
    inv_no: 12,
    inv_fin_year: 2026,
    inv_date: '2026-10-10',
    discount: 0,
    labour: 200,
    tax_amount: 35,
    total: 685,
    one_time_charge: false,
  },
  items: [{ disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555', grn_item_id: 'g1', qty: 20, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 1 }],
} as CreateInvoicePayload;

const messages = () => mockSentryMessage.mock.calls.map(([text]) => text as string);
const answers = (answer: unknown) => (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc: jest.fn(async () => answer) });
const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@errors.example.org/1';
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
});

describe.each([
  ['createInvoice', () => createInvoice(payload, KEY)],
  ['updateInvoice', () => updateInvoice(INVOICE, payload, KEY)],
])('%s', (_name, save) => {
  it('reports save_refused for a number already used', async () => {
    answers({ data: { success: false, error_code: 'WH409', reason: 'NUMBER_TAKEN', number: 15, error: 'Invoice number 15 is already used' }, error: null });
    await save();
    expect(messages()).toEqual([`outcome save_refused code=NUMBER_TAKEN path=public key=${KEY}`]);
  });

  it('reports save_refused for a refusal the screen acts on', async () => {
    answers({ data: { success: false, error_code: 'WH409', reason: 'STALE_RECORD', error: 'Example Traders changed' }, error: null });
    await save();
    expect(messages()).toEqual([`outcome save_refused code=STALE_RECORD path=public key=${KEY}`]);
  });

  it('reports save_refused for any other answer of success: false', async () => {
    answers({ data: { success: false, error_code: 'WH409', error: 'A dispatch line is already on another invoice' }, error: null });
    await save();
    expect(messages()).toEqual([`outcome save_refused code=WH409 path=public key=${KEY}`]);
  });

  it('reports save_failed for a failure of the call', async () => {
    answers({ data: null, error: { message: 'boom for Example Traders', code: 'XX000' } });
    await save();
    expect(messages()).toEqual([`outcome save_failed path=public key=${KEY}`]);
  });

  it('reports lost_answer with the request code when the answer is lost, and nothing else', async () => {
    answers({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
    const result = await save();
    expect(result.lostAnswer).toBeDefined();
    expect(messages()).toEqual([`outcome lost_answer path=public key=${KEY}`]);
  });
});
