import { printSkippedNote } from '@/features/gst/printSkipped';
import * as Crypto from 'expo-crypto';
import { createAuthenticatedFetch, getCurrentConfig } from '../config/supabaseConfig';
import { discardBody } from '../config/discardBody';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { createLogger } from '@/utils/logger';
import { t } from '@/i18n';
import { serverText, upgradingBody } from '@/utils/serverText';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

// Logging rule: the print endpoints carry the session credential, document
// ranges and printer diagnostics. Only the HTTP status and ok flag of a
// response are logged; never a token, a request body, a response body or an
// error message.
const log = createLogger('print');

/** Why a print request failed, for the text shown (`printFailureMessage`). */
export type PrintFailureKind =
  | 'notSetUp'
  | 'notAllowed'
  | 'unconfirmed'
  | 'printerFailed'
  | 'serverUnavailable'
  | 'connection'
  | 'allSkipped'
  | 'other';

export interface PrintJobResponse {
  success: boolean;
  /** HTTP status of the answer (absent when no answer came). */
  status?: number;
  /** The backend's own code (PRINTING_OFF, PRINT_FORBIDDEN, PRINTER_FAILED, PRINT_UNCONFIRMED), when it sends one. */
  code?: string;
  /** On a failure: which text to show. Decided from the code, else from the HTTP status. */
  kind?: PrintFailureKind;
  message?: string;
  range?: {
    start: string;
    end: string;
    count?: number;
    fin_year?: number;
  };
  print_job?: {
    print_job_id?: string | null;
    cups_job_id: number | null;
    job_uri: string;
    printer: string;
    content_size: number;
  };
  timestamp?: string;
  error?: string;
  /** The printer accepted the job but did not confirm it (status 'unknown'): it may still print. */
  unconfirmed?: boolean;
  /** The server had already handled this request_id and printed nothing again. That is a success. */
  duplicate?: boolean;
  /**
   * Invoices of the range that were not printed on the form (print-invoice-preprinted): `cancelled`, `igst` (no field for
   * IGST on the form; print on plain paper) or `does_not_fit` (a value is longer than its field, named in `field`). The rest printed.
   */
  skipped?: PrintSkipped[];
}

export interface PrintSkipped {
  inv_no?: number | string;
  inv_fin_year?: number | string;
  reason?: string;
  field?: string;
}

export interface PrintJob {
  id: string;
  job_type: string; // Backend returns "GRN", "Dispatch", "Invoice" (capitalized)
  cups_job_id: number | null;
  status: 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  created_at: string;
  user_id: string;
  user_name: string;
  document_range_start: string;
  document_range_end: string;
  document_count: number;
  printer_name: string;
  content_size: number;
  submitted_at: string;
  completed_at: string | null;
  updated_at: string;
  error_message: string | null;
}

export interface GetPrintJobsResponse {
  success: boolean;
  data?: PrintJob[];
  error?: string;
}

export interface CancelPrintJobResponse {
  success: boolean;
  message?: string;
  error?: string;
  /** The backend's code when it sent one: INVALID_STATUS, CANNOT_CANCEL, CANCEL_FAILED. */
  code?: string;
}

export type PrinterStatus = 'online' | 'offline' | 'error' | 'busy';

export interface GetPrinterStatusResponse {
  success: boolean;
  status?: PrinterStatus;
  message?: string;
  printer_name?: string;
  printer_state?: number;
  printer_state_message?: string;
  printer_state_reasons?: string[];
  printer_is_accepting_jobs?: boolean;
  queued_job_count?: number;
  timestamp?: string;
  error?: string;
}

/**
 * Decide the failure kind from the backend's code, else (today's backend, no code) from the HTTP status.
 * A 503 whose JSON body is not the "upgrading" answer is "printing not set up"; a 502 or 504, or an answer that is
 * not JSON, is "server unavailable"; only the code PRINTER_FAILED (502) names a printer failure; any other error shows the server's message.
 */
function classifyFailure(status: number, code: string | undefined, unconfirmed: boolean, jsonBody: boolean): PrintFailureKind {
  if (unconfirmed || code === 'PRINT_UNCONFIRMED') return 'unconfirmed';
  if (code === 'PRINTING_OFF') return 'notSetUp';
  if (code === 'PRINT_FORBIDDEN') return 'notAllowed';
  if (code === 'PRINTER_FAILED') return 'printerFailed';
  if (!jsonBody) return 'serverUnavailable';
  if (status === 503) return 'notSetUp';
  if (status === 403) return 'notAllowed';
  if (status === 502 || status === 504) return 'serverUnavailable';
  return 'other';
}

