import { getAuthTokenString } from '@/utils/authTokenUtils';
import {
  cancelPrintJob,
  getPrintJobs,
  getPrinterStatus,
  printDispatchRange,
  printGRNRange,
  printInvoiceRange,
} from '../print-service';

jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'https://warehouse.example.test', anonKey: 'fictional-anon-key-SENTINEL' }),
  createAuthenticatedFetch: () => (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const token = 'fictional-access-credential-SENTINEL';
const marker = 'FICTIONAL_PRIVATE_PRINT_SENTINEL';
const originalFetch = global.fetch;
let logs: jest.SpyInstance[];
// Join the raw console arguments so the logger's pretty-printed JSON keeps its quotes.
const logOutput = () => logs.flatMap(log => log.mock.calls.flat()).map(String).join('\n');

beforeEach(() => {
  jest.mocked(getAuthTokenString).mockResolvedValue(token);
  global.fetch = jest.fn();
  logs = ['log', 'warn', 'error', 'debug', 'info'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => {
  logs.forEach(log => log.mockRestore());
  global.fetch = originalFetch;
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  ({ ok, status, headers: { get: () => 'application/json' }, json: async () => body }) as any;

function expectPrivateLogs() {
  const output = logOutput();
  expect(output).not.toContain(token);
  expect(output).not.toContain('fictional-anon-key-SENTINEL');
  expect(output).not.toContain(marker);
  expect(output).not.toContain('Bearer');
}

describe('print job submission privacy', () => {
  it.each([
    ['GRN', () => printGRNRange(`FXG${marker}1`, `FXG${marker}2`), 'print-grn-preprinted', { start_gr_no: `FXG${marker}1`, end_gr_no: `FXG${marker}2` }],
    ['dispatch', () => printDispatchRange(`FXD${marker}1`, `FXD${marker}2`), 'print-dispatch-preprinted', { start_disp_no: `FXD${marker}1`, end_disp_no: `FXD${marker}2` }],
    ['invoice', () => printInvoiceRange(`FXI${marker}1`, `FXI${marker}2`, 2026), 'print-invoice-preprinted', { start_inv_no_str: `FXI${marker}1`, end_inv_no_str: `FXI${marker}2`, inv_fin_year: 2026 }],
  ] as const)('submits the %s range with the session and returns the response without logging either', async (_name, submit, path, body) => {
    const response = { success: true, message: marker, print_job: { cups_job_id: 7, job_uri: marker, printer: marker, content_size: 1 } };
    jest.mocked(fetch).mockResolvedValue(jsonResponse(response));
    expect(await submit()).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(`https://warehouse.example.test/functions/v1/${path}`, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      body: JSON.stringify(body),
    }));
    expectPrivateLogs();
    expect(logOutput()).toMatch(/"status": 200/);
    expect(logOutput()).toMatch(/"ok": true/);
  });

  it('returns the server error to the caller and logs only the failing status', async () => {
    jest.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, error: marker }, false, 422));
    expect(await printGRNRange('FXG0001', 'FXG0002')).toEqual({ success: false, error: marker });
    expectPrivateLogs();
    expect(logOutput()).toMatch(/"status": 422/);
    expect(logOutput()).toMatch(/"ok": false/);
  });

  it('reports a non-JSON gateway failure without reading or logging its body', async () => {
    const text = jest.fn(async () => marker);
    jest.mocked(fetch).mockResolvedValue({ ok: false, status: 502, headers: { get: () => 'text/html' }, text, json: text } as any);
    for (const submit of [() => printGRNRange('a', 'b'), () => printDispatchRange('a', 'b'), () => printInvoiceRange('a', 'b')]) {
      expect(await submit()).toEqual({
        success: false,
        error: 'Server error (502): The print server is unavailable. Please try again later.',
      });
    }
    expect(text).not.toHaveBeenCalled();
    expectPrivateLogs();
  });

  it('returns a transport exception to the caller without logging its message', async () => {
    jest.mocked(fetch).mockRejectedValue(new Error(marker));
    expect(await printInvoiceRange('a', 'b')).toEqual({ success: false, error: marker });
    expectPrivateLogs();
  });

  it('does not submit without a session', async () => {
    jest.mocked(getAuthTokenString).mockResolvedValue(null);
    expect(await printDispatchRange('a', 'b')).toEqual({ success: false, error: 'Authentication required. Please log in again.' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('print job queries privacy', () => {
  it('lists print jobs through the RPC without logging the rows, key or token', async () => {
    const jobs = [{ id: 'job-1', user_name: marker, document_range_start: marker, error_message: marker }];
    jest.mocked(fetch).mockResolvedValue(jsonResponse(jobs));
    expect(await getPrintJobs('grn', 10, 'pending')).toEqual({ success: true, data: jobs });
    expect(fetch).toHaveBeenCalledWith('https://warehouse.example.test/rest/v1/rpc/get_print_jobs', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${token}`, apikey: 'fictional-anon-key-SENTINEL' }),
      body: JSON.stringify({ p_job_type: 'grn', p_limit: 10, p_status: 'pending' }),
    }));
    expectPrivateLogs();
    expect(logOutput()).toMatch(/"status": 200/);
  });

  it('cancels a print job and returns the server message without logging it', async () => {
    jest.mocked(fetch).mockResolvedValue(jsonResponse({ message: marker }));
    expect(await cancelPrintJob('job-1')).toEqual({ success: true, message: marker });
    expectPrivateLogs();
  });

  it('returns a cancellation failure without logging the response', async () => {
    jest.mocked(fetch).mockResolvedValue(jsonResponse({ message: marker }, false, 409));
    expect(await cancelPrintJob('job-1')).toEqual({ success: false, error: marker });
    expectPrivateLogs();
    expect(logOutput()).toMatch(/"status": 409/);
  });

  it('returns printer diagnostics to the caller without logging them', async () => {
    jest.mocked(fetch).mockResolvedValue(jsonResponse({
      status: 'error', message: marker, printer_name: marker, printer_state: 5,
      printer_state_message: marker, printer_state_reasons: [marker], printer_is_accepting_jobs: false, queued_job_count: 2, timestamp: 't',
    }));
    expect(await getPrinterStatus('FICTIONAL_PRINTER')).toMatchObject({ success: true, status: 'error', message: marker, printer_state_reasons: [marker] });
    expectPrivateLogs();
    expect(logOutput()).not.toContain('FICTIONAL_PRINTER');
  });

  it('returns query exceptions to the caller without logging their messages', async () => {
    jest.mocked(fetch).mockRejectedValue(new Error(marker));
    expect(await getPrintJobs()).toEqual({ success: false, error: marker });
    expect(await cancelPrintJob('job-1')).toEqual({ success: false, error: marker });
    expect(await getPrinterStatus()).toEqual({ success: false, error: marker });
    expectPrivateLogs();
  });
});
