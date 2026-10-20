import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  NextInvoiceNumberResponse,
  InvoiceableGrnsResponse,
  InvoiceFormDataResponse,
  CreateInvoiceResponse,
  CreateInvoicePayload,
  InvoiceableGrn,
  InvoiceItemData,
  InvoiceHeaderData,
} from '@/types/invoice.types';
import { t } from '@/i18n';

import { toLocalISODate } from '@/utils/formatters';
import { calculateItemAmounts, hasZeroChargeLine } from '@/utils/invoiceCalculations';
import { serverReason, serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';
import { escapeLike } from '@/utils/postgrestFilter';
import { invalidateReportQueries } from '@/lib/queryClient';

const invoiceFormLogger = createLogger('InvoiceFormService');

/**
 * What goes to the device log for a failed call: the error's code and message.
 * A PostgREST error also carries `details` and `hint`, where PostgreSQL repeats
 * row values (a customer name, an amount, a discount reason); those are left out.
 */
const errorForLog = (error: unknown): { code?: string; message: string } => {
  const source = (error ?? {}) as { code?: unknown; message?: unknown };
  return {
    code: typeof source.code === 'string' ? source.code : undefined,
    message: typeof source.message === 'string' ? source.message : String(error),
  };
};

/** The server's words for a GRN that the preview refuses: not fully dispatched, or already invoiced. */
const NOT_INVOICEABLE = /not (be )?ready for invoicing/i;

/** Thrown inside loadInvoiceFormData so the caller can tell this refusal from a failed request. */
class GrnNotInvoiceableError extends Error {}

/**
 * Refusals of a save that the person can act on (the GRN was invoiced by
 * someone else meanwhile, a rate is out of range). They are shown in the app's
 * own words in every language; other server text goes through serverText.
 */
const INVOICE_REFUSAL = /already invoiced|already on another invoice|must be between/i;

const isOneTime = (pricingMode: unknown): boolean => String(pricingMode ?? '').toUpperCase() === 'ONE_TIME';

type RpcClient = Awaited<ReturnType<typeof getAuthenticatedClient>>;

/** A money value the server sent, as a number; null when it sent none. */
function serverAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * The total the server stored for an invoice that was just saved.
 *
 * The server recomputes every invoice from its own durations and the GRN's
 * pricing mode and ignores the totals the phone sends (backend migration 24),
 * so the figure to show after a save is the stored one. `save_invoice(jsonb)`
 * returns it as `totals.grand_total`; the three-argument save and
 * `update_invoice` return no totals, so the invoice is read back. null when
 * it cannot be read: the save itself has succeeded and stays reported as such.
 */
async function savedInvoiceTotal(client: RpcClient, answer: any, invoiceId: string | undefined): Promise<number | null> {
  const fromAnswer = serverAmount(answer?.totals?.grand_total ?? answer?.totals?.total);
  if (fromAnswer !== null) return fromAnswer;
  if (!invoiceId) return null;
  try {
    const { data, error } = await client.rpc('get_invoice_detail', { p_invoice_id: invoiceId });
    if (error || !data?.success) return null;
    return serverAmount(data.invoice?.total);
  } catch {
    return null;
  }
}

/**
 * The header field for a zero charge (backend migration 48). It is sent only
 * when a line of the invoice has a charge of 0: the reason, or null when none
 * was written (the server then refuses staff with "Enter a reason for the zero
 * charge" and lets administrators and supervisors through). Without such a
 * line the key is left out, and the server stores no reason.
 */
function zeroChargeHeader(payload: CreateInvoicePayload): { zero_charge_reason?: string | null } {
  if (!hasZeroChargeLine(payload.items)) return {};
  return { zero_charge_reason: payload.header.zero_charge_reason?.trim() || null };
}

/**
 * An invoice number outside 1 to 99999999 (backend migration 73, SQLSTATE
 * WH422). The three-argument save_invoice sends it as the error's code,
 * update_invoice as `error_code` in its answer, save_invoice(jsonb) inside its
 * text ("Database error: … (SQLState: WH422)").
 */
const INVOICE_NUMBER_RANGE = 'WH422';
const isInvoiceNumberRange = (text: unknown, code: unknown): boolean =>
  code === INVOICE_NUMBER_RANGE ||
  (typeof text === 'string' && /\(SQLState:\s*WH422\)/i.test(text));

function invoiceSaveMessage(text: unknown, fallback: string, code?: unknown): string {
  if (isInvoiceNumberRange(text, code)) return t('invoice.validation.invoiceNumberRange');
  if (typeof text === 'string' && INVOICE_REFUSAL.test(text)) {
    return serverReason(text) ?? serverText(text, fallback, { write: true, form: true });
  }
  return serverText(text, fallback, { write: true, form: true });
}
/** PostgREST found no function that takes the parameters sent (PGRST202). */
const isUnknownFunctionSignature = (error: { code?: string; message?: string }): boolean =>
  error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');

/** The calendar year a financial year starts in ("2026-27" -> 2026), as `invoice.inv_fin_year` stores it. */
const financialYearStart = (finYear: string): number | null => {
  const match = /^(\d{4})(?:-\d{2,4})?$/.exec(String(finYear ?? '').trim());
  return match ? Number(match[1]) : null;
};

/**
 * The next free invoice number of a financial year.
 *
 * Numbers are counted per financial year (backend migration 48):
 * `get_next_invoice_number(p_fin_year)` answers with the highest number of that
 * year plus 1 as plain digits ("55"), or refuses with "No invoice number is
 * left in financial year <year>". `finYear` is the form's financial year
 * ("2026-27"), which follows the invoice date.
 *
 * A server without migration 48 has the function without the parameter and
 * refuses the call before running anything (PostgREST `PGRST202`). The
 * question is then asked once more without the parameter; that server counts
 * across all years and answers with a prefixed number ("I0000554").
 *
 * `success: false` when no number could be read: the form then asks for the
 * number to be typed.
 */
export const getNextInvoiceNumber = async (
  finYear: string
): Promise<NextInvoiceNumberResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();
    const startYear = financialYearStart(finYear);

    let { data, error } =
      startYear === null
        ? await authenticatedClient.rpc('get_next_invoice_number')
        : await authenticatedClient.rpc('get_next_invoice_number', { p_fin_year: startYear });
    if (error && startYear !== null && isUnknownFunctionSignature(error)) {
      ({ data, error } = await authenticatedClient.rpc('get_next_invoice_number'));
    }

    if (error) {
      invoiceFormLogger.error('RPC error:', errorForLog(error));
      throw new Error(serverText(error.message, t('invoice.service.nextNumberFailed')));
    }

    if (data === null || data === undefined || data === '') {
      return {
        success: true,
        data: {
          next_invoice_number: 1,
          financial_year: finYear,
        },
      };
    }

    // Plain digits, or a prefixed number from a server before migration 48.
    const match = /^[A-Z]*(\d+)$/.exec(String(data).trim());
    const invoiceNumber = match ? parseInt(match[1], 10) : NaN;
    if (!Number.isSafeInteger(invoiceNumber) || invoiceNumber < 1) {
      throw new Error(t('invoice.service.nextNumberFailed'));
    }

    return {
      success: true,
      data: {
        next_invoice_number: invoiceNumber,
        financial_year: finYear,
      },
    };
  } catch (error: any) {
    // Handled: the form then asks for the number to be typed.
    invoiceFormLogger.warn('Error in getNextInvoiceNumber:', errorForLog(error));
    return {
      success: false,
      data: {
        next_invoice_number: 1,
        financial_year: finYear,
      },
      message: serverText(error.message, t('invoice.service.nextNumberFailed')),
    };
  }
};

