/**
 * Payments on invoices (backend migration 172, WH-143).
 *
 * The server alone works out what is paid and due and the status; this file only reads those figures and sends what the
 * person entered. Amounts go as text with 2 decimals ("400.50"), never through floating point. Every write carries a
 * request code (`p_request_id`), so a write whose answer is lost is settled with `get_submission_result`, as the other
 * saves are (owner rule D22, W22): `runPaymentWrite` below.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { getFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { t } from '@/i18n';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { checkSubmission } from '@/utils/lostAnswer';
import { isUnsettledFailure } from '@/utils/serverText';
import { REFUSAL } from '@/utils/serverRefusal';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { formatIdentifier } from '@/i18n';
import { invoiceLabelOf } from '@/utils/invoiceLabel';
import { importedReadOnlyText } from '@/utils/importedRefusal';
import { createLogger } from '@/utils/logger';

const log = createLogger('PaymentsService');

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other';
/** The modes in the order the form offers them. */
export const PAYMENT_MODES: readonly PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'cheque', 'other'];
export type PaymentStatus = 'due' | 'part_paid' | 'paid';
export const PAYMENT_NOTE_MAX = 200;

/** One payment as the server sent it (`payment_json`). */
export interface PaymentRecord {
  id: string;
  paymentNo: number | null;
  invoiceId: string | null;
  /** 'YYYY-MM-DD'. */
  paidOn: string;
  amount: number;
  mode: PaymentMode | null;
  note: string | null;
  enteredByName: string | null;
  /** The version token an edit or delete is sent with. */
  updatedAt: string;
  /** False for a row of the old accounting link: read-only. */
  recordedInApp: boolean;
  /** Migration 195 (WH-180): imported from the previous system, so read-only. False when an older server omits it. */
  imported: boolean;
}

/** What the server says is paid and due on an invoice. null figures: the reader is not allowed them (staff). */
export interface InvoicePaymentFigures {
  paidAmount: number | null;
  dueAmount: number | null;
  status: PaymentStatus | null;
}

export interface InvoicePayments extends InvoicePaymentFigures {
  payments: PaymentRecord[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The status word the server sent, or null (a cancelled invoice has none). */
export const readPaymentStatus = (v: unknown): PaymentStatus | null =>
  v === 'due' || v === 'part_paid' || v === 'paid' ? v : null;

/** The three figures of a server row (an invoice of the list, `get_invoice_data` or `get_invoice_detail`). */
export function readFigures(row: unknown): InvoicePaymentFigures {
  const r = isRecord(row) ? row : {};
  return { paidAmount: num(r.paid_amount), dueAmount: num(r.due_amount), status: readPaymentStatus(r.payment_status) };
}

export function readPayment(value: unknown): PaymentRecord | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const amount = num(value.amount);
  const updatedAt = text(value.updated_at);
  const paidOn = text(value.paid_on);
  if (!id || amount === null || !updatedAt || !paidOn) return null;
  const mode = PAYMENT_MODES.find(m => m === value.mode) ?? null;
  return {
    id,
    paymentNo: num(value.payment_no),
    invoiceId: text(value.invoice_id),
    paidOn,
    amount,
    mode,
    note: text(value.note),
    enteredByName: text(value.entered_by_name),
    updatedAt,
    recordedInApp: value.recorded_in_app === true,
    imported: value.imported === true,
  };
}

/** Reads the invoice's payments with `get_invoice_detail`. Throws when the answer cannot be read. */
export async function getInvoicePayments(invoiceId: string): Promise<InvoicePayments> {
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_invoice_detail', { p_invoice_id: invoiceId });
  if (error) throw new Error(t('payments.section.loadFailed'));
  const invoice = isRecord(data) && data.success === true && isRecord(data.invoice) ? data.invoice : null;
  if (!invoice) throw new Error(t('payments.section.loadFailed'));
  const payments = (Array.isArray(invoice.payments) ? invoice.payments : [])
    .map(readPayment)
    .filter((p): p is PaymentRecord => p !== null);
  return { ...readFigures(invoice), payments };
}

// ---------------------------------------------------------------------------------------------------------------------
// The amount as typed
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The amount as the server is to be told it: digits with exactly 2 decimals ("400.50"), made by text only. null when the
 * text is not an amount more than 0 with at most 2 decimals. The server checks again.
 */
export function amountForServer(typed: string): string | null {
  const match = /^(\d{1,10})(?:\.(\d{0,2}))?$/.exec(typed.trim());
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, '');
  const cents = (match[2] ?? '').padEnd(2, '0');
  if (/^0+$/.test(whole + cents)) return null;
  return `${whole}.${cents}`;
}

