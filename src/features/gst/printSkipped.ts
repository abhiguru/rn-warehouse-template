/**
 * What the pre-printed invoice print did not print (WH-151): one line for each invoice of the range that was skipped, with the
 * app's own words for its reason (`igst`: PDF only, with the note; `does_not_fit`: which field; `cancelled`).
 */
import { formatIdentifier, t } from '@/i18n';
import type { PrintJobResponse } from '@/services/print-service';

const FIELD_KEYS: Record<string, string> = {
  address: 'address',
  amount: 'amount',
  'amount in words': 'amountInWords',
  'amount total': 'amountTotal',
  'grand total': 'grandTotal',
  'inward quantity': 'inwardQuantity',
  'inward total': 'inwardTotal',
  labour: 'labour',
  months: 'months',
  'outward quantity': 'outwardQuantity',
  'outward total': 'outwardTotal',
  rate: 'rate',
  state: 'state',
  weight: 'weight',
  gstin: 'gstin',
  cgst: 'cgst',
  sgst: 'sgst',
  'tax total': 'taxTotal',
};

function fieldName(field: string | undefined): string {
  const key = FIELD_KEYS[(field ?? '').trim().toLowerCase()] ?? 'other';
  return t(`gst.print.field.${key}` as 'gst.print.field.other');
}

/** The note for the print dialog, or null when every invoice of the range was printed. */
export function printSkippedNote(
  result: Pick<PrintJobResponse, 'skipped'>,
  title: 'gst.print.skippedTitle' | 'gst.print.allSkippedTitle' = 'gst.print.skippedTitle'
): string | null {
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  if (skipped.length === 0) return null;
  const lines = skipped.map((item) => {
    const number = formatIdentifier(String(item.inv_no ?? ''));
    if (item.reason === 'igst') {
      return t('gst.print.skippedLine', { number, reason: `${t('gst.print.igstReason')}. ${t('gst.print.igstNote')}` });
    }
    if (item.reason === 'does_not_fit') {
      return t('gst.print.skippedLine', { number, reason: t('gst.print.doesNotFit', { field: fieldName(item.field) }) });
    }
    if (item.reason === 'cancelled') return t('gst.print.skippedLine', { number, reason: t('gst.print.cancelledReason') });
    return t('gst.print.skippedLine', { number, reason: t('gst.print.otherReason') });
  });
  return [t(title), ...lines].join('\n');
}
