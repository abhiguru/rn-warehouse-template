/**
 * The gateway answers every `/functions/v1/` call with the same 503 body as the REST API while it upgrades
 * (`{"code":"upgrading", ...}`). The edge functions are called with plain fetch, so there is no error object to carry the
 * code: each caller reads it from the body, and the person sees the app's sentence in the app's language, not "(503)".
 */
import { setLanguage, t } from '@/i18n';
import { upgradingBody } from '@/utils/serverText';
import { generateCustomerStockPDF, generateDispatchPDF, generateGRNPDF, generateInvoicePDF } from '../pdf-service';
import { cancelPrintJob, printGRNRange, printInvoiceRange } from '../print-service';

const mockFetch = jest.fn();
jest.mock('../../config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));

const UPGRADING = { code: 'upgrading', message: "The facility's server is being updated. Try again in a few minutes." };
const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

beforeEach(() => { mockFetch.mockReset(); jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { setLanguage('en'); jest.restoreAllMocks(); });

it('upgradingBody reads the code and nothing else', () => {
  expect(upgradingBody(UPGRADING)).toBe(UPGRADING);
  expect(upgradingBody({ code: 'PGRST301', message: 'JWT expired' })).toBeUndefined();
  expect(upgradingBody({ error: 'boom' })).toBeUndefined();
  expect(upgradingBody(null)).toBeUndefined();
  expect(upgradingBody('upgrading')).toBeUndefined();
});

describe.each(['en', 'gu'] as const)('in %s', language => {
  beforeEach(() => setLanguage(language));

  it.each([
    ['GRN PDF', () => generateGRNPDF('TEST0001')],
    ['dispatch PDF', () => generateDispatchPDF('TEST0001')],
    ['invoice PDF', () => generateInvoicePDF(123, 2026)],
    ['stock PDF', () => generateCustomerStockPDF('fictional-customer')],
    ['print range', () => printGRNRange('1', '1')],
    ['invoice print range', () => printInvoiceRange('412', '412', 2025)],
    ['print job cancel', () => cancelPrintJob('job-1')],
  ] as const)('%s says the server is being updated', async (_name, call) => {
    mockFetch.mockResolvedValue(answer(503, UPGRADING));
    const result = await call();
    expect(result).toMatchObject({ success: false, error: t('components.upgrading.message') });
    expect((result as { error: string }).error).not.toMatch(/503/);
    if (language === 'gu') expect((result as { error: string }).error).not.toMatch(/[A-Za-z]/);
  });
});

it('another 503 keeps the status text', async () => {
  mockFetch.mockResolvedValue(answer(503, { message: 'The upstream server is unavailable' }));
  const result = await generateGRNPDF('TEST0001');
  expect(result.error).not.toBe(t('components.upgrading.message'));
});
