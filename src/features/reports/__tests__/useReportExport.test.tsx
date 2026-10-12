/**
 * useReportExport: busy from the tap until the share has finished, a second tap
 * ignored, the file name in any script, failures shown with showAlert in the
 * app's words, and the export offered no longer once the server has said it has
 * no generate-report-pdf.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { setLanguage, t } from '@/i18n';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { showAlert } from '@/utils/alert';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import type { ReportPdfRequest } from '@/services/pdf-service';
import {
  reportPdfFilename,
  resetReportExportAvailability,
  useReportExport,
  type ReportExport,
  type ReportExportFallbackResult,
  type ReportExportNameParts,
} from '../useReportExport';

let mockConfigUrl = 'https://warehouse.example.test';
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: mockConfigUrl }),
  createAuthenticatedFetch: () => (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const CUSTOMER_ID = '1275b249-2831-11ed-ba24-525400024271';
const CUSTOMER_NAME = 'Fictional Traders';
const SIGNED_URL =
  'https://warehouse.example.test/storage/v1/object/sign/documents/report/x.pdf?token=fictional-private-link';

const periodRequest: ReportPdfRequest = {
  report: 'grn-activity',
  customer_id: CUSTOMER_ID,
  from: '2026-09-01',
  to: '2026-09-30',
  sort: { field: 'date', order: 'desc' },
};

const answer = (status: number, body: unknown, contentType = 'application/json') =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
  }) as any;
const success = () => answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 });
const oldServer = () => answer(404, 'Function not found', 'text/plain');

const originalFetch = global.fetch;
let logs: jest.SpyInstance[];
const mounted: TestRenderer.ReactTestRenderer[] = [];
beforeEach(() => {
  mockConfigUrl = 'https://warehouse.example.test';
  resetReportExportAvailability();
  jest.mocked(getAuthTokenString).mockResolvedValue('fictional-access-credential');
  jest.mocked(showAlert).mockClear();
  jest.mocked(downloadAndSharePDF).mockReset().mockResolvedValue({ success: true });
  global.fetch = jest.fn();
  logs = ['log', 'info', 'warn', 'error', 'debug'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(renderer => renderer.unmount()));
  logs.forEach(log => log.mockRestore());
  global.fetch = originalFetch;
});

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function setup(
  request: ReportPdfRequest | null = periodRequest,
  parts: ReportExportNameParts = { title: 'GRN activity', customerName: CUSTOMER_NAME },
  fallback?: () => Promise<ReportExportFallbackResult>
) {
  let latest!: ReportExport;
  function Probe() {
    latest = useReportExport({ buildRequest: () => request, filenameParts: () => parts, fallback });
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  mounted.push(renderer);
  return {
    current: () => latest,
    tap: () => act(async () => { void latest.exportPdf(); await settle(); }),
    run: () => act(async () => { await latest.exportPdf(); }),
  };
}

/** A fetch that answers only when the test says so. */
function heldFetch() {
  let release!: (response: unknown) => void;
  jest.mocked(fetch).mockImplementation(() => new Promise(resolve => { release = resolve; }) as any);
  return (response: unknown) => act(async () => { release(response); await settle(); await settle(); });
}

describe('busy', () => {
  it('is true from the tap until the share has finished', async () => {
    const release = heldFetch();
    let finishShare!: (value: { success: boolean }) => void;
    jest.mocked(downloadAndSharePDF).mockImplementation(() => new Promise(resolve => { finishShare = resolve; }));
    const probe = setup();
    expect(probe.current().busy).toBe(false);

    await probe.tap();
    expect(probe.current().busy).toBe(true);

    await release(success());
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(probe.current().busy).toBe(true);

    await act(async () => { finishShare({ success: true }); await settle(); });
    expect(probe.current().busy).toBe(false);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first export runs', async () => {
    const release = heldFetch();
    const probe = setup();
    await probe.tap();
    await probe.tap();
    expect(fetch).toHaveBeenCalledTimes(1);
    await release(success());
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(probe.current().busy).toBe(false);

    // Once finished, a new tap exports again.
    jest.mocked(fetch).mockResolvedValue(success());
    await probe.run();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does nothing while the screen has no request to export', async () => {
    const probe = setup(null);
    await probe.run();
    expect(fetch).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(false);
  });
});