/**
 * Get list of GRNs that are available for invoicing
 * Returns GRNs that have dispatched items that haven't been invoiced yet
 */
export const getInvoiceableGrns = async (
  searchTerm?: string
): Promise<InvoiceableGrnsResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Use the same RPC as web app: get_invoiceable_grns
    const { data, error } = await authenticatedClient.rpc('get_invoiceable_grns', {
      // The server matches with ILIKE '%' || text || '%': the typed text is
      // sent whole, with its wildcard characters escaped.
      p_search_grn_no: searchTerm ? escapeLike(searchTerm) : null,
    });

    if (error) {
      invoiceFormLogger.error('Error fetching invoiceable GRNs:', errorForLog(error));
      throw new Error(serverText(error.message, t('invoice.service.grnsFailed')));
    }

    // Handle case where RPC returns an object wrapper instead of an array
    // Backend may return: { data: [...] }, { grns: [...] }, { success: true, data: [...] }, or [...]
    let grnArray: any[] = [];
    if (Array.isArray(data)) {
      grnArray = data;
    } else if (data && typeof data === 'object') {
      // Try common wrapper patterns
      if (Array.isArray(data.data)) {
        grnArray = data.data;
      } else if (Array.isArray(data.grns)) {
        grnArray = data.grns;
      } else if (Array.isArray(data.rows)) {
        grnArray = data.rows;
      } else if (Array.isArray(data.items)) {
        grnArray = data.items;
      } else {
        // If backend returns an error object, throw it
        if (data.error || data.message) {
          throw new Error(data.error || data.message);
        }
      }
    }

    // Transform response to match mobile type structure
    // Backend uses snake_case field names
    const grns: InvoiceableGrn[] = grnArray.map((grn: any) => {
      // Handle date field - RPC returns 'gr_date'
      const grnDate = grn.gr_date || grn.grn_date || grn.date || '';

      // Handle dispatched quantity
      const dispatchedQty = grn.total_dispatched_qty || grn.dispatched_qty || grn.total_dispatched || 0;

      return {
        id: grn.grn_id,
        gr_no: grn.gr_no,
        date: grnDate,
        customer_id: grn.customer_id,
        customer_name: grn.customer_name,
        sender_name: grn.sender_name || '',
        supervisor_name: grn.supervisor_name || '',
        total_dispatched_qty: dispatchedQty,
        has_uninvoiced_items: grn.has_uninvoiced_items !== false,
      };
    });

    return {
      success: true,
      data: grns,
    };
  } catch (error: any) {
    invoiceFormLogger.error('Error in getInvoiceableGrns:', errorForLog(error));
    return {
      success: false,
      data: [],
      message: serverText(error.message, t('invoice.service.grnsFailed')),
    };
  }
};

