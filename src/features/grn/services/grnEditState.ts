/**
 * What `get_grn_edit_state` says about a GRN opened for editing, read the one way whether the server gave it or the phone's
 * copy did (WH-303, contract section 14.3: the lock mapping moved into one shared function). Pure.
 */
import { formatIdentifier } from '@/i18n';
import type { GRNInvoiceRef, GRNLineLocks } from '@/store/slices/grnFormSlice';

export const textOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : typeof value === 'number' ? String(value) : undefined;

interface LockLine {
  id?: unknown;
  dispatched_qty?: unknown;
  has_history?: unknown;
  on_invoice?: unknown;
  invoice_label?: unknown;
  invoice_no?: unknown;
  on_order?: unknown;
  order_customer_name?: unknown;
}

/** The locks of each saved line, by the line's id, from the `lines` of the edit state or of the copy's `grn_lock`. */
export function locksOfLines(lines: unknown): Map<string, GRNLineLocks> {
  const out = new Map<string, GRNLineLocks>();
  for (const line of (Array.isArray(lines) ? lines : []) as (LockLine | null)[]) {
    if (!line || typeof line.id !== 'string') continue;
    const dispatchedQty = Number(line.dispatched_qty);
    out.set(line.id, {
      dispatched: Number.isFinite(dispatchedQty) && dispatchedQty > 0,
      ...(Number.isFinite(dispatchedQty) ? { dispatchedQty } : {}),
      hasHistory: line.has_history === true,
      invoiced: line.on_invoice === true,
      invoiceNo: textOrUndefined(line.invoice_label) ?? textOrUndefined(line.invoice_no),
      onOrder: line.on_order === true,
      customerName: textOrUndefined(line.order_customer_name),
    });
  }
  return out;
}

/** The GRN's live invoice from the edit state, or null. */
export function invoiceRefOf(raw: unknown): GRNInvoiceRef | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const invoice = raw as { id?: string | number; invoice_label?: unknown; inv_no?: unknown };
  if (!invoice.id) return null;
  return {
    id: String(invoice.id),
    invNo: formatIdentifier(textOrUndefined(invoice.invoice_label) ?? textOrUndefined(invoice.inv_no) ?? ''),
  };
}

/** The day (YYYY-MM-DD) of the first dispatch, or null. */
export const firstDispatchDayOf = (raw: unknown): string | null => (typeof raw === 'string' && raw !== '' ? raw.slice(0, 10) : null);

/** The version token, or null. */
export const updatedAtOf = (raw: unknown): string | null => (typeof raw === 'string' && raw !== '' ? raw : null);