describe('share', () => {
  it('shares the signed link under the report file name', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup();
    await probe.run();
    expect(downloadAndSharePDF).toHaveBeenCalledWith(
      SIGNED_URL,
      'GRN_activity_Fictional_Traders_2026_09_01_to_2026_09_30.pdf'
    );
  });

  it("shows the share helper's own reason when it gives one", async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: false, error: t('errors.pdf.sharingUnavailable') });
    const probe = setup();
    await probe.run();
    expect(showAlert).toHaveBeenCalledWith("Couldn't share the PDF", 'Sharing is not available on this device');
    expect(probe.current().busy).toBe(false);
  });

  it('shows the connection words when the share helper gives no reason', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: false });
    const probe = setup();
    await probe.run();
    expect(showAlert).toHaveBeenCalledWith("Couldn't share the PDF", 'Check your connection and try again.');
    expect(probe.current().busy).toBe(false);
  });

  it.each([
    ['a native error', 'Network request failed'],
    ['the gated fetch', 'Session changed'],
    ['a download with an HTTP status', 'Failed to download PDF (status: 500)'],
  ])("shows the connection words, never the text of %s", async (_from, raw) => {
    jest.mocked(fetch).mockResolvedValue(success());
    jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: false, error: raw });
    const probe = setup();
    await probe.run();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith("Couldn't share the PDF", 'Check your connection and try again.');
  });

  it("keeps the share helper's own reasons in the app's language", async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup();
    for (const reason of [t('errors.pdf.tooLarge'), t('errors.network.noInternet')]) {
      jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: false, error: reason });
      await probe.run();
      expect(showAlert).toHaveBeenLastCalledWith("Couldn't share the PDF", reason);
    }
  });
});

describe('a PDF the server cut short', () => {
  const cutShort = (truncated: boolean) =>
    answer(200, {
      success: true,
      pdf_url: SIGNED_URL,
      expires_in: 3600,
      document: { type: 'report', report: 'grn-activity', rows_count: 5000, rows_total: 12345, truncated, sort: { field: 'date', order: 'desc' } },
    });

  it('says how many rows it holds, then shares it all the same', async () => {
    jest.mocked(fetch).mockResolvedValue(cutShort(true));
    const order: string[] = [];
    jest.mocked(showAlert).mockImplementation(() => void order.push('notice'));
    jest.mocked(downloadAndSharePDF).mockImplementation(async () => {
      order.push('share');
      return { success: true };
    });
    const probe = setup();
    await probe.run();
    expect(showAlert).toHaveBeenCalledWith('Share PDF', 'This PDF shows the first 5,000 of 12,345 rows.');
    expect(order).toEqual(['notice', 'share']);
    expect(downloadAndSharePDF).toHaveBeenCalledWith(SIGNED_URL, 'GRN_activity_Fictional_Traders_2026_09_01_to_2026_09_30.pdf');
    expect(probe.current().busy).toBe(false);
  });

  it('says it in Gujarati', async () => {
    jest.mocked(fetch).mockResolvedValue(cutShort(true));
    setLanguage('gu');
    try {
      await setup().run();
      expect(showAlert).toHaveBeenCalledWith('PDF શેર કરો', 'આ PDFમાં ૧૨,૩૪૫માંથી પહેલી ૫,૦૦૦ હરોળ જ છે.');
    } finally {
      setLanguage('en');
    }
  });

  it('says nothing for a whole PDF', async () => {
    jest.mocked(fetch).mockResolvedValue(cutShort(false));
    await setup().run();
    expect(showAlert).not.toHaveBeenCalled();
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
  });
});

describe('the file name', () => {
  it('keeps an English title and customer, and the period', () => {
    expect(reportPdfFilename(periodRequest, { title: 'GRN activity', customerName: 'Patel & Sons, Ltd.' })).toBe(
      'GRN_activity_Patel_Sons_Ltd_2026_09_01_to_2026_09_30.pdf'
    );
  });

  it('keeps a Gujarati title and customer name with their vowel signs', () => {
    expect(reportPdfFilename(periodRequest, { title: 'આવકની કામગીરી', customerName: 'રમેશ ટ્રેડર્સ' })).toBe(
      'આવકની_કામગીરી_રમેશ_ટ્રેડર્સ_2026_09_01_to_2026_09_30.pdf'
    );
  });

  it('uses the start of the customer id for a name with no letter or digit', () => {
    expect(reportPdfFilename({ report: 'stock-summary', customer_id: CUSTOMER_ID }, { title: 'Stock summary', customerName: ' — ' })).toBe(
      'Stock_summary_1275b249.pdf'
    );
    expect(reportPdfFilename({ report: 'stock-summary', customer_id: CUSTOMER_ID }, { title: 'Stock summary' })).toBe(
      'Stock_summary_1275b249.pdf'
    );
  });

  it("has no dates for a stock report, all customers for every customer, and the report's own title by default", () => {
    expect(reportPdfFilename({ report: 'stock-aging' })).toBe('Stock_aging_All_customers.pdf');
    expect(reportPdfFilename({ report: 'item-stock-summary' }, { title: '***' })).toBe('item_stock_summary_All_customers.pdf');
  });

  it('names every customer in Gujarati in a Gujarati file name', () => {
    setLanguage('gu');
    try {
      expect(reportPdfFilename({ report: 'stock-aging' }, { title: 'માલ કેટલા દિવસથી પડ્યો છે' })).toBe('માલ_કેટલા_દિવસથી_પડ્યો_છે_બધા_વેપારી.pdf');
    } finally {
      setLanguage('en');
    }
  });
});

