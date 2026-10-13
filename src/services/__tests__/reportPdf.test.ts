/**
 * generateReportPDF: the request it sends to generate-report-pdf, the words it
 * gives for every answer, the old-backend case, and that nothing private is logged.
 */
import { createAuthenticatedFetch } from '@/config/supabaseConfig';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { setLanguage } from '@/i18n';
import {
  REPORT_PDF_FILTER_FIELDS,
  generateReportPDF,
  reportPdfRequestBody,
  reportPdfSearch,
  withoutReportFilters,
  type ReportPdfRequest,
} from '../pdf-service';

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
  const FILTER_NEEDS_UPDATE =
    "This facility's server can't apply your filter or search to the PDF yet. You can share the full report, or cancel and ask for a server update.";

  it('is refused with its own reason and message after one request, and no PDF of all the invoices is asked for', async () => {
    // A second answer is ready, as the old retry would have found it: the new code must not use it.
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(refusal(UNKNOWN_FIELD))
      .mockResolvedValueOnce(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    const result = await generateReportPDF(withStatus);

    expect(result).toEqual({ success: false, reason: 'filter-unsupported', error: FILTER_NEEDS_UPDATE });
    expect(result.pdfUrl).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toMatchObject({ status: 'paid' });
  });

  it.each(['paid', 'pending'] as const)('is refused the same way for the "%s" choice', async status => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    expect((await generateReportPDF({ ...invoiceRequest, status })).reason).toBe('filter-unsupported');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toHaveProperty('status', status);
  });

  it('is not the outdated-server reason, so the other exports are not hidden', async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    const result = await generateReportPDF(withStatus);
    expect(result.reason).not.toBe('server-outdated');
    expect(result.error).not.toBe("This facility's server needs an update before reports can be shared as PDF.");
  });

  it('gives the message in Gujarati in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    const result = await generateReportPDF(withStatus);
    expect(result.reason).toBe('filter-unsupported');
    expect(result.error).toBe(
      'આ કોલ્ડ સ્ટોરેજનું સર્વર હજુ PDFમાં તમારું ફિલ્ટર કે શોધ લાગુ કરી શકતું નથી. તમે આખો અહેવાલ શેર કરી શકો છો, અથવા રદ કરીને સર્વર અપડેટ કરવાનું કહો.'
    );
  });

  it("logs nothing at all: no retry line, and nothing of the request, the customer or the server's text", async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    await generateReportPDF(withStatus);
    nothingLogged();
  });

  it.each([
    ['another 400 message', refusal('Invalid request'), 'not-accepted'],
    ['a 400 about the period', refusal('The period must not be longer than 450 days'), 'period-too-long'],
    ['the message with other words around it', refusal(`${UNKNOWN_FIELD}: status`), 'not-accepted'],
    ['the message in other letters', refusal('unknown field in report request'), 'not-accepted'],
    ['the message under status 500', refusal(UNKNOWN_FIELD, 500), 'server-unavailable'],
    ['the message under status 403', refusal(UNKNOWN_FIELD, 403), 'forbidden'],
    ['a 400 without a message', answer(400, { success: false }), 'not-accepted'],
    ["a 400 that is not the function's envelope", answer(400, { error: UNKNOWN_FIELD }), 'server-unavailable'],
    ['a 400 page that is not JSON', answer(400, UNKNOWN_FIELD, 'text/plain'), 'server-unavailable'],
  ] as const)('is the normal failure, after one request, for %s', async (_name, refused, reason) => {
    jest.mocked(fetch).mockResolvedValue(refused);
    const result = await generateReportPDF(withStatus);
    expect(result.reason).toBe(reason);
    expect(result.reason).not.toBe('filter-unsupported');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toMatchObject({ status: 'paid' });
    nothingLogged();
  });

  it('is the normal failure when the request carried no status, after one request', async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    expect(await generateReportPDF(invoiceRequest)).toEqual({
      success: false,
      reason: 'not-accepted',
      error: "The server didn't accept this request. Update the app and try again.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    nothingLogged();
  });

  it('is the normal failure for a report that cannot carry a status, whatever a caller slips in', async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    const smuggled = { ...periodRequest, status: 'paid' } as ReportPdfRequest;
    expect((await generateReportPDF(smuggled)).reason).toBe('not-accepted');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).not.toHaveProperty('status');
  });

  it("is the normal failure at the all-customers level, where `status` is never sent", async () => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    const allCustomers = { report: 'invoice-history', from: '2026-09-01', to: '2026-09-30', status: 'paid' } as ReportPdfRequest;
    expect((await generateReportPDF(allCustomers)).reason).toBe('not-accepted');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).not.toHaveProperty('status');
  });

  it('still succeeds when the server takes the status', async () => {
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    expect(await generateReportPDF(withStatus)).toMatchObject({ success: true, pdfUrl: SIGNED_URL });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toHaveProperty('status', 'paid');
  });
});

