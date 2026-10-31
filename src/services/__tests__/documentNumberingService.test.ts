/**
 * The next GRN or dispatch number (WS-8, backend migration 127): `suggest_document_number` where the backend has it,
 * the earlier `get_next_*_number` where it does not (or does not say), and never a number the app made up.
 */
import { setLanguage, t as tr } from '@/i18n';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import {
  getDocumentNumbering,
  nextDocumentNumber,
  numberForNewDate,
  setDocumentNumbering,
  suggestDocumentNumber,
} from '../documentNumberingService';
import { NumberingUnconfirmedError } from '../documentNumberingUnconfirmed';

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

  it('tells the caller the pattern, and why there is no number', async () => {
    const offers: unknown[] = [];
    mockRpc.mockResolvedValueOnce(suggestion({ number: 'A0042', hint: 'A####' }));
    await nextDocumentNumber('grn', undefined, offer => offers.push(offer));
    mockRpc.mockResolvedValueOnce(suggestion({ number: null, hint: null, scheme: 'free', reason: 'TYPE_IT' }));
    await nextDocumentNumber('grn', undefined, offer => offers.push(offer));
    mockRpc.mockResolvedValueOnce(suggestion({ number: null, hint: 'A####', reason: 'SERIES_FULL' }));
    await nextDocumentNumber('dispatch', undefined, offer => offers.push(offer));
    expect(offers).toEqual([
      { hint: 'A####', reason: null },
      { hint: null, reason: 'TYPE_IT' },
      { hint: 'A####', reason: 'SERIES_FULL' },
    ]);
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
  it('has no rule to tell: the caller is not told anything', async () => {
    withMigration(126);
    mockRpc.mockResolvedValue({ data: 'A0042', error: null });
    const told = jest.fn();
    await nextDocumentNumber('grn', undefined, told);
    await numberForNewDate('grn', '2027-04-02', told);
    expect(told).not.toHaveBeenCalled();
  });

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

  it('words a refusal in the app\'s own text, never the server\'s sentence', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'The prefix can have up to 10 characters: capital letters, digits, / and -.' } });
    const failure = await setDocumentNumbering('grn', { scheme: 'year', prefix: 'x' }).catch((error: Error) => error);
    expect((failure as Error).message).toBe(tr('numbering.edit.refused'));
  });

  it('words any other failure of a save, and of a read, in the app\'s own text', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint "x"' }, status: 409 });
    const save = await setDocumentNumbering('grn', { scheme: 'year', prefix: 'x' }).catch((error: Error) => error);
    expect((save as Error).message).toBe(tr('numbering.edit.saveFailed'));
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation "numbering" does not exist' } });
    const read = await getDocumentNumbering().catch((error: Error) => error);
    expect((read as Error).message).toBe(tr('numbering.screen.loadFailed'));
  });
});

describe('a set_document_numbering whose answer did not come through', () => {
  const rule = { scheme: 'year' as const, prefix: 'x' };
  it.each([
    ['a dropped connection', { data: null, error: { message: 'TypeError: Network request failed', code: '' } }],
    ['a timeout', { data: null, error: { message: 'TimeoutError: Request timeout', code: 'ABORT_ERR' } }],
    ['a gateway 502', { data: null, error: { message: '<html>Bad Gateway</html>', code: '' }, status: 502 }],
    ['a 5xx', { data: null, error: { message: 'internal', code: 'XX000' }, status: 500 }],
    ['an empty 200', { data: null, error: null, status: 200 }],
    ['a non-JSON 200', { data: null, error: { message: '<html>Maintenance</html>' }, status: 200 }],
  ])('%s is unconfirmed, with no raw server text', async (_name, answer) => {
    mockRpc.mockResolvedValue(answer);
    const failure = await setDocumentNumbering('grn', rule).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(NumberingUnconfirmedError);
    expect((failure as Error).message).toBe(tr('numbering.edit.unconfirmed'));
  });

  it('a refusal with a code is not unconfirmed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'The prefix is wrong.' }, status: 400 });
    await expect(setDocumentNumbering('grn', rule)).rejects.not.toBeInstanceOf(NumberingUnconfirmedError);
  });
});

describe('a refusal of set_document_numbering in Gujarati', () => {
  afterEach(() => setLanguage('en'));

  it('does not blame the connection for the server refusing the values (22023)', async () => {
    setLanguage('gu');
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'The prefix can have up to 10 characters: capital letters, digits, / and -.' } });
    const failure = await setDocumentNumbering('grn', { scheme: 'year', prefix: 'x' }).catch((error: Error) => error);
    expect((failure as Error).message).toBe(tr('numbering.edit.refused'));
    expect((failure as Error).message).not.toBe(tr('numbering.edit.saveFailed'));
  });

  it('still says the numbering could not be saved when the failure has no refusal code', async () => {
    setLanguage('gu');
    mockRpc.mockResolvedValue({ data: null, error: { message: 'something odd' } });
    const failure = await setDocumentNumbering('grn', { scheme: 'year', prefix: 'x' }).catch((error: Error) => error);
    expect((failure as Error).message).toBe(tr('numbering.edit.saveFailed'));
  });
});

describe('the form date', () => {
  it('goes to a financial-year rule as the day only (a timestamp is cut to its day)', async () => {
    withMigration(127);
    mockRpc.mockResolvedValue(suggestion({ number: 'GRN/26-27/0042', scheme: 'year' }));
    await nextDocumentNumber('grn', '2027-03-30');
    expect(mockRpc).toHaveBeenLastCalledWith('suggest_document_number', { p_document_type: 'grn', p_date: '2027-03-30' });
    await nextDocumentNumber('dispatch', '2027-03-30T00:00:00.000Z');
    expect(mockRpc).toHaveBeenLastCalledWith('suggest_document_number', { p_document_type: 'dispatch', p_date: '2027-03-30' });
  });

  it('is left out when the form holds none', async () => {
    withMigration(127);
    mockRpc.mockResolvedValue(suggestion());
    await nextDocumentNumber('grn', '');
    expect(mockRpc).toHaveBeenLastCalledWith('suggest_document_number', { p_document_type: 'grn' });
  });

  it('tells the caller the rule of the new date too', async () => {
    withMigration(127);
    mockRpc.mockResolvedValue(suggestion({ number: 'GRN/27-28/0001', hint: 'GRN/27-28/####', scheme: 'year' }));
    const told = jest.fn();
    await numberForNewDate('grn', '2027-04-02', told);
    expect(told).toHaveBeenCalledWith({ hint: 'GRN/27-28/####', reason: null });
  });

  it('gives the number of the new date under a financial-year rule only', async () => {
    withMigration(127);
    mockRpc.mockResolvedValueOnce(suggestion({ number: 'GRN/27-28/0001', scheme: 'year' }));
    await expect(numberForNewDate('grn', '2027-04-02')).resolves.toBe('GRN/27-28/0001');
    expect(mockRpc).toHaveBeenCalledWith('suggest_document_number', { p_document_type: 'grn', p_date: '2027-04-02' });
    mockRpc.mockResolvedValueOnce(suggestion({ number: 'A0042', scheme: 'letters' }));
    await expect(numberForNewDate('grn', '2027-04-02')).resolves.toBeNull();
    mockRpc.mockResolvedValueOnce(suggestion({ number: 'I0042', scheme: 'sequence' }));
    await expect(numberForNewDate('dispatch', '2027-04-02')).resolves.toBeNull();
  });

  it('asks nothing of an older backend', async () => {
    withMigration(126);
    await expect(numberForNewDate('grn', '2027-04-02')).resolves.toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
