/**
 * A new invoice is written down as an unfinished save before it is sent (as a GRN and a dispatch are), and the note is
 * removed when the server's answer is known; a lost answer keeps it for the start-up check.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { forgetUnfinishedSave, rememberUnfinishedSave } from '@/services/unfinishedSaves';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { createInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/services/unfinishedSaves', () => ({
  rememberUnfinishedSave: jest.fn(async () => {}),
  forgetUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('@/config/lanTransport', () => ({ getConnectionPath: () => 'public' }));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));

const KEY = 'warehouse-invoice-create-0123abcd';
const payload = {
  header: {
    customer_id: '22222222-3333-4444-8555-666666666666', customer_name: 'Example Traders',
    gr_id: '11111111-2222-4333-8444-555555555555', gr_no: 'A0010', inv_no: 12, inv_fin_year: 2026, inv_date: '2026-10-10',
    discount: 0, labour: 200, tax_amount: 35, total: 685, one_time_charge: false,
  },
  items: [{ disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555', grn_item_id: 'g1', qty: 20, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 1 }],
} as CreateInvoicePayload;
const answers = (answer: unknown) => jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: jest.fn(async () => answer) } as never);

beforeEach(() => {
  jest.clearAllMocks();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('createInvoice and the unfinished-save note', () => {
  it('writes the note down before the request and removes it once the server answered', async () => {
    answers({ data: { success: true, invoice_id: 'inv-1', invoice_no: 12 }, error: null });
    await createInvoice(payload, KEY);
    expect(rememberUnfinishedSave).toHaveBeenCalledWith({ kind: 'invoice', requestKey: KEY, number: '12', customerName: 'Example Traders' });
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it('removes the note for a refusal too', async () => {
    answers({ data: { success: false, error: 'Not allowed' }, error: null });
    const result = await createInvoice(payload, KEY);
    expect(result.success).toBe(false);
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
  });

  it('keeps the note when the answer is lost', async () => {
    answers({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
    const result = await createInvoice(payload, KEY);
    expect(result.lostAnswer).toBeDefined();
    expect(rememberUnfinishedSave).toHaveBeenCalledTimes(1);
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
  });

  it('does not write the note again for a resend of the same save', async () => {
    answers({ data: { success: true, invoice_id: 'inv-1', invoice_no: 12 }, error: null });
    await createInvoice(payload, KEY, { resend: true });
    expect(rememberUnfinishedSave).not.toHaveBeenCalled();
  });
});
