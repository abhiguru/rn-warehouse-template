import { createAuthenticatedFetch, getCurrentConfig } from '../config/supabaseConfig';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { getLanguage, t, type AppLanguage } from '@/i18n';
import { createLogger } from '@/utils/logger';
import { serverText } from '@/utils/serverText';

const log = createLogger('reportPdf');

/**
 * Fix private development origins returned by backend Edge Functions. Docker
 * service names and loopback hosts are not reachable from a physical device,
 * so retain the signed path/query while using the app's configured API origin.
 */
function fixInternalUrl(url: string): string {
  if (!url) return url;

  try {
    const signedUrl = new URL(url);
    const internalHosts = new Set(['kong', 'localhost', '127.0.0.1']);

    if (!internalHosts.has(signedUrl.hostname)) {
      return url;
    }

    const publicOrigin = new URL(getCurrentConfig().url).origin;
    if (signedUrl.origin !== publicOrigin) {
      return url.replace(signedUrl.origin, publicOrigin);
    }
  } catch {
    // Preserve malformed server values so the caller reports the download error.
  }

  return url;
}

const insecureDownloadError = () => t('errors.pdf.insecureLink');

/**
 * Accept a signed download URL only when it is HTTPS or sits on the origin the
 * app was configured with (a plain-HTTP origin exists only in development).
 * Anything else, including a malformed value, is refused so the session read
 * fetch never follows a link to an unrelated host.
 */
export function acceptSignedUrl(url: string): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const signedUrl = new URL(url);
    if (signedUrl.protocol === 'https:') return url;
    if (signedUrl.protocol !== 'http:') return null;
    const configuredOrigin = new URL(getCurrentConfig().url).origin;
    return signedUrl.origin === configuredOrigin ? url : null;
  } catch {
    return null;
  }
}

export interface PDFResponse {
  success: boolean;
  pdfUrl?: string;
  expiresIn?: number;
  document?: {
    type: string;
    number: string;
    date: string;
    customer: string;
    items_count: number;
  };
  error?: string;
}

/**
 * Get authentication token for PDF API calls
 * First tries to get from Supabase session, falls back to stored JWT tokens
 */
const getAuthToken = getAuthTokenString;

/**
 * Generate GRN PDF using Supabase Edge Function
 * @param grNo - GRN number (e.g., "Z0797")
 * @returns PDF response with signed URL for download
 */
export async function generateGRNPDF(grNo: string): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: t('errors.auth.loginAgain'),
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-grn-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ gr_no: grNo }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
      };
    }

    const pdfUrl = acceptSignedUrl(fixInternalUrl(data.pdf_url));
    if (!pdfUrl) {
      return { success: false, error: insecureDownloadError() };
    }

    return {
      success: true,
      pdfUrl,
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : t('errors.pdf.generateFailed'),
    };
  }
}

/**
 * Generate Dispatch PDF using Supabase Edge Function
 * @param dispNo - Dispatch number (e.g., "I4613")
 * @returns PDF response with signed URL for download
 */
export async function generateDispatchPDF(
  dispNo: string
): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: t('errors.auth.loginAgain'),
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-dispatch-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ disp_no: dispNo }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
      };
    }

    const pdfUrl = acceptSignedUrl(fixInternalUrl(data.pdf_url));
    if (!pdfUrl) {
      return { success: false, error: insecureDownloadError() };
    }

    return {
      success: true,
      pdfUrl,
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : t('errors.pdf.generateFailed'),
    };
  }
}

/**
 * Generate Invoice PDF using Supabase Edge Function
 * @param invNo - Invoice number (numeric, e.g., 2555)
 * @param finYear - Financial year (e.g., 2025)
 * @returns PDF response with signed URL for download
 */
export async function generateInvoicePDF(
  invNo: number,
  finYear: number
): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: t('errors.auth.loginAgain'),
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-invoice-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ inv_no: invNo, fin_year: finYear }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
      };
    }

    const pdfUrl = acceptSignedUrl(fixInternalUrl(data.pdf_url));
    if (!pdfUrl) {
      return { success: false, error: insecureDownloadError() };
    }

    return {
      success: true,
      pdfUrl,
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : t('errors.pdf.generateFailed'),
    };
  }
}

/**
 * Generate Customer Stock Summary PDF using Supabase Edge Function
 * @param customerId - Customer UUID (e.g., "1275b249-2831-11ed-ba24-525400024271")
 * @returns PDF response with signed URL for download
 */
