/**
 * WH-109: the print requests carry a request_id (one per user print action, reused only for a retry that got no usable
 * answer), the failure kinds and texts follow the answers the backend really gives (functions/_shared/auth-helpers.ts,
 * print-transport.ts, print-request.ts, main/index.ts), and a cancel goes to the cancel-print-job function.
 */
import { setLanguage, t } from '@/i18n';

const mockFetch = jest.fn();
jest.mock('../../config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'fictional-anon-key' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

type Service = typeof import('../print-service');
// The last request_id is module state: every test starts with a fresh copy of the service.
function load(): Service {
  let service!: Service;
  jest.isolateModules(() => {
    service = require('../print-service');
  });
  return service;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});
const gatewayPage = (status: number) => ({
  ok: false,
  status,
  headers: { get: () => 'text/html' },
  json: async () => { throw new Error('not json'); },
});
const sentBody = (call: number) => JSON.parse(mockFetch.mock.calls[call][1].body);

// The answers the backend gives (fictional ids).
const JOB = '6f1c2d3e-0000-4000-8000-000000000001';
const SENT = { success: true, message: 'Invoice range print job submitted', range: { start: '412', end: '412', fin_year: 2025, count: 1 }, print_job: { print_job_id: JOB, cups_job_id: 7, job_uri: 'x', printer: 'P', content_size: 10 } };
const PRINTING_OFF = { success: false, code: 'PRINTING_OFF', error: 'Printing is not set up for this facility' };
const PRINT_FORBIDDEN = { success: false, error: 'Admin, supervisor or staff access required to print', code: 'PRINT_FORBIDDEN' };
const UNCONFIRMED = { success: false, error: 'The printer did not confirm the job', code: 'PRINT_UNCONFIRMED', unconfirmed: true, print_job_id: JOB, timestamp: 't' };
const PRINTER_FAILED = { success: false, error: 'connect ECONNREFUSED', code: 'PRINTER_FAILED', timestamp: 't' };

