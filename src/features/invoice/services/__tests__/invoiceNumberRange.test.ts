/**
 * The server refuses an invoice number outside 1 to 99999999 with WH422 and
 * "Invoice number must be between 1 and 99999999" (backend migration 73). The
 * three ways it reaches the app, each shown in the app's own sentence in both
 * languages:
 *   - the three-argument save_invoice (the app's create path) has no handler:
 *     a PostgREST error with code WH422;
 *   - update_invoice (the edit path) answers { success: false, error, error_code: 'WH422' };
 *   - save_invoice(jsonb) answers { success: false, error: 'Database error: … (SQLState: WH422)' }.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { createInvoice, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

const SERVER_TEXT = 'Invoice number must be between 1 and 99999999';
const INVOICE = '33333333-3333-4444-8555-666666666666';

const payload: CreateInvoicePayload = {
  header: {
    customer_id: '22222222-3333-4444-8555-666666666666',
    customer_name: 'Example Traders',
    gr_id: '11111111-2222-4333-8444-555555555555',
    gr_no: 'A0010',
    inv_no: 100000000,
    inv_fin_year: 2026,
    inv_date: '2026-10-10',
    discount: 0,
    labour: 200,
    tax_amount: 35,
    total: 735,
    one_time_charge: false,
  },
  items: [
    { disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555', grn_item_id: 'g1', qty: 20, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 1 },
  ],
};

function mockRpc(answer: unknown) {
  const rpc = jest.fn(async () => answer);
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  return rpc;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

describe.each(['en', 'gu'] as const)('an invoice number the server refuses with WH422 (%s)', (language) => {
  beforeEach(() => setLanguage(language));
  const expected = () => t('invoice.validation.invoiceNumberRange');

  it('is said in the app\'s words when a new invoice is saved (PostgREST error)', async () => {
    mockRpc({ data: null, error: { code: 'WH422', message: SERVER_TEXT, details: null, hint: null } });

    const created = await createInvoice(payload);

    expect(created.success).toBe(false);
    expect(created.message).toBe(expected());
  });

  it('is said in the app\'s words when an edit is saved (error_code in the answer)', async () => {
    mockRpc({ data: { success: false, error: SERVER_TEXT, error_code: 'WH422' }, error: null });

    const updated = await updateInvoice(INVOICE, payload);

    expect(updated.success).toBe(false);
    expect(updated.message).toBe(expected());
  });

  it('is said in the app\'s words from a wrapped database error', async () => {
    mockRpc({ data: { success: false, error: `Database error: ${SERVER_TEXT} (SQLState: WH422)` }, error: null });

    const created = await createInvoice(payload);

    expect(created.message).toBe(expected());
  });
});

it('the app\'s words are the server\'s sentence in English and Gujarati digits in Gujarati', () => {
  setLanguage('en');
  expect(t('invoice.validation.invoiceNumberRange')).toBe(SERVER_TEXT);
  setLanguage('gu');
  expect(t('invoice.validation.invoiceNumberRange')).toBe('ઇન્વૉઇસ નંબર ૧ થી ૯૯૯૯૯૯૯૯ સુધીનો હોવો જોઈએ');
});
