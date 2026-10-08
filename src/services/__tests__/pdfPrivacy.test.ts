import { getAuthTokenString } from '@/utils/authTokenUtils';
import {
  acceptSignedUrl,
  generateGRNPDF,
  generateDispatchPDF,
  generateInvoicePDF,
  generateCustomerStockPDF,
} from '../pdf-service';

let mockConfigUrl = 'http://localhost:28000';
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: mockConfigUrl }),
  createAuthenticatedFetch: () => (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const originalFetch = global.fetch;
let logs: jest.SpyInstance[];
beforeEach(() => {
  mockConfigUrl = 'http://localhost:28000';
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

const jsonResponse = (body: Record<string, unknown>, ok = true) =>
  ({ ok, status: ok ? 200 : 500, headers: { get: () => 'application/json' }, json: async () => body }) as any;

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
    jest.mocked(fetch).mockResolvedValue(jsonResponse({
      success: true,
      pdf_url: url,
      expires_in: 60,
      document: { customer: 'Fictional Customer' },
    }));
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

it('rewrites a loopback signed URL to the configured physical-device origin', async () => {
  mockConfigUrl = 'http://169.254.49.167:18000';
  jest.mocked(fetch).mockResolvedValue(jsonResponse({
    success: true,
    pdf_url:
      'http://localhost:18000/storage/v1/object/sign/documents/dispatch.pdf?token=private',
    expires_in: 60,
  }));

  expect(await generateDispatchPDF('TEST0001')).toMatchObject({
    success: true,
    pdfUrl:
      'http://169.254.49.167:18000/storage/v1/object/sign/documents/dispatch.pdf?token=private',
  });
});

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
  expect(await generateInvoicePDF(123, 2026)).toEqual({
    success: false,
    error: 'Authentication required. Please log in again.',
  });
  expect(fetch).not.toHaveBeenCalled();
});

describe('acceptSignedUrl', () => {
  beforeEach(() => { mockConfigUrl = 'https://warehouse.example.test'; });

  it.each([
    'https://warehouse.example.test/storage/v1/object/sign/documents/a.pdf?token=t',
    'https://cdn.example.test/documents/a.pdf?token=t',
    'https://warehouse.example.test:8443/a.pdf',
  ])('accepts the HTTPS link %s', url => {
    expect(acceptSignedUrl(url)).toBe(url);
  });

  it('accepts a plain-HTTP link only on the configured development origin', () => {
    mockConfigUrl = 'http://169.254.49.167:18000';
    const sameOrigin = 'http://169.254.49.167:18000/storage/v1/object/sign/documents/a.pdf?token=t';
    expect(acceptSignedUrl(sameOrigin)).toBe(sameOrigin);
    expect(acceptSignedUrl('http://169.254.49.167:28000/a.pdf')).toBeNull();
    expect(acceptSignedUrl('http://evil.example.test/a.pdf?token=t')).toBeNull();
  });

  it.each([
    'http://evil.example.test/storage/v1/object/sign/documents/a.pdf?token=t',
    'http://warehouse.example.test/a.pdf',
    'ftp://warehouse.example.test/a.pdf',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('refuses %p', url => {
    expect(acceptSignedUrl(url)).toBeNull();
  });

  it('refuses every link when the configured origin itself is malformed', () => {
    mockConfigUrl = 'not-an-origin';
    expect(acceptSignedUrl('http://169.254.49.167:18000/a.pdf')).toBeNull();
    expect(acceptSignedUrl('https://warehouse.example.test/a.pdf')).toBe('https://warehouse.example.test/a.pdf');
  });
});

it.each([
  ['GRN', () => generateGRNPDF('TEST0001')],
  ['dispatch', () => generateDispatchPDF('TEST0001')],
  ['invoice', () => generateInvoicePDF(123, 2026)],
  ['stock', () => generateCustomerStockPDF('fictional-customer')],
] as const)(
  'returns a user-facing error instead of an insecure %s download link',
  async (_name, generate) => {
    mockConfigUrl = 'https://warehouse.example.test';
    jest.mocked(fetch).mockResolvedValue(jsonResponse({
      success: true,
      pdf_url: 'http://evil.example.test/storage/v1/object/sign/documents/test.pdf?token=fictional-private-link',
      expires_in: 60,
      document: { customer: 'Fictional Customer' },
    }));
    const result = await generate();
    expect(result).toEqual({
      success: false,
      error: 'The server returned a download link that is not secure. Contact your operator.',
    });
    expect(result).not.toHaveProperty('pdfUrl');
    logs.forEach(log => expect(log).not.toHaveBeenCalled());
  }
);

it('still accepts a loopback link rewritten onto an HTTPS configured origin', async () => {
  mockConfigUrl = 'https://warehouse.example.test';
  jest.mocked(fetch).mockResolvedValue(jsonResponse({
    success: true,
    pdf_url: 'http://kong:8000/storage/v1/object/sign/documents/grn.pdf?token=private',
    expires_in: 60,
  }));
  expect(await generateGRNPDF('TEST0001')).toMatchObject({
    success: true,
    pdfUrl: 'https://warehouse.example.test/storage/v1/object/sign/documents/grn.pdf?token=private',
  });
});

it('reports a malformed download link as insecure', async () => {
  jest.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, pdf_url: 'not a url', expires_in: 60 }));
  expect((await generateCustomerStockPDF('fictional-customer')).success).toBe(false);
});
