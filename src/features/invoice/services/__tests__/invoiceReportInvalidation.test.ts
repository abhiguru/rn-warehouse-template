/**
 * A saved invoice marks every report out of date, once; a failed or refused save does not
 * (review 2026-10-13, SR-10).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { invalidateReportQueries } from '@/lib/queryClient';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { createInvoice, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));

const invalidate = jest.mocked(invalidateReportQueries);
const INVOICE_ID = '33333333-3333-4444-8555-666666666666';
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
  items: [
    { disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555', grn_item_id: 'g1', qty: 20, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 1 },
  ],
};

function answer(result: unknown) {
  const rpc = jest.fn(async () => result);
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  invalidate.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const saved = { data: { success: true, invoice_id: INVOICE_ID, invoice_no: 12, invoice_number: '12', totals: { grand_total: 735 } }, error: null };
const failures = [
  ['a transport error', { data: null, error: { message: 'Network request failed', code: '' } }],
  ['success: false', { data: { success: false, error: 'GRN is already invoiced', error_code: 'WH409' }, error: null }],
] as const;

describe.each([
  ['createInvoice', () => createInvoice(payload)],
  ['updateInvoice', () => updateInvoice(INVOICE_ID, payload)],
] as const)('%s', (_name, save) => {
  it('marks the reports out of date once after the save', async () => {
    answer(saved);
    expect((await save()).success).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(failures)('marks nothing after %s', async (_failure, result) => {
    answer(result);
    expect((await save()).success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
