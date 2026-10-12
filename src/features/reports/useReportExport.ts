/**
 * Export the report a screen shows as a PDF (backend generate-report-pdf) and
 * hand it to the share sheet.
 *
 * The screen gives two functions, read at the moment of the tap: one builds the
 * request for what it shows now (report, customer, resolved period, sort), one
 * gives the names for the file. `exportPdf` generates, downloads and shares;
 * `busy` is true from the tap until that has finished, and a tap while busy is
 * ignored. A failure is shown with showAlert in the app's words: a reason the
 * share helper gave in the app's language is shown as it is, anything else (a
 * native error's text such as "Network request failed") as "Check your
 * connection and try again." A PDF the server cut short (`document.truncated`)
 * is still shared, after a notice that says how many of the rows it holds.
 *
 * `available` turns false once the facility's server has answered that it has
 * no generate-report-pdf (a backend older than the release with migrations
 * 52-53), so the screen can hide its export action instead of failing on every
 * tap. That answer is remembered per facility server in memory only: it lasts
 * until the app is restarted (or until an export to that server succeeds), so
 * a facility that updates its server is offered the export again after a restart.
 *
 * A screen whose report the facility could already share before
 * generate-report-pdf (one customer's stock summary, generate-customer-stock-pdf)
 * passes that older export as `fallback`. On a server without the new function
 * the fallback makes the PDF instead: no "server needs an update" alert, and that
 * action stays `available`; actions without a fallback are still left out.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCurrentConfig } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { generateReportPDF, isPeriodReport, type ReportPdfDocument, type ReportPdfRequest } from '@/services/pdf-service';
import { showAlert } from '@/utils/alert';
import { formatNumber } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { reportById } from './reportRegistry';

const log = createLogger('reportExport');

// ---------------------------------------------------------------------------
// Servers without generate-report-pdf, for this run of the app.
// ---------------------------------------------------------------------------

const outdatedServers = new Set<string>();
const listeners = new Set<() => void>();

function currentServer(): string {
  try {
    return getCurrentConfig().url;
  } catch {
    return '';
  }
}

function noteServer(server: string, outdated: boolean): void {
  if (outdated === outdatedServers.has(server)) return;
  if (outdated) outdatedServers.add(server);
  else outdatedServers.delete(server);
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const exportAvailable = () => !outdatedServers.has(currentServer());

/** For tests: forget every server remembered as outdated, as an app restart does. */
export function resetReportExportAvailability(): void {
  outdatedServers.clear();
  listeners.forEach(listener => listener());
}

// ---------------------------------------------------------------------------
// The file name
// ---------------------------------------------------------------------------

