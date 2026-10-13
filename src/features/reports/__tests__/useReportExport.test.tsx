/**
 * useReportExport: busy from the tap until the share has finished, a second tap
 * ignored, the file name in any script and with the customer as the function
 * names it, failures shown with showAlert in the app's words, and the export
 * offered no longer once the facility (its origin and instance) has said it has
 * no generate-report-pdf. What the PDF will not follow is said before anything
 * is shared: a search it does not apply, a filter an older server refuses (the
 * full report only with the person's consent), a PDF cut short (waited for).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { setLanguage, t } from '@/i18n';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { showAlert } from '@/utils/alert';
import { alertTexts, dismissLatestAlert, pressAlertButton } from '@/tests/helpers/alertMock';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import type { ReportPdfRequest } from '@/services/pdf-service';
import {
  reportPdfFilename,
  resetReportExportAvailability,
  useReportExport,
  type ReportExport,
  type ReportExportFallbackResult,
  type ReportExportNameParts,
  type UseReportExportOptions,
} from '../useReportExport';

// The facility in use: the requests go to its origin, and what it cannot do is remembered
// under its origin and its instance.
const FACILITY = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
let mockFacility = FACILITY;
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: mockFacility.origin }),
  createAuthenticatedFetch: () => (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockFacility }));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));
// askAlert draws through the stand-in showAlert: a dialog the export waits on is answered by pressing its button.
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
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
  mockFacility = FACILITY;
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
  fallback?: () => Promise<ReportExportFallbackResult>,
  unappliedSearch?: UseReportExportOptions['unappliedSearch']
) {
  let latest!: ReportExport;
  function Probe() {
    latest = useReportExport({ buildRequest: () => request, filenameParts: () => parts, fallback, unappliedSearch });
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

/** Presses a button of the dialog the export waits on, and lets the export go on. */
const press = (text: string) => act(async () => { pressAlertButton(showAlert as jest.Mock, text); await settle(); await settle(); });
/** Closes the dialog the export waits on without a button. */
const dismiss = () => act(async () => { dismissLatestAlert(showAlert as jest.Mock); await settle(); await settle(); });
const dialogs = () => alertTexts(showAlert as jest.Mock);

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

  it('says how many rows it holds, waits for OK, then shares it all the same', async () => {
    jest.mocked(fetch).mockResolvedValue(cutShort(true));
    const probe = setup();
    await probe.tap();
    expect(dialogs()).toEqual([['Share PDF', 'This PDF shows the first 5,000 of 12,345 rows.']]);
    // The share sheet waits for the notice: a broken export opens it under the notice.
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(true);
    // Busy through the notice: a second tap is ignored.
    await probe.tap();
    expect(fetch).toHaveBeenCalledTimes(1);

    await press('OK');
    expect(downloadAndSharePDF).toHaveBeenCalledWith(SIGNED_URL, 'GRN_activity_Fictional_Traders_2026_09_01_to_2026_09_30.pdf');
    expect(probe.current().busy).toBe(false);
  });

  it('shares it also when the notice is closed without OK', async () => {
    jest.mocked(fetch).mockResolvedValue(cutShort(true));
    const probe = setup();
    await probe.tap();
    await dismiss();
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(probe.current().busy).toBe(false);
  });

  it('says it in Gujarati', async () => {
    jest.mocked(fetch).mockResolvedValue(cutShort(true));
    setLanguage('gu');
    try {
      await setup().tap();
      expect(dialogs()).toEqual([['PDF શેર કરો', 'આ PDFમાં ૧૨,૩૪૫માંથી પહેલી ૫,૦૦૦ લાઇન જ છે.']]);
      await press('ઓકે');
      expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
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

describe("the customer's name in the file name", () => {
  // The function prints the customer's name from its own database and gives it in its answer.
  const made = (customer: unknown, report: ReportPdfRequest['report'] = 'grn-activity') =>
    answer(200, {
      success: true,
      pdf_url: SIGNED_URL,
      expires_in: 3600,
      document: { type: 'report', report, customer, rows_count: 3, rows_total: 3, truncated: false, sort: { field: 'date', order: 'desc' } },
    });
  const sharedAs = () => jest.mocked(downloadAndSharePDF).mock.calls.map(([, filename]) => filename);

  it("is the function's own name for the customer, not the screen's", async () => {
    jest.mocked(fetch).mockResolvedValue(made('Riverbank Produce'));
    await setup(periodRequest, { title: 'GRN activity', customerName: 'Other Company' }).run();
    expect(sharedAs()).toEqual(['GRN_activity_Riverbank_Produce_2026_09_01_to_2026_09_30.pdf']);
  });

  it("is the function's name when the screen holds none, instead of the start of the id", async () => {
    jest.mocked(fetch).mockResolvedValue(made('રમેશ ટ્રેડર્સ'));
    await setup(periodRequest, { title: 'GRN activity', customerName: '' }).run();
    expect(sharedAs()).toEqual(['GRN_activity_રમેશ_ટ્રેડર્સ_2026_09_01_to_2026_09_30.pdf']);
  });

  it.each([
    ['no name', undefined],
    ['an empty name', ''],
    ['a name with no letter or digit', ' — '],
    ['a name that is not text', { name: 'Riverbank Produce' }],
  ])("is the screen's name when the answer has %s", async (_what, customer) => {
    jest.mocked(fetch).mockResolvedValue(made(customer));
    await setup().run();
    expect(sharedAs()).toEqual(['GRN_activity_Fictional_Traders_2026_09_01_to_2026_09_30.pdf']);
  });

  it('is the start of the customer id when neither the answer nor the screen has a name', async () => {
    jest.mocked(fetch).mockResolvedValue(made(undefined));
    await setup(periodRequest, { title: 'GRN activity', customerName: '' }).run();
    expect(sharedAs()).toEqual(['GRN_activity_1275b249_2026_09_01_to_2026_09_30.pdf']);
  });

  it('stays "All customers" for a report of every customer, whatever the answer names', async () => {
    jest.mocked(fetch).mockResolvedValue(made('Riverbank Produce', 'stock-aging'));
    await setup({ report: 'stock-aging' }, { title: 'Stock aging' }).run();
    expect(sharedAs()).toEqual(['Stock_aging_All_customers.pdf']);
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

  it('is remembered for that facility only', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    await setup().run();
    expect(setup().current().available).toBe(false);
    mockFacility = { origin: 'https://other-facility.example.test', instanceId: 'instance-a' };
    expect(setup().current().available).toBe(true);
  });

  it('is offered again when another instance replaces the facility at the same origin', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    await setup().run();
    expect(setup().current().available).toBe(false);

    // The same address now serves an instance that makes report PDFs.
    mockFacility = { origin: FACILITY.origin, instanceId: 'instance-b' };
    jest.mocked(fetch).mockClear();
    jest.mocked(fetch).mockResolvedValue(success());
    const replaced = setup();
    expect(replaced.current().available).toBe(true);
    await replaced.run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(replaced.current().available).toBe(true);

    // What the first instance answered is still remembered for it.
    mockFacility = FACILITY;
    expect(setup().current().available).toBe(false);
  });

  // Only for an export started by calling exportPdf: the screen hides the action while the flag is set,
  // so within a run of the app nothing sends this request (see the comment at the top of the hook).
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

describe("a payment status on one customer's invoice history", () => {
  const invoiceRequest: ReportPdfRequest = {
    report: 'invoice-history',
    customer_id: CUSTOMER_ID,
    from: '2026-09-01',
    to: '2026-09-30',
    sort: { field: 'date', order: 'desc' },
    status: 'pending',
  };
  const parts: ReportExportNameParts = { title: 'Invoice history', customerName: CUSTOMER_NAME };
  const FILE = 'Invoice_history_Fictional_Traders_2026_09_01_to_2026_09_30.pdf';
  const unknownField = () => answer(400, { success: false, error: 'Unknown field in report request' });
  const bodyOf = (call: number) => JSON.parse(jest.mocked(fetch).mock.calls[call][1]!.body as string);

  it('sends the status the screen asked for, and shares the PDF', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup(invoiceRequest, parts);
    await probe.run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toMatchObject({ report: 'invoice-history', customer_id: CUSTOMER_ID, status: 'pending' });
    expect(downloadAndSharePDF).toHaveBeenCalledWith(SIGNED_URL, FILE);
  });

  const FILTER_NEEDS_UPDATE =
    "This facility's server can't apply your filter or search to the PDF yet. You can share the full report, or cancel and ask for a server update.";

  it('on an older server that does not know the field: one request, then the question; Cancel shares nothing and the export stays offered', async () => {
    // A success is queued behind the refusal: nothing may use it without the person's consent.
    jest.mocked(fetch).mockResolvedValueOnce(unknownField()).mockResolvedValueOnce(success());
    const probe = setup(invoiceRequest, parts);
    await probe.tap();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toHaveProperty('status', 'pending');
    expect(dialogs()).toEqual([['Share the full report?', FILTER_NEEDS_UPDATE]]);
    expect(probe.current().busy).toBe(true);
    await press('Cancel');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    // Not taken as a server without report PDFs: the action stays, on this screen and on another.
    expect(probe.current().available).toBe(true);
    expect(setup({ report: 'stock-aging' }).current().available).toBe(true);
    expect(probe.current().busy).toBe(false);
  });

  it('with the consent: asks once more without the status and shares that PDF under the same name', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(unknownField()).mockResolvedValueOnce(success());
    const probe = setup(invoiceRequest, parts);
    await probe.tap();
    await press('Share full report');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).not.toHaveProperty('status');
    expect(bodyOf(1)).toMatchObject({ report: 'invoice-history', customer_id: CUSTOMER_ID, from: '2026-09-01', to: '2026-09-30' });
    expect(jest.mocked(downloadAndSharePDF).mock.calls).toEqual([[SIGNED_URL, FILE]]);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(probe.current().busy).toBe(false);
  });

  it('closing the question shares nothing', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(unknownField()).mockResolvedValueOnce(success());
    const probe = setup(invoiceRequest, parts);
    await probe.tap();
    await dismiss();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(false);
  });

  it('with the consent, a failure of the full report is shown as any failure', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(unknownField()).mockResolvedValueOnce(answer(403, { success: false }));
    const probe = setup(invoiceRequest, parts);
    await probe.tap();
    await press('Share full report');
    expect(dialogs()[1]).toEqual(["Couldn't create the PDF", 'This report is not available to your account as a PDF.']);
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(false);
  });

  it('shares normally at the next tap once the Payment filter is removed: the server is not marked outdated', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(unknownField()).mockResolvedValueOnce(success());
    const { status: _status, ...withoutStatus } = invoiceRequest;
    let request: ReportPdfRequest = invoiceRequest;
    let latest!: ReportExport;
    function Probe() {
      latest = useReportExport({ buildRequest: () => request, filenameParts: () => parts });
      return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Probe />);
    });
    mounted.push(renderer);

    await act(async () => { void latest.exportPdf(); await settle(); });
    await press('Cancel');
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(latest.available).toBe(true);

    // The person removes the Payment filter and taps again.
    request = withoutStatus as ReportPdfRequest;
    await act(async () => { await latest.exportPdf(); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).not.toHaveProperty('status');
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledWith(SIGNED_URL, FILE);
    // The refusal's question is the only dialog.
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(latest.available).toBe(true);
  });

  it('sends the filter again at the next tap and is refused again each time: the older server is never answered with the unfiltered PDF unasked', async () => {
    jest.mocked(fetch).mockResolvedValue(unknownField());
    const probe = setup(invoiceRequest, parts);
    await probe.tap();
    await press('Cancel');
    await probe.tap();
    await press('Cancel');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(0)).toHaveProperty('status', 'pending');
    expect(bodyOf(1)).toHaveProperty('status', 'pending');
    expect(showAlert).toHaveBeenCalledTimes(2);
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(probe.current().available).toBe(true);
  });

  it('shows the message in Gujarati in Gujarati', async () => {
    jest.mocked(fetch).mockResolvedValue(unknownField());
    try {
      setLanguage('gu');
      const probe = setup(invoiceRequest, parts);
      await probe.tap();
      expect(showAlert).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
      expect(title).toBe('આખો અહેવાલ શેર કરવો છે?');
      expect(message).toBe(t('reports.export.filterNeedsUpdate'));
      expect(message).not.toBe(FILTER_NEEDS_UPDATE);
      expect(message).toContain('ફિલ્ટર');
      expect(buttons?.map(button => button.text)).toEqual(['રદ કરો', 'આખો અહેવાલ શેર કરો']);
      await press('રદ કરો');
      expect(downloadAndSharePDF).not.toHaveBeenCalled();
    } finally {
      setLanguage('en');
    }
  });

  it('does not ask again for another 400, and shows its normal failure', async () => {
    jest.mocked(fetch).mockResolvedValue(answer(400, { success: false, error: 'The period must not be longer than 450 days' }));
    const probe = setup(invoiceRequest, parts);
    await probe.run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith("Couldn't create the PDF", 'A PDF can cover at most 450 days. Choose a shorter period.');
    expect(probe.current().available).toBe(true);
  });

  it('does not ask again when the request had no status', async () => {
    jest.mocked(fetch).mockResolvedValue(unknownField());
    const { status: _status, ...withoutStatus } = invoiceRequest;
    const probe = setup(withoutStatus as ReportPdfRequest, parts);
    await probe.run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).not.toHaveProperty('status');
    expect(showAlert).toHaveBeenCalledWith("Couldn't create the PDF", "The server didn't accept this request. Update the app and try again.");
  });

  it('is still taken as outdated when the server has no report PDFs at all', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    const probe = setup(invoiceRequest, parts);
    await probe.run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(probe.current().available).toBe(false);
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

  it('asks for the report PDF again, not the fallback, once another instance serves the same origin', async () => {
    jest.mocked(fetch).mockResolvedValue(oldServer());
    await setup().run();
    expect(fetch).toHaveBeenCalledTimes(1);

    mockFacility = { origin: FACILITY.origin, instanceId: 'instance-b' };
    jest.mocked(fetch).mockResolvedValue(success());
    const fallback = jest.fn().mockResolvedValue({ success: true, pdfUrl: OLD_URL });
    await setup(stockRequest, stockParts, fallback).run();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
    expect(downloadAndSharePDF).toHaveBeenLastCalledWith(SIGNED_URL, 'Stock_summary_Fictional_Traders.pdf');
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

describe('a filter an older server does not know, for every filter field', () => {
  const unknownField = () => answer(400, { success: false, error: 'Unknown field in report request' });
  const bodyOf = (call: number) => JSON.parse(jest.mocked(fetch).mock.calls[call][1]!.body as string);
  const cases: [string, ReportPdfRequest, string][] = [
    ['invoicing', { ...periodRequest, invoicing: 'not_invoiced' }, 'GRN_activity_Fictional_Traders_2026_09_01_to_2026_09_30.pdf'],
    ['bucket', { report: 'stock-aging', customer_id: CUSTOMER_ID, bucket: 'over-364' }, 'GRN_activity_Fictional_Traders.pdf'],
    ['search', { report: 'item-stock-summary', search: 'onion' }, 'GRN_activity_All_customers.pdf'],
  ];

  it.each(cases)('%s: sent, refused, asked about, and with the consent asked for once more without it', async (field, request, file) => {
    jest.mocked(fetch).mockResolvedValueOnce(unknownField()).mockResolvedValueOnce(success());
    const probe = setup(request);
    await probe.tap();
    expect(bodyOf(0)).toHaveProperty(field);
    expect(dialogs()).toEqual([['Share the full report?', t('reports.export.filterNeedsUpdate')]]);
    await press('Share full report');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).not.toHaveProperty(field);
    expect(bodyOf(1).report).toBe(request.report);
    expect(jest.mocked(downloadAndSharePDF).mock.calls).toEqual([[SIGNED_URL, file]]);
  });

  it.each(cases)('%s: sent and shared at once by a server that knows it, with no dialog', async (field, request) => {
    jest.mocked(fetch).mockResolvedValue(success());
    await setup(request).run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toHaveProperty(field);
    expect(showAlert).not.toHaveBeenCalled();
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
  });
});

describe('a search the PDF does not apply', () => {
  const ON_SCREEN = { query: 'chilli', count: 1234 };
  const DISCLOSURE = 'The PDF will include every row of the period, not only the 1,234 matching "chilli".';

  it('is said before anything is asked for; Cancel asks for nothing', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup(periodRequest, undefined, undefined, () => ON_SCREEN);
    await probe.tap();
    expect(dialogs()).toEqual([['Share the full report?', DISCLOSURE]]);
    const buttons = jest.mocked(showAlert).mock.calls[0][2];
    expect(buttons?.map(button => [button.text, button.style])).toEqual([['Cancel', 'cancel'], ['Share full report', undefined]]);
    // A broken export has asked for the PDF already.
    expect(fetch).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(true);
    await press('Cancel');
    expect(fetch).not.toHaveBeenCalled();
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(false);
  });

  it('with the consent, the full report is asked for and shared', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup(periodRequest, undefined, undefined, () => ON_SCREEN);
    await probe.tap();
    await press('Share full report');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string)).not.toHaveProperty('search');
    expect(downloadAndSharePDF).toHaveBeenCalledWith(SIGNED_URL, 'GRN_activity_Fictional_Traders_2026_09_01_to_2026_09_30.pdf');
    expect(probe.current().busy).toBe(false);
  });

  it('closing the dialog is Cancel', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup(periodRequest, undefined, undefined, () => ON_SCREEN);
    await probe.tap();
    await dismiss();
    expect(fetch).not.toHaveBeenCalled();
    expect(probe.current().busy).toBe(false);
  });

  it('a second tap while the dialog waits is ignored', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup(periodRequest, undefined, undefined, () => ON_SCREEN);
    await probe.tap();
    await probe.tap();
    expect(showAlert).toHaveBeenCalledTimes(1);
    await press('Share full report');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
  });

  it('is not asked about without a search, nor for a blank one', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    await setup(periodRequest, undefined, undefined, () => null).run();
    await setup(periodRequest, undefined, undefined, () => ({ query: '  ', count: 3 })).run();
    expect(showAlert).not.toHaveBeenCalled();
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(2);
  });

  it('a stock report says all the stock; a long search is cut at 40 characters', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    const long = 'Example very long search words for one item name';
    const probe = setup({ report: 'stock-aging', customer_id: CUSTOMER_ID }, undefined, undefined, () => ({ query: long, count: 2 }));
    await probe.tap();
    expect(dialogs()).toEqual([
      ['Share the full report?', 'The PDF will include all the stock, not only the 2 matching "Example very long search words for one i…".'],
    ]);
    await press('Cancel');
  });

  it('says it in Gujarati, with Gujarati digits and the search as typed', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    setLanguage('gu');
    try {
      const probe = setup(periodRequest, undefined, undefined, () => ({ query: 'મરચાં', count: 12 }));
      await probe.tap();
      expect(dialogs()).toEqual([['આખો અહેવાલ શેર કરવો છે?', 'PDFમાં સમયગાળાની બધી લાઇન આવશે, ફક્ત "મરચાં" સાથે મળતી ૧૨ લાઇન જ નહીં.']]);
      await press('આખો અહેવાલ શેર કરો');
      expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    } finally {
      setLanguage('en');
    }
  });

  // With a filter the PDF does apply (Payment, Invoicing, Stock age) the PDF is not the full report:
  // the question says the search is dropped and the other choices kept, and the request keeps the filter.
  it.each([
    [
      'a payment status on invoice history',
      { ...periodRequest, report: 'invoice-history', status: 'paid' } as ReportPdfRequest,
      'status',
      'paid',
      'The PDF will list every row of the period that your other choices keep, not only the 1,234 matching "chilli".',
    ],
    [
      'an invoicing choice on GRN activity',
      { ...periodRequest, invoicing: 'not_invoiced' } as ReportPdfRequest,
      'invoicing',
      'not_invoiced',
      'The PDF will list every row of the period that your other choices keep, not only the 1,234 matching "chilli".',
    ],
    [
      'a stock age on stock aging',
      { report: 'stock-aging', customer_id: CUSTOMER_ID, bucket: '121-240' } as ReportPdfRequest,
      'bucket',
      '121-240',
      'The PDF will list every row your other choices keep, not only the 1,234 matching "chilli".',
    ],
  ])('with %s, asks to share without the search and keeps the filter', async (_name, request, field, value, message) => {
    jest.mocked(fetch).mockResolvedValue(success());
    const probe = setup(request, { title: 'Report', customerName: CUSTOMER_NAME }, undefined, () => ON_SCREEN);
    await probe.tap();
    expect(dialogs()).toEqual([['Share without the search?', message]]);
    const buttons = jest.mocked(showAlert).mock.calls[0][2];
    expect(buttons?.map(button => button.text)).toEqual(['Cancel', 'Share without the search']);
    expect(fetch).not.toHaveBeenCalled();
    await press('Share without the search');
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body[field]).toBe(value);
    expect(body).not.toHaveProperty('search');
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
  });

  it('says the filtered question in Gujarati', async () => {
    jest.mocked(fetch).mockResolvedValue(success());
    setLanguage('gu');
    try {
      const request: ReportPdfRequest = { report: 'stock-aging', customer_id: CUSTOMER_ID, bucket: 'over-364' };
      const probe = setup(request, undefined, undefined, () => ({ query: 'મરચાં', count: 12 }));
      await probe.tap();
      expect(dialogs()).toEqual([
        ['શોધ વગર શેર કરવું છે?', 'PDFમાં તમારી બીજી પસંદગીઓ મુજબની બધી લાઇન આવશે, ફક્ત "મરચાં" સાથે મળતી ૧૨ લાઇન જ નહીં.'],
      ]);
      await press('શોધ વગર શેર કરો');
      expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    } finally {
      setLanguage('en');
    }
  });

  it('then a filter the server refuses: a second question, and the full report only after both', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(answer(400, { success: false, error: 'Unknown field in report request' }))
      .mockResolvedValueOnce(success());
    const request: ReportPdfRequest = { ...periodRequest, report: 'invoice-history', status: 'paid' };
    const probe = setup(request, { title: 'Invoice history', customerName: CUSTOMER_NAME }, undefined, () => ON_SCREEN);
    await probe.tap();
    await press('Share without the search');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(dialogs()).toHaveLength(2);
    await press('Share full report');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
  });
});
