import { createAuthenticatedFetch, getCurrentConfig } from '../config/supabaseConfig';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { createLogger } from '@/utils/logger';
import { t } from '@/i18n';

// Logging rule: the print endpoints carry the session credential, document
// ranges and printer diagnostics. Only the HTTP status and ok flag of a
// response are logged; never a token, a request body, a response body or an
// error message.
const log = createLogger('print');

interface PrintJobResponse {
  success: boolean;
  message?: string;
  range?: {
    start: string;
    end: string;
    count?: number;
    fin_year?: number;
  };
  print_job?: {
    cups_job_id: number;
    job_uri: string;
    printer: string;
    content_size: number;
  };
  timestamp?: string;
  error?: string;
}

export interface PrintJob {
  id: string;
  job_type: string; // Backend returns "GRN", "Dispatch", "Invoice" (capitalized)
  cups_job_id: number;
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';
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

/**
 * Submit a print job to one of the preprinted-form Edge Functions.
 * The response body is returned to the caller untouched and never logged.
 */
async function submitPrintJob(
  operation: string,
  path: string,
  body: Record<string, unknown>
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
      body: JSON.stringify(body),
    });

    logResponse(operation, response);

    // Handle non-JSON responses (like 502 HTML error pages) without reading them.
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: t('errors.print.serverUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || t('errors.print.httpError', { status: String(response.status) }),
      };
    }

    return data;
  } catch (error) {
    log.error(`${operation} failed`);
    return {
      success: false,
      error: error instanceof Error ? error.message : t('errors.print.submitFailed'),
    };
  }
}

/**
 * Print GRN range using Supabase Edge Function
 * @param startGrNo - Starting GRN number (e.g., "Z0797")
 * @param endGrNo - Ending GRN number (e.g., "Z0801")
 * @returns Print job response with CUPS job details
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
 * @returns Print job response with CUPS job details
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
 * @returns Print job response with CUPS job details
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

  if (finYear !== undefined) {
    requestBody.inv_fin_year = finYear;
  }

  return submitPrintJob('printInvoiceRange', 'print-invoice-preprinted', requestBody);
}

/**
 * Get list of print jobs from the database
 * @param jobType - Optional filter by job type (grn, dispatch, invoice)
 * @param limit - Maximum number of jobs to return (default: 50)
 * @param status - Optional filter by status (pending, processing, completed, failed, cancelled)
 * @returns List of print jobs with status
 */
export async function getPrintJobs(
  jobType?: 'grn' | 'dispatch' | 'invoice',
  limit = 50,
  status?: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled'
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
          data.error ||
          data.message ||
          t('errors.print.httpError', { status: String(response.status) }),
      };
    }

    return {
      success: true,
      data: Array.isArray(data) ? data : [],
    };
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
    const response = await authenticatedFetch(`${config.url}/rest/v1/rpc/cancel_print_job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        apikey: config.anonKey,
      },
      body: JSON.stringify({
        p_print_job_id: jobId,
      }),
    });

    logResponse('cancelPrintJob', response);

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || t('errors.print.cancelFailed'),
      };
    }

    return {
      success: true,
      message: data?.message || t('errors.print.cancelled'),
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
 * Get current printer status from CUPS
 * @param printerName - Name of the printer (default: LQ1310_RAW)
 * @returns Printer status and details
 */
export async function getPrinterStatus(
  printerName: string = 'LQ1310_RAW'
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
      body: JSON.stringify({
        printer_name: printerName,
      }),
    });

    logResponse('getPrinterStatus', response);

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error:
          data.error ||
          data.message ||
          t('errors.print.httpError', { status: String(response.status) }),
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