// Everything that is not a letter, a combining mark (Gujarati vowel signs are
// marks) or a digit, in any script. An engine without Unicode property escapes
// gets white space and ASCII punctuation instead (other scripts are kept whole).
const NOT_LETTER_OR_DIGIT: RegExp = (() => {
  try {
    return new RegExp('[^\\p{L}\\p{M}\\p{N}]+', 'gu');
  } catch {
    return /[\s!-/:-@[-`{-~]+/g;
  }
})();

/** One part of the file name: letters and digits kept, every run of anything else one '_', none at the ends. */
export function reportFilenamePart(text: string | null | undefined): string {
  return (typeof text === 'string' ? text : '')
    .replace(NOT_LETTER_OR_DIGIT, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface ReportExportNameParts {
  /** The report's title as the screen shows it; the report's own title when absent. */
  title?: string;
  /** The customer's name as the screen shows it; not used at the all-customers level. */
  customerName?: string | null;
}

/**
 * `<ReportTitle>_<customer or All customers>_<from>_to_<to>.pdf`, without the
 * dates for a report that has no period; "All customers" is in the app's
 * language. A title that has no letter or digit left becomes the report's id; a
 * customer name that has none becomes the first 8 characters of the customer
 * id, so a name in any script never leaves an empty part.
 */
export function reportPdfFilename(request: ReportPdfRequest, parts: ReportExportNameParts = {}): string {
  const title =
    reportFilenamePart(parts.title ?? reportById(request.report)?.title) || reportFilenamePart(request.report);
  const customerId = typeof request.customer_id === 'string' ? request.customer_id : '';
  const customer = customerId
    ? reportFilenamePart(parts.customerName) || reportFilenamePart(customerId.slice(0, 8))
    : reportFilenamePart(t('reports.shared.allCustomers')) || 'All';
  const pieces = [title, customer];
  if (isPeriodReport(request.report)) {
    pieces.push(reportFilenamePart(request.from), 'to', reportFilenamePart(request.to));
  }
  return `${pieces.join('_')}.pdf`;
}

// ---------------------------------------------------------------------------
// Making the PDF
// ---------------------------------------------------------------------------

/** A made PDF: its signed link, and what the server says it holds (none from a fallback). */
interface MadePdf {
  pdfUrl: string;
  document?: ReportPdfDocument;
}

/**
 * The PDF made, or undefined after the failure has been shown.
 * On a server known to lack generate-report-pdf an export with a fallback goes
 * straight to it; a server that answers so now is remembered (actions without a
 * fallback are then left out) and the fallback is asked instead.
 */
async function makePdf(
  request: ReportPdfRequest,
  server: string,
  fallback: (() => Promise<ReportExportFallbackResult>) | undefined
): Promise<MadePdf | undefined> {
  if (fallback && outdatedServers.has(server)) return fallbackPdf(request, fallback);
  const result = await generateReportPDF(request);
  if (result.success && result.pdfUrl) {
    noteServer(server, false);
    return { pdfUrl: result.pdfUrl, document: result.document };
  }
  // The reason only: never the customer, the URL or the server's text.
  log.warn('Report PDF not created', { report: request.report, reason: result.reason });
  if (result.reason === 'server-outdated') {
    noteServer(server, true);
    if (fallback) return fallbackPdf(request, fallback);
  }
  showAlert(t('reports.export.failedTitle'), result.error ?? t('common.checkConnection'));
  return undefined;
}

async function fallbackPdf(
  request: ReportPdfRequest,
  fallback: () => Promise<ReportExportFallbackResult>
): Promise<MadePdf | undefined> {
  const result = await fallback();
  if (result.success && result.pdfUrl) return { pdfUrl: result.pdfUrl };
  // As the older export always did: its server text is not shown.
  log.warn('Fallback PDF not created', { report: request.report });
  showAlert(t('reports.export.failedTitle'), t('common.checkConnection'));
  return undefined;
}

/**
 * The share helper's reason when it is one the app wrote for people (in the
 * app's language), else "Check your connection and try again.". Its other
 * reasons are a native error's own text ("Network request failed", "Session
 * changed") or carry an HTTP status, which are not for people (§12.1).
 */
function shareFailureText(reason: string | undefined): string {
  const shown = [
    t('errors.pdf.sharingUnavailable'),
    t('errors.pdf.tooLarge'),
    t('errors.pdf.downloadFailed'),
    t('errors.pdf.shareFailed'),
    t('errors.network.noInternet'),
    t('errors.network.notReachable'),
    t('errors.network.requestTimedOut'),
  ];
  return reason && shown.includes(reason) ? reason : t('common.checkConnection');
}

/** A PDF the server cut short: say how many of the rows it holds. The alert does not wait; the share sheet follows. */
function noteTruncated(document: ReportPdfDocument | undefined): void {
  if (!document?.truncated) return;
  showAlert(
    t('reports.export.sharePdf'),
    t('reports.export.truncated', { shown: formatNumber(document.rows_count), total: formatNumber(document.rows_total) })
  );
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface UseReportExportOptions {
  /** The request for what the screen shows now; null when there is nothing to export yet. */
  buildRequest: () => ReportPdfRequest | null;
  /** The names for the file, as the screen shows them. */
  filenameParts?: () => ReportExportNameParts;
  /**
   * The facility's older PDF of the same report, used when its server has no
   * generate-report-pdf. Its answer has the shape of the document PDFs'
   * (`generateCustomerStockPDF`); the file is named as the report's would be.
   */
  fallback?: () => Promise<ReportExportFallbackResult>;
}

/** What a fallback export gives: a signed link to the PDF, or a failure. */
export interface ReportExportFallbackResult {
  success: boolean;
  pdfUrl?: string;
}

export interface ReportExport {
  /** Generate the PDF and open the share sheet. Ignored while an export is running. */
  exportPdf: () => Promise<void>;
  /** True from the tap until the export has finished or failed. */
  busy: boolean;
  /**
   * False once this facility's server has answered that it cannot make report
   * PDFs; always true for an export with a fallback.
   */
  available: boolean;
}

export function useReportExport(options: UseReportExportOptions): ReportExport {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const latest = useRef(options);
  latest.current = options;
  const available = useSyncExternalStore(subscribe, exportAvailable);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const exportPdf = useCallback(async () => {
    if (running.current) return;
    const { buildRequest, fallback } = latest.current;
    const request = buildRequest();
    if (!request) return;
    running.current = true;
    setBusy(true);
    const server = currentServer();
    try {
      const made = await makePdf(request, server, fallback);
      if (!made) return;
      const filename = reportPdfFilename(request, latest.current.filenameParts?.());
      noteTruncated(made.document);
      const shared = await downloadAndSharePDF(made.pdfUrl, filename);
      if (!shared.success) {
        log.warn('Report PDF not shared', { report: request.report });
        showAlert(t('reports.export.shareFailedTitle'), shareFailureText(shared.error));
      }
    } catch {
      log.warn('Report PDF export failed', { report: request.report });
      showAlert(t('reports.export.failedTitle'), t('common.checkConnection'));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { exportPdf, busy, available: available || Boolean(options.fallback) };
}
