/**
 * Every send of an invoice save, a resend after a lost answer included, asks for the CURRENT authenticated client: the
 * resend is a new call of the service (the screen's loop, features/invoice/utils/lostAnswerSubmit.ts), so a sign-in token
 * renewed meanwhile is the one it goes out with. (The dispatch services loop inside the call and are tested separately.)
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
const payload = {
  header: {
    customer_id: '22222222-3333-4444-8555-666666666666',
    customer_name: 'Example Traders',
    gr_id: GRN,
    gr_no: 'A0010',
    inv_no: 12,
    inv_fin_year: '2026-27' as unknown as number,
    inv_date: '2026-10-10',
    discount: 0,
    labour: 200,
    tax_amount: 35,
    total: 685,
    one_time_charge: false,
  },
  items: [{ disp_trl_id: LINE, grn_item_id: 'g1', qty: 20, charge: 5.5, labour_rate: 2, tax: 5, duration: 1.5, no_of_days: 45 } as CreateInvoicePayload['items'][number]],
} as CreateInvoicePayload;
const dropped = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };

function client(token: string, answers: Record<string, unknown>) {
  return {
    token,
    rpc: jest.fn(async (name: string) => {
      if (name in answers) return answers[name];
      if (name === 'get_invoice_detail') return { data: { success: true, invoice: { id: INVOICE, total: 685 }, items: [] }, error: null };
      if (name === 'generate_invoice_data_for_grn_with_pricing') return { data: [{ disp_trl_id: LINE, grn_item_id: 'g1', qty: 20, disp_qty: 20 }], error: null };
      throw new Error(`unexpected RPC ${name}`);
    }),
  };
}

beforeEach(() => {
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it.each([
  ['create', 'save_invoice', (resend: boolean) => createInvoice(payload, 'key-1', resend ? { resend: true } : undefined)],
  ['update', 'update_invoice', (resend: boolean) => updateInvoice(INVOICE, payload, 'key-1', resend ? { resend: true } : undefined)],
] as const)('the resend of an invoice %s goes out on the client the session has now', async (_name, rpcName, run) => {
  const before = client('token-before-renewal', { [rpcName]: dropped });
  const after = client('token-after-renewal', { [rpcName]: { data: { success: true, invoice_id: INVOICE, invoice_number: '12', totals: { grand_total: 685 } }, error: null } });
  jest.mocked(getAuthenticatedClient).mockResolvedValueOnce(before as never).mockResolvedValueOnce(after as never);

  const first = await run(false);
  const again = await run(true);

  expect(first.lostAnswer).toBeDefined();
  expect(again.success).toBe(true);
  expect(before.rpc.mock.calls.filter(([name]) => name === rpcName)).toHaveLength(1);
  expect(after.rpc.mock.calls.filter(([name]) => name === rpcName)).toHaveLength(1);
});