/**
 * Load invoice form data for a specific GRN
 * Fetches dispatch items grouped by dispatch, ready for invoice creation
 * Uses the same RPC as web app: generate_invoice_data_for_grn_with_pricing
 */
export const loadInvoiceFormData = async (
  grId: string
): Promise<InvoiceFormDataResponse> => {
  try {
    // Extract the actual GRN ID if it includes a reset counter suffix
    const actualGrnId = grId.includes('_') ? grId.split('_')[0] : grId;

    const authenticatedClient = await getAuthenticatedClient();

    // Use the same RPC as web app: generate_invoice_data_for_grn_with_pricing
    const { data: response, error } = await authenticatedClient.rpc(
      'generate_invoice_data_for_grn_with_pricing',
      {
        p_gr_id: actualGrnId,
      }
    );

    if (error) {
      invoiceFormLogger.error('Error loading invoice form data:', errorForLog(error));
      throw new Error(serverText(error.message, t('invoice.service.formDataFailed')));
    }

    // Handle the wrapped response structure from RPC
    // The RPC returns { success: boolean, header: {...}, rows: [...], totals: {...} }
    const responseData = response;

    if (!responseData) {
      throw new Error(t('invoice.service.noResponse'));
    }

    // Check if this is an error response from the RPC
    if (responseData.success === false && responseData.error) {
      const errorMsg = responseData.error || 'RPC operation failed';

      // Provide user-friendly error messages for common issues
      if (errorMsg.includes('column') && errorMsg.includes('does not exist')) {
        throw new Error(t('invoice.service.schemaError'));
      } else if (NOT_INVOICEABLE.test(errorMsg)) {
        throw new GrnNotInvoiceableError(t('invoice.review.grnNotInvoiceable'));
      } else {
        throw new Error(errorMsg);
      }
    }

    // Validate response structure
    // Handle both 'items' and 'rows' keys (backend may use either)
    const itemsData = responseData.items || responseData.rows;

    if (!responseData.header || !itemsData) {
      throw new Error(t('invoice.service.invalidResponse'));
    }

    const headerData = responseData.header;

    // Check if there are any items to invoice
    if (!itemsData || itemsData.length === 0) {
      throw new Error(t('invoice.service.noDispatchedItemsLong'));
    }

    // Determine one_time_charge from GRN's pricing_mode
    // Check first item for pricing_mode (ONE_TIME means one_time_charge = true)
    // Also check header for pricing_mode (backend may return it at header level)
    // Handle both snake_case (grn_items_pricing_mode) and camelCase (grnItems_pricing_mode)
    const firstItem = itemsData[0];
    const rawPricingMode =
      headerData.pricing_mode ||
      firstItem?.grn_items_pricing_mode ||  // snake_case from RPC
      firstItem?.grnItems_pricing_mode ||   // camelCase variation
      firstItem?.pricing_mode ||
      'MONTHLY';
    const isOneTimeCharge = isOneTime(rawPricingMode);

    // Transform header to mobile format
    const header = {
      customer_id: headerData.customer_id,
      customer_name: headerData.customer_name,
      gr_id: headerData.grn_id,
      gr_no: headerData.grn_no,
      one_time_charge: isOneTimeCharge,
    };

    // Transform items to include temp_id and mobile-specific fields
    // Backend uses snake_case exclusively for all field names
    const items: InvoiceItemData[] = (itemsData || []).map((item: any, index: number) => {
      // Extract fields using snake_case naming from RPC response
      // grn_items_id is the GRN item record ID (goodsreceived_trl.id)
      const grnItemId = item.grn_items_id || item.grn_item_id || '';
      const catalogItemId = item.grn_items_item_id || item.item_id || '';
      const itemName = item.grn_items_item_name || item.items_catalog_name || item.item_name || '';
      const qty = item.dispatches_items_disp_qty || item.qty || 0;
      const grnOriginalQty = item.grn_items_original_qty || item.grn_original_qty || 0;
      const packageMark = item.grn_items_package_mark || item.package_mark || '';
      const rack = item.grn_items_rack || item.rack || '';
      const weight = item.grn_items_weight || item.weight || 0;

      const dispatchId = item.dispatches_id || item.dispatch_id || '';
      const dispatchNo = item.dispatches_no || item.dispatch_no || '';
      const dispatchDate = item.dispatches_date || item.dispatch_date || '';

      const grnId = item.grn_id || actualGrnId;
      const grnNo = item.grn_no || headerData.grn_no;
      const grnDate = item.grn_date || '';

      // Duration can be fractional (e.g., 7.5 months), don't round it
      const duration = item.duration || 1;
      const noOfDays = Math.round(item.no_of_days || item.billable_days || 30);

      // Pricing fields - snake_case from RPC
      const charge = item.unit_price || item.charge || 0;
      const labourRate = item.labour_rate || 0;
      const tax = item.tax_percent || item.tax || 0;

      // The GRN's pricing mode decides how the line is charged. Every row of
      // the preview carries it; the header value covers a row that does not.
      const oneTime = item.grn_items_pricing_mode || item.grnItems_pricing_mode || item.pricing_mode
        ? isOneTime(item.grn_items_pricing_mode || item.grnItems_pricing_mode || item.pricing_mode)
        : isOneTimeCharge;

      return {
        // Generate temp_id for React keys
        temp_id: `temp_${Date.now()}_${index}`,

        // Dispatch item reference (required for RPC)
        disp_trl_id: item.dispatches_items_id || item.disp_trl_id || '',

        // GRN item reference (required for RPC - goodsreceived_trl.id)
        grn_item_id: grnItemId,

        // Item details
        item_id: catalogItemId,
        item_name: itemName,
        qty: qty,
        grn_original_qty: grnOriginalQty,
        package_mark: packageMark,
        rack: rack,
        weight: weight,

        // Dispatch details
        dispatch_id: dispatchId,
        dispatch_no: dispatchNo,
        dispatch_date: dispatchDate,

        // GRN details
        grn_id: grnId,
        grn_no: grnNo,
        grn_date: grnDate,

        // Pricing fields with defaults
        duration: duration,
        no_of_days: noOfDays,
        charge: charge,
        labour_rate: labourRate,
        tax: tax,

        // Amounts as the server computes them for this pricing mode
        one_time: oneTime,
        ...calculateItemAmounts(qty, charge, labourRate, tax, duration, oneTime),
      };
    });

    return {
      success: true,
      data: {
        header,
        items,
      },
    };
  } catch (error: any) {
    invoiceFormLogger.error('Error in loadInvoiceFormData:', errorForLog(error));
    return {
      success: false,
      code: error instanceof GrnNotInvoiceableError ? 'not_invoiceable' : undefined,
      data: {
        header: {
          customer_id: '',
          customer_name: '',
          gr_id: '',
          gr_no: '',
        },
        items: [],
      },
      message: serverText(error.message, t('invoice.service.formDataFailed')),
    };
  }
};