export async function generateCustomerStockPDF(
  customerId: string
): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: t('errors.auth.loginAgain'),
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-customer-stock-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ customer_id: customerId }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
      };
    }

    const pdfUrl = acceptSignedUrl(fixInternalUrl(data.pdf_url));
    if (!pdfUrl) {
      return { success: false, error: insecureDownloadError() };
    }

    return {
      success: true,
      pdfUrl,
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : t('errors.pdf.generateFailed'),
    };
  }
}

// ---------------------------------------------------------------------------
// Report PDFs: backend edge function generate-report-pdf (the backend release
// with migrations 52-53).
// ---------------------------------------------------------------------------

/** Reports that cover a chosen period: `from` and `to` are required. */
export type ReportPdfPeriodReport = 'grn-activity' | 'dispatch-activity' | 'invoice-history' | 'customer-activity';
/** Reports of the stock as it is now: the server refuses `from` and `to` for them. */
export type ReportPdfStockReport = 'stock-summary' | 'stock-aging' | 'item-stock-summary';
export type ReportPdfName = ReportPdfPeriodReport | ReportPdfStockReport;

const PERIOD_REPORTS: ReadonlySet<ReportPdfName> = new Set<ReportPdfName>([
  'grn-activity',
  'dispatch-activity',
  'invoice-history',
  'customer-activity',
]);

export const isPeriodReport = (report: ReportPdfName): report is ReportPdfPeriodReport => PERIOD_REPORTS.has(report);

/** The longest period one report PDF covers, both days included (backend report-request.ts). */
export const REPORT_PDF_MAX_PERIOD_DAYS = 450;

export interface ReportPdfSort {
  /** A lower-case field name; one the report does not sort by gives the report's default order. */
  field: string;
  order: 'asc' | 'desc';
}

/** The payment status an invoice history PDF is narrowed to. */
export type ReportPdfStatus = 'paid' | 'pending';

interface ReportPdfRequestBase {
  /** One customer's report; absent or null = the all-customers level. */
  customer_id?: string | null;
  sort?: ReportPdfSort;
  /**
   * Only the invoices with this payment status. The server accepts it with
   * `report: 'invoice-history'` and a `customer_id` only; the body leaves it out
   * for anything else. A server that predates it refuses the field (see generateReportPDF).
   */
  status?: ReportPdfStatus;
  /** Language of the PDF's labels; the app's current language when absent. */
  lang?: AppLanguage;
}

/**
 * The request body of generate-report-pdf, field for field. A report without a
 * period cannot carry dates (the server refuses them with 400); `from` and `to`
 * are 'YYYY-MM-DD'.
 */
export type ReportPdfRequest =
  | (ReportPdfRequestBase & { report: ReportPdfPeriodReport; from: string; to: string })
  | (ReportPdfRequestBase & { report: ReportPdfStockReport; from?: never; to?: never });

export interface ReportPdfDocument {
  type: 'report';
  report: ReportPdfName;
  customer?: string;
  from?: string;
  to?: string;
  rows_count: number;
  rows_total: number;
  truncated: boolean;
  sort: ReportPdfSort;
}

/**
 * Why a report PDF was not made. `server-outdated`: the facility's backend has
 * no generate-report-pdf (older than the release with migrations 52-53).
 */
export type ReportPdfFailure =
  | 'session'
  | 'network'
  | 'server-outdated'
  | 'forbidden'
  | 'customer-unavailable'
  | 'period-too-long'
  | 'not-accepted'
  | 'server-unavailable'
  | 'insecure-link';

export interface ReportPdfResult {
  success: boolean;
  pdfUrl?: string;
  expiresIn?: number;
  document?: ReportPdfDocument;
  /** In the app's language, ready to show. */
  error?: string;
  reason?: ReportPdfFailure;
}

/** The JSON body sent for a request: only the contract's fields, dates only for a period report. */
export function reportPdfRequestBody(request: ReportPdfRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { report: request.report };
  if (typeof request.customer_id === 'string' && request.customer_id) body.customer_id = request.customer_id;
  // Accepted only for one customer's invoice history; the server refuses it anywhere else.
  if (request.report === 'invoice-history' && body.customer_id && (request.status === 'paid' || request.status === 'pending')) {
    body.status = request.status;
  }
  if (isPeriodReport(request.report)) {
    body.from = request.from;
    body.to = request.to;
  }
  if (request.sort) body.sort = { field: request.sort.field, order: request.sort.order };
  body.lang = request.lang ?? getLanguage();
  return body;
}

/** The function's own answer has `success: boolean`; a router or gateway answer does not. */
const isFunctionEnvelope = (data: unknown): data is { success: boolean; error?: unknown } =>
  typeof data === 'object' &&
  data !== null &&
  !Array.isArray(data) &&
  typeof (data as { success?: unknown }).success === 'boolean';

