/**
 * WH-205: a save the server refuses with GST_DETAILS_REQUIRED (no GST details saved yet) is a refused save: nothing is
 * saved, the refusal reaches the screen as a refusal, and the words are the app's own. The real service runs; only the
 * server's reply is faked. Fictional data only.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n';
import { REFUSAL } from '@/utils/serverRefusal';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { createInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

const payload: CreateInvoicePayload = {
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
    total: 735,
    one_time_charge: false,
  },
  items: [{ disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555', grn_item_id: 'g1', qty: 20, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 1 }],
};

const SERVER_ENGLISH = 'GST details must be saved before a bill is made';
const refused = { data: { success: false, error_code: 'WH409', reason: 'GST_DETAILS_REQUIRED', error: SERVER_ENGLISH }, error: null };

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

it('names the reason GST_DETAILS_REQUIRED in the list of refusal reasons', () => {
  expect((REFUSAL as Record<string, string>).GST_DETAILS_REQUIRED).toBe('GST_DETAILS_REQUIRED');
});

describe.each(['en', 'gu'] as const)('a save refused for missing GST details (%s)', (language) => {
  beforeEach(() => setLanguage(language));

  it('is a refused save that carries the refusal, with nothing saved and no answer lost', async () => {
    const rpc = jest.fn(async () => refused);
    (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });

    const result = await createInvoice(payload);

    expect(result.success).toBe(false);
    expect(result.refusal?.reason).toBe('GST_DETAILS_REQUIRED');
    expect(result.data?.invoice_id).toBeFalsy();
    expect(result.lostAnswer).toBeUndefined();
    expect(result.numberTaken).toBeUndefined();
    // The server's English is never shown to a person.
    expect(result.message).toBeTruthy();
    expect(result.message).not.toBe(SERVER_ENGLISH);
    // A refusal is information, not an error in the device log.
    expect(console.error).not.toHaveBeenCalled();
  });
});
