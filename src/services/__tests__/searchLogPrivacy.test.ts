// Review 2026-10-10, X4-13: a development build writes the console to logcat,
// so the search and customer services must not print what was typed or what
// the server answered.
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { customerService } from '../customer-service';
import { searchService } from '../search-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn((reason: string) => ({ type: 'forced', reason })) }));

const customer = {
  id: '5b0f6c5e-0000-4000-8000-000000000001',
  name: 'Kalpesh Vaghasiya',
  mobile: '919876500001',
  city: 'Unjha',
  email: 'kalpesh@example.invalid',
  address: '12 Fictional Market Yard, Unjha',
};
// Everything a log line must not contain: the record, the query and the server's wording.
const secrets = ['Kalpesh', 'Vaghasiya', '9876500001', 'Unjha', 'Fictional Market', 'example.invalid', 'Jeera Bold', 'jute bag', 'server said'];

let written: string[];
function rpcAnswers(answer: unknown) {
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc: jest.fn(async () => answer) });
}
function expectNothingPrivateWritten() {
  const text = written.join('\n');
  for (const secret of secrets) expect(text).not.toContain(secret);
}

beforeEach(() => {
  jest.clearAllMocks();
  written = [];
  for (const method of ['log', 'info', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      written.push(args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    });
  }
});
afterEach(() => jest.restoreAllMocks());

describe('search service', () => {
  test('a customer search prints neither the query nor a result', async () => {
    rpcAnswers({ data: [customer], error: null });
    const results = await searchService.searchCustomers('Kalpesh');
    expect(results).toEqual([
      { label: customer.name, value: customer.id, detail: '12 Fictional Market Yard', city: 'Unjha', mobile: customer.mobile, type: 'customer' },
    ]);
    expectNothingPrivateWritten();
  });

  test('a refused customer search prints the error code only', async () => {
    rpcAnswers({ data: null, error: { code: '42501', message: 'server said Kalpesh Vaghasiya is not yours' } });
    expect(await searchService.searchCustomers('Kalpesh')).toEqual([]);
    expectNothingPrivateWritten();
    expect(written.join('\n')).toContain('42501');
  });

  test('an item search prints neither the query nor a result', async () => {
    rpcAnswers({ data: { items: [{ id: 'i1', name: 'Jeera Bold', packaging: 'jute bag' }] }, error: null });
    expect(await searchService.searchGRNItems('Jeera Bold')).toEqual([{ label: 'Jeera Bold', value: 'i1', detail: 'jute bag', type: 'item' }]);
    expectNothingPrivateWritten();
  });

  test('an item answer of an unexpected shape is not printed', async () => {
    rpcAnswers({ data: { rows: [{ name: 'Jeera Bold' }] }, error: null });
    expect(await searchService.searchGRNItems('Jeera Bold')).toEqual([]);
    expectNothingPrivateWritten();
  });

  test('a dispatch search prints neither the number typed nor the answer', async () => {
    rpcAnswers({ data: { success: true, data: { dispatches: [{ id: 'd1', disp_no: 'DD0003', customer_name: customer.name }] } }, error: null });
    await searchService.searchDispatches('Kalpesh');
    expectNothingPrivateWritten();
  });
});

describe('customer service', () => {
  test('a search prints neither the query nor a result', async () => {
    rpcAnswers({ data: { success: true, data: [customer] }, error: null });
    const results = await customerService.searchCustomers('Kalpesh');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe(customer.name);
    expectNothingPrivateWritten();
  });

  test('an answer of an unexpected shape is not printed', async () => {
    rpcAnswers({ data: { customers: [customer] }, error: null });
    expect(await customerService.searchCustomers('Kalpesh')).toEqual([]);
    expectNothingPrivateWritten();
  });

  test('a refused search prints the error code only', async () => {
    rpcAnswers({ data: null, error: { code: '42501', message: 'server said Kalpesh Vaghasiya is not yours', details: customer.mobile } });
    await expect(customerService.searchCustomers('Kalpesh')).rejects.toBeTruthy();
    expectNothingPrivateWritten();
    expect(written.join('\n')).toContain('42501');
  });
});
