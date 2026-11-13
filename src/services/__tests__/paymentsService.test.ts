/**
 * Payments on invoices (WH-143, backend migration 172). The server works out paid, due and status; the app reads those figures,
 * sends the amount as text with 2 decimals (never through floating point) and words the refusals. The real service runs here,
 * with only the server's reply faked. Fictional figures only.
 */
import {
  amountForServer,
  getInvoicePayments,
  newPaymentRequestId,
  paymentRefusalOf,
  readFigures,
  readPayment,
  readPaymentStatus,
  runPaymentWrite,
  type PaymentWrite,
} from '../paymentsService';
import { REFUSAL } from '@/utils/serverRefusal';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));

beforeEach(() => {
  mockRpc.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('amountForServer', () => {
  it.each([
    ['400', '400.00'],
    ['400.5', '400.50'],
    ['400.50', '400.50'],
    ['400.', '400.00'],
    ['0.05', '0.05'],
    ['007', '7.00'],
    ['  25.10 ', '25.10'],
    ['9999999999.99', '9999999999.99'],
  ])('%j goes to the server as %j, by text only', (typed, sent) => {
    expect(amountForServer(typed)).toBe(sent);
  });

  it.each(['', '0', '0.00', '000', '.5', '-5', '12.345', '1,000', '₹100', 'abc', '1e3', '12345678901', '10.5.1'])(
    '%j is no amount more than 0 with at most 2 decimals',
    typed => {
      expect(amountForServer(typed)).toBeNull();
    }
  );

  it('does not lose paise to binary floating point', () => {
    expect(amountForServer('1234567.89')).toBe('1234567.89');
    expect(amountForServer('0.29')).toBe('0.29');
  });
});

describe('reading the server\'s figures', () => {
  it('reads paid, due and status from a row, and null for what the reader may not see', () => {
    expect(readFigures({ paid_amount: '400.50', due_amount: 99.5, payment_status: 'part_paid' })).toEqual({ paidAmount: 400.5, dueAmount: 99.5, status: 'part_paid' });
    expect(readFigures({ paid_amount: null, due_amount: undefined, payment_status: 'cancelled' })).toEqual({ paidAmount: null, dueAmount: null, status: null });
    expect(readFigures('nonsense')).toEqual({ paidAmount: null, dueAmount: null, status: null });
    expect(readFigures({ paid_amount: '', due_amount: 'x' })).toMatchObject({ paidAmount: null, dueAmount: null });
  });

  it.each([['due', 'due'], ['part_paid', 'part_paid'], ['paid', 'paid'], ['PAID', null], [undefined, null], [3, null]])('status %j is %j', (value, expected) => {
    expect(readPaymentStatus(value)).toBe(expected);
  });

  const payment = { id: 'p1', payment_no: 7, invoice_id: 'i1', paid_on: '2026-11-02', amount: '250.00', mode: 'upi', note: 'part', entered_by_name: 'Asha', updated_at: '2026-11-02T10:00:00Z', recorded_in_app: true };

  it('reads a payment with its version token and mode', () => {
    expect(readPayment(payment)).toEqual({
      id: 'p1', paymentNo: 7, invoiceId: 'i1', paidOn: '2026-11-02', amount: 250, mode: 'upi', note: 'part', enteredByName: 'Asha',
      updatedAt: '2026-11-02T10:00:00Z', recordedInApp: true, imported: false,
    });
  });

  it('reads imported only from true: absent (an older server) or anything else is false', () => {
    expect(readPayment({ ...payment, imported: true })).toMatchObject({ imported: true });
    expect(readPayment({ ...payment, imported: 'true' })).toMatchObject({ imported: false });
    expect(readPayment(payment)).toMatchObject({ imported: false });
  });

  it('marks a row of the old accounting link read-only, and an unknown mode as none', () => {
    expect(readPayment({ ...payment, recorded_in_app: undefined, mode: 'barter' })).toMatchObject({ recordedInApp: false, mode: null });
  });

  it.each(['id', 'amount', 'updated_at', 'paid_on'])('is not a payment without %s', key => {
    expect(readPayment({ ...payment, [key]: null })).toBeNull();
  });
});

describe('getInvoicePayments', () => {
  it('reads the figures and the payments of get_invoice_detail, and leaves out a row it cannot read', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        invoice: {
          paid_amount: 250, due_amount: 750, payment_status: 'part_paid',
          payments: [
            { id: 'p1', amount: 250, paid_on: '2026-11-02', updated_at: 'u1', mode: 'cash' },
            { id: 'bad', amount: null, paid_on: '2026-11-02', updated_at: 'u2' },
          ],
        },
      },
      error: null,
    });
    const result = await getInvoicePayments('i1');
    expect(mockRpc).toHaveBeenCalledWith('get_invoice_detail', { p_invoice_id: 'i1' });
    expect(result).toMatchObject({ paidAmount: 250, dueAmount: 750, status: 'part_paid' });
    expect(result.payments.map(p => p.id)).toEqual(['p1']);
  });

  it('fails when the answer is not a success', async () => {
    mockRpc.mockResolvedValue({ data: { success: false }, error: null });
    await expect(getInvoicePayments('i1')).rejects.toThrow();
  });
});