/** The text for a failed print result, in the app's language. */
export function printFailureMessage(result: PrintJobResponse): string {
  switch (result.kind) {
    case 'notSetUp':
      return t('errors.print.notSetUp');
    case 'notAllowed':
      return t('errors.print.notAllowed');
    case 'unconfirmed':
      return t('errors.print.unconfirmed');
    case 'printerFailed':
      return t('errors.print.printerFailed');
    case 'serverUnavailable':
      return t('errors.print.serverUnavailable', { status: String(result.status ?? '') });
    case 'connection':
      return t('errors.print.connection');
    case 'allSkipped':
      // WH-151: ALL_SKIPPED, every invoice of the range was skipped: each is listed with its reason.
      return printSkippedNote(result, 'gst.print.allSkippedTitle') ?? t('gst.print.noneFit');
    default:
      return serverText(result.error, t('errors.print.submitFailed'));
  }
}

const authRequiredError = () => t('errors.auth.loginAgain');

/**
 * Get authentication token for print API calls
 * First tries to get from Supabase session, falls back to stored JWT tokens (properly decoded)
 */
const getAuthToken = getAuthTokenString;

/** Log the outcome of a print request: status and ok flag only. */
const logResponse = (operation: string, response: Pick<Response, 'status' | 'ok'>) => {
  log.info(`${operation} response`, { status: response.status, ok: response.ok });
};

// One request_id per user print action (the server prints a repeated one only once). The id is reused only while the last
// attempt of the same request ended without a usable answer (no connection, a gateway page, a cut answer): the user's
// next tap is then the retry of the same action. After any answer the server gave (success, refusal, "unconfirmed",
// printer failed) the next tap is a new action with a new id; a deliberate second copy must print.
const REQUEST_ID_REUSE_MS = 5 * 60 * 1000;
// Kept per document (path + range), so an answer to one print never clears another print's id.
const lastAttempts = new Map<string, { id: string; at: number }>();
registerSessionScoped('print-request-ids', () => lastAttempts.clear());

function requestIdFor(path: string, body: Record<string, unknown>): string {
  const key = `${path}:${JSON.stringify(body)}`;
  const now = Date.now();
  const last = lastAttempts.get(key);
  if (last && now - last.at < REQUEST_ID_REUSE_MS) return last.id;
  const id = Crypto.randomUUID();
  lastAttempts.set(key, { id, at: now });
  return id;
}

/**
 * Submit a print job to one of the preprinted-form Edge Functions.
 * The response body is returned to the caller untouched and never logged.
 */
async function submitPrintJob(
  operation: string,
  path: string,
  body: Record<string, unknown>
): Promise<PrintJobResponse> {
  const key = `${path}:${JSON.stringify(body)}`;
  let answered = false;
  try {
    const result = await sendPrintJob(operation, path, body, () => { answered = true; });
    return result;
  } finally {
    if (answered) lastAttempts.delete(key);
  }
}

