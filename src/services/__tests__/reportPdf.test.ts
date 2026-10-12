/**
 * generateReportPDF: the request it sends to generate-report-pdf, the words it
 * gives for every answer, the old-backend case, and that nothing private is logged.
 */
import { createAuthenticatedFetch } from '@/config/supabaseConfig';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { setLanguage } from '@/i18n';
import { generateReportPDF, reportPdfRequestBody, type ReportPdfRequest } from '../pdf-service';

let mockConfigUrl = 'https://warehouse.example.test';
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: mockConfigUrl }),
  createAuthenticatedFetch: jest.fn(() => (...args: Parameters<typeof fetch>) => global.fetch(...args)),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const CUSTOMER_ID = '1275b249-2831-11ed-ba24-525400024271';
const CUSTOMER_NAME = 'Fictional Traders';
const SIGNED_URL =
  'https://warehouse.example.test/storage/v1/object/sign/documents/report/grn-activity/x.pdf?token=fictional-private-link';

const originalFetch = global.fetch;
let logs: jest.SpyInstance[];
beforeEach(() => {
  mockConfigUrl = 'https://warehouse.example.test';
  setLanguage('en');
  jest.mocked(getAuthTokenString).mockResolvedValue('fictional-access-credential');
  global.fetch = jest.fn();
  logs = ['log', 'info', 'warn', 'error', 'debug'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => {
  logs.forEach(log => log.mockRestore());
  global.fetch = originalFetch;
  setLanguage('en');
});

const answer = (status: number, body: unknown, contentType = 'application/json') =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
    text: jest.fn(async () => (typeof body === 'string' ? body : JSON.stringify(body))),
  }) as any;

const periodRequest: ReportPdfRequest = {
  report: 'grn-activity',
  customer_id: CUSTOMER_ID,
  from: '2026-09-01',
  to: '2026-09-30',
  sort: { field: 'date', order: 'desc' },
};
const stockRequest: ReportPdfRequest = { report: 'stock-summary' };

const sentBody = () => JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string);
const nothingLogged = () => logs.forEach(log => expect(log).not.toHaveBeenCalled());

