import { getAuthTokenString } from '@/utils/authTokenUtils';
import {
  generateGRNPDF,
  generateDispatchPDF,
  generateInvoicePDF,
  generateCustomerStockPDF,
} from '../pdf-service';

jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:28000' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const originalFetch = global.fetch;
let logs: jest.SpyInstance[];
beforeEach(() => {
  jest
    .mocked(getAuthTokenString)
    .mockResolvedValue('fictional-access-credential');
  global.fetch = jest.fn();
  logs = ['log', 'warn', 'error', 'debug'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => {
  logs.forEach(log => log.mockRestore());
  global.fetch = originalFetch;
});

it.each([
  ['GRN', () => generateGRNPDF('TEST0001')],
  ['dispatch', () => generateDispatchPDF('TEST0001')],
  ['invoice', () => generateInvoicePDF(123, 2026)],
  ['stock', () => generateCustomerStockPDF('fictional-customer')],
] as const)(
  'returns the %s private download without logging its signed URL or document',
  async (_name, generate) => {
    const url =
      'http://localhost:28000/storage/v1/object/sign/documents/test.pdf?token=fictional-private-link';
    jest
      .mocked(fetch)
      .mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          pdf_url: url,
          expires_in: 60,
          document: { customer: 'Fictional Customer' },
        }),
      } as any);
    expect(await generate()).toMatchObject({
      success: true,
      pdfUrl: url,
      expiresIn: 60,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fictional-access-credential',
        }),
      })
    );
    logs.forEach(log => expect(log).not.toHaveBeenCalled());
  }
);

it('reports a non-JSON gateway failure without reading or logging the response body', async () => {
  const text = jest.fn(async () => 'sensitive upstream diagnostic');
  jest
    .mocked(fetch)
    .mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      text,
    } as any);
  expect(await generateGRNPDF('TEST0001')).toEqual({
    success: false,
    error: 'Server error (502): PDF generation service unavailable.',
  });
  expect(text).not.toHaveBeenCalled();
  logs.forEach(log => expect(log).not.toHaveBeenCalled());
});

it('does not request a PDF without a session', async () => {
  jest.mocked(getAuthTokenString).mockResolvedValue(null);
  expect((await generateInvoicePDF(123, 2026)).success).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
