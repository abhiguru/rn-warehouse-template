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
 * is still shared, once the person has read a notice that says how many of the
 * rows it holds (the notice is waited for; the share sheet follows it).
 *
 * The PDF follows the screen's choices the server can apply (the request's
 * filter fields: Payment, Invoicing, Stock age, the item search). What it cannot
 * apply is said before anything is shared, never left to be found in the PDF:
 * - a search the server does not apply (`unappliedSearch`, every searchable
 *   screen but the item stock summary): "Share the full report?" first; Cancel
 *   or closing the dialog asks for nothing;
 * - a server older than a filter field refuses the request
 *   ('filter-unsupported'): the person is asked whether to share the full
 *   report instead, and only then is it asked for again without the filters.
 * `busy` stays true, and a second tap is ignored, while a dialog waits.
 *
 * `available` turns false once the facility's server has answered that it has
 * no generate-report-pdf (a backend older than the release with migrations
 * 52-53), so the screen can hide its export action instead of failing on every
 * tap. That answer is remembered per facility, by its origin and its instance
 * (`facilityKey`, as the item list's sort is), in a module-level Set, in memory
 * only: an instance that replaces another at the same origin is asked afresh.
 * A later successful export does not clear it within a run: once it is set the
 * action is hidden, and an export with a fallback goes straight to the fallback
 * (see `makePdf`), so no report PDF request reaches that instance again. Only a
 * relaunch of the app empties the Set, and a facility that updates its server
 * without changing its instance is offered the export again then.
 *
 * The file is named after the customer as the function names it in its answer
 * (`document.customer`, the name printed in the PDF), else as the screen does.
 *
 * A screen whose report the facility could already share before
 * generate-report-pdf (one customer's stock summary, generate-customer-stock-pdf)
 * passes that older export as `fallback`. On a server without the new function
 * the fallback makes the PDF instead: no "server needs an update" alert, and that
 * action stays `available`; actions without a fallback are still left out.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t } from '@/i18n';
import {
  generateReportPDF,
  isPeriodReport,
  REPORT_PDF_FILTER_FIELDS,
  withoutReportFilters,
  type ReportPdfDocument,
  type ReportPdfRequest,
} from '@/services/pdf-service';
import { facilityKey } from '@/services/stock-service';
import { askAlert, showAlert } from '@/utils/alert';
import { formatNumber } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { reportById } from './reportRegistry';

const log = createLogger('reportExport');

// ---------------------------------------------------------------------------
// Facilities without generate-report-pdf, for this run of the app.
// ---------------------------------------------------------------------------

const outdatedFacilities = new Set<string>();
const listeners = new Set<() => void>();

/** The facility in use, by origin and instance; '' when it cannot be told. */
function currentFacility(): string {
  try {
    return facilityKey();
  } catch {
    return '';
  }
}

function noteFacility(facility: string, outdated: boolean): void {
  if (outdated === outdatedFacilities.has(facility)) return;
  if (outdated) outdatedFacilities.add(facility);
  else outdatedFacilities.delete(facility);
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const exportAvailable = () => !outdatedFacilities.has(currentFacility());

/** For tests: forget every facility remembered as outdated, as an app restart does. */
export function resetReportExportAvailability(): void {
  outdatedFacilities.clear();
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
  /**
   * The customer's name as the screen shows it, which is the facility's (useReportScope) and
   * never a route's; not used at the all-customers level.
   */
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

/**
 * The names for the file of a PDF that was made: the customer as the function
 * named it in its answer when that gives the file name a part, else as the
 * screen names it. (A fallback PDF comes with no answer of this kind.)
 */
function namePartsOf(document: ReportPdfDocument | undefined, parts: ReportExportNameParts = {}): ReportExportNameParts {
  return reportFilenamePart(document?.customer) ? { ...parts, customerName: document?.customer } : parts;
}

// ---------------------------------------------------------------------------
// Making the PDF
// ---------------------------------------------------------------------------

/** A made PDF: its signed link, and what the server says it holds (none from a fallback). */
interface MadePdf {
  pdfUrl: string;
  document?: ReportPdfDocument;
}

/** The server cannot apply the request's filters: nothing was made, and nothing has been shown yet. */
const FILTERS_REFUSED = 'filters-refused';

/**
 * The PDF made, or undefined after the failure has been shown, or
 * FILTERS_REFUSED (when `askOnFilters`) for a server older than a filter field
 * the request carries, so the caller can ask the person.
 * On a facility known to lack generate-report-pdf an export with a fallback goes
 * straight to it; a facility that answers so now is remembered (actions without a
 * fallback are then left out) and the fallback is asked instead.
 */
async function makePdf(
  request: ReportPdfRequest,
  facility: string,
  fallback: (() => Promise<ReportExportFallbackResult>) | undefined,
  askOnFilters: boolean
): Promise<MadePdf | typeof FILTERS_REFUSED | undefined> {
  if (fallback && outdatedFacilities.has(facility)) return fallbackPdf(request, fallback);
  const result = await generateReportPDF(request);
  if (result.success && result.pdfUrl) {
    noteFacility(facility, false);
    return { pdfUrl: result.pdfUrl, document: result.document };
  }
  // The reason only: never the customer, the URL or the server's text.
  log.warn('Report PDF not created', { report: request.report, reason: result.reason });
  if (result.reason === 'filter-unsupported' && askOnFilters) return FILTERS_REFUSED;
  if (result.reason === 'server-outdated') {
    noteFacility(facility, true);
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

/** A PDF the server cut short: say how many of the rows it holds, and wait for OK before the share sheet. */
async function noteTruncated(document: ReportPdfDocument | undefined): Promise<void> {
  if (!document?.truncated) return;
  await askAlert(
    t('reports.export.sharePdf'),
    t('reports.export.truncated', { shown: formatNumber(document.rows_count), total: formatNumber(document.rows_total) }),
    [{ text: t('common.ok'), value: undefined }],
    undefined
  );
}

/** A search shown in a sentence: at most 40 characters, then "…". */
const QUOTED_SEARCH_MAX = 40;
function quotedSearch(query: string): string {
  const characters = Array.from(query.trim());
  return characters.length > QUOTED_SEARCH_MAX ? `${characters.slice(0, QUOTED_SEARCH_MAX).join('').trimEnd()}…` : characters.join('');
}

/** The question before a PDF that will not follow the screen: its title, the message and the button that agrees. */
interface ShareQuestion {
  title: string;
  message: string;
  agree: string;
}

/** "Share the full report?" with Cancel and "Share full report": the PDF will hold all the period, or all the stock. */
const fullReportQuestion = (message: string): ShareQuestion => ({
  title: t('reports.export.fullReportTitle'),
  message,
  agree: t('reports.export.shareFullReport'),
});

/** Asks the question with Cancel and its agree button; true only for the latter. Closing the dialog is Cancel. */
const agreeToShare = ({ title, message, agree }: ShareQuestion): Promise<boolean> =>
  askAlert(
    title,
    message,
    [
      { text: t('common.cancel'), style: 'cancel', value: false },
      { text: agree, value: true },
    ],
    false
  );

/** True when the request keeps a filter of the screen that the PDF applies (Payment, Invoicing, Stock age). */
const keepsAFilter = (request: ReportPdfRequest): boolean =>
  REPORT_PDF_FILTER_FIELDS.some(field => field !== 'search' && request[field] != null);

/**
 * The search the PDF will not apply, said before the export. Without another filter the PDF holds the whole
 * period, or all the stock ("Share the full report?"); with one it keeps that filter, so the question is to
 * share without the search ("Share without the search?").
 */
function searchNotAppliedQuestion(request: ReportPdfRequest, search: UnappliedSearch): ShareQuestion {
  const values = { count: formatNumber(search.count), query: quotedSearch(search.query) };
  const period = isPeriodReport(request.report);
  if (keepsAFilter(request)) {
    return {
      title: t('reports.export.withoutSearchTitle'),
      message: period
        ? t('reports.export.searchNotAppliedFiltered', values)
        : t('reports.export.searchNotAppliedFilteredStock', values),
      agree: t('reports.export.shareWithoutSearch'),
    };
  }
  return fullReportQuestion(
    period ? t('reports.export.searchNotApplied', values) : t('reports.export.searchNotAppliedStock', values)
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
  /**
   * The search on screen that the PDF will not apply, read at the tap: what was
   * typed and how many rows it leaves; null or undefined when there is none. The
   * person is then asked to share the full report first, or, when the request
   * keeps a filter, to share without the search.
   */
  unappliedSearch?: () => UnappliedSearch | null | undefined;
}

/** A search the screen applies and the PDF does not. */
export interface UnappliedSearch {
  /** As typed. */
  query: string;
  /** The rows on screen that the search leaves. */
  count: number;
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
    const { buildRequest, fallback, unappliedSearch } = latest.current;
    const request = buildRequest();
    if (!request) return;
    // Running, and busy, through every dialog below: a second tap meanwhile is ignored.
    running.current = true;
    setBusy(true);
    const facility = currentFacility();
    try {
      // A search the PDF will not apply: the person agrees to the full report before anything is asked for.
      const search = unappliedSearch?.();
      if (search && search.query.trim() && !(await agreeToShare(searchNotAppliedQuestion(request, search)))) return;
      let made = await makePdf(request, facility, fallback, true);
      // The server cannot apply a filter: the full report only if the person agrees, never on its own.
      if (made === FILTERS_REFUSED) {
        if (!(await agreeToShare(fullReportQuestion(t('reports.export.filterNeedsUpdate'))))) return;
        made = await makePdf(withoutReportFilters(request), facility, fallback, false);
      }
      if (!made || made === FILTERS_REFUSED) return;
      const filename = reportPdfFilename(request, namePartsOf(made.document, latest.current.filenameParts?.()));
      await noteTruncated(made.document);
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