/**
 * Ask the server again, just before a new invoice is saved, whether the GRN
 * can still be invoiced and still has the dispatch lines the form holds. The
 * form may have been open for a while: another user can have invoiced the GRN,
 * or a dispatch can have been changed. The server refuses a second invoice by
 * itself (migration 41); this check gives the reason before anything is sent
 * and catches lines that changed.
 */
export const checkGrnStillInvoiceable = async (
  grId: string,
  formItems: Pick<InvoiceItemData, 'disp_trl_id' | 'qty'>[]
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const fresh = await loadInvoiceFormData(grId);
  if (!fresh.success) {
    return {
      ok: false,
      message:
        fresh.code === 'not_invoiceable'
          ? t('invoice.review.grnNotInvoiceable')
          : serverText(fresh.message, t('invoice.service.formDataFailed')),
    };
  }

  const lines = (items: Pick<InvoiceItemData, 'disp_trl_id' | 'qty'>[]) =>
    items.map((item) => `${item.disp_trl_id}:${Number(item.qty)}`).sort().join('|');
  if (lines(fresh.data.items) !== lines(formItems)) {
    return { ok: false, message: t('invoice.review.grnChanged') };
  }
  return { ok: true };
};

/**
 * Create a new invoice
 * Calls the save_invoice RPC with header and items data
 * Uses the same RPC and payload structure as web app
 */
