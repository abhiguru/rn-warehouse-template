/**
 * A read is tried again when the network let it down, not when the server
 * answered that this session may not have it (M3-8): three more round trips
 * do not change a revoked session or a denied permission.
 */
import { queryClient, shouldRetryQuery } from '../queryClient';
import { noteDiscoveryAnswered, noteDiscoveryUpgrading, resetUpgradeNotice } from '@/config/upgradeNotice';

describe('shouldRetryQuery', () => {
  it('retries a network failure up to three times', () => {
    const error = new TypeError('Network request failed');
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(true);
    expect(shouldRetryQuery(3, error)).toBe(false);
  });

  it('does not ask again after the gateway\'s "upgrading" answer (the request layer already waited and asked once more)', () => {
    expect(shouldRetryQuery(0, { status: 503, code: 'upgrading', message: 'The facility\'s server is being updated.' })).toBe(false);
    expect(shouldRetryQuery(0, { status: 503, message: 'The upstream server is unavailable' })).toBe(true);
  });

  describe('while the notice says the facility is being upgraded', () => {
    afterEach(() => resetUpgradeNotice());

    it('an error that lost its code on the way (a service\'s message rethrown) is not asked again either', () => {
      const lostCode = new Error('The facility\'s server is being updated. Try again in a few minutes.');
      expect(shouldRetryQuery(0, lostCode)).toBe(true);
      noteDiscoveryUpgrading();
      expect(shouldRetryQuery(0, lostCode)).toBe(false);
      noteDiscoveryAnswered();
      expect(shouldRetryQuery(0, lostCode)).toBe(true);
    });
  });

  it('retries a server fault', () => {
    expect(shouldRetryQuery(0, { status: 503, message: 'Service unavailable' })).toBe(true);
    expect(shouldRetryQuery(0, new Error('Failed to fetch dispatches'))).toBe(true);
  });

  // "Active account required" never reaches the app over HTTP (the session check answers "Session expired or revoked"
  // first, docs/API_CONTRACT.md), so its words are no longer matched.
  it('does not read the words "Active account required"', () => {
    expect(shouldRetryQuery(0, new Error('Active account required'))).toBe(true);
  });

  it.each([
    [{ status: 401, message: 'JWT expired' }],
    [{ status: 403, message: 'Forbidden' }],
    [{ code: '42501', message: 'permission denied for table dispatch' }],
    [{ code: 'PGRST301', message: 'JWT expired' }],
    [new Error('Access denied: No accessible customers found')],
    [new Error('Session expired or revoked')],
    [new Error('Authentication required')],
  ])('does not retry what the server refused: %j', error => {
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('is the rule every query uses by default', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });
});
