/**
 * WH-162: fills the invoice form for "Create invoice" on GRN details before the form opens, so that it opens straight at
 * Review: the server's preview of this GRN (every dispatch line on no live invoice, with the server's figures), the
 * suggested number of today's financial year and today's date, as Details and Items would leave them untouched.
 *
 * The preview is the call the form's own GRN choice makes (loadInvoiceFormData). When it fails or does not answer,
 * nothing opens: the caller stays on GRN details with the message. The suggested number is asked for as step 1 asks
 * for it; without one the form opens at Details, which asks again and shows today's message.
 *
 * Which step the form opens at follows the checks of Details and of Items' Next: the first that would stop the person.
 * Nothing here works out an amount.
 */

import type { AppDispatch, RootState } from '@/store';
import { loadInvoiceFormData, updateHeader } from '@/store/slices/invoiceFormSlice';
import {
  getNextInvoiceNumber,
  loadInvoiceFormData as loadInvoiceFormDataService,
} from '@/features/invoice/services/invoiceFormService';
import {
  setInvoiceChargingRule,
  validateNewInvoiceStep1,
  validateStep2,
} from '@/features/invoice/schemas/invoiceValidation';
import { dispatchAfterInvoiceDate } from '@/features/invoice/utils/invoiceDates';
import { NUMBER_REQUEST_TIMEOUT_MS } from '@/hooks/useInvoiceForm';
import { serverText } from '@/utils/serverText';
import { t } from '@/i18n';
import { createLogger } from '@/utils/logger';

const log = createLogger('prepareInvoiceFromGrn');

/** The step the form opens at. */
export type InvoiceOpenStep = 'details' | 'items' | 'review';

/** `stale`: the caller no longer wanted the form (see `stillWanted`); nothing was written to the form. */
export type PrepareResult = { ok: true; step: InvoiceOpenStep } | { ok: false; message: string; stale?: true };

const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });

/** The suggested number and its prefix, or null when none came (failed, timed out, or no number). */
async function suggestedNumber(finYear: string): Promise<{ number: number; prefix: string } | null> {
  try {
    const answer = await withTimeout(getNextInvoiceNumber(finYear), NUMBER_REQUEST_TIMEOUT_MS);
    const number = answer.success && answer.data ? answer.data.next_invoice_number : null;
    return number !== null && number > 0 ? { number, prefix: answer.data?.prefix ?? '' } : null;
  } catch (error) {
    log.warn('No suggested invoice number for the form opened from GRN details:', error);
    return null;
  }
}

/**
 * Fills the (just reset) form with the GRN's preview and the suggested number. `ok: false`: nothing usable was read
 * and the message says why (the form's own words for a GRN that could not be loaded).
 * `stillWanted` is asked after each wait and before each write to the form: when it says no (another form was opened, a
 * newer tap took over, the page was left) nothing more is written and the result is `stale`, so a form someone else
 * is filling is never touched.
 */
export async function prepareInvoiceFromGrn(
  dispatch: AppDispatch,
  getState: () => RootState,
  grnId: string,
  stillWanted: () => boolean = () => true
): Promise<PrepareResult> {
  const finYear = getState().invoiceForm.header.inv_fin_year;
  const numberWork = suggestedNumber(finYear);

  let preview: Awaited<ReturnType<typeof loadInvoiceFormDataService>>;
  try {
    preview = await loadInvoiceFormDataService(grnId);
  } catch (error) {
    log.error('Failed to load the GRN for a new invoice:', error);
    return { ok: false, message: t('common.checkConnection') };
  }
  if (!preview.success || !preview.data) {
    return { ok: false, message: serverText(preview.message, t('common.checkConnection')) };
  }

  if (!stillWanted()) return { ok: false, message: '', stale: true };
  dispatch(loadInvoiceFormData({ header: preview.data.header, items: preview.data.items, grId: grnId }));
  const suggestion = await numberWork;
  if (!stillWanted()) return { ok: false, message: '', stale: true };
  if (!suggestion) return { ok: true, step: 'details' };
  dispatch(updateHeader({ inv_no: suggestion.number, inv_no_typed: false, inv_prefix: suggestion.prefix }));

  // Details' checks (what its Next checks before Items).
  const { header, items } = getState().invoiceForm;
  if (items.length === 0) return { ok: true, step: 'details' };
  const details = await validateNewInvoiceStep1(header);
  if (!details.isValid || dispatchAfterInvoiceDate(header.inv_date, items)) return { ok: true, step: 'details' };

  // Items' checks (what its Next checks before Review), under the charging rule of the preview.
  if (items.some((item) => item.duration === 0)) return { ok: true, step: 'items' };
  setInvoiceChargingRule(header.charging);
  try {
    const lines = await validateStep2(items);
    return { ok: true, step: lines.isValid ? 'review' : 'items' };
  } finally {
    setInvoiceChargingRule(undefined);
  }
}
