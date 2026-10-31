/** An invoice save answered "Session expired or revoked" (403) ends the sign-in, so the reason is kept and shown. */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { createInvoice, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/utils/serviceErrorHandler', () => ({ ...jest.requireActual('@/utils/serviceErrorHandler'), handleGlobalAuthError: jest.fn() }));

const GRN = '11111111-2222-4333-8444-555555555555';
const LINE_A = 'aaaaaaaa-2222-4333-8444-555555555555';
const LINE_B = 'bbbbbbbb-2222-4333-8444-555555555555';

const payload: CreateInvoicePayload = {
  header: {
    customer_id: '22222222-3333-4444-8555-666666666666',
    customer_name: 'Example Traders',
    gr_id: GRN,
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
  items: [
    { disp_trl_id: LINE_A, grn_item_id: 'g1', qty: 20, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 1 },
  ],
};

const ended = { data: null, error: { message: 'Session expired or revoked', code: '42501' }, status: 403 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc: jest.fn(async () => ended) });
});
afterEach(() => jest.restoreAllMocks());

it.each([
  ['create', () => createInvoice(payload)],
  ['update', () => updateInvoice('33333333-3333-4444-8555-666666666666', payload)],
])('%s answered 403 reports the ended session', async (_name, save) => {
  await save();
  expect(handleGlobalAuthError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Session expired or revoked' }));
});