export const createInvoice = async (
  payload: CreateInvoicePayload
): Promise<CreateInvoiceResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Validate required fields
    if (!payload.header.customer_id) {
      throw new Error(t('invoice.service.customerRequired'));
    }
    if (!payload.header.gr_id) {
      throw new Error(t('invoice.service.grnRequired'));
    }
    if (!payload.header.inv_date) {
      throw new Error(t('invoice.validation.invoiceDateRequired'));
    }

    // Convert financial year string to number (e.g., '2025-26' -> 2025)
    const invFinYearString = String(payload.header.inv_fin_year);
    const invFinYear = parseInt(invFinYearString.split('-')[0]);

    // Format date to match web app format: 'YYYY-MM-DD' + 'T00:00:00Z'
    const formattedDate = payload.header.inv_date.includes('T')
      ? payload.header.inv_date
      : payload.header.inv_date + 'T00:00:00Z';

    // Prepare RPC payload matching web app structure
    const invoiceData = {
      customer_id: payload.header.customer_id,
      customer_name: payload.header.customer_name,
      gr_id: payload.header.gr_id,
      gr_no: payload.header.gr_no,
      inv_no: payload.header.inv_no,
      inv_fin_year: invFinYear,
      inv_date: formattedDate,
      discount: payload.header.discount || 0,
      discount_reason: payload.header.discount_reason?.trim() || null,
      labour: payload.header.labour || 0,
      tax_amount: payload.header.tax_amount || 0,
      total: payload.header.total || 0,
      one_time_charge: Boolean(payload.header.one_time_charge),
      is_auto_generated: false, // Manual creation
      ...zeroChargeHeader(payload),
    };

    // Transform items to match RPC expected format
    // Both disp_trl_id and grn_item_id are required by backend validation
    const invoiceItems = payload.items.map((item, index) => {
      // Validate required IDs
      if (!item.disp_trl_id) {
        throw new Error(t('invoice.service.itemMissingDispatch', { index: index + 1 }));
      }
      if (!item.grn_item_id) {
        throw new Error(t('invoice.service.itemMissingGrnItem', { index: index + 1 }));
      }

      return {
        disp_trl_id: item.disp_trl_id,
        grn_item_id: item.grn_item_id, // GRN item record ID (goodsreceived_trl.id)
        qty: item.qty || 0,
        charge: item.charge || 0, // Storage rate per unit per duration
        labour_rate: item.labour_rate || 0, // Labour rate per unit
        tax: item.tax || 0, // Tax percentage (e.g., 18 for 18%)
        duration: item.duration, // Duration in months
        no_of_days: item.no_of_days, // Number of days
      };
    });

    invoiceFormLogger.debug('Calling save_invoice RPC with payload:', {
      invoiceNo: invoiceData.inv_no,
      itemsCount: invoiceItems.length,
    });

    // Call the save_invoice RPC
    const rpcPayload = {
      p_invoice_id: null, // NULL for create operation
      p_invoice_data: invoiceData,
      p_invoice_items: invoiceItems,
    };

    const { data, error } = await authenticatedClient.rpc('save_invoice', rpcPayload);

    if (error) {
      invoiceFormLogger.error('RPC error:', errorForLog(error));
      throw new Error(invoiceSaveMessage(error.message, t('invoice.service.createFailed'), error.code));
    }

    if (!data || !data.success) {
      const errorMsg = invoiceSaveMessage(data?.error || data?.message, t('invoice.service.createFailed'), data?.error_code);
      throw new Error(errorMsg);
    }
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    return {
      success: true,
      data: {
        invoice_id: data.invoice_id,
        invoice_no: data.invoice_no || payload.header.inv_no,
        total: await savedInvoiceTotal(authenticatedClient, data, data.invoice_id),
      },
    };
  } catch (error: any) {
    invoiceFormLogger.error('Error in createInvoice:', errorForLog(error));
    return {
      success: false,
      data: {
        invoice_id: '',
        invoice_no: 0,
      },
      message: serverText(error.message, t('invoice.service.createFailed'), { write: true, form: true }),
    };
  }
};