async function sendPrintJob(
  operation: string,
  path: string,
  body: Record<string, unknown>,
  markAnswered: () => void
): Promise<PrintJobResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      log.warn(`${operation} refused: no session`);
      return { success: false, error: authRequiredError() };
    }

    const config = getCurrentConfig();
    const response = await authenticatedFetch(`${config.url}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ ...body, request_id: requestIdFor(path, body) }),
    });

    logResponse(operation, response);

    // Handle non-JSON responses (like 502 HTML error pages) without reading them.
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      discardBody(response);
      return {
        success: false,
        status: response.status,
        kind: 'serverUnavailable',
        error: t('errors.print.serverUnavailable', { status: String(response.status) }),
      };
    }

    // A body that says it is JSON but is not: an answer that was cut or garbled.
    let data: any;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (data === null || typeof data !== 'object') {
      // On a success the job may be on its way, but the server did answer: the next tap is a deliberate new print
      // (new id). Only a request that got no answer at all is retried with the same id.
      if (response.ok) markAnswered();
      return response.ok
        ? { success: false, status: response.status, kind: 'unconfirmed', unconfirmed: true, error: t('errors.print.unconfirmed') }
        : {
            success: false,
            status: response.status,
            kind: 'serverUnavailable',
            error: t('errors.print.serverUnavailable', { status: String(response.status) }),
          };
    }

    // The server gave a real answer (not a gateway's 502/504 with no code of its own): the next tap is a new action.
    if (response.ok || typeof data.code === 'string' || data.unconfirmed === true || (response.status !== 502 && response.status !== 504)) markAnswered();

    if (!response.ok) {
      const code = typeof data.code === 'string' ? data.code : undefined;
      // The backend says so (`unconfirmed: true`), or a 502 names a recorded job: the printer did
      // not confirm it. Never resubmit on a guess.
      const unconfirmed = data.unconfirmed === true || (response.status === 502 && !!data.print_job_id);
      const upgrading = upgradingBody(data) !== undefined;
      return {
        success: false,
        status: response.status,
        ...(code ? { code } : {}),
        // WH-151: ALL_SKIPPED (HTTP 422): every invoice of the range was skipped, and `skipped` says why for each.
        kind: upgrading ? 'other' : code === 'ALL_SKIPPED' ? 'allSkipped' : classifyFailure(response.status, code, unconfirmed, true),
        ...(code === 'ALL_SKIPPED' && Array.isArray(data.skipped) ? { skipped: data.skipped as PrintSkipped[] } : {}),
        error: serverText(upgradingBody(data) ?? data.error, t('errors.print.submitFailed')),
        ...(unconfirmed ? { unconfirmed: true } : {}),
      };
    }

    // duplicate: the server had this request_id already and printed nothing again: the job is done, a success.
    return { ...data, ...(data.duplicate === true ? { success: true } : {}), status: response.status };
  } catch (error) {
    log.error(`${operation} failed`);
    return {
      success: false,
      kind: 'connection',
      error: error instanceof Error ? error.message : t('errors.print.submitFailed'),
    };
  }
}

/**
 * Print GRN range using Supabase Edge Function
 * @param startGrNo - Starting GRN number (e.g., "Z0797")
 * @param endGrNo - Ending GRN number (e.g., "Z0801")
 * @returns The print job response
 */
export async function printGRNRange(
  startGrNo: string,
  endGrNo: string
): Promise<PrintJobResponse> {
  return submitPrintJob('printGRNRange', 'print-grn-preprinted', {
    start_gr_no: startGrNo,
    end_gr_no: endGrNo,
  });
}

/**
 * Print dispatch range using Supabase Edge Function
 * @param startDispNo - Starting dispatch number
 * @param endDispNo - Ending dispatch number
 * @returns The print job response
 */
export async function printDispatchRange(
  startDispNo: string,
  endDispNo: string
): Promise<PrintJobResponse> {
  return submitPrintJob('printDispatchRange', 'print-dispatch-preprinted', {
    start_disp_no: startDispNo,
    end_disp_no: endDispNo,
  });
}

/**
 * Print invoice range using Supabase Edge Function
 * @param startInvNo - Starting invoice number (e.g., "INV001")
 * @param endInvNo - Ending invoice number (e.g., "INV005")
 * @param finYear - Financial year (optional, defaults to current year in backend)
 * @returns The print job response
 */
export async function printInvoiceRange(
  startInvNo: string,
  endInvNo: string,
  finYear?: number
): Promise<PrintJobResponse> {
  const requestBody: {
    start_inv_no_str: string;
    end_inv_no_str: string;
    inv_fin_year?: number;
  } = {
    start_inv_no_str: startInvNo,
    end_inv_no_str: endInvNo,
  };

  // A year that is not a finite number is left out: the backend then uses the current year.
  if (finYear !== undefined && Number.isFinite(finYear)) {
    requestBody.inv_fin_year = finYear;
  }

  return submitPrintJob('printInvoiceRange', 'print-invoice-preprinted', requestBody);
}

/**
 * Get list of print jobs from the database
 * @param jobType - Optional filter by job type (grn, dispatch, invoice)
 * @param limit - Maximum number of jobs to return (default: 50)
 * @param status - Optional filter by status (queued, printing, completed, failed, cancelled, unknown)
 * @returns List of print jobs with status
 */
export async function getPrintJobs(
  jobType?: 'grn' | 'dispatch' | 'invoice',
  limit = 50,
  status?: 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled' | 'unknown'
): Promise<GetPrintJobsResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      log.warn('getPrintJobs refused: no session');
      return { success: false, error: authRequiredError() };
    }

    const config = getCurrentConfig();
    const response = await authenticatedFetch(`${config.url}/rest/v1/rpc/get_print_jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        apikey: config.anonKey,
      },
      body: JSON.stringify({
        p_job_type: jobType || null,
        p_limit: limit,
        p_status: status || null,
      }),
    });

    logResponse('getPrintJobs', response);

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error:
          serverText(upgradingBody(data) ?? (data.error ||
          data.message), t('errors.print.httpError', { status: String(response.status) })),
      };
    }

    // The RPC answers {success, data: [...], message}; a bare array is tolerated.
    const rows = Array.isArray(data) ? data : data && Array.isArray(data.data) ? data.data : [];
    return { success: true, data: rows };
  } catch (error) {
    log.error('getPrintJobs failed');
    return {
      success: false,
      error:
        error instanceof Error ? error.message : t('errors.print.fetchJobsFailed'),
    };
  }
}

