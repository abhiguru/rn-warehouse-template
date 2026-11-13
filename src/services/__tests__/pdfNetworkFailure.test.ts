/**
 * WH-157: a PDF request that cannot reach the server shows the app's own connection sentence, in the app's language,
 * never the exception's text ("fetch failed: java.net.UnknownHostException: Unable to resolve host ..."), which names
 * a host. Checked through each of the six real PDF functions with only the network call faked.
 */
import {
  generateCustomerStockPDF,
  generateDispatchPDF,
  generateGRNPDF,
  generateInvoicePDF,
  generateStatementPDF,
  generateTemperatureReportPDF,
} from '../pdf-service';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { setLanguage, t } from '@/i18n';

jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'https://warehouse.example.test' }),
  createAuthenticatedFetch: () => (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const originalFetch = global.fetch;
const reply = (body: Record<string, unknown>, status: number) =>
  ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body }) as unknown as Response;

const calls: Array<[string, () => Promise<{ success: boolean; error?: string }>]> = [
  ['GRN', () => generateGRNPDF('FXG001')],
  ['dispatch', () => generateDispatchPDF('FXD001')],
  ['invoice', () => generateInvoicePDF(7, 2026)],
  ['customer stock', () => generateCustomerStockPDF('fictional-customer')],
  ['statement', () => generateStatementPDF('fictional-customer')],
  ['temperature report', () => generateTemperatureReportPDF('fictional-device', '2026-11-01', '2026-11-07')],
];

const failures: Array<[string, () => Error]> = [
  ['a native "fetch failed" with the host', () => new TypeError('fetch failed: java.net.UnknownHostException: Unable to resolve host "warehouse.example.test": No address associated with hostname')],
  ['"Network request failed"', () => new TypeError('Network request failed')],
];

const LEAKS = [/fetch failed/i, /java\./i, /UnknownHost/i, /warehouse\.example\.test/i, /Unable to resolve/i];

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(getAuthTokenString).mockResolvedValue('fictional-access-credential');
});
afterEach(() => {
  global.fetch = originalFetch;
  setLanguage('en');
});

describe.each(calls)('the %s PDF', (_name, generate) => {
  describe.each(failures)('when the request fails with %s', (_label, makeError) => {
    it.each([['en'], ['gu']] as const)("shows the app's own connection sentence in %s and none of the exception", async language => {
      setLanguage(language);
      global.fetch = jest.fn().mockRejectedValue(makeError());
      const result = await generate();
      expect(result.success).toBe(false);
      expect(result.error).toBe(t('common.checkConnection'));
      expect(result.error).toBe(language === 'en' ? 'Check your connection and try again.' : 'તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.');
      for (const leak of LEAKS) expect(result.error).not.toMatch(leak);
    });
  });

  it("shows the server's own message for a refusal, as before", async () => {
    global.fetch = jest.fn().mockResolvedValue(reply({ success: false, error: 'Fictional refusal text' }, 400));
    const result = await generate();
    expect(result).toMatchObject({ success: false, error: 'Fictional refusal text' });
  });

  it.each([['en'], ['gu']] as const)('keeps the upgrading (503) answer in its own wording in %s', async language => {
    setLanguage(language);
    global.fetch = jest.fn().mockResolvedValue(reply({ code: 'upgrading', error: 'upgrading' }, 503));
    const result = await generate();
    expect(result.success).toBe(false);
    expect(result.error).toBe(t('components.upgrading.message'));
    expect(result.error).not.toBe(t('common.checkConnection'));
  });
});

it('an exception that is not a lost connection gets the generic sentence, not its own text', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('Unexpected token < in JSON at warehouse.example.test'));
  const result = await generateGRNPDF('FXG001');
  expect(result.error).toBe(t('errors.pdf.generateFailed'));
});