const reportFailure = (reason: ReportPdfFailure, error: string): ReportPdfResult => ({ success: false, error, reason });

/** What a server that predates the `status` field answers (HTTP 400) to a request that carries it. */
const UNKNOWN_FIELD_MESSAGE = 'Unknown field in report request';

/** One POST to generate-report-pdf; null when no answer came. */
async function postReportPdf(authToken: string, body: Record<string, unknown>): Promise<Response | null> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    return await authenticatedFetch(`${getCurrentConfig().url}/functions/v1/generate-report-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/** The answer's JSON; null when it is not JSON (a router's or gateway's page is not read). */
async function readReportPdfAnswer(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Generate a PDF of one report screen with the backend's generate-report-pdf.
 *
 * Same request path and result shape as the document PDFs above (the gated
 * fetch with the session; `{ success, pdfUrl, expiresIn, document }`). A failure
 * carries `error` in the app's language, ready to show, and a `reason`:
 * - 401: the session ended; 403: not available to this account; the function's
 *   own 404: the customer is unavailable; 400: the period is too long, or the
 *   request was not accepted; 503 and any other server failure: the server
 *   could not make the PDF right now;
 * - a 404 that is not the function's JSON envelope (the functions router's
 *   "Function not found", a gateway's "no Route matched") or a PGRST202 answer:
 *   the facility's server predates generate-report-pdf and needs an update;
 * - no answer at all (offline, timed out): check the connection.
 *
 * A request with `status` (the Payment choice of one customer's invoice history)
 * is asked again, once and without `status`, when the server answers HTTP 400
 * "Unknown field in report request": a server older than the field then makes
 * the PDF of all the period's invoices, as it did before, and is not taken as
 * outdated. Any other 400, and a second 400, are failures as above.
 *
 * Nothing is logged but that one retry, in a line with no request, customer,
 * link or server text in it (src/services/__tests__/reportPdf.test.ts).
 */
export async function generateReportPDF(request: ReportPdfRequest): Promise<ReportPdfResult> {
  const authToken = await getAuthToken();
  if (!authToken) return reportFailure('session', t('errors.auth.loginAgain'));

  const body = reportPdfRequestBody(request);
  let response = await postReportPdf(authToken, body);
  // No answer: offline, timed out, or the session changed while waiting.
  if (!response) return reportFailure('network', t('common.checkConnection'));
  let data = await readReportPdfAnswer(response);

  if ('status' in body && response.status === 400 && isFunctionEnvelope(data) && data.error === UNKNOWN_FIELD_MESSAGE) {
    log.info('The server does not take a payment status for the PDF; asked again without it');
    const withoutStatus = { ...body };
    delete withoutStatus.status;
    response = await postReportPdf(authToken, withoutStatus);
    if (!response) return reportFailure('network', t('common.checkConnection'));
    data = await readReportPdfAnswer(response);
  }

  if (!isFunctionEnvelope(data)) {
    const code = typeof data === 'object' && data !== null ? (data as { code?: unknown }).code : undefined;
    if (response.status === 404 || code === 'PGRST202') {
      return reportFailure('server-outdated', t('reports.export.serverNeedsUpdate'));
    }
    return reportFailure('server-unavailable', t('reports.export.serverBusy'));
  }

  if (!response.ok || data.success !== true) {
    switch (response.status) {
      case 401:
        return reportFailure('session', t('errors.code.sessionExpired'));
      case 403:
        return reportFailure('forbidden', t('reports.export.notAvailable'));
      case 404:
        return reportFailure('customer-unavailable', t('reports.export.customerUnavailable'));
      case 400:
        // The server's refusals are fixed English sentences; only this one is the person's to fix.
        return typeof data.error === 'string' && /period must not be longer/i.test(data.error)
          ? reportFailure('period-too-long', t('reports.export.periodTooLong', { days: REPORT_PDF_MAX_PERIOD_DAYS }))
          : reportFailure('not-accepted', t('reports.export.notAccepted'));
      case 405:
        return reportFailure('not-accepted', t('reports.export.notAccepted'));
      default:
        return reportFailure('server-unavailable', t('reports.export.serverBusy'));
    }
  }

  const answer = data as { pdf_url?: unknown; expires_in?: unknown; document?: ReportPdfDocument };
  const pdfUrl = acceptSignedUrl(fixInternalUrl(typeof answer.pdf_url === 'string' ? answer.pdf_url : ''));
  if (!pdfUrl) return reportFailure('insecure-link', insecureDownloadError());

  return {
    success: true,
    pdfUrl,
    expiresIn: typeof answer.expires_in === 'number' ? answer.expires_in : undefined,
    document: answer.document,
  };
}