/**
 * Cancel a pending print job
 * @param jobId - Database ID of the print job to cancel
 * @returns Success status and message
 */
export async function cancelPrintJob(
  jobId: string
): Promise<CancelPrintJobResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      log.warn('cancelPrintJob refused: no session');
      return { success: false, error: authRequiredError() };
    }

    const config = getCurrentConfig();
    const response = await authenticatedFetch(`${config.url}/functions/v1/cancel-print-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        print_job_id: jobId,
      }),
    });

    logResponse('cancelPrintJob', response);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const code = data && typeof data.code === 'string' ? data.code : undefined;
      // The function's own refusals get a text of the app's own (the server's English is not shown).
      const known: Record<string, string> = {
        CANNOT_CANCEL: t('errors.print.cannotCancel'),
        INVALID_STATUS: t('errors.print.cancelFinished'),
        CANCEL_FAILED: t('errors.print.cancelUnconfirmed'),
        RECORD_FAILED: t('errors.print.cancelNotRecorded'),
      };
      if (code && known[code]) return { success: false, code, error: known[code] };
      return {
        success: false,
        ...(code ? { code } : {}),
        error: serverText(upgradingBody(data) ?? (data?.error || data?.message), t('errors.print.cancelFailed')),
      };
    }

    return {
      success: true,
      message: serverText(data?.message, t('errors.print.cancelled')),
    };
  } catch (error) {
    log.error('cancelPrintJob failed');
    return {
      success: false,
      error:
        error instanceof Error ? error.message : t('errors.print.cancelFailed'),
    };
  }
}

/**
 * Get the current printer status from the print server
 * @param printerName - Name of the printer; left out, the server answers for the facility's own printer
 * @returns Printer status and details
 */
export async function getPrinterStatus(
  printerName?: string
): Promise<GetPrinterStatusResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      log.warn('getPrinterStatus refused: no session');
      return { success: false, error: authRequiredError() };
    }

    const config = getCurrentConfig();
    const response = await authenticatedFetch(`${config.url}/functions/v1/get-printer-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(printerName ? { printer_name: printerName } : {}),
    });

    logResponse('getPrinterStatus', response);

    // Not JSON (a gateway's page) or cut short: no status, and the caller falls back.
    const data = await response.json().catch(() => null);
    if (data === null || typeof data !== 'object') {
      return {
        success: false,
        error: t('errors.print.serverUnavailable', { status: String(response.status) }),
      };
    }

    if (!response.ok) {
      // The server's own status (offline, error) on a refusal such as 503 offline: the caller shows it, not a fallback.
      const serverStatus: PrinterStatus | undefined =
        upgradingBody(data) === undefined && (data.status === 'offline' || data.status === 'error') ? data.status : undefined;
      return {
        success: false,
        ...(serverStatus ? { status: serverStatus } : {}),
        printer_name: data.printer_name,
        error:
          serverText(upgradingBody(data) ?? (data.error ||
          data.message), t('errors.print.httpError', { status: String(response.status) })),
      };
    }

    return {
      success: true,
      status: data.status,
      message: data.message,
      printer_name: data.printer_name,
      printer_state: data.printer_state,
      printer_state_message: data.printer_state_message,
      printer_state_reasons: data.printer_state_reasons,
      printer_is_accepting_jobs: data.printer_is_accepting_jobs,
      queued_job_count: data.queued_job_count,
      timestamp: data.timestamp,
    };
  } catch (error) {
    log.error('getPrinterStatus failed');
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : t('errors.print.statusFailed'),
    };
  }
}
