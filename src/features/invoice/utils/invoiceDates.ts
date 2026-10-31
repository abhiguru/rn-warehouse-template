import type { InvoiceItemData } from '@/types/invoice.types';
import { indiaDay, toCalendarDay } from '@/utils/formatters';

/** The dispatch an invoice date falls before: its number and its day in India. */
export interface DispatchAfterInvoice {
  dispatchNo: string;
  dispatchDate: string;
}

/**
 * The latest dispatch of the invoice's lines when the invoice is dated before it (owner rule: an invoice may not be dated
 * before the dispatch of its lines; the same day is fine, and days are the facility's, in India). Null when the date is
 * fine, when it is missing, or when no line has a readable dispatch day (the dispatches are not known yet).
 */
export function dispatchAfterInvoiceDate(invDate: string | null | undefined, items: readonly InvoiceItemData[]): DispatchAfterInvoice | null {
  const invoiceDay = invDate ? toCalendarDay(invDate) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDay)) return null;
  let latest: DispatchAfterInvoice | null = null;
  items.forEach((line) => {
    const day = indiaDay(line.dispatch_date);
    if (!day) return;
    if (latest === null || day > latest.dispatchDate) latest = { dispatchNo: line.dispatch_no, dispatchDate: day };
  });
  return latest !== null && (latest as DispatchAfterInvoice).dispatchDate > invoiceDay ? latest : null;
}