beforeEach(() => {
  mockFetch.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('request_id', () => {
  it('is a uuid on every print request', async () => {
    const { printGRNRange, printDispatchRange, printInvoiceRange } = load();
    mockFetch.mockResolvedValue(answer(200, SENT));
    await printGRNRange('A1', 'A1');
    await printDispatchRange('B1', 'B1');
    await printInvoiceRange('C1', 'C1', 2025);
    for (const call of [0, 1, 2]) expect(sentBody(call).request_id).toMatch(UUID);
  });

  it('is reused when the retry follows a lost connection, and a new one is used once the server answered', async () => {
    const { printGRNRange } = load();
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));
    mockFetch.mockResolvedValueOnce(answer(200, SENT));
    mockFetch.mockResolvedValueOnce(answer(200, SENT));

    await printGRNRange('A1', 'A1');
    await printGRNRange('A1', 'A1'); // the retry of the same action
    await printGRNRange('A1', 'A1'); // a deliberate second copy

    expect(sentBody(1).request_id).toBe(sentBody(0).request_id);
    expect(sentBody(2).request_id).not.toBe(sentBody(0).request_id);
  });

  it('is reused after a gateway page (no answer of the server itself)', async () => {
    const { printInvoiceRange } = load();
    mockFetch.mockResolvedValueOnce(gatewayPage(502));
    mockFetch.mockResolvedValueOnce(answer(200, SENT));
    await printInvoiceRange('412', '412', 2025);
    await printInvoiceRange('412', '412', 2025);
    expect(sentBody(1).request_id).toBe(sentBody(0).request_id);
  });

  it('is new after a 200 whose body is cut: the server did answer, a reprint is deliberate', async () => {
    const { printInvoiceRange } = load();
    mockFetch.mockResolvedValueOnce(answer(200, undefined));
    mockFetch.mockResolvedValueOnce(answer(200, SENT));
    await printInvoiceRange('412', '412', 2025);
    await printInvoiceRange('412', '412', 2025);
    expect(sentBody(1).request_id).not.toBe(sentBody(0).request_id);
  });

  it('is kept per document: an answer to one print does not clear the id of another that is still unanswered', async () => {
    const { printGRNRange, printDispatchRange } = load();
    mockFetch.mockRejectedValueOnce(new Error('Network request failed')); // dispatch, no answer
    mockFetch.mockResolvedValueOnce(answer(200, SENT)); // an answer to a GRN print
    mockFetch.mockResolvedValueOnce(answer(200, SENT)); // the dispatch retry
    await printDispatchRange('B1', 'B1');
    await printGRNRange('A1', 'A1');
    await printDispatchRange('B1', 'B1');
    expect(sentBody(2).request_id).toBe(sentBody(0).request_id);
  });

  it.each([
    ['a refusal', 403, PRINT_FORBIDDEN],
    ['printing off', 503, PRINTING_OFF],
    ['an unconfirmed job', 502, UNCONFIRMED],
    ['a printer failure', 502, PRINTER_FAILED],
  ])('is new for the next tap after %s (the server answered)', async (_name, status, body) => {
    const { printGRNRange } = load();
    mockFetch.mockResolvedValue(answer(status, body));
    await printGRNRange('A1', 'A1');
    await printGRNRange('A1', 'A1');
    expect(sentBody(1).request_id).not.toBe(sentBody(0).request_id);
  });

  it('is not shared between a different range or document type', async () => {
    const { printGRNRange, printDispatchRange } = load();
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    await printGRNRange('A1', 'A1');
    await printGRNRange('A2', 'A2');
    await printDispatchRange('A1', 'A1');
    const ids = [0, 1, 2].map(i => sentBody(i).request_id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('a repeated request the server already handled (duplicate: true)', () => {
  it('is a success: the job is done and nothing was printed again', async () => {
    const { printGRNRange } = load();
    // print-request.ts duplicateResponse: 200, no top-level cups_job_id, cups_job_id may be null
    mockFetch.mockResolvedValue(answer(200, {
      success: true, duplicate: true, message: 'This print request was already handled; nothing was printed again',
      range: { start: 'A1', end: 'A1', count: 1 }, print_job: { print_job_id: JOB, cups_job_id: null, status: 'printing' }, timestamp: 't',
    }));
    const result = await printGRNRange('A1', 'A1');
    expect(result).toMatchObject({ success: true, duplicate: true, status: 200 });
    expect(result.unconfirmed).toBeUndefined();
  });

  it('of a job the printer never confirmed is still the unconfirmed failure, not a success', async () => {
    const { printGRNRange, printFailureMessage } = load();
    mockFetch.mockResolvedValue(answer(502, { ...UNCONFIRMED, duplicate: true }));
    const result = await printGRNRange('A1', 'A1');
    expect(result).toMatchObject({ success: false, unconfirmed: true, kind: 'unconfirmed', code: 'PRINT_UNCONFIRMED' });
    expect(printFailureMessage(result)).toBe(t('errors.print.unconfirmed'));
  });
});

describe('failure kinds and texts, from the answers the backend gives', () => {
  it.each([
    ['printing is off (main/index.ts: 503 PRINTING_OFF)', answer(503, PRINTING_OFF), 'notSetUp', 'Printing is not set up for this facility. Ask an admin to set it up.'],
    ['printing is off on backend v0.7.0 (main/index.ts: 503 with no code)', answer(503, { success: false, error: 'Printing is not configured for this operator instance' }), 'notSetUp', 'Printing is not set up for this facility. Ask an admin to set it up.'],
    ['a 503 that carries another code is not "not set up" (WH-182)', answer(503, { success: false, code: 'SOMETHING_ELSE', error: 'Server says no' }), 'other', 'Server says no'],
    ['the role may not print (auth-helpers: 403 PRINT_FORBIDDEN)',answer(403, PRINT_FORBIDDEN), 'notAllowed', "You aren't allowed to print. Ask an admin."],
    ['the printer did not confirm (502 PRINT_UNCONFIRMED)', answer(502, UNCONFIRMED), 'unconfirmed', 'The printer did not confirm the job. Check the printer before printing again.'],
    ['the printer failed (502 PRINTER_FAILED)', answer(502, PRINTER_FAILED), 'printerFailed', "The printer couldn't print the job. Check the printer and try again."],
    ['a 500 for a range with no documents (print-grn-preprinted)', answer(500, { success: false, error: 'No GRNs found in specified range', timestamp: 't' }), 'other', 'No GRNs found in specified range'],
    ['a 500 for a range of cancelled invoices (print-invoice-preprinted)', answer(500, { success: false, error: 'All 2 Invoices in the range are cancelled and were skipped (X1, X2)', timestamp: 't' }), 'other', 'All 2 Invoices in the range are cancelled and were skipped (X1, X2)'],
    ['a gateway page comes back', gatewayPage(502), 'serverUnavailable', 'Server error (502): The print server is unavailable. Please try again later.'],
  ])('%s', async (_name, response, kind, text) => {
    const { printInvoiceRange, printFailureMessage } = load();
    mockFetch.mockResolvedValue(response);
    const result = await printInvoiceRange('412', '412', 2025);
    expect(result).toMatchObject({ success: false, kind });
    expect(printFailureMessage(result)).toBe(text);
  });

  it('no connection at all is the connection text', async () => {
    const { printGRNRange, printFailureMessage } = load();
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    const result = await printGRNRange('A1', 'A1');
    expect(result).toMatchObject({ success: false, kind: 'connection' });
    expect(printFailureMessage(result)).toBe("Couldn't reach the print server. Check your connection and try again.");
  });

  it('a 200 whose body is cut is unconfirmed (never resubmit on a guess)', async () => {
    const { printGRNRange } = load();
    mockFetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => { throw new Error('cut'); } });
    expect(await printGRNRange('A1', 'A1')).toMatchObject({ success: false, kind: 'unconfirmed', unconfirmed: true });
  });

  it('an old server (no code) that names a recorded job on a 502 is unconfirmed', async () => {
    const { printGRNRange } = load();
    mockFetch.mockResolvedValue(answer(502, { success: false, error: 'x', print_job_id: JOB }));
    expect(await printGRNRange('A1', 'A1')).toMatchObject({ kind: 'unconfirmed', unconfirmed: true });
  });

  it('the facility upgrading is neither "not set up" nor a printer failure', async () => {
    const { printGRNRange } = load();
    mockFetch.mockResolvedValue(answer(503, { code: 'upgrading', message: "The facility's server is being updated. Try again in a few minutes." }));
    const result = await printGRNRange('A1', 'A1');
    expect(result.kind).toBe('other');
    expect(result.error).toBe(t('components.upgrading.message'));
  });
});

describe('invoice year', () => {
  it.each([[NaN], [Infinity]])('%s is left out of the request', async (year) => {
    const { printInvoiceRange } = load();
    mockFetch.mockResolvedValue(answer(200, SENT));
    await printInvoiceRange('412', '412', year);
    expect(sentBody(0)).not.toHaveProperty('inv_fin_year');
  });
});

describe('cancelPrintJob', () => {
  it('calls the cancel-print-job function with the job id, not the old RPC', async () => {
    const { cancelPrintJob } = load();
    mockFetch.mockResolvedValue(answer(200, { success: true, message: 'Print job cancelled', print_job_id: JOB, cups_job_id: 7, timestamp: 't' }));
    const result = await cancelPrintJob(JOB);
    expect(result).toMatchObject({ success: true });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.invalid/functions/v1/cancel-print-job');
    expect(url).not.toContain('rpc/cancel_print_job');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(init.body)).toEqual({ print_job_id: JOB });
  });

  // cancel-print-job/index.ts and _shared/print-cancel.ts
  it.each([
    [409, 'CANNOT_CANCEL', 'The printer would not cancel this job: it may already be printing. Check the printer.', "This job can't be cancelled: it may already be printing. Check the printer."],
    [409, 'INVALID_STATUS', 'Cannot cancel a job with status: completed', 'This job has already finished or been cancelled.'],
    [502, 'CANCEL_FAILED', 'The print service did not confirm the cancel. The job may still print.', "The cancel wasn't confirmed. The job may still print. Check the printer."],
  ])('%i %s has its own text, not the server English', async (status, code, serverError, text) => {
    const { cancelPrintJob } = load();
    mockFetch.mockResolvedValue(answer(status, { success: false, code, error: serverError, print_job_id: JOB, timestamp: 't' }));
    expect(await cancelPrintJob(JOB)).toEqual({ success: false, code, error: text });
  });

  it('a refusal with no code of the app keeps the server text', async () => {
    const { cancelPrintJob } = load();
    mockFetch.mockResolvedValue(answer(404, { success: false, code: 'NOT_FOUND', error: 'Print job not found', print_job_id: undefined }));
    expect(await cancelPrintJob(JOB)).toEqual({ success: false, code: 'NOT_FOUND', error: 'Print job not found' });
  });
});

it('only PRINTER_FAILED blames the printer: a 500 never does', async () => {
  const { printGRNRange, printFailureMessage } = load();
  mockFetch.mockResolvedValue(answer(500, { success: false, error: 'No GRNs found in specified range' }));
  expect(printFailureMessage(await printGRNRange('A1', 'A1'))).not.toMatch(/printer/i);
});

describe('cancel RECORD_FAILED (cancel-print-job/index.ts: 500, cancelled at the printer, not recorded)', () => {
  it('has its own text, not the server English', async () => {
    const { cancelPrintJob } = load();
    mockFetch.mockResolvedValue(answer(500, { success: false, code: 'RECORD_FAILED', error: 'The job was cancelled, but it could not be recorded.', print_job_id: JOB, timestamp: 't' }));
    expect(await cancelPrintJob(JOB)).toEqual({
      success: false,
      code: 'RECORD_FAILED',
      error: "The job was cancelled at the printer, but the record couldn't be updated. Refresh the list.",
    });
  });
});

describe('getPrintJobs reads the {success, data} answer of get_print_jobs', () => {
  it('returns its rows, and a bare array still works', async () => {
    const { getPrintJobs } = load();
    const rows = [{ id: JOB, status: 'queued' }];
    mockFetch.mockResolvedValueOnce(answer(200, { success: true, data: rows, message: 'ok' }));
    expect(await getPrintJobs()).toEqual({ success: true, data: rows });
    mockFetch.mockResolvedValueOnce(answer(200, rows));
    expect(await getPrintJobs()).toEqual({ success: true, data: rows });
  });
});

describe('getPrinterStatus on a refusal that carries the server status', () => {
  it.each([['offline'], ['error']])('keeps status %s of a 503', async (status) => {
    const { getPrinterStatus } = load();
    mockFetch.mockResolvedValue(answer(503, { success: false, status, transport: 'bridge', error: 'The print bridge did not answer', printer_name: 'P', timestamp: 't' }));
    expect(await getPrinterStatus()).toMatchObject({ success: false, status });
  });

  it('keeps no status for the upgrading answer or a refusal without one', async () => {
    const { getPrinterStatus } = load();
    // nginx's maintenance answer (docker/nginx/api-http.conf): a code and a message, no status
    mockFetch.mockResolvedValueOnce(answer(503, { code: 'upgrading', message: "The facility's server is being updated. Try again in a few minutes." }));
    expect(await getPrinterStatus()).not.toHaveProperty('status');
    mockFetch.mockResolvedValueOnce(answer(403, { success: false, error: 'Admin, supervisor or staff access required to print', code: 'PRINT_FORBIDDEN' }));
    expect(await getPrinterStatus()).not.toHaveProperty('status');
  });
});

describe('a print whose 500 has no message of its own', () => {
  afterEach(() => setLanguage('en'));
  it.each(['en', 'gu'] as const)('shows the general print text in %s, never "HTTP error"', async (language) => {
    setLanguage(language);
    const { printGRNRange, printFailureMessage } = require('../print-service') as Service; // same module registry as setLanguage
    mockFetch.mockResolvedValue(answer(500, { success: false }));
    const result = await printGRNRange('A1', 'A1');
    expect(result.error).toBe(t('errors.print.submitFailed'));
    expect(printFailureMessage(result)).toBe(t('errors.print.submitFailed'));
    expect(printFailureMessage(result)).not.toMatch(/HTTP|500/);
  });

  // Product (WH-182) chose that a 503 with no code reads "not set up", because released backend v0.7.0 answers so when printing is
  // off. The price: nginx's own 503 {"message":"The upstream server is unavailable"} (functions container down) reads the same.
  // This test was a skipped bug note that said the opposite; it now pins the chosen behaviour.
  it('a 503 "upstream unavailable" (no code) reads "printing is not set up", as WH-182 decided', async () => {
    const { printGRNRange, printFailureMessage } = load();
    mockFetch.mockResolvedValue(answer(503, { message: 'The upstream server is unavailable' }));
    expect(printFailureMessage(await printGRNRange('A1', 'A1'))).toBe('Printing is not set up for this facility. Ask an admin to set it up.');
  });
});
