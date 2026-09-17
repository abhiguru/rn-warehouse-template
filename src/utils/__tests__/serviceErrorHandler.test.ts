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
