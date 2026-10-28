/**
 * The next GRN or dispatch number (WS-8, backend migration 127): `suggest_document_number` where the backend has it,
 * the earlier `get_next_*_number` where it does not (or does not say), and never a number the app made up.
 */
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import {
  getDocumentNumbering,
  nextDocumentNumber,
  setDocumentNumbering,
  suggestDocumentNumber,
} from '../documentNumberingService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
const mockServer = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));

const withMigration = (n: number) => setFacilityRelease(mockServer, { backendRelease: 'v0.7.0', schemaHead: `${String(n).padStart(14, '0')}_x` });
const suggestion = (over: Record<string, unknown> = {}) => ({
  data: { success: true, number: 'A0042', hint: 'A####', scheme: 'letters', reason: null, ...over },
  error: null,
});

beforeEach(() => {
  mockRpc.mockReset();
  resetFacilityRelease();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('a backend with migration 127', () => {
  beforeEach(() => withMigration(127));

  it.each(['grn', 'dispatch'] as const)('asks suggest_document_number for %s and takes its number', async type => {
    mockRpc.mockResolvedValue(suggestion({ number: 'GRN/26-27/0042' }));
    await expect(nextDocumentNumber(type)).resolves.toBe('GRN/26-27/0042');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('suggest_document_number', { p_document_type: type });
  });

  it.each([
    ['TYPE_IT', 'free'],
    ['SERIES_FULL', 'letters'],
  ])('leaves the box empty (never a made-up number) when the reason is %s', async (reason, scheme) => {
    mockRpc.mockResolvedValue(suggestion({ number: null, hint: null, scheme, reason }));
    await expect(nextDocumentNumber('grn')).resolves.toBe('');
    await expect(nextDocumentNumber('dispatch')).resolves.toBe('');
  });

  it('throws when the call fails, so the form shows its "could not load" text', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed', code: '' } });
    await expect(nextDocumentNumber('grn')).rejects.toThrow();
  });

  it('passes the date to a financial-year rule', async () => {
    mockRpc.mockResolvedValue(suggestion());
    await suggestDocumentNumber('invoice', '2026-04-01');
    expect(mockRpc).toHaveBeenCalledWith('suggest_document_number', { p_document_type: 'invoice', p_date: '2026-04-01' });
  });
});

describe('a backend older than migration 127, or one that does not say', () => {
  it.each([
    ['grn', 'get_next_grn_number', 'A0042'],
    ['dispatch', 'get_next_dispatch_number', 'I0042'],
  ] as const)('%s keeps %s', async (type, rpcName, number) => {
    withMigration(126);
    mockRpc.mockResolvedValue({ data: number, error: null });
    await expect(nextDocumentNumber(type)).resolves.toBe(number);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(rpcName);
  });

  it('counts an unknown schemaHead as older', async () => {
    // Nothing recorded for the server.
    mockRpc.mockResolvedValue({ data: 'A0007', error: null });
    await expect(nextDocumentNumber('grn')).resolves.toBe('A0007');
    expect(mockRpc).toHaveBeenCalledWith('get_next_grn_number');
  });

  it.each([null, '', undefined])('has no G0001 or D0001 fallback: an empty answer (%p) leaves the box empty', async empty => {
    mockRpc.mockResolvedValue({ data: empty ?? null, error: null });
    await expect(nextDocumentNumber('grn')).resolves.toBe('');
    await expect(nextDocumentNumber('dispatch')).resolves.toBe('');
  });
});

describe('the rules', () => {
  const rule = (over: Record<string, unknown>) => ({
    document_type: 'grn', scheme: 'letters', prefix: '', width: 4, start: 1, first_letter: 'A', per_letter: 1000, check: true,
    fy_reset: false, hint: 'A####', existing_documents: 12, not_following: 0, updated_at: null, updated_by: null, ...over,
  });

  it('reads the three rules in the server order', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, rules: [rule({}), rule({ document_type: 'dispatch', scheme: 'sequence', prefix: 'I' }), rule({ document_type: 'invoice', scheme: 'year', fy_reset: true })] }, error: null });
    const rules = await getDocumentNumbering();
    expect(rules.map(r => [r.document_type, r.scheme])).toEqual([['grn', 'letters'], ['dispatch', 'sequence'], ['invoice', 'year']]);
    expect(mockRpc).toHaveBeenCalledWith('get_document_numbering');
  });

  it('fails when no rule comes back', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, rules: [] }, error: null });
    await expect(getDocumentNumbering()).rejects.toThrow();
  });

  it('sends the rule as given and reads the answer', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, changed: true, document_type: 'grn', existing_documents: 12, not_following: 2, next_number: 'GRN/26-27/0001', hint: 'GRN/26-27/####', reason: null }, error: null });
    const result = await setDocumentNumbering('grn', { scheme: 'year', prefix: 'GRN/', width: 4, start: 1, check: true });
    expect(mockRpc).toHaveBeenCalledWith('set_document_numbering', { p_document_type: 'grn', p_rule: { scheme: 'year', prefix: 'GRN/', width: 4, start: 1, check: true } });
    expect(result).toMatchObject({ changed: true, next_number: 'GRN/26-27/0001', not_following: 2, existing_documents: 12 });
  });

  it('throws the server sentence of a refusal', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'The prefix can have up to 10 characters: capital letters, digits, / and -.' } });
    await expect(setDocumentNumbering('grn', { scheme: 'year', prefix: 'x' })).rejects.toThrow('The prefix can have up to 10 characters');
  });
});
