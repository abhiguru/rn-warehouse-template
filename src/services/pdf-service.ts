import { createAuthenticatedFetch, getCurrentConfig } from '../config/supabaseConfig';
import { discardBody } from '../config/discardBody';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { getLanguage, t, type AppLanguage } from '@/i18n';
import { serverText, upgradingBody } from '@/utils/serverText';

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
      discardBody(response);
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(upgradingBody(data) ?? data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
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
      discardBody(response);
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(upgradingBody(data) ?? data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
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
      discardBody(response);
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(upgradingBody(data) ?? data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
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
      discardBody(response);
      return {
        success: false,
        error: t('errors.pdf.serviceUnavailable', { status: String(response.status) }),
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: serverText(upgradingBody(data) ?? data.error, t('errors.pdf.generateFailedStatus', { status: String(response.status) })),
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
/** The GRNs a GRN activity PDF is narrowed to: those invoiced, or those not yet invoiced. */
export type ReportPdfInvoicing = 'invoiced' | 'not_invoiced';
/** The stock age a stock aging PDF is narrowed to, in days (the app's AgingBucketId). */
export type ReportPdfBucket = '0-120' | '121-240' | '241-364' | 'over-364';

const INVOICING_VALUES: readonly string[] = ['invoiced', 'not_invoiced'];
const BUCKET_VALUES: readonly string[] = ['0-120', '121-240', '241-364', 'over-364'];
/** The longest search an item stock PDF is narrowed to (backend report-request.ts). */
export const REPORT_PDF_SEARCH_MAX_LENGTH = 80;

// Control characters (C0, DEL and C1), which the server refuses in a search.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * The search as an item stock PDF request carries it: trimmed, 1 to 80
 * characters (UTF-16 units, as the server counts), without control characters;
 * undefined for one the server would refuse (the screen then says the PDF is of
 * every item).
 */
export function reportPdfSearch(text: string | null | undefined): string | undefined {
  if (typeof text !== 'string') return undefined;
  const search = text.trim();
  if (!search || search.length > REPORT_PDF_SEARCH_MAX_LENGTH || CONTROL_CHARACTER.test(search)) return undefined;
  return search;
}

/**
 * The request fields that narrow a report PDF to what the screen shows. A server
 * older than a field refuses the whole request ('filter-unsupported').
 */
export const REPORT_PDF_FILTER_FIELDS = ['status', 'invoicing', 'bucket', 'search'] as const;

interface ReportPdfRequestBase {
  /** One customer's report; absent or null = the all-customers level. */
  customer_id?: string | null;
  sort?: ReportPdfSort;
  /**
   * Only the invoices with this payment status. The server accepts it with
   * `report: 'invoice-history'` and a `customer_id` only; the body leaves it out
   * for anything else. A server that predates it refuses the field, and then no PDF is made at all
   * (see generateReportPDF): a filtered export never becomes an unfiltered one.
   */
  status?: ReportPdfStatus;
  /** Only the GRNs invoiced or not yet invoiced: sent with `report: 'grn-activity'` and a `customer_id` only. */
  invoicing?: ReportPdfInvoicing;
  /** Only the stock of this age: sent with `report: 'stock-aging'` and a `customer_id` only. */
  bucket?: ReportPdfBucket;
  /** Only the items this search finds: sent with `report: 'item-stock-summary'` only, as `reportPdfSearch` gives it. */
  search?: string;
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
 * `filter-unsupported`: the backend has it but not a filter field the request
 * carries (`REPORT_PDF_FILTER_FIELDS`), so it cannot make the narrowed PDF;
 * nothing is made (the full report is not what the screen asked for: the export
 * asks the person first, useReportExport), and the server is not outdated for
 * the exports without a filter.
 */
export type ReportPdfFailure =
  | 'session'
  | 'network'
  | 'server-outdated'
  | 'forbidden'
  | 'customer-unavailable'
  | 'period-too-long'
  | 'not-accepted'
  | 'filter-unsupported'
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

/** The request without the fields that narrow it: the full report the screen's period, customer and sort give. */
export function withoutReportFilters(request: ReportPdfRequest): ReportPdfRequest {
  const rest: Record<string, unknown> = { ...request };
  for (const field of REPORT_PDF_FILTER_FIELDS) delete rest[field];
  return rest as unknown as ReportPdfRequest;
}

/**
 * The JSON body sent for a request: only the contract's fields, dates only for a
 * period report, and each filter only where the server accepts it (any other is
 * left out, as the server would refuse the request).
 */
export function reportPdfRequestBody(request: ReportPdfRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { report: request.report };
  if (typeof request.customer_id === 'string' && request.customer_id) body.customer_id = request.customer_id;
  // Accepted only for one customer's invoice history; the server refuses it anywhere else.
  if (request.report === 'invoice-history' && body.customer_id && (request.status === 'paid' || request.status === 'pending')) {
    body.status = request.status;
  }
  // Accepted only for one customer's GRN activity.
  if (request.report === 'grn-activity' && body.customer_id && typeof request.invoicing === 'string' && INVOICING_VALUES.includes(request.invoicing)) {
    body.invoicing = request.invoicing;
  }
  // Accepted only for one customer's stock aging.
  if (request.report === 'stock-aging' && body.customer_id && typeof request.bucket === 'string' && BUCKET_VALUES.includes(request.bucket)) {
    body.bucket = request.bucket;
  }
  // Accepted only for the item stock summary, at either level.
  const search = request.report === 'item-stock-summary' ? reportPdfSearch(request.search) : undefined;
  if (search) body.search = search;
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

/** What a server that predates a filter field answers (HTTP 400) to a request that carries it. It is the only message read. */
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
  if (!contentType || !contentType.includes('application/json')) {
    discardBody(response);
    return null;
  }
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
 * A request with a filter field (`status`, `invoicing`, `bucket` or `search`)
 * that the server answers with HTTP 400 "Unknown field in report request" is a
 * failure with the reason `filter-unsupported`: the server is older than the
 * field and cannot filter. It is asked once and never again here without the
 * filter, because the full report is not the PDF that was asked for; the export
 * asks the person whether to share the full report instead. That server is not
 * outdated: a request without a filter is made as usual. Any other 400, and the
 * same message to a request without a filter, are failures as above.
 *
 * Nothing is logged: no request, customer, link or server text
 * (src/services/__tests__/reportPdf.test.ts).
 */
export async function generateReportPDF(request: ReportPdfRequest): Promise<ReportPdfResult> {
  const authToken = await getAuthToken();
  if (!authToken) return reportFailure('session', t('errors.auth.loginAgain'));

  const body = reportPdfRequestBody(request);
  const response = await postReportPdf(authToken, body);
  // No answer: offline, timed out, or the session changed while waiting.
  if (!response) return reportFailure('network', t('common.checkConnection'));
  const data = await readReportPdfAnswer(response);

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
        // A server older than a filter field cannot filter. The request is not made again here without
        // the filter: that would share the full report, as if nothing had been chosen.
        if (REPORT_PDF_FILTER_FIELDS.some(field => field in body) && data.error === UNKNOWN_FIELD_MESSAGE) {
          return reportFailure('filter-unsupported', t('reports.export.filterNeedsUpdate'));
        }
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
