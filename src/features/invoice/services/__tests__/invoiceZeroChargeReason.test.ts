/**
 * A zero charge and its reason on the wire (owner decision 3 of 2026-10-11,
 * backend migration 48): the header of save_invoice and update_invoice carries
 * `zero_charge_reason` when, and only when, a line has a charge of 0, and
 * get_invoice_detail returns the stored reason for an edit.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import type { CreateInvoicePayload, InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';
import { createInvoice, loadInvoiceData, transformFormDataToPayload, updateInvoice } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

const GRN = '11111111-2222-4333-8444-555555555555';
const INVOICE = '33333333-3333-4444-8555-666666666666';
const FREE = 'aaaaaaaa-2222-4333-8444-555555555555';
const PAID = 'bbbbbbbb-2222-4333-8444-555555555555';

const line = (disp_trl_id: string, charge: number) =>
  ({ disp_trl_id, grn_item_id: 'g1', qty: 20, charge, labour_rate: 2, tax: 5, duration: 1.5, no_of_days: 45 });

const payload = (charges: number[], reason?: string | null): CreateInvoicePayload => ({
  header: {
    customer_id: '22222222-3333-4444-8555-666666666666',
    customer_name: 'Example Traders',
    gr_id: GRN,
    gr_no: 'A0010',
    inv_no: 12,
    inv_fin_year: 2026,
    inv_date: '2026-10-10',
    discount: 0,
    labour: 80,
    tax_amount: 4,
    total: 84,
    one_time_charge: false,
    ...(reason === undefined ? {} : { zero_charge_reason: reason }),
  },
  items: charges.map((charge, index) => line(index === 0 ? FREE : PAID, charge)),
});

let rpc: jest.Mock;
let answers: Record<string, { data: unknown; error: unknown }>;
beforeEach(() => {
  answers = {
    save_invoice: { data: { success: true, invoice_id: INVOICE, invoice_number: '12', totals: { grand_total: 84 } }, error: null },
    update_invoice: { data: { success: true, invoice_id: INVOICE, invoice_number: 12 }, error: null },
    get_invoice_detail: { data: { success: true, invoice: { id: INVOICE, total: 84 }, items: [] }, error: null },
  };
  rpc = jest.fn(async (name: string) => {
    if (!answers[name]) throw new Error(`unexpected RPC ${name}`);
    return answers[name];
  });
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

const sentHeader = (name: string) => rpc.mock.calls.find(([called]) => called === name)?.[1].p_invoice_data;

describe.each([
  ['save_invoice', (data: CreateInvoicePayload) => createInvoice(data)],
  ['update_invoice', (data: CreateInvoicePayload) => updateInvoice(INVOICE, data)],
] as const)('%s header', (name, save) => {
  it('carries the reason, trimmed, when a line has a charge of 0', async () => {
    const result = await save(payload([0, 5.5], '  Sample lot, agreed with the owner  '));

    expect(result.success).toBe(true);
    expect(sentHeader(name)).toHaveProperty('zero_charge_reason', 'Sample lot, agreed with the owner');
  });

  it('sends the line itself with a charge of 0', async () => {
    await save(payload([0, 5.5], 'Sample lot'));

    const lines = rpc.mock.calls.find(([called]) => called === name)![1].p_invoice_items;
    expect(lines.map((item: { charge: number }) => item.charge)).toEqual([0, 5.5]);
  });

  it.each([[undefined], [null], [''], ['   ']])(
    'carries null when a line has a charge of 0 and the reason is %p (administrators and supervisors may leave it empty)',
    async (reason) => {
      await save(payload([0, 5.5], reason));

      expect(sentHeader(name)).toHaveProperty('zero_charge_reason', null);
    }
  );

  // The server rounds the charge to two decimals before it decides whether a line is free.
  it('carries the key for a charge that rounds to 0, and leaves it out for one that rounds to 0.01', async () => {
    await save(payload([0.004, 5.5], 'Sample lot'));
    expect(sentHeader(name)).toHaveProperty('zero_charge_reason', 'Sample lot');

    rpc.mockClear();
    await save(payload([0.004, 5.5], ''));
    expect(sentHeader(name)).toHaveProperty('zero_charge_reason', null);

    rpc.mockClear();
    await save(payload([0.005, 5.5], 'Sample lot'));
    expect(sentHeader(name)).not.toHaveProperty('zero_charge_reason');
  });

  it('leaves the key out when no line has a charge of 0, also when a reason was written earlier', async () => {
    await save(payload([4, 5.5], 'Sample lot'));

    expect(sentHeader(name)).not.toHaveProperty('zero_charge_reason');
  });

  it('never says who gave the reason or when: the server records that itself', async () => {
    await save(payload([0], 'Sample lot'));

    expect(sentHeader(name)).not.toHaveProperty('zero_charge_set_by');
    expect(sentHeader(name)).not.toHaveProperty('zero_charge_set_at');
  });

  it.each(['en', 'gu'] as const)('reports the refusal of a missing reason in the reader\'s language (%s)', async (language) => {
    setLanguage(language);
    answers[name] = { data: { success: false, error: 'Enter a reason for the zero charge', error_code: '22023' }, error: null };

    const result = await save(payload([0], null));

    expect(result.success).toBe(false);
    expect(result.message).toBe(language === 'en' ? 'Enter a reason for the zero charge' : t('errors.parsed.zeroChargeReasonRequired'));
  });

  it('reports the same refusal when it comes back as a database error', async () => {
    setLanguage('gu');
    answers[name] = { data: null, error: { code: '22023', message: 'Enter a reason for the zero charge' } };

    const result = await save(payload([0], null));

    expect(result.success).toBe(false);
    expect(result.message).toBe('શૂન્ય ભાડાનું કારણ લખો.');
  });
});

describe('the invoice opened for editing', () => {
  const detail = (zeroChargeReason: unknown) => ({
    data: {
      success: true,
      invoice: {
        id: INVOICE, inv_no: 12, inv_fin_year: 2026, inv_date: '2026-10-05T00:00:00Z', gr_id: GRN, gr_no: 'A0010',
        customer_id: 'c1', customer_name: 'Example Traders', labour: 80, tax_amount: 4, total: 84, discount: 0,
        zero_charge_reason: zeroChargeReason,
        zero_charge_set_by: '44444444-2222-4333-8444-555555555555',
        zero_charge_set_by_name: 'Fictional Staff',
        zero_charge_set_at: '2026-10-05T09:30:00Z',
      },
      items: [
        { id: 'l1', disp_trl_id: FREE, grn_item_id: 'g1', item_name: 'Example Potatoes', qty: 20, duration: 1.5, no_of_days: 45, charge: 0, labour_rate: 2, tax: 5 },
        { id: 'l2', disp_trl_id: PAID, grn_item_id: 'g1', item_name: 'Example Potatoes', qty: 20, duration: 1.5, no_of_days: 45, charge: 5.5, labour_rate: 2, tax: 5 },
      ],
    },
    error: null,
  });
  const noGrnMode = { data: { success: true, data: { header: { grn: { id: GRN, pricing_mode: 'MONTHLY' } }, items: [] } }, error: null };

  it('has the stored reason and its line with a charge of 0', async () => {
    answers.get_invoice_detail = detail('Sample lot');
    answers.get_invoice_data = noGrnMode;

    const result = await loadInvoiceData(INVOICE);

    expect(result.success).toBe(true);
    expect(result.data.header.zero_charge_reason).toBe('Sample lot');
    expect(result.data.items.map((item) => item.charge)).toEqual([0, 5.5]);
  });

  it.each([[null], [undefined]])('has an empty reason when the server stored %p', async (stored) => {
    answers.get_invoice_detail = detail(stored);
    answers.get_invoice_data = noGrnMode;

    expect((await loadInvoiceData(INVOICE)).data.header.zero_charge_reason).toBe('');
  });
});

describe('the update built from the edit form', () => {
  const formLine = (disp_trl_id: string, charge: number) => ({ ...line(disp_trl_id, charge), temp_id: `edit_${disp_trl_id}` }) as unknown as InvoiceItemData;
  // The form as loaded: it holds the stored reason.
  const stored: InvoiceHeaderData = {
    inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 12, inv_no_typed: true, customer_id: 'c1', customer_name: 'Example Traders',
    gr_id: GRN, gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 80, tax_amount: 4, total: 84,
    zero_charge_reason: 'Sample lot',
  };

  it('sends the stored reason back: the server asks staff for it on every save', async () => {
    await updateInvoice(INVOICE, transformFormDataToPayload(stored, [formLine(FREE, 0), formLine(PAID, 5.5)]));

    expect(sentHeader('update_invoice')).toHaveProperty('zero_charge_reason', 'Sample lot');
  });

  it('sends the stored reason back when other lines are free now', async () => {
    await updateInvoice(INVOICE, transformFormDataToPayload(stored, [formLine(FREE, 4), formLine(PAID, 0)]));

    expect(sentHeader('update_invoice')).toHaveProperty('zero_charge_reason', 'Sample lot');
  });

  it('sends what was written in this edit', async () => {
    const typed = { ...stored, zero_charge_reason: ' Agreed with the owner ' };

    await updateInvoice(INVOICE, transformFormDataToPayload(typed, [formLine(FREE, 0), formLine(PAID, 0)]));

    expect(sentHeader('update_invoice')).toHaveProperty('zero_charge_reason', 'Agreed with the owner');
  });

  it('sends null when the reason was erased: an administrator or supervisor removes it that way', async () => {
    await updateInvoice(INVOICE, transformFormDataToPayload({ ...stored, zero_charge_reason: '' }, [formLine(FREE, 0)]));

    expect(sentHeader('update_invoice')).toHaveProperty('zero_charge_reason', null);
  });

  it('sends nothing about a zero charge once every line has a charge', async () => {
    await updateInvoice(INVOICE, transformFormDataToPayload(stored, [formLine(FREE, 3), formLine(PAID, 5.5)]));

    expect(sentHeader('update_invoice')).not.toHaveProperty('zero_charge_reason');
  });

  it('counts a line sent without a charge as a zero charge, as the server does', async () => {
    const noCharge = { ...formLine(FREE, 0), charge: undefined } as unknown as InvoiceItemData;

    await updateInvoice(INVOICE, transformFormDataToPayload(stored, [noCharge]));

    expect(sentHeader('update_invoice')).toHaveProperty('zero_charge_reason', 'Sample lot');
  });

  it('puts the reason at the top level of the header, beside the discount reason, and nothing of the form\'s own', async () => {
    await updateInvoice(INVOICE, transformFormDataToPayload({ ...stored, discount: 10, discount_reason: 'Damaged bags' }, [formLine(FREE, 0)]));

    const header = sentHeader('update_invoice');
    expect(header).toMatchObject({ discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' });
    for (const key of ['inv_no_typed', 'saved_discount', 'saved_discount_reason', 'discount_reason_edited']) {
      expect(header).not.toHaveProperty(key);
    }
  });
});
