/**
 * A read is tried again when the network let it down, not when the server
 * answered that this session may not have it (M3-8): three more round trips
 * do not change a revoked session or a denied permission.
 */
import { queryClient, shouldRetryQuery } from '../queryClient';

describe('shouldRetryQuery', () => {
  it('retries a network failure up to three times', () => {
    const error = new TypeError('Network request failed');
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(true);
    expect(shouldRetryQuery(3, error)).toBe(false);
  });

  it('retries a server fault', () => {
    expect(shouldRetryQuery(0, { status: 503, message: 'Service unavailable' })).toBe(true);
    expect(shouldRetryQuery(0, new Error('Failed to fetch dispatches'))).toBe(true);
  });

  it.each([
    [{ status: 401, message: 'JWT expired' }],
    [{ status: 403, message: 'Forbidden' }],
    [{ code: '42501', message: 'permission denied for table dispatch' }],
    [{ code: 'PGRST301', message: 'JWT expired' }],
    [new Error('Access denied: No accessible customers found')],
    [new Error('Session expired or revoked')],
    [new Error('Active account required')],
    [new Error('Authentication required')],
  ])('does not retry what the server refused: %j', error => {
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('is the rule every query uses by default', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });
});
