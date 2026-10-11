import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import type { CreateInvoicePayload, InvoiceItemData } from '@/types/invoice.types';
import { checkGrnStillInvoiceable, createInvoice, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

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

const formLine = (disp_trl_id: string, qty: number) => ({ disp_trl_id, qty }) as InvoiceItemData;

/** One row of generate_invoice_data_for_grn_with_pricing. */
const previewRow = (id: string, qty: number) => ({
  dispatches_items_id: id,
  grn_items_id: 'g1',
  dispatches_items_disp_qty: qty,
  unit_price: 5,
  labour_rate: 2,
  tax_percent: 5,
  duration: 1,
  grn_items_pricing_mode: 'MONTHLY',
});

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

describe.each(['en', 'gu'] as const)('a refused invoice save (%s)', (language) => {
  beforeEach(() => setLanguage(language));

  it.each([
    ['GRN is already invoiced', 'errors.parsed.grnAlreadyInvoiced'],
    ['A dispatch line is already on another invoice', 'errors.parsed.lineOnOtherInvoice'],
    ['Invoice line tax must be between 0 and 100', 'errors.parsed.invoiceTaxRange'],
  ] as const)('says why in the app\'s words: %s', async (error, key) => {
    mockRpc({ data: { success: false, error, error_code: 'WH409' }, error: null });

    const created = await createInvoice(payload);
    const updated = await updateInvoice('33333333-3333-4444-8555-666666666666', payload);

    expect(created.success).toBe(false);
    expect(created.message).toBe(t(key));
    expect(updated.success).toBe(false);
    expect(updated.message).toBe(t(key));
  });
});

describe('checking a GRN again just before saving', () => {
  it('passes when the GRN still has the same dispatch lines', async () => {
    const rpc = mockRpc({
      data: { success: true, header: { grn_id: GRN, grn_no: 'A0010' }, rows: [previewRow(LINE_A, 20), previewRow(LINE_B, 80)] },
      error: null,
    });

    const result = await checkGrnStillInvoiceable(GRN, [formLine(LINE_B, 80), formLine(LINE_A, 20)]);

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('generate_invoice_data_for_grn_with_pricing', { p_gr_id: GRN });
  });

  it('stops when another user has invoiced the GRN meanwhile', async () => {
    mockRpc({
      data: { success: false, error: 'GRN is not ready for invoicing (must be completely dispatched and not already invoiced)' },
      error: null,
    });

    const result = await checkGrnStillInvoiceable(GRN, [formLine(LINE_A, 20)]);

    expect(result).toEqual({ ok: false, message: t('invoice.review.grnNotInvoiceable') });
  });

  it.each([
    ['a dispatch quantity changed', [previewRow(LINE_A, 25)]],
    ['a dispatch line was added', [previewRow(LINE_A, 20), previewRow(LINE_B, 80)]],
    ['a dispatch line was replaced', [previewRow(LINE_B, 20)]],
  ])('stops when %s', async (_name, rows) => {
    mockRpc({ data: { success: true, header: { grn_id: GRN, grn_no: 'A0010' }, rows }, error: null });

    const result = await checkGrnStillInvoiceable(GRN, [formLine(LINE_A, 20)]);

    expect(result).toEqual({ ok: false, message: t('invoice.review.grnChanged') });
  });

  it('stops when the check itself cannot be made', async () => {
    mockRpc({ data: null, error: { message: 'TypeError: Network request failed' } });

    const result = await checkGrnStillInvoiceable(GRN, [formLine(LINE_A, 20)]);

    expect(result.ok).toBe(false);
  });
});

describe('what a failed invoice call writes to the device log', () => {
  // PostgreSQL puts row values into `details` and `hint`; they stay out of the log.
  const error = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "unique_inv_no_per_year"',
    details: 'Key (customer_name, discount_reason)=(Example Traders, Damaged bags) already exists.',
    hint: 'Row of Example Traders',
  };
  const logged = (spy: jest.SpyInstance) => spy.mock.calls.map((call) => call.map((part: unknown) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')).join('\n');

  it('has the error code and message, not the row values', async () => {
    const errorLog = console.error as unknown as jest.SpyInstance;
    const otherLogs = [console.log as unknown as jest.SpyInstance, console.warn as unknown as jest.SpyInstance];
    mockRpc({ data: null, error });

    await createInvoice(payload);
    await updateInvoice('33333333-3333-4444-8555-666666666666', payload);

    const text = logged(errorLog);
    expect(text).toContain('23505');
    expect(text).toContain('unique_inv_no_per_year');
    for (const spy of [errorLog, ...otherLogs]) {
      expect(logged(spy)).not.toContain('Example Traders');
      expect(logged(spy)).not.toContain('Damaged bags');
    }
  });
});
