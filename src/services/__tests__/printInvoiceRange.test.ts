/**
 * printInvoiceRange sends the invoice's financial year when given, and a 502 that names a
 * recorded job comes back as `unconfirmed` (the printer did not confirm it).
 */
import { printInvoiceRange } from '../print-service';

const mockFetch = jest.fn();
jest.mock('../../config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));

const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

beforeEach(() => mockFetch.mockReset());

it('sends the financial year it was given', async () => {
  mockFetch.mockResolvedValue(answer(200, { success: true }));
  await printInvoiceRange('412', '412', 2025);
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ start_inv_no_str: '412', end_inv_no_str: '412', inv_fin_year: 2025 });
});

it('marks a 502 with a recorded job as unconfirmed, and a plain failure as not', async () => {
  mockFetch.mockResolvedValueOnce(answer(502, { success: false, error: 'The printer did not confirm the job', print_job_id: 'j1' }));
  expect(await printInvoiceRange('412', '412', 2025)).toMatchObject({ success: false, unconfirmed: true });

  mockFetch.mockResolvedValueOnce(answer(500, { success: false, error: 'boom' }));
  expect(await printInvoiceRange('412', '412', 2025)).not.toHaveProperty('unconfirmed');
});
