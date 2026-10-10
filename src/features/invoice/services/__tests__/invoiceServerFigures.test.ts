/**
 * The invoice form shows the server's figures: the stored total after a save,
 * and line amounts worked out the way the server works them out.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { CreateInvoicePayload } from '@/types/invoice.types';
import { createInvoice, loadInvoiceData, loadInvoiceFormData, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

const GRN = '11111111-2222-4333-8444-555555555555';
const INVOICE = '33333333-3333-4444-8555-666666666666';
const LINE_A = 'aaaaaaaa-2222-4333-8444-555555555555';
const LINE_B = 'bbbbbbbb-2222-4333-8444-555555555555';

// The phone's figures for the form: 100 bags, one period. The server will count 1.5 periods.
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
    { disp_trl_id: LINE_B, grn_item_id: 'g1', qty: 80, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 1 },
  ],
};

type Answer = { data: unknown; error: unknown };
/** A client that answers each RPC by name. */
function mockRpcs(answers: Record<string, Answer | (() => Answer)>) {
  const rpc = jest.fn(async (name: string) => {
    const answer = answers[name];
    if (!answer) throw new Error(`unexpected RPC ${name}`);
    return typeof answer === 'function' ? answer() : answer;
  });
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  return rpc;
}

const storedInvoice = (total: number) => ({
  data: { success: true, invoice: { id: INVOICE, inv_no: 12, total, tax_amount: 48, labour: 200, discount: 0 }, items: [] },
  error: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the total after a save', () => {
  it('is the one the server stored, read back after save_invoice', async () => {
    const rpc = mockRpcs({
      // save_invoice(uuid, jsonb, jsonb[]) answers without totals.
      save_invoice: { data: { success: true, invoice_id: INVOICE, invoice_number: '12', items_count: 2 }, error: null },
      get_invoice_detail: storedInvoice(998),
    });

    const result = await createInvoice(payload);

    expect(result.success).toBe(true);
    expect(result.data.total).toBe(998);
    expect(rpc).toHaveBeenCalledWith('get_invoice_detail', { p_invoice_id: INVOICE });
  });

  it('is taken from the save answer when the server sends its totals', async () => {
    const rpc = mockRpcs({
      save_invoice: {
        data: { success: true, invoice_id: INVOICE, invoice_no: '12', totals: { subtotal: 950, tax: 48, grand_total: 998, total: 998 } },
        error: null,
      },
    });

    const result = await createInvoice(payload);

    expect(result.data.total).toBe(998);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('is the stored one after update_invoice too', async () => {
    mockRpcs({
      update_invoice: { data: { success: true, invoice_id: INVOICE, invoice_number: 12, items_count: 2 }, error: null },
      get_invoice_detail: storedInvoice(998),
    });

    const result = await updateInvoice(INVOICE, payload);

    expect(result.success).toBe(true);
    expect(result.data.total).toBe(998);
  });

  it('is unknown, not the phone\'s figure, when it cannot be read back; the save still counts', async () => {
    mockRpcs({
      save_invoice: { data: { success: true, invoice_id: INVOICE, invoice_number: '12' }, error: null },
      get_invoice_detail: { data: null, error: { message: 'TypeError: Network request failed' } },
    });

    const result = await createInvoice(payload);

    expect(result.success).toBe(true);
    expect(result.data.invoice_id).toBe(INVOICE);
    expect(result.data.total).toBeNull();
  });
});

describe('the lines of a GRN to invoice', () => {
  const row = (id: string, qty: number, mode: 'MONTHLY' | 'ONE_TIME') => ({
    dispatches_items_id: id,
    grn_items_id: 'g1',
    grn_items_item_id: 'i1',
    grn_items_item_name: 'Example Potatoes',
    dispatches_items_disp_qty: qty,
    grn_items_pricing_mode: mode,
    unit_price: 5,
    labour_rate: 2,
    tax_percent: 5,
    duration: 1.5,
    no_of_days: 31,
  });
  const preview = (mode: 'MONTHLY' | 'ONE_TIME') => ({
    data: { success: true, header: { grn_id: GRN, grn_no: 'A0010', customer_id: 'c1', customer_name: 'Example Traders' }, rows: [row(LINE_A, 20, mode), row(LINE_B, 80, mode)] },
    error: null,
  });

  it('are monthly lines with the documented amounts', async () => {
    mockRpcs({ generate_invoice_data_for_grn_with_pricing: preview('MONTHLY') });

    const result = await loadInvoiceFormData(GRN);

    expect(result.data.header.one_time_charge).toBe(false);
    expect(result.data.items.map((i) => [i.one_time, i.amount, i.labour_amount, i.tax_amount, i.item_total])).toEqual([
      [false, 150, 40, 9.5, 199.5],
      [false, 600, 160, 38, 798],
    ]);
  });

  it('are one-time lines when the GRN is priced one-time: no duration, no labour', async () => {
    mockRpcs({ generate_invoice_data_for_grn_with_pricing: preview('ONE_TIME') });

    const result = await loadInvoiceFormData(GRN);

    expect(result.data.header.one_time_charge).toBe(true);
    expect(result.data.items.map((i) => [i.one_time, i.duration, i.amount, i.labour_amount, i.tax_amount, i.item_total])).toEqual([
      [true, 1.5, 100, 0, 5, 105],
      [true, 1.5, 400, 0, 20, 420],
    ]);
  });
});

describe('a saved invoice opened for editing', () => {
  const detail = (oneTimeFlag: boolean) => ({
    data: {
      success: true,
      invoice: {
        id: INVOICE, inv_no: 12, inv_fin_year: 2026, inv_date: '2026-10-05T00:00:00Z', gr_id: GRN, gr_no: 'A0010',
        customer_id: 'c1', customer_name: 'Example Traders', labour: 0, tax_amount: 25, total: 525, discount: 0,
        // The flag the old switch stored. It does not decide anything.
        one_time_charge: oneTimeFlag, pricing_mode: null,
      },
      items: [
        { id: 'l1', disp_trl_id: LINE_A, grn_item_id: 'g1', item_name: 'Example Potatoes', qty: 100, duration: 1.5, no_of_days: 31, charge: 5, labour_rate: 2, tax: 5 },
      ],
    },
    error: null,
  });
  const invoiceData = (mode: string) => ({ data: { success: true, data: { header: { grn: { id: GRN, pricing_mode: mode } }, items: [] } }, error: null });

  it('takes one-time from the GRN, not from the stored flag', async () => {
    mockRpcs({ get_invoice_detail: detail(false), get_invoice_data: invoiceData('ONE_TIME') });

    const result = await loadInvoiceData(INVOICE);

    expect(result.data.header.one_time_charge).toBe(true);
    expect(result.data.items[0]).toMatchObject({ one_time: true, duration: 1.5, amount: 500, labour_amount: 0, tax_amount: 25, item_total: 525 });
  });

  it('treats a monthly GRN as monthly although the stored flag says one-time', async () => {
    mockRpcs({ get_invoice_detail: detail(true), get_invoice_data: invoiceData('MONTHLY') });

    const result = await loadInvoiceData(INVOICE);

    expect(result.data.header.one_time_charge).toBe(false);
    expect(result.data.items[0]).toMatchObject({ one_time: false, amount: 750, labour_amount: 200, tax_amount: 47.5, item_total: 997.5 });
  });

  it('still opens when the GRN pricing mode cannot be read', async () => {
    mockRpcs({ get_invoice_detail: detail(false), get_invoice_data: { data: null, error: { message: 'Network request failed' } } });

    const result = await loadInvoiceData(INVOICE);

    expect(result.success).toBe(true);
    expect(result.data.items[0]).toMatchObject({ one_time: false, amount: 750 });
  });
});
