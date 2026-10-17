/**
 * M02: a request of the gated fetch is in flight, and a write holds a server switch back,
 * until its body has been read or its time limit passes (two minutes for the document and
 * print functions). A service that returns on a gateway's error page without reading it ends
 * the request at once (discardBody), so the switch is free as soon as the service answers.
 */
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { initializeSupabase, isOperatorSwitchFree } from '@/config/supabaseConfig';
import {
  generateCustomerStockPDF,
  generateDispatchPDF,
  generateGRNPDF,
  generateInvoicePDF,
  generateReportPDF,
} from '../pdf-service';
import { printGRNRange } from '../print-service';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({})) }));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const originalFetch = global.fetch;
let logs: jest.SpyInstance[];
beforeEach(() => {
  initializeSupabase('https://warehouse.example.test', 'fictional-anon-key');
  jest.mocked(getAuthTokenString).mockResolvedValue('fictional-access-credential');
  global.fetch = jest.fn();
  logs = ['log', 'info', 'warn', 'error', 'debug'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => {
  logs.forEach(log => log.mockRestore());
  global.fetch = originalFetch;
});

/** A gateway's 502 page whose body never finishes arriving; nothing but the discard ends it early. */
const errorPage = () =>
  ({
    ok: false,
    status: 502,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: () => new Promise<string>(() => undefined),
    json: () => new Promise<never>(() => undefined),
  }) as unknown as Response;

test.each([
  ['a GRN PDF', () => generateGRNPDF('FX0001')],
  ['a dispatch PDF', () => generateDispatchPDF('FXD0001')],
  ['an invoice PDF', () => generateInvoicePDF(1, 2026)],
  ['a customer stock PDF', () => generateCustomerStockPDF('customer-1')],
  ['a report PDF', () => generateReportPDF({ report: 'stock-summary' })],
  ['a print job', () => printGRNRange('FX0001', 'FX0002')],
])('%s answered with a gateway error page ends its request at once', async (_name, ask) => {
  const signals: AbortSignal[] = [];
  jest.mocked(fetch).mockImplementation(async (_url, init) => {
    signals.push(init!.signal!);
    return errorPage();
  });
  expect(await ask()).toMatchObject({ success: false });
  expect(signals).toHaveLength(1);
  expect(signals[0].aborted).toBe(true);
  expect(isOperatorSwitchFree()).toBe(true);
});