describe('the Invoicing choice of one customer\'s GRN activity', () => {
  const grnRequest: ReportPdfRequest = { ...periodRequest, invoicing: 'not_invoiced' };

  it.each(['invoiced', 'not_invoiced'] as const)('is sent as "%s" with the customer, the dates and the sort', async invoicing => {
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    await generateReportPDF({ ...periodRequest, invoicing });
    expect(sentBody()).toEqual({
      report: 'grn-activity',
      customer_id: CUSTOMER_ID,
      invoicing,
      from: '2026-09-01',
      to: '2026-09-30',
      sort: { field: 'date', order: 'desc' },
      lang: 'en',
    });
  });

  it('is left out with none, at the all-customers level, for another report and for any other value', () => {
    expect(reportPdfRequestBody(periodRequest)).not.toHaveProperty('invoicing');
    expect(reportPdfRequestBody({ ...grnRequest, customer_id: null })).not.toHaveProperty('invoicing');
    expect(reportPdfRequestBody({ ...grnRequest, customer_id: '' })).not.toHaveProperty('invoicing');
    for (const report of ['dispatch-activity', 'invoice-history', 'customer-activity'] as const) {
      expect(reportPdfRequestBody({ ...grnRequest, report })).not.toHaveProperty('invoicing');
    }
    expect(reportPdfRequestBody({ report: 'stock-aging', customer_id: CUSTOMER_ID, invoicing: 'invoiced' })).not.toHaveProperty('invoicing');
    for (const invoicing of ['all', '', 'INVOICED', 'not-invoiced', null, 1]) {
      expect(reportPdfRequestBody({ ...periodRequest, invoicing } as unknown as ReportPdfRequest)).not.toHaveProperty('invoicing');
    }
  });
});

describe("the Stock age choice of one customer's stock aging", () => {
  const agingRequest: ReportPdfRequest = { report: 'stock-aging', customer_id: CUSTOMER_ID, sort: { field: 'age', order: 'desc' } };

  it.each(['0-120', '121-240', '241-364', 'over-364'] as const)('is sent as "%s" with the customer and the sort, without dates', async bucket => {
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    await generateReportPDF({ ...agingRequest, bucket });
    expect(sentBody()).toEqual({ report: 'stock-aging', customer_id: CUSTOMER_ID, bucket, sort: { field: 'age', order: 'desc' }, lang: 'en' });
  });

  it('is left out with none, at the all-customers level, for another report and for any other value', () => {
    expect(reportPdfRequestBody(agingRequest)).not.toHaveProperty('bucket');
    expect(reportPdfRequestBody({ report: 'stock-aging', bucket: 'over-364' })).not.toHaveProperty('bucket');
    expect(reportPdfRequestBody({ report: 'stock-summary', customer_id: CUSTOMER_ID, bucket: 'over-364' })).not.toHaveProperty('bucket');
    expect(reportPdfRequestBody({ ...periodRequest, bucket: 'over-364' })).not.toHaveProperty('bucket');
    // '364+' is the RPC's own key, not the request's.
    for (const bucket of ['all', '364+', 'over_364', '0-119', '', null]) {
      expect(reportPdfRequestBody({ ...agingRequest, bucket } as unknown as ReportPdfRequest)).not.toHaveProperty('bucket');
    }
  });
});