/** An amount of the server for the screen: ₹ and 2 decimals, in the language's digits. For showing only. */
export const formatMoney = (value: unknown): string =>
  formatCurrency(num(value) ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------------------------------

export type PaymentWrite =
  | { kind: 'record'; args: { p_invoice_id: string; p_paid_on: string; p_amount: string; p_mode: PaymentMode; p_note: string | null } }
  | { kind: 'update'; args: { p_id: string; p_paid_on: string; p_amount: string; p_mode: PaymentMode; p_expected_updated_at: string; p_note: string | null } }
  | { kind: 'delete'; args: { p_id: string; p_expected_updated_at: string } };

const RPC_OF = { record: 'record_payment', update: 'update_payment', delete: 'delete_payment' } as const;

const randomHex = (digits: number): string =>
  Array.from({ length: digits }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/** The request code of one payment write: made when the write is first confirmed, kept until its outcome is known. */
export const newPaymentRequestId = (kind: PaymentWrite['kind']): string =>
  `warehouse-payment-${kind}-${Date.now().toString(36)}-${randomHex(20)}`;

/** The invoice's figures after the write, and (for record and update) the payment, as the server answered. */
export interface PaymentWriteDone {
  invoiceId: string | null;
  invoiceNumber: string | null;
  figures: InvoicePaymentFigures;
  /** record, update: the payment now; delete: the payment that was deleted. */
  payment: PaymentRecord | null;
  /** The amount of the payment, for the confirmation line. */
  amountText: string;
}

export interface PaymentRefusal {
  reason: string;
  /** The app's own sentence for it, in the app's language. */
  message: string;
  /** The screen must read the invoice again (what it showed is out of date or gone). */
  reload: boolean;
  /** The refusal is about the typed values: the form stays open and keeps them. */
  keepForm: boolean;
}

export type PaymentOutcome =
  | { ok: true; done: PaymentWriteDone }
  | { ok: false; refusal: PaymentRefusal }
  /** The request was sent and nothing is known: only when the person left during the wait. */
  | { ok: false; left: true };

function readDone(kind: PaymentWrite['kind'], body: unknown): PaymentWriteDone | null {
  if (!isRecord(body) || body.success !== true) return null;
  const invoice = isRecord(body.invoice) ? body.invoice : {};
  const payment = readPayment(kind === 'delete' ? body.deleted : body.payment);
  const amount = payment?.amount ?? null;
  return {
    invoiceId: text(body.invoice_id) ?? text(invoice.invoice_id),
    // WH-139: the full number (invoice_label), the digits on an older server.
    invoiceNumber: invoice.inv_no === undefined || invoice.inv_no === null ? null : invoiceLabelOf(invoice.invoice_label, String(invoice.inv_no)),
    figures: readFigures(invoice),
    payment,
    amountText: formatMoney(amount),
  };
}

const field = (fields: Record<string, unknown> | undefined, key: string): unknown => fields?.[key];

/** The app's sentence for a refusal of the payment functions, by its reason code; undefined when it has none. */
export function paymentRefusalOf(reason: string | undefined, fields: Record<string, unknown> | undefined): PaymentRefusal | undefined {
  const refuse = (message: string, reload = false, keepForm = false): PaymentRefusal => ({ reason: reason ?? '', message, reload, keepForm });
  switch (reason) {
    case REFUSAL.PAYMENT_DATE_FUTURE:
      return refuse(t('payments.futureDate', { date: formatDate(text(field(fields, 'today'))) }), false, true);
    case REFUSAL.PAYMENT_BEFORE_INVOICE:
      return refuse(t('payments.beforeInvoice', { date: formatDate(text(field(fields, 'invoice_date'))) }), false, true);
    case REFUSAL.PAYMENT_OVER_DUE:
      // The figure is the server's; the screen reads the invoice again so that the due amount shown is the live one.
      return refuse(t('payments.overDue', { due: formatMoney(field(fields, 'due')) }), true, true);
    case REFUSAL.PAYMENTS_OFF:
      return refuse(t('payments.refusal.off'), true);
    case REFUSAL.INVOICE_CANCELLED:
      return refuse(t('payments.refusal.cancelled'), true);
    case REFUSAL.INVOICE_NOT_FOUND:
      return refuse(t('payments.refusal.invoiceGone'), true);
    case REFUSAL.PAYMENT_NOT_FOUND:
      return refuse(t('payments.refusal.paymentGone'), true);
    case REFUSAL.IMPORTED_READ_ONLY:
      return refuse(importedReadOnlyText({ success: false, reason, fields }) ?? t('payments.refusal.notEditable'), true);
    case REFUSAL.PAYMENT_NOT_EDITABLE:
      return refuse(t('payments.refusal.notEditable'), true);
    case REFUSAL.STALE_RECORD:
      return refuse(t('payments.refusal.stale'), true);
    case REFUSAL.USER_REQUIRED:
      return refuse(t('payments.refusal.userRequired'));
    default:
      return undefined;
  }
}

/** One send of a payment write, as the answer or as "no answer came". */
async function sendOnce(
  write: PaymentWrite,
  requestId: string,
  resend: boolean
): Promise<{ kind: 'answer'; outcome: PaymentOutcome } | { kind: 'lost'; sentAt: number }> {
  const sentAt = Date.now();
  const result = await executeRPC<unknown>(
    getAuthenticatedClient,
    RPC_OF[write.kind],
    { ...write.args, p_request_id: requestId },
    { context: `PaymentsService.${RPC_OF[write.kind]}`, write: true, unwrapNested: false, validateSuccess: true }
  );
  if (result.success) {
    const done = readDone(write.kind, result.data);
    if (done) return { kind: 'answer', outcome: { ok: true, done } };
    // An answer that cannot be read is no answer of the server's: settled by asking about the request code.
    return { kind: 'lost', sentAt };
  }
  if (result.lostAnswer || (resend && isUnsettledFailure(result, result.errorCode))) return { kind: 'lost', sentAt };
  const known = paymentRefusalOf(result.reason, result.fields);
  if (known) return { kind: 'answer', outcome: { ok: false, refusal: known } };
  const failedKey = write.kind === 'delete' ? 'payments.refusal.deleteFailed' : 'payments.refusal.failed';
  // 22023: a value the server does not accept (an amount of 0 or with more than 2 decimals, a note over 200). 42501: not allowed.
  const message =
    result.errorCode === '22023'
      ? t('payments.refusal.invalid')
      : result.errorCode === '42501'
        ? t('payments.refusal.notAllowed')
        : isUnsettledFailure(result, result.errorCode) || !result.reason
          ? result.message || t(failedKey)
          : t(failedKey);
  return { kind: 'answer', outcome: { ok: false, refusal: { reason: result.reason ?? result.errorCode ?? '', message, reload: false, keepForm: true } } };
}

/**
 * Sends a payment write and, when its answer is lost (rule W22), neither gives up nor guesses: `onLocked(true)` locks the
 * form, the app waits for the connection and the server, asks `get_submission_result` for the answer stored under the
 * request code, and uses it when found; when not found the identical request (same body, same code) is sent once more.
 * The same code makes the server return the stored answer instead of writing twice, so no payment is entered twice.
 */
export async function runPaymentWrite(
  write: PaymentWrite,
  requestId: string,
  signal: AbortSignal,
  onLocked: (locked: boolean) => void
): Promise<PaymentOutcome> {
  let sent = await sendOnce(write, requestId, false);
  try {
    for (;;) {
      if (sent.kind === 'answer') return sent.outcome;
      onLocked(true);
      let stored: PaymentWriteDone | null = null;
      try {
        const found = await checkSubmission(requestId, sent.sentAt, signal);
        if (signal.aborted) return { ok: false, left: true };
        if (found.found) stored = readDone(write.kind, found.response);
      } catch (error) {
        if (signal.aborted) return { ok: false, left: true };
        log.warn('The check for a lost payment write failed:', error);
      }
      if (signal.aborted) return { ok: false, left: true };
      if (stored) return { ok: true, done: stored };
      sent = await sendOnce(write, requestId, true);
      if (signal.aborted) return { ok: false, left: true };
    }
  } finally {
    onLocked(false);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The facility switch
// ---------------------------------------------------------------------------------------------------------------------

export class RecordPaymentsUnconfirmedError extends Error {
  constructor() {
    super(t('payments.switch.unconfirmed'));
  }
}

/** Turns Record payments on or off (administrators). Records the new value in the app's capabilities at once. */
export async function setRecordPayments(enabled: boolean): Promise<boolean> {
  const result = await executeRPC<{ record_payments?: unknown }>(
    getAuthenticatedClient,
    'set_record_payments',
    { p_enabled: enabled },
    { context: 'PaymentsService.setRecordPayments', write: true, unwrapNested: false, validateSuccess: true }
  );
  if (!result.success) {
    if (result.lostAnswer) throw new RecordPaymentsUnconfirmedError();
    throw new Error(result.errorCode === '42501' ? t('payments.refusal.notAllowed') : t('payments.switch.changeFailed'));
  }
  const now = result.data?.record_payments === true;
  notePaymentsCapability(now);
  return now;
}

/** Keeps the app's capabilities in step with the setting the server holds, without waiting for the next config read. */
export function notePaymentsCapability(on: boolean): void {
  const server = getActiveOperatorServer();
  if (!server) return;
  setFacilityCapabilities(server, { ...getFacilityCapabilities(), payments: on });
}

/** Words for the invoice number in a sentence. */
export const invoiceNumberText = (n: string | number | null | undefined): string => formatIdentifier(n ?? '');
