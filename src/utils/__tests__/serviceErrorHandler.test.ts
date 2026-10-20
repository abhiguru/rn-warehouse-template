import { setLanguage, t } from '@/i18n';
import { AppError } from '../appError';
import {
  categorizeError,
  executeRPC,
  isSessionInvalidationError,
} from '../serviceErrorHandler';

afterEach(() => setLanguage('en'));

describe('session invalidation errors', () => {
  it('recognizes the backend session expiry/revocation response', () => {
    const error = { code: '42501', message: 'Session expired or revoked' };

    expect(isSessionInvalidationError(error)).toBe(true);
    expect(categorizeError(error)).toMatchObject({
      category: 'auth',
      shouldLogout: true,
    });
  });

  it('does not treat an ordinary authorization denial as session invalidation', () => {
    const error = { code: '42501', message: 'Permission denied' };

    expect(isSessionInvalidationError(error)).toBe(false);
  });
});

describe('isOfflineFailure', () => {
  const { isOfflineFailure } = jest.requireActual('../serviceErrorHandler');
  it.each<[string, unknown, boolean]>([
    ['a React Native network failure', new TypeError('Network request failed'), true],
    ['a fetch failure', new Error('fetch failed'), true],
    ['a connection reset', new Error('ECONNRESET while reading'), true],
    ['a request timeout', new Error('Authentication request timed out'), true],
    ['a PostgREST-wrapped network failure', { message: 'TypeError: Network request failed', details: '', hint: '', code: '', status: 0 }, true],
    ['a PostgREST-wrapped timeout', { message: 'AbortError: The request timed out', code: '' }, true],
    ['a session change', new Error('Session changed'), false],
    ['a PostgREST-wrapped session change', { message: 'Error: Session changed', code: '' }, false],
    ['a missing session', new Error('Sign in required'), false],
    ['a pending identity verification', new Error('Warehouse identity verification required'), false],
    ['a server switch', new Error('Server switch in progress'), false],
    ['an aborted read', new Error('Aborted'), false],
    ['an unauthorized response', new Error('Unauthorized'), false],
    ['a 401 object', { status: 401, message: 'JWT expired' }, false],
    ['a 403 object', { status: 403, message: 'Forbidden' }, false],
    ['the backend session revocation', { code: '42501', message: 'Session expired or revoked' }, false],
    ['a gateway JWT rejection', { code: 'PGRST301', message: 'JWSError JWSInvalidSignature' }, false],
    ['a server error', new Error('502 Bad Gateway'), false],
    ['a validation error', new Error('invalid input'), false],
    ['an unrelated error', new Error('Something else'), false],
    ['an empty object', {}, false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('%s', (_, error, expected) => {
    expect(isOfflineFailure(error)).toBe(expected);
  });
});

// Review 2026-10-20, G13: the PostgREST client turns a timeout thrown inside fetch into "<name>: <message>" with
// no code; in Gujarati the app's own message has no English word, so the class name and the app's sentence tell.
describe('isOfflineFailure: a timeout is told by the error, not by English words', () => {
  const { isOfflineFailure } = jest.requireActual('../serviceErrorHandler');

  it('reads the class name in front of the text', () => {
    expect(isOfflineFailure({ message: 'TimeoutError: સમય પૂરો થયો', details: '', hint: '', code: '' })).toBe(true);
  });

  it("reads the app's own timeout sentence behind 'AppError', in Gujarati", () => {
    setLanguage('gu');
    expect(isOfflineFailure({ message: `AppError: ${t('errors.network.requestTimedOut')}`, code: '' })).toBe(true);
    expect(isOfflineFailure({ message: `AppError: ${t('errors.network.authTimedOut')}`, code: '' })).toBe(true);
  });

  it('leaves an AppError sentence that is no timeout, and a session change, alone', () => {
    setLanguage('gu');
    expect(isOfflineFailure({ message: `AppError: ${t('errors.auth.sessionChanged')}`, code: '' })).toBe(false);
    expect(isOfflineFailure({ message: 'Error: Session changed', code: '' })).toBe(false);
  });

  it('an expired token is not offline (PGRST303 as PGRST301)', () => {
    expect(isOfflineFailure({ code: 'PGRST303', message: 'JWT expired' })).toBe(false);
    expect(categorizeError({ code: 'PGRST303', message: 'JWT expired' }).category).toBe('auth');
  });
});

// Review 2026-10-20, contract items 7, 8 and 9: the wording of a failed call.
describe('executeRPC wording of a failed call', () => {
  let logged: jest.SpyInstance;
  let warned: jest.SpyInstance;
  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logged.mockRestore();
    warned.mockRestore();
  });

  const answering = (answer: { data: unknown; error: unknown }) => async () => ({ rpc: async () => answer });
  const failing = (message: string, code = '') => answering({ data: null, error: { message, details: '', hint: '', code } });
  const call = (client: () => Promise<unknown>, options: { write?: boolean; delete?: boolean; errorMessage?: string } = {}) =>
    executeRPC(client, 'fictional_rpc', {}, { context: 'test', ...options });

  it('a delete that timed out says it may have been deleted, with the detail screen wording', async () => {
    const result = await call(failing('TimeoutError: Request timeout'), { delete: true });
    expect(result).toMatchObject({
      success: false,
      message: 'No answer from the server. It may have been deleted. Go back to the list and check before trying again.',
      errorCode: 'TIMEOUT',
    });
  });

  it('a delete that failed after the request went out says the same; one that never went out says to check the connection', async () => {
    expect((await call(failing('Error: fetch failed: Software caused connection abort'), { delete: true })).message).toBe(t('errors.parsed.timeoutDeleteForm'));
    const unsent = async () => { throw new AppError('NETWORK', 'Network request failed: session refresh unavailable'); };
    expect((await call(unsent, { delete: true })).message).toBe(t('errors.parsed.network'));
  });

  it('a save that failed after the request went out says it may have been saved, in Gujarati too', async () => {
    for (const failure of ['Error: fetch failed: Software caused connection abort', 'TypeError: Network request failed', 'TimeoutError: Request timeout']) {
      expect((await call(failing(failure), { write: true })).message).toBe(t('errors.parsed.timeoutWrite'));
    }
    setLanguage('gu');
    expect((await call(failing('TypeError: Network request failed'), { write: true })).message).toBe(t('errors.parsed.timeoutWrite'));
    expect(t('errors.parsed.timeoutWrite')).toMatch(/[઀-૿]/);
  });

  it('a transport failure handed back as a PostgrestError (an Error subclass whose message is not enumerable) is still told as no answer', async () => {
    // postgrest-js 2.117 returns a failed fetch this way; spreading such an error would drop its message.
    class FakePostgrestError extends Error {
      details = '';
      hint = '';
      code = '';
      constructor(message: string) {
        super(message);
        this.name = 'PostgrestError';
      }
    }
    const answer = async () => ({ rpc: async () => ({ data: null, status: 0, error: new FakePostgrestError('TypeError: Network request failed') }) });
    const result = await call(answer, { write: true });
    expect(result.message).toBe(t('errors.parsed.timeoutWrite'));
    expect(result.error).toBe('TypeError: Network request failed');
  });

  it('a save that never went out says to check the connection', async () => {
    const unsent = async () => { throw new AppError('NETWORK', 'Network request failed: session refresh unavailable'); };
    expect((await call(unsent, { write: true })).message).toBe(t('errors.parsed.network'));
    expect((await call(failing('Error: fetch failed: Unable to resolve host "example.test"'), { write: true })).message).toBe(t('errors.parsed.network'));
  });

  it('a read that failed is only a connection failure', async () => {
    expect((await call(failing('TypeError: Network request failed'))).message).toBe(t('errors.parsed.network'));
    expect((await call(failing('TimeoutError: Request timeout'))).message).toBe(t('errors.parsed.network'));
  });

  it.each([['PGRST301'], ['PGRST303']])('an expired sign-in (%s) on a read says so, also over the caller\'s own message', async code => {
    for (const language of ['en', 'gu'] as const) {
      setLanguage(language);
      const result = await call(failing('JWT expired', code), { errorMessage: 'Failed to update' });
      expect(result.message).toBe(t('errors.code.sessionExpired'));
      expect(result.errorCode).toBe(code);
    }
  });

  it('a change refused for an expired token (PGRST303) says the sign-in was renewed; PGRST301 still says to sign in again', async () => {
    for (const language of ['en', 'gu'] as const) {
      setLanguage(language);
      const saved = await call(failing('JWT expired', 'PGRST303'), { write: true, errorMessage: 'Failed to update' });
      expect(saved.message).toBe(t('errors.code.signInRenewed'));
      const deleted = await call(failing('JWT expired', 'PGRST303'), { delete: true });
      expect(deleted.message).toBe(t('errors.code.signInRenewedDelete'));
      const rejected = await call(failing('JWT expired', 'PGRST301'), { write: true, errorMessage: 'Failed to update' });
      expect(rejected.message).toBe(t('errors.code.sessionExpired'));
    }
    setLanguage('en');
    expect(t('errors.code.signInRenewed')).toBe('Your sign-in was renewed. Tap Save again.');
  });

  it('a gateway\'s 502 or 504 (no PostgREST code) is no answer: a write may have been saved', async () => {
    const gateway = (status: number, message: string) => async () => ({
      rpc: async () => ({ data: null, status, error: { message, details: '', hint: '', code: '' } }),
    });
    expect((await call(gateway(502, 'Something unexpected'), { write: true })).message).toBe(t('errors.parsed.timeoutWrite'));
    expect((await call(gateway(504, 'The upstream server is timing out'), { write: true })).message).toBe(t('errors.parsed.timeoutWrite'));
    expect((await call(gateway(502, 'Something unexpected'))).message).toBe(t('errors.parsed.network'));
  });

  it('keeps the server\'s own sentence beside the app\'s text', async () => {
    const refused = async () => ({ rpc: async () => ({ data: { success: false, message: 'Order item not found' }, error: null }) });
    setLanguage('gu');
    const result = await call(refused, { write: true, errorMessage: 'Failed to update' });
    expect(result.serverMessage).toBe('Order item not found');
    expect(result.message).not.toBe('Order item not found');
  });

  it('never shows "RPC call failed" or the name of the call: an unusable text gives a plain sentence', async () => {
    const result = await call(failing('invalid input syntax for type uuid: "2660"', '22P02'), { write: true });
    expect(result.message).toBe(t('errors.general.somethingWrongRetry'));
    expect(result.message).not.toMatch(/RPC|fictional_rpc/);
  });
});