/**
 * How the GRN of a saved invoice is priced ('ONE_TIME' or 'MONTHLY').
 * `read: false` when the server could not be asked or refused; `mode: null`
 * when it answered without a mode, in which case the caller falls back.
 */
async function invoiceGrnPricingMode(
  client: RpcClient,
  invoiceId: string
): Promise<{ read: true; mode: string | null } | { read: false }> {
  try {
    const { data, error } = await client.rpc('get_invoice_data', { p_invoice_id: invoiceId });
    if (error || !data?.success) return { read: false };
    return { read: true, mode: data.data?.header?.grn?.pricing_mode || null };
  } catch {
    return { read: false };
  }
}

/**
 * Load existing invoice data for editing
 * Calls get_invoice_detail RPC to fetch complete invoice with items
 */
export const loadInvoiceData = async (
  invoiceId: string
): Promise<InvoiceFormDataResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // get_invoice_detail has the invoice and its lines. The GRN's pricing mode,
    // which decides how every line is charged, comes with it as
    // invoice.grn_pricing_mode (the key is there, even when its value is null).
    // Only an older server leaves the key out: then get_invoice_data is asked.
    const { data, error } = await authenticatedClient.rpc('get_invoice_detail', { p_invoice_id: invoiceId });

    if (error) {
      invoiceFormLogger.error('RPC error:', errorForLog(error));
      throw new Error(serverText(error.message, t('invoice.service.fetchFailed')));
    }

    if (!data || !data.success) {
      const errorMsg = serverText(data?.error, t('invoice.details.notFoundTitle'));
      return {
        success: false,
        data: {
          header: { customer_id: '', customer_name: '', gr_id: '', gr_no: '' },
          items: [],
        },
        message: errorMsg,
      };
    }

    // Transform response to flat form state format
    // Backend returns: { success, invoice: {...}, items: [...] }
    const header = data.invoice;
    const items = data.items || [];

    // Defensive check: ensure we have the invoice header
    if (!header) {
      return {
        success: false,
        data: {
          header: { customer_id: '', customer_name: '', gr_id: '', gr_no: '' },
          items: [],
        },
        message: t('invoice.service.dataMissing'),
      };
    }

    // Normalize financial year to "YYYY-YY" format (e.g., "2025-26")
    // Backend may return: "2025-26" (string), 2025 (number), or "2025" (string)
    let finYear = '';
    if (header.inv_fin_year) {
      const finYearStr = String(header.inv_fin_year);
      if (/^\d{4}-\d{2}$/.test(finYearStr)) {
        // Already in correct format "2025-26"
        finYear = finYearStr;
      } else if (/^\d{4}$/.test(finYearStr)) {
        // Just a year "2025" - convert to "2025-26"
        const year = parseInt(finYearStr, 10);
        finYear = `${year}-${String(year + 1).slice(-2)}`;
      } else if (/^\d{4}-\d{4}$/.test(finYearStr)) {
        // Full format "2025-2026" - convert to "2025-26"
        const parts = finYearStr.split('-');
        finYear = `${parts[0]}-${parts[1].slice(-2)}`;
      }
    }

    const grnPricing: { read: true; mode: string | null } | { read: false } =
      'grn_pricing_mode' in header
        ? { read: true, mode: header.grn_pricing_mode || null }
        : await invoiceGrnPricingMode(authenticatedClient, invoiceId);

    // Without the GRN's pricing mode the form cannot say what a line costs: a
    // one-time invoice priced as monthly shows, and after any change totals,
    // amounts the server will not charge. The form is not opened on a guess.
    if (!grnPricing.read) {
      return {
        success: false,
        data: {
          header: { customer_id: '', customer_name: '', gr_id: '', gr_no: '' },
          items: [],
        },
        message: t('invoice.details.loadFailed'),
      };
    }

    // A GRN without a mode of its own: the invoice's pricing_mode column is
    // the fallback, and without either the lines are monthly.
    const oneTime = isOneTime(grnPricing.mode ?? header.pricing_mode);

    // Convert header data - full InvoiceHeaderData format
    const formattedHeader: InvoiceHeaderData = {
      customer_id: header.customer_id || '',
      customer_name: header.customer_name || '',
      gr_id: header.gr_id || '',
      gr_no: header.gr_no || '',
      inv_date: header.inv_date ? header.inv_date.split('T')[0] : toLocalISODate(new Date()),
      inv_fin_year: finYear,
      inv_no: typeof header.inv_no === 'string' ? parseInt(header.inv_no.replace(/\D/g, ''), 10) || 0 : header.inv_no || 0,
      // The GRN's pricing mode, not the flag stored with the invoice: the
      // server charges by the GRN whatever that flag says.
      one_time_charge: oneTime,
      discount: header.discount || 0,
      discount_reason: header.discount_reason || '',
      zero_charge_reason: header.zero_charge_reason || '',
      labour: header.labour || 0,
      tax_amount: header.tax_amount || 0,
      total: header.total || 0,
    };

    // Convert items data - backend now returns all needed fields
    // Available: id, disp_trl_id, item_name, qty, dispatch_no, dispatch_date,
    //            duration, no_of_days, charge, tax, labour_rate, and from migration 109
    //            item_id, dispatch_id, rack

    const formattedItems: InvoiceItemData[] = items.map((item: any, index: number) => {
      const charge = item.charge || 0;
      // Duration can be fractional (e.g., 7.5 months), don't round it
      const duration = item.duration || 1;
      const labour_rate = item.labour_rate || 0;
      const tax = item.tax || 0;
      const no_of_days = Math.round(item.no_of_days || 30);
      const qty = item.qty || 0;

      return {
        // Generate temp_id for React keys
        temp_id: `edit_${item.id}_${index}`,

        // Dispatch item reference (required for RPC)
        disp_trl_id: item.disp_trl_id || '',

        // GRN item reference
        grn_item_id: item.grn_item_id || item.gr_trl_id || '',

        // Item details - now available from backend
        item_id: item.item_id || '',
        item_name: item.item_name || '',
        qty: qty,
        grn_original_qty: item.grn_original_qty || 0,
        package_mark: item.package_mark || '',
        rack: item.rack || '',
        weight: item.weight || 0,

        // Dispatch details - now available from backend
        dispatch_id: item.dispatch_id || '',
        dispatch_no: item.dispatch_no || '',
        dispatch_date: item.dispatch_date ? item.dispatch_date.split('T')[0] : '',

        // GRN details - use header values
        grn_id: header.gr_id || '',
        grn_no: header.gr_no || '',
        grn_date: '',

        // Pricing fields (editable) - from invoice_trl
        duration: duration,
        no_of_days: no_of_days,
        charge: charge,
        labour_rate: labour_rate,
        tax: tax,

        // Calculated fields, as the server computes them for this pricing mode
        one_time: oneTime,
        ...calculateItemAmounts(qty, charge, labour_rate, tax, duration, oneTime),
      };
    });

    return {
      success: true,
      data: {
        header: formattedHeader,
        items: formattedItems,
      },
      message: t('invoice.service.loaded'),
    };
  } catch (error: any) {
    invoiceFormLogger.error('Error loading invoice:', errorForLog(error));
    return {
      success: false,
      data: {
        header: { customer_id: '', customer_name: '', gr_id: '', gr_no: '' },
        items: [],
      },
      message: serverText(error.message, t('invoice.service.loadFailed')),
    };
  }
};