describe('failure', () => {
  it.each([
    [403, 'This report is not available to your account as a PDF.'],
    [404, 'This customer is not available. Choose another customer and try again.'],
    [503, "The server couldn't make the PDF right now. Try again in a moment."],
  ])('shows the words for %i and ends busy', async (status, text) => {
    jest.mocked(fetch).mockResolvedValue(answer(status, { success: false, error: 'server words' }));
    const probe = setup();
    await probe.run();
    expect(showAlert).toHaveBeenCalledWith("Couldn't create the PDF", text);
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(false);
    expect(probe.current().available).toBe(true);
  });

  it('shows the connection words when no answer came', async () => {
    jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
    const probe = setup();
    await probe.run();
    expect(showAlert).toHaveBeenCalledWith("Couldn't create the PDF", 'Check your connection and try again.');
    expect(probe.current().busy).toBe(false);
  });

  it('logs neither the customer nor the link', async () => {
    jest.mocked(fetch).mockResolvedValue(answer(403, { success: false, error: `Refused for ${CUSTOMER_NAME}` }));
    const probe = setup();
    await probe.run();
    const logged = JSON.stringify(logs.flatMap(log => log.mock.calls));
    // The failure is logged (its report and reason), so the checks below look at real output.
    expect(logged).toContain('grn-activity');
    expect(logged).not.toContain(CUSTOMER_NAME);
    expect(logged).not.toContain(CUSTOMER_ID);
    expect(logged).not.toContain('fictional-private-link');
  });
});

describe('available', () => {
  it('turns false after the server answers that it has no report PDFs, on every screen', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    const probe = setup();
    const other = setup({ report: 'stock-summary' });
    expect(probe.current().available).toBe(true);

    await probe.run();
    expect(showAlert).toHaveBeenCalledWith(
      "Couldn't create the PDF",
      "This facility's server needs an update before reports can be shared as PDF."
    );
    expect(probe.current().available).toBe(false);
    expect(other.current().available).toBe(false);
    expect(probe.current().busy).toBe(false);
  });

  it('is remembered for that facility server only', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    await setup().run();
    mockConfigUrl = 'https://other-facility.example.test';
    expect(setup().current().available).toBe(true);
  });

  it('comes back when an export to that server succeeds', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    const probe = setup();
    await probe.run();
    expect(probe.current().available).toBe(false);
    jest.mocked(fetch).mockResolvedValue(success());
    await probe.run();
    expect(probe.current().available).toBe(true);
  });
});

describe('fallback', () => {
  const stockRequest: ReportPdfRequest = { report: 'stock-summary', customer_id: CUSTOMER_ID };
  const stockParts: ReportExportNameParts = { title: 'Stock summary', customerName: CUSTOMER_NAME };
  const OLD_URL = 'https://warehouse.example.test/storage/v1/object/sign/documents/stock/old.pdf?token=fictional';

  it('makes the PDF with the fallback on a server without report PDFs, with no alert, and stays available', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    const fallback = jest.fn().mockResolvedValue({ success: true, pdfUrl: OLD_URL });
    const probe = setup(stockRequest, stockParts, fallback);
    const withoutFallback = setup();

    await probe.run();
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledWith(OLD_URL, 'Stock_summary_Fictional_Traders.pdf');
    expect(showAlert).not.toHaveBeenCalled();
    expect(probe.current().available).toBe(true);
    // The server is remembered: an export without a fallback is left out.
    expect(withoutFallback.current().available).toBe(false);
    expect(probe.current().busy).toBe(false);
  });

  it('goes straight to the fallback once the server is known to lack report PDFs', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    await setup().run();
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.mocked(showAlert).mockClear();

    const fallback = jest.fn().mockResolvedValue({ success: true, pdfUrl: OLD_URL });
    const probe = setup(stockRequest, stockParts, fallback);
    expect(probe.current().available).toBe(true);
    await probe.run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledWith(OLD_URL, 'Stock_summary_Fictional_Traders.pdf');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('is not used on a server that makes report PDFs, nor for its other failures', async () => {
    const fallback = jest.fn().mockResolvedValue({ success: true, pdfUrl: OLD_URL });
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup(stockRequest, stockParts, fallback);
    await probe.run();
    expect(downloadAndSharePDF).toHaveBeenCalledWith(SIGNED_URL, 'Stock_summary_Fictional_Traders.pdf');

    jest.mocked(fetch).mockResolvedValue(answer(403, { success: false }));
    await probe.run();
    expect(showAlert).toHaveBeenCalledWith("Couldn't create the PDF", 'This report is not available to your account as a PDF.');
    expect(fallback).not.toHaveBeenCalled();
  });

  it("shows the connection words when the fallback fails, never the server's text", async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    const fallback = jest.fn().mockResolvedValue({ success: false, error: 'server words' });
    const probe = setup(stockRequest, stockParts, fallback);
    await probe.run();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith("Couldn't create the PDF", 'Check your connection and try again.');
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(probe.current().available).toBe(true);
    expect(probe.current().busy).toBe(false);
  });
});