describe('the search of the item stock summary', () => {
  const itemRequest: ReportPdfRequest = { report: 'item-stock-summary', sort: { field: 'item', order: 'asc' } };

  it('is sent trimmed, at either level, with the sort and without dates', async () => {
    jest.mocked(fetch).mockResolvedValue(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    await generateReportPDF({ ...itemRequest, search: '  onion bags ' });
    expect(sentBody()).toEqual({ report: 'item-stock-summary', search: 'onion bags', sort: { field: 'item', order: 'asc' }, lang: 'en' });
    expect(reportPdfRequestBody({ ...itemRequest, customer_id: CUSTOMER_ID, search: 'ડુંગળી' })).toMatchObject({ customer_id: CUSTOMER_ID, search: 'ડુંગળી' });
  });

  it('is sent up to 80 characters and left out beyond, blank, with a control character, or for another report', () => {
    const eighty = 'a'.repeat(80);
    expect(reportPdfRequestBody({ ...itemRequest, search: eighty })).toHaveProperty('search', eighty);
    expect(reportPdfRequestBody({ ...itemRequest, search: ` ${eighty} ` })).toHaveProperty('search', eighty);
    expect(reportPdfRequestBody({ ...itemRequest, search: `${eighty}b` })).not.toHaveProperty('search');
    for (const search of ['', '   ', 'onion\nbags', 'tab\there', 'bell\u0007', 'c1\u0085', undefined, null, 5]) {
      expect(reportPdfRequestBody({ ...itemRequest, search } as unknown as ReportPdfRequest)).not.toHaveProperty('search');
    }
    for (const report of ['stock-summary', 'stock-aging'] as const) {
      expect(reportPdfRequestBody({ report, customer_id: CUSTOMER_ID, search: 'onion' })).not.toHaveProperty('search');
    }
    expect(reportPdfRequestBody({ ...periodRequest, search: 'onion' })).not.toHaveProperty('search');
  });

  it('reportPdfSearch says which searches a PDF can carry', () => {
    expect(reportPdfSearch(' onion ')).toBe('onion');
    expect(reportPdfSearch('x'.repeat(81))).toBeUndefined();
    expect(reportPdfSearch('')).toBeUndefined();
    expect(reportPdfSearch(undefined)).toBeUndefined();
  });
});

describe('the request without its filters', () => {
  it('keeps the report, customer, period, sort and language, and drops every filter field', () => {
    const narrowed = { ...periodRequest, lang: 'gu', status: 'paid', invoicing: 'invoiced', bucket: 'over-364', search: 'onion' } as ReportPdfRequest;
    expect(withoutReportFilters(narrowed)).toEqual({ ...periodRequest, lang: 'gu' });
    expect([...REPORT_PDF_FILTER_FIELDS]).toEqual(['status', 'invoicing', 'bucket', 'search']);
  });
});

describe('a server that does not know a filter field', () => {
  const FILTER_NEEDS_UPDATE =
    "This facility's server can't apply your filter or search to the PDF yet. You can share the full report, or cancel and ask for a server update.";
  const narrowed: [string, ReportPdfRequest][] = [
    ['invoicing', { ...periodRequest, invoicing: 'not_invoiced' }],
    ['bucket', { report: 'stock-aging', customer_id: CUSTOMER_ID, bucket: 'over-364' }],
    ['search', { report: 'item-stock-summary', search: 'onion' }],
  ];

  it.each(narrowed)('refuses a request with %s as filter-unsupported, after one request', async (field, request) => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(refusal(UNKNOWN_FIELD))
      .mockResolvedValueOnce(answer(200, { success: true, pdf_url: SIGNED_URL, expires_in: 3600 }));
    expect(await generateReportPDF(request)).toEqual({ success: false, reason: 'filter-unsupported', error: FILTER_NEEDS_UPDATE });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toHaveProperty(field);
    nothingLogged();
  });

  it.each(narrowed)('is the normal failure when %s was left out of the body', async (field, request) => {
    jest.mocked(fetch).mockResolvedValue(refusal(UNKNOWN_FIELD));
    expect((await generateReportPDF(withoutReportFilters(request))).reason).toBe('not-accepted');
    expect(bodyOf(0)).not.toHaveProperty(field);
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