/**
 * Update an existing invoice
 * Calls the update_invoice RPC with invoice ID and updated data
 */
export const updateInvoice = async (
  invoiceId: string,
  payload: CreateInvoicePayload
): Promise<CreateInvoiceResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Validate required fields
    if (!payload.header.customer_id) {
      throw new Error(t('invoice.service.customerRequired'));
    }
    if (!payload.header.gr_id) {
      throw new Error(t('invoice.service.grnRequired'));
    }
    if (!payload.header.inv_date) {
      throw new Error(t('invoice.validation.invoiceDateRequired'));
    }

    // Convert financial year string to number (e.g., '2025-26' -> 2025)
    const invFinYearString = String(payload.header.inv_fin_year);
    const invFinYear = parseInt(invFinYearString.split('-')[0]);

    // Format date to match web app format: 'YYYY-MM-DD' + 'T00:00:00Z'
    const formattedDate = payload.header.inv_date.includes('T')
      ? payload.header.inv_date
      : payload.header.inv_date + 'T00:00:00Z';

    // Prepare RPC payload for update_invoice
    const invoiceData = {
      customer_id: payload.header.customer_id,
      customer_name: payload.header.customer_name,
      gr_id: payload.header.gr_id,
      gr_no: payload.header.gr_no,
      inv_no: payload.header.inv_no,
      inv_fin_year: invFinYear,
      inv_date: formattedDate,
      discount: payload.header.discount || 0,
      discount_reason: payload.header.discount_reason?.trim() || null,
      labour: payload.header.labour || 0,
      tax_amount: payload.header.tax_amount || 0,
      total: payload.header.total || 0,
      one_time_charge: payload.header.one_time_charge || false,
      ...zeroChargeHeader(payload),
    };

    const invoiceItems = payload.items.map((item) => ({
      disp_trl_id: item.disp_trl_id,
      grn_item_id: item.grn_item_id, // GRN item record ID (goodsreceived_trl.id)
      duration: item.duration,
      no_of_days: item.no_of_days,
      charge: item.charge,
      tax: item.tax,
      labour_rate: item.labour_rate,
    }));

    // Call update_invoice RPC
    const { data, error } = await authenticatedClient.rpc('update_invoice', {
      p_invoice_id: invoiceId,
      p_invoice_data: invoiceData,
      p_invoice_items: invoiceItems,
    });

    if (error) {
      invoiceFormLogger.error('RPC error:', errorForLog(error));
      throw new Error(invoiceSaveMessage(error.message, t('invoice.service.updateFailed'), error.code));
    }

    // RPC returns an object directly
    const result = data;

    if (!result || !result.success) {
      const errorMsg = invoiceSaveMessage(result?.error, t('invoice.service.updateFailed'), result?.error_code);
      return {
        success: false,
        data: { invoice_id: '', invoice_no: 0 },
        message: errorMsg,
      };
    }
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    return {
      success: true,
      data: {
        invoice_id: result.invoice_id,
        invoice_no: parseInt(result.invoice_number),
        total: await savedInvoiceTotal(authenticatedClient, result, result.invoice_id || invoiceId),
      },
      message: serverText(result.message, t('invoice.service.updated')),
    };
  } catch (error: any) {
    invoiceFormLogger.error('Error updating invoice:', errorForLog(error));
    return {
      success: false,
      data: { invoice_id: '', invoice_no: 0 },
      message: serverText(error.message, t('invoice.service.updateFailed'), { write: true, form: true }),
    };
  }
};

export { transformFormDataToPayload } from '../utils/invoicePayload';
