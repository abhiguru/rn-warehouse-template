/**
 * Exactly what the app sends when an invoice is saved. The server reads these
 * names; a key that is renamed or dropped here is ignored there without an
 * error, and a key that is added is a figure the server did not ask for.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { createInvoice, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

const GRN = '11111111-2222-4333-8444-555555555555';
const INVOICE = '33333333-3333-4444-8555-666666666666';
const LINE = 'aaaaaaaa-2222-4333-8444-555555555555';

const payload: CreateInvoicePayload = {
  header: {
    customer_id: '22222222-3333-4444-8555-666666666666',
    customer_name: 'Example Traders',
    gr_id: GRN,
    gr_no: 'A0010',
    inv_no: 12,
    inv_fin_year: '2026-27' as unknown as number,
    inv_date: '2026-10-10',
    discount: 50,
    discount_reason: '  Long-standing customer  ',
    labour: 200,
    tax_amount: 35,
    total: 685,
    one_time_charge: true,
  },
  items: [
    {
      disp_trl_id: LINE, grn_item_id: 'g1', qty: 20, charge: 5.5, labour_rate: 2, tax: 5, duration: 1.5, no_of_days: 45,
      // Form-only fields that must not be sent.
      temp_id: 'new_1', item_name: 'Example Potatoes', amount: 165,
    } as CreateInvoicePayload['items'][number],
  ],
};

let rpc: jest.Mock;
beforeEach(() => {
  rpc = jest.fn(async (name: string) => {
    if (name === 'save_invoice') return { data: { success: true, invoice_id: INVOICE, invoice_number: '12', totals: { grand_total: 685 } }, error: null };
    if (name === 'update_invoice') return { data: { success: true, invoice_id: INVOICE }, error: null };
    if (name === 'get_invoice_detail') return { data: { success: true, invoice: { id: INVOICE, total: 685 }, items: [] }, error: null };
    // The GRN is read again before a new invoice is saved; these lines are still open.
    if (name === 'generate_invoice_data_for_grn_with_pricing') {
      return { data: [{ disp_trl_id: LINE, grn_item_id: 'g1', qty: 20, disp_qty: 20 }], error: null };
    }
    throw new Error(`unexpected RPC ${name}`);
  });
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const sent = (name: string) => rpc.mock.calls.find(([called]) => called === name)?.[1];

describe('save_invoice request', () => {
  it('has these keys and no others', async () => {
    const result = await createInvoice(payload);
    expect(result.success).toBe(true);

    const request = sent('save_invoice');
    expect(Object.keys(request).sort()).toEqual(['p_invoice_data', 'p_invoice_id', 'p_invoice_items']);
    expect(request.p_invoice_id).toBeNull();
    expect(request.p_invoice_data).toEqual({
      customer_id: '22222222-3333-4444-8555-666666666666',
      customer_name: 'Example Traders',
      gr_id: GRN,
      gr_no: 'A0010',
      inv_no: 12,
      inv_fin_year: 2026,
      inv_date: '2026-10-10T00:00:00Z',
      discount: 50,
      discount_reason: 'Long-standing customer',
      labour: 200,
      tax_amount: 35,
      total: 685,
      one_time_charge: true,
      is_auto_generated: false,
    });
    expect(request.p_invoice_items).toEqual([
      { disp_trl_id: LINE, grn_item_id: 'g1', qty: 20, charge: 5.5, labour_rate: 2, tax: 5, duration: 1.5, no_of_days: 45 },
    ]);
  });

  it('never says who set the discount or when: the server records that itself', async () => {
    await createInvoice(payload);
    const header = sent('save_invoice').p_invoice_data;
    expect(header).not.toHaveProperty('discount_set_by');
    expect(header).not.toHaveProperty('discount_set_at');
  });
});

describe('update_invoice request', () => {
  it('names the invoice and sends the header and the line fields the server reads', async () => {
    const result = await updateInvoice(INVOICE, payload);
    expect(result.success).toBe(true);

    const request = sent('update_invoice');
    expect(Object.keys(request).sort()).toEqual(['p_invoice_data', 'p_invoice_id', 'p_invoice_items']);
    expect(request.p_invoice_id).toBe(INVOICE);
    expect(request.p_invoice_data).toEqual(expect.objectContaining({
      customer_id: '22222222-3333-4444-8555-666666666666',
      gr_id: GRN,
      inv_no: 12,
      discount: 50,
      discount_reason: 'Long-standing customer',
      one_time_charge: true,
    }));
    expect(request.p_invoice_data).not.toHaveProperty('discount_set_by');
    expect(request.p_invoice_data).not.toHaveProperty('discount_set_at');
    expect(Object.keys(request.p_invoice_items[0]).sort()).toEqual(
      ['charge', 'disp_trl_id', 'duration', 'grn_item_id', 'labour_rate', 'no_of_days', 'tax']
    );
  });
});
