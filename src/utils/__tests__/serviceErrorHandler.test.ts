import {
  categorizeError,
  isSessionInvalidationError,
} from '../serviceErrorHandler';

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