describe('the words of a refusal', () => {
  it('keeps the form and the typed values for a date or an amount the server refused', () => {
    expect(paymentRefusalOf(REFUSAL.PAYMENT_DATE_FUTURE, { today: '2026-11-11' })).toMatchObject({ keepForm: true, reload: false });
    expect(paymentRefusalOf(REFUSAL.PAYMENT_BEFORE_INVOICE, { invoice_date: '2026-11-01' })).toMatchObject({ keepForm: true, reload: false });
  });

  it('names the live due amount from the server when a payment is more than is due, and reads the invoice again', () => {
    const refusal = paymentRefusalOf(REFUSAL.PAYMENT_OVER_DUE, { due: '750.00' });
    expect(refusal).toMatchObject({ keepForm: true, reload: true });
    expect(refusal?.message).toContain('750.00');
  });

  it.each([REFUSAL.PAYMENTS_OFF, REFUSAL.INVOICE_CANCELLED, REFUSAL.INVOICE_NOT_FOUND, REFUSAL.PAYMENT_NOT_FOUND, REFUSAL.PAYMENT_NOT_EDITABLE, REFUSAL.STALE_RECORD])(
    '%s asks for the screen to read the invoice again',
    reason => {
      expect(paymentRefusalOf(reason, undefined)).toMatchObject({ reload: true, keepForm: false });
    }
  );

  it('has no sentence for a reason it does not know', () => {
    expect(paymentRefusalOf('SOMETHING_NEW', undefined)).toBeUndefined();
    expect(paymentRefusalOf(undefined, undefined)).toBeUndefined();
  });
});

describe('runPaymentWrite', () => {
  const record: PaymentWrite = { kind: 'record', args: { p_invoice_id: 'i1', p_paid_on: '2026-11-02', p_amount: '250.00', p_mode: 'cash', p_note: null } };
  const never = new AbortController().signal;

  it('sends the amount as the text it was given, with the request code, and returns the figures after the write', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        invoice_id: 'i1',
        invoice: { inv_no: 12, invoice_label: 'SRT/12', paid_amount: 250, due_amount: 750, payment_status: 'part_paid' },
        payment: { id: 'p1', amount: 250, paid_on: '2026-11-02', updated_at: 'u1', mode: 'cash' },
      },
      error: null,
    });
    const requestId = newPaymentRequestId('record');
    const outcome = await runPaymentWrite(record, requestId, never, () => {});
    expect(mockRpc).toHaveBeenCalledWith('record_payment', { ...record.args, p_request_id: requestId });
    expect(typeof mockRpc.mock.calls[0][1].p_amount).toBe('string');
    expect(outcome).toMatchObject({
      ok: true,
      done: { invoiceId: 'i1', invoiceNumber: 'SRT/12', figures: { paidAmount: 250, dueAmount: 750, status: 'part_paid' } },
    });
  });

  it('shows the digits as the invoice number on a server before migration 175 (no label)', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, invoice_id: 'i1', invoice: { inv_no: 12, paid_amount: 1, due_amount: 0, payment_status: 'paid' }, payment: { id: 'p1', amount: 1, paid_on: '2026-11-02', updated_at: 'u1' } },
      error: null,
    });
    const outcome = await runPaymentWrite(record, newPaymentRequestId('record'), never, () => {});
    expect(outcome).toMatchObject({ ok: true, done: { invoiceNumber: '12' } });
  });

  it('answers a payment over the due amount with the app\'s sentence and keeps the form, writing nothing twice', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, reason: REFUSAL.PAYMENT_OVER_DUE, fields: { due: '100.00' } }, error: null });
    const outcome = await runPaymentWrite(record, newPaymentRequestId('record'), never, () => {});
    expect(outcome).toMatchObject({ ok: false, refusal: { reason: REFUSAL.PAYMENT_OVER_DUE, keepForm: true, reload: true } });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('request codes differ between writes and name the kind', () => {
    const a = newPaymentRequestId('record');
    const b = newPaymentRequestId('record');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^warehouse-payment-record-/);
    expect(newPaymentRequestId('delete')).toMatch(/^warehouse-payment-delete-/);
  });
});
