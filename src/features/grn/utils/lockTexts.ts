/**
 * The app's words for the refusals and locks of a GRN edit that name an invoice (backend migration 121). An invoice
 * without a number (the server sends none) gets the sentence without it, never "invoice ." with a blank.
 */
import { t as tr, formatIdentifier } from '@/i18n';

const numberOf = (invoiceNo: string | null | undefined): string | undefined => {
  const no = typeof invoiceNo === 'string' ? invoiceNo.trim() : '';
  return no === '' ? undefined : formatIdentifier(no);
};

/** A line on an invoice can't change item, packing or weight (LOT_INVOICED). */
export function lotInvoicedText(item: string, invoiceNo: string | null | undefined): string {
  const invoice = numberOf(invoiceNo);
  return invoice === undefined
    ? tr('grn.refusal.lotInvoicedNoNumber', { item })
    : tr('grn.refusal.lotInvoiced', { item, invoice });
}

/** An invoiced GRN takes no new line (GRN_INVOICED). `grn` is the GRN's number as the app writes it. */
export function invoicedNoNewLotText(grn: string, invoiceNo: string | null | undefined): string {
  const invoice = numberOf(invoiceNo);
  return invoice === undefined
    ? tr('grn.refusal.invoicedNoNewLotNoNumber', { grn })
    : tr('grn.refusal.invoicedNoNewLot', { grn, invoice });
}
