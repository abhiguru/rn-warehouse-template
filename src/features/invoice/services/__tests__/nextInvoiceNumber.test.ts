/**
 * The next invoice number is per financial year (owner decision 2 of
 * 2026-10-11, backend migration 48): `get_next_invoice_number(p_fin_year)`,
 * where the year is the calendar year the financial year starts in.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getNextInvoiceNumber } from '../invoiceFormService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));

/** An rpc that gives the listed answers in turn. */
function mockRpc(...answers: unknown[]) {
  const rpc = jest.fn();
  answers.forEach((answer) => rpc.mockResolvedValueOnce(answer));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  return rpc;
}

const UNKNOWN_PARAMETER = {
  code: 'PGRST202',
  message: 'Could not find the function public.get_next_invoice_number(p_fin_year) in the schema cache',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('getNextInvoiceNumber', () => {
  it.each([
    ['2026-27', 2026],
    ['2025-26', 2025],
    ['1999-00', 1999],
  ])('asks for financial year %s as p_fin_year %d', async (finYear, startYear) => {
    const rpc = mockRpc({ data: '55', error: null });

    const result = await getNextInvoiceNumber(finYear);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_next_invoice_number', { p_fin_year: startYear });
    expect(result).toEqual({ success: true, data: { next_invoice_number: 55, financial_year: finYear } });
  });

  it.each([
    ['1', 1],
    ['55', 55],
    ['2147483647', 2147483647],
    // A server before migration 48 answers with a prefixed number.
    ['I0000554', 554],
  ])('reads the answer %p as %d', async (answer, number) => {
    mockRpc({ data: answer, error: null });

    expect((await getNextInvoiceNumber('2026-27')).data.next_invoice_number).toBe(number);
  });

  it('reads a number sent as a JSON number', async () => {
    mockRpc({ data: 56, error: null });

    expect(await getNextInvoiceNumber('2026-27')).toEqual({
      success: true,
      data: { next_invoice_number: 56, financial_year: '2026-27' },
    });
  });

  it('reports a failure when the year has no number left, so the form asks for one to be typed', async () => {
    const rpc = mockRpc({ data: null, error: { code: 'WH409', message: 'No invoice number is left in financial year 2026' } });

    const result = await getNextInvoiceNumber('2026-27');

    expect(result.success).toBe(false);
    // Not taken for a server that lacks the parameter: nothing is asked a second time.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('asks once more without the parameter when the server does not know it (no migration 48)', async () => {
    const rpc = mockRpc({ data: null, error: UNKNOWN_PARAMETER }, { data: 'I0000554', error: null });

    const result = await getNextInvoiceNumber('2026-27');

    expect(rpc.mock.calls).toEqual([
      ['get_next_invoice_number', { p_fin_year: 2026 }],
      ['get_next_invoice_number'],
    ]);
    expect(result).toEqual({ success: true, data: { next_invoice_number: 554, financial_year: '2026-27' } });
  });

  it('recognises the missing parameter by its message when the code is absent', async () => {
    const rpc = mockRpc({ data: null, error: { message: UNKNOWN_PARAMETER.message } }, { data: '7', error: null });

    expect((await getNextInvoiceNumber('2026-27')).data.next_invoice_number).toBe(7);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('falls back once only: a second failure is reported', async () => {
    const rpc = mockRpc({ data: null, error: UNKNOWN_PARAMETER }, { data: null, error: UNKNOWN_PARAMETER });

    expect((await getNextInvoiceNumber('2026-27')).success).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on any other failure', async () => {
    const rpc = mockRpc({ data: null, error: { code: '42501', message: 'permission denied' } });

    expect((await getNextInvoiceNumber('2026-27')).success).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('reports a failure, not number 1, when the answer is not a number', async () => {
    mockRpc({ data: 'none', error: null });

    expect((await getNextInvoiceNumber('2026-27')).success).toBe(false);
  });
});