describe('the request', () => {
  it('sends a period report with its customer, dates, sort and language to generate-report-pdf', async () => {
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    await generateReportPDF(periodRequest);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = jest.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://warehouse.example.test/functions/v1/generate-report-pdf');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fictional-access-credential' },
    });
    expect(sentBody()).toEqual({
      report: 'grn-activity',
      customer_id: CUSTOMER_ID,
      from: '2026-09-01',
      to: '2026-09-30',
      sort: { field: 'date', order: 'desc' },
      lang: 'en',
    });
  });

  it('sends a stock report without dates and without a customer at the all-customers level', async () => {
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    await generateReportPDF(stockRequest);
    expect(sentBody()).toEqual({ report: 'stock-summary', lang: 'en' });
  });

  it('never sends dates for a stock report, even when a caller slips them in', () => {
    const smuggled = { report: 'stock-aging', from: '2026-09-01', to: '2026-09-30', customer_id: null } as unknown as ReportPdfRequest;
    expect(reportPdfRequestBody(smuggled)).toEqual({ report: 'stock-aging', lang: 'en' });
  });

  it("takes the app's language unless the request names one", () => {
    setLanguage('gu');
    expect(reportPdfRequestBody(stockRequest).lang).toBe('gu');
    expect(reportPdfRequestBody({ ...stockRequest, lang: 'en' }).lang).toBe('en');
  });

  it('goes through the gated fetch of the session', async () => {
    jest.mocked(createAuthenticatedFetch).mockClear();
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    await generateReportPDF(stockRequest);
    expect(createAuthenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it('does not ask without a session', async () => {
    jest.mocked(getAuthTokenString).mockResolvedValue(null);
    expect(await generateReportPDF(stockRequest)).toEqual({
      success: false,
      reason: 'session',
      error: 'Authentication required. Please log in again.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the answer', () => {
  it('returns the signed link, its lifetime and the document', async () => {
    const document = {
      type: 'report',
      report: 'grn-activity',
      customer: CUSTOMER_NAME,
      from: '2026-09-01',
      to: '2026-09-30',
      rows_count: 3,
      rows_total: 3,
      truncated: false,
      sort: { field: 'date', order: 'desc' },
    };
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600, document }));
    expect(await generateReportPDF(periodRequest)).toEqual({
      success: true,
      pdfUrl: SIGNED_URL,
      expiresIn: 3600,
      document,
    });
  });

  it('refuses a link that is not secure', async () => {
    jest.mocked(fetch).mockResolvedValue(
      answer(200, { success: true, pdf_url: 'http://evil.example.test/a.pdf?token=t', expires_in: 3600 })
    );
    expect(await generateReportPDF(periodRequest)).toEqual({
      success: false,
      reason: 'insecure-link',
      error: 'The server returned a download link that is not secure. Contact your operator.',
    });
  });

  it.each([
    [401, 'Invalid or expired access token', 'session', 'Your session has expired. Please sign in again.'],
    [403, 'Report not available to this account', 'forbidden', 'This report is not available to your account as a PDF.'],
    [404, 'Customer unavailable', 'customer-unavailable', 'This customer is not available. Choose another customer and try again.'],
    [400, 'The period must not be longer than 450 days', 'period-too-long', 'A PDF can cover at most 450 days. Choose a shorter period.'],
    [400, 'Unknown field in report request', 'not-accepted', "The server didn't accept this request. Update the app and try again."],
    [405, 'POST required', 'not-accepted', "The server didn't accept this request. Update the app and try again."],
    [503, 'Document storage unavailable', 'server-unavailable', "The server couldn't make the PDF right now. Try again in a moment."],
    [500, 'Server unavailable', 'server-unavailable', "The server couldn't make the PDF right now. Try again in a moment."],
  ] as const)('maps %i "%s" to %s', async (status, serverText, reason, text) => {
    jest.mocked(fetch).mockResolvedValue(answer(status, { success: false, error: serverText }));
    expect(await generateReportPDF(periodRequest)).toEqual({ success: false, reason, error: text });
    nothingLogged();
  });

  it('gives the Gujarati text in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(fetch).mockResolvedValue(answer(400, { success: false, error: 'The period must not be longer than 450 days' }));
    expect((await generateReportPDF(periodRequest)).error).toBe(
      'એક PDFમાં વધુમાં વધુ ૪૫૦ દિવસ આવી શકે છે. ટૂંકો સમયગાળો પસંદ કરો.'
    );
  });

  it('says the connection failed when no answer came', async () => {
    jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
    expect(await generateReportPDF(periodRequest)).toEqual({
      success: false,
      reason: 'network',
      error: 'Check your connection and try again.',
    });
    nothingLogged();
  });

  it('treats a gateway page that is not JSON as the server being unavailable, without reading it', async () => {
    const page = answer(502, 'sensitive upstream diagnostic', 'text/html');
    jest.mocked(fetch).mockResolvedValue(page);
    expect(await generateReportPDF(periodRequest)).toMatchObject({ success: false, reason: 'server-unavailable' });
    expect(page.text).not.toHaveBeenCalled();
  });
});

const invoiceRequest: ReportPdfRequest = {
  report: 'invoice-history',
  customer_id: CUSTOMER_ID,
  from: '2026-09-01',
  to: '2026-09-30',
  sort: { field: 'date', order: 'desc' },
};
const UNKNOWN_FIELD = 'Unknown field in report request';
const bodyOf = (call: number) => JSON.parse(jest.mocked(fetch).mock.calls[call][1]!.body as string);
const refusal = (message: string, status = 400) => answer(status, { success: false, error: message });

describe("the payment status of one customer's invoice history", () => {
  it.each(['paid', 'pending'] as const)('is sent as "%s" with the customer, the dates and the sort', async status => {
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    await generateReportPDF({ ...invoiceRequest, status });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({
      report: 'invoice-history',
      customer_id: CUSTOMER_ID,
      status,
      from: '2026-09-01',
      to: '2026-09-30',
      sort: { field: 'date', order: 'desc' },
      lang: 'en',
    });
  });

  it('is left out when the request has none, so a server without the field sees the request it always did', () => {
    expect(reportPdfRequestBody(invoiceRequest)).not.toHaveProperty('status');
    expect(reportPdfRequestBody({ ...invoiceRequest, status: undefined })).not.toHaveProperty('status');
  });

  it('is never sent at the all-customers level, whatever a caller slips in', () => {
    const allCustomers = { report: 'invoice-history', from: '2026-09-01', to: '2026-09-30', status: 'paid' } as ReportPdfRequest;
    expect(reportPdfRequestBody(allCustomers)).not.toHaveProperty('status');
    expect(reportPdfRequestBody({ ...allCustomers, customer_id: null })).not.toHaveProperty('status');
    expect(reportPdfRequestBody({ ...allCustomers, customer_id: '' })).not.toHaveProperty('status');
  });

  it('is never sent for another report, even for one customer', () => {
    const others = [
      { report: 'grn-activity', from: '2026-09-01', to: '2026-09-30' },
      { report: 'dispatch-activity', from: '2026-09-01', to: '2026-09-30' },
      { report: 'customer-activity', from: '2026-09-01', to: '2026-09-30' },
      { report: 'stock-summary' },
      { report: 'stock-aging' },
      { report: 'item-stock-summary' },
    ];
    for (const other of others) {
      const request = { ...other, customer_id: CUSTOMER_ID, status: 'pending' } as unknown as ReportPdfRequest;
      expect(reportPdfRequestBody(request)).not.toHaveProperty('status');
    }
  });

  it('is only "paid" or "pending": any other value is left out', () => {
    for (const status of ['all', '', 'PAID', 'partly_paid', null, 1]) {
      expect(reportPdfRequestBody({ ...invoiceRequest, status } as unknown as ReportPdfRequest)).not.toHaveProperty('status');
    }
  });
});

describe('a server that does not know the payment status', () => {
  const withStatus: ReportPdfRequest = { ...invoiceRequest, status: 'paid' };
  const document = { type: 'report', report: 'invoice-history', rows_count: 4, rows_total: 4, truncated: false, sort: { field: 'date', order: 'desc' } };

  it('is asked again once without it, and the PDF of all the invoices is returned, not marked as an outdated server', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(refusal(UNKNOWN_FIELD))
      .mockResolvedValueOnce(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600, document }));
    const result = await generateReportPDF(withStatus);

    expect(result).toEqual({ success: true, pdfUrl: SIGNED_URL, expiresIn: 3600, document });
    expect(result.reason).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(0)).toMatchObject({ status: 'paid' });
    // The second request is the first without `status`, field for field.
    const { status, ...first } = bodyOf(0);
    expect(status).toBe('paid');
    expect(bodyOf(1)).toEqual(first);
    expect(bodyOf(1)).not.toHaveProperty('status');
    expect(jest.mocked(fetch).mock.calls[1][0]).toBe('https://warehouse.example.test/functions/v1/generate-report-pdf');
    expect(jest.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fictional-access-credential' },
    });
  });

  it("logs one line for it, with nothing of the request, the customer or the server's text", async () => {
    jest.mocked(fetch).mockResolvedValueOnce(refusal(UNKNOWN_FIELD)).mockResolvedValueOnce(answer(200, { success: true, pdf_url: SIGNED_URL }));
    await generateReportPDF(withStatus);
    const logged = logs.flatMap(log => log.mock.calls);
    expect(logged).toHaveLength(1);
    const line = JSON.stringify(logged);
    expect(line).toContain('payment status');
    for (const secret of [CUSTOMER_ID, 'fictional-access-credential', 'fictional-private-link', UNKNOWN_FIELD, '2026-09-01']) {
      expect(line).not.toContain(secret);
    }
  });

  it('fails as it does now when the second answer is the same refusal, and does not ask a third time', async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    expect(await generateReportPDF(withStatus)).toEqual({
      success: false,
      reason: 'not-accepted',
      error: "The server didn't accept this request. Update the app and try again.",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).not.toHaveProperty('status');
    // Only the retry is logged.
    expect(logs.flatMap(log => log.mock.calls)).toHaveLength(1);
  });

  it.each([
    [401, 'Invalid or expired access token', 'session'],
    [403, 'Report not available to this account', 'forbidden'],
    [404, 'Customer unavailable', 'customer-unavailable'],
    [400, 'The period must not be longer than 450 days', 'period-too-long'],
    [503, 'Document storage unavailable', 'server-unavailable'],
  ] as const)('shows the normal failure when the second answer is %i "%s"', async (status, message, reason) => {
    jest.mocked(fetch).mockResolvedValueOnce(refusal(UNKNOWN_FIELD)).mockResolvedValueOnce(refusal(message, status));
    expect((await generateReportPDF(withStatus)).reason).toBe(reason);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('says the connection failed when the second request gets no answer', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(refusal(UNKNOWN_FIELD)).mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await generateReportPDF(withStatus)).toEqual({ success: false, reason: 'network', error: 'Check your connection and try again.' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['another 400 message', refusal('Invalid request')],
    ['a 400 about the period', refusal('The period must not be longer than 450 days')],
    ['the message with other words around it', refusal(`${UNKNOWN_FIELD}: status`)],
    ['the message in other letters', refusal('unknown field in report request')],
    ['the message under status 500', refusal(UNKNOWN_FIELD, 500)],
    ['the message under status 403', refusal(UNKNOWN_FIELD, 403)],
    ['a 400 without a message', answer(400, { success: false })],
    ["a 400 that is not the function's envelope", answer(400, { error: UNKNOWN_FIELD })],
    ['a 400 page that is not JSON', answer(400, UNKNOWN_FIELD, 'text/plain')],
  ])('is not asked again for %s', async (_name, refused) => {
    jest.mocked(fetch).mockResolvedValue(refused);
    await generateReportPDF(withStatus);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toMatchObject({ status: 'paid' });
    nothingLogged();
  });

  it('is not asked again when the request carried no status, and the refusal is the normal failure', async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    expect(await generateReportPDF(invoiceRequest)).toEqual({
      success: false,
      reason: 'not-accepted',
      error: "The server didn't accept this request. Update the app and try again.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    nothingLogged();
  });

  it('is not asked again for a report that cannot carry a status, whatever a caller slips in', async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    const smuggled = { ...periodRequest, status: 'paid' } as ReportPdfRequest;
    expect((await generateReportPDF(smuggled)).reason).toBe('not-accepted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('a server older than generate-report-pdf', () => {
  const outdated = "This facility's server needs an update before reports can be shared as PDF.";

  it("is the functions router's plain 404 for an unknown function", async () => {
    jest.mocked(fetch).mockResolvedValue(answer(404, 'Function not found', 'text/plain;charset=UTF-8'));
    expect(await generateReportPDF(periodRequest)).toEqual({ success: false, reason: 'server-outdated', error: outdated });
  });

  it("is a gateway's JSON 404 that is not the function's envelope", async () => {
    jest.mocked(fetch).mockResolvedValue(answer(404, { message: 'no Route matched with those values' }));
    expect(await generateReportPDF(periodRequest)).toEqual({ success: false, reason: 'server-outdated', error: outdated });
  });

  it('is a PGRST202 answer', async () => {
    jest.mocked(fetch).mockResolvedValue(answer(400, { code: 'PGRST202', message: 'Could not find the function' }));
    expect((await generateReportPDF(periodRequest)).reason).toBe('server-outdated');
  });

  it("is not the function's own 404 about a customer", async () => {
    jest.mocked(fetch).mockResolvedValue(answer(404, { success: false, error: 'Customer unavailable' }));
    expect((await generateReportPDF(periodRequest)).reason).toBe('customer-unavailable');
  });

  it('shows the update text in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(fetch).mockResolvedValue(answer(404, 'Function not found', 'text/plain'));
    expect((await generateReportPDF(periodRequest)).error).toBe(
      'અહેવાલની PDF શેર કરવા માટે આ કોલ્ડ સ્ટોરેજનું સર્વર અપડેટ કરવું જરૂરી છે.'
    );
  });
});

describe('privacy', () => {
  it.each([
    ['a success', () => answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600, document: { customer: CUSTOMER_NAME } })],
    ['a refusal', () => answer(403, { success: false, error: `Customer ${CUSTOMER_NAME} refused` })],
    ['an old server', () => answer(404, 'Function not found', 'text/plain')],
    ['an insecure link', () => answer(200, { success: true, pdf_url: 'http://evil.example.test/x.pdf?token=fictional-private-link' })],
  ])('logs nothing for %s: no URL, customer, credential or body', async (_name, make) => {
    jest.mocked(fetch).mockResolvedValue(make());
    const result = await generateReportPDF(periodRequest);
    nothingLogged();
    // The shown text never carries the server's words or the customer.
    if (!result.success) {
      expect(result.error).not.toContain(CUSTOMER_NAME);
      expect(result.error).not.toContain('fictional-private-link');
    }
  });

  it('logs nothing when the request fails without an answer', async () => {
    jest.mocked(fetch).mockRejectedValue(new Error(`timeout for ${SIGNED_URL}`));
    const result = await generateReportPDF(periodRequest);
    expect(result.error).not.toContain('fictional-private-link');
    nothingLogged();
  });
});
