// Review 2026-10-10, M2-1 / X6-4 / M2-5 / M2-7 / M2-9 / M2-12: text typed into a
// customer filter is data, not filter syntax.
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { customerService } from '../customer-service';
import { containsPattern, escapeLike, orContains, quoteFilterValue } from '@/utils/postgrestFilter';
import { DEFAULT_CUSTOMER_FILTERS } from '@/types/customer.types';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn((reason: string) => ({ type: 'forced', reason })) }));
import { store } from '@/store';

/** A query builder that records its filters and resolves to `answer`. */
function recordingClient(answer: unknown = { data: [], error: null, count: 0 }) {
  const calls: Record<string, unknown[][]> = { or: [], ilike: [], eq: [] };
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'or', 'ilike', 'eq', 'order', 'range'])
    query[method] = (...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return query;
    };
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve);
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) });
  return calls;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('filter helpers', () => {
  test('LIKE wildcards and the escape character are literal', () => {
    expect(escapeLike('50%_x\\y')).toBe('50\\%\\_x\\\\y');
    expect(containsPattern('Surat_')).toBe('%Surat\\_%');
  });
  test('a value in an or-list is quoted, with quotes and backslashes escaped', () => {
    expect(quoteFilterValue('Shah, Mehta (Pvt) "A"')).toBe('"Shah, Mehta (Pvt) \\"A\\""');
    expect(orContains('name', 'Shah, Mehta 50%_x')).toBe('name.ilike."%Shah, Mehta 50\\\\%\\\\_x%"');
  });
});

describe('customer list filters', () => {
  test.each(['Shah, Ramesh', 'ABC (Pvt) Ltd', 'x,id.not.is.null', '50%', 'a_b', 'say "hi"'])(
    'search %p stays two quoted conditions',
    async search => {
      const calls = recordingClient();
      const result = await customerService.getCustomerList({ ...DEFAULT_CUSTOMER_FILTERS, search }, 20, 0);
      expect(result.success).toBe(true);
      expect(calls.or).toHaveLength(1);
      const filter = String(calls.or[0][0]);
      expect(filter).toBe(`${orContains('name', search)},${orContains('mobile', search)}`);
      // Outside the quoted values nothing is left but the two conditions.
      const outside = filter.replace(/"(?:[^"\\]|\\.)*"/g, '""');
      expect(outside).toBe('name.ilike."",mobile.ilike.""');
    }
  );

  test('the city filter treats % and _ as characters', async () => {
    const calls = recordingClient();
    await customerService.getCustomerList({ ...DEFAULT_CUSTOMER_FILTERS, city: 'Surat_%' }, 20, 0);
    expect(calls.ilike).toEqual([['city', '%Surat\\_\\%%']]);
  });

  test('the search text and the rows are not written to the device log', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    recordingClient({ data: [{ id: 'c1', name: 'Kiran Example', mobile: '9000000001' }], error: null, count: 1 });
    await customerService.getCustomerList({ ...DEFAULT_CUSTOMER_FILTERS, search: 'Kiran Example', city: 'Rajkot' }, 20, 0);
    const written = JSON.stringify(log.mock.calls);
    expect(written).not.toMatch(/Kiran Example|9000000001|Rajkot/);
  });

  test('a revoked session found by the list ends the session', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    recordingClient({ data: null, error: { code: '42501', message: 'Session expired or revoked' }, count: null });
    const result = await customerService.getCustomerList(DEFAULT_CUSTOMER_FILTERS, 20, 0);
    expect(result.success).toBe(false);
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  });

  test('an ordinary list error does not end the session', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    recordingClient({ data: null, error: { code: 'PGRST100', message: 'failed to parse logic tree' }, count: null });
    await customerService.getCustomerList(DEFAULT_CUSTOMER_FILTERS, 20, 0);
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
