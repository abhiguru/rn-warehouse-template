import React from 'react';
import { act, create } from 'react-test-renderer';
import { setLanguage, t } from '@/i18n';
import { useRateLimitCountdown } from '../useRateLimitCountdown';

type Countdown = ReturnType<typeof useRateLimitCountdown>;
let countdown: Countdown;
let tree: ReturnType<typeof create> | undefined;
const Harness = () => {
  countdown = useRateLimitCountdown();
  return null;
};

beforeEach(() => {
  jest.useFakeTimers();
  act(() => {
    tree = create(React.createElement(Harness));
  });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.useRealTimers();
  setLanguage('en');
});

const handle = (error: unknown): boolean => {
  let handled = false;
  act(() => {
    handled = countdown.handleRateLimitError(error);
  });
  return handled;
};

describe('useRateLimitCountdown', () => {
  it('starts from the number the app returned, whatever language its sentence is in', () => {
    setLanguage('gu');
    // What signInWithPhone returns when the app's own limit applies.
    const message = t('errors.auth.otpWaitSeconds', { seconds: '૪૫' });
    expect(handle({ success: false, error: message, rateLimited: true, retryAfterSeconds: 45 })).toBe(true);
    expect(countdown.isRateLimited).toBe(true);
    expect(countdown.secondsRemaining).toBe(45);
    expect(countdown.countdownText).toBe('૦:૪૫');
    expect(countdown.message).toBe('બીજો OTP મગાવતાં પહેલાં ૪૫ સેકન્ડ રાહ જુઓ.');
  });

  it('does not find a wait time inside a translated sentence', () => {
    setLanguage('gu');
    expect(handle(t('errors.auth.otpWaitSeconds', { seconds: '૪૫' }))).toBe(false);
    expect(countdown.isRateLimited).toBe(false);
  });

  it('has no countdown for the daily limit, which carries no wait', () => {
    expect(handle({ success: false, error: t('errors.auth.otpDailyLimit'), rateLimited: true, retryAfterSeconds: undefined })).toBe(false);
    expect(countdown.isRateLimited).toBe(false);
  });

  it('still reads the wait time from English server text', () => {
    expect(handle('Too many OTP requests. Please wait 30 seconds before trying again.')).toBe(true);
    expect(countdown.secondsRemaining).toBe(30);
    expect(countdown.countdownText).toBe('0:30');
    expect(countdown.message).toBe('Too many OTP requests. Please wait 30 seconds before trying again.');
  });

  it('writes its own messages in the app language', () => {
    expect(handle('rate limit exceeded')).toBe(true);
    expect(countdown.message).toBe('Too many requests. Please wait before trying again.');
    act(() => countdown.clearRateLimit());
    setLanguage('gu');
    act(() => countdown.triggerRateLimit(90000));
    expect(countdown.message).toBe('ઘણી બધી વિનંતીઓ થઈ. ફરી પ્રયાસ કરતાં પહેલાં ૧:૩૦ રાહ જુઓ.');
  });
});

// Backend migration 44: the server says how long to wait, or names a limit that has no wait.
describe('limits the server applies to sign-in codes', () => {
  it('counts down from the 15 minutes of the slow lane, not from a fixed 60 seconds', () => {
    expect(handle({ success: false, error: 'Please wait 15 minutes before requesting another code.', errorCode: 'otp_wait', retryAfterSeconds: 900 })).toBe(true);
    expect(countdown.secondsRemaining).toBe(900);
    expect(countdown.countdownText).toBe('15:00');
    expect(countdown.message).toBe('Please wait 15 minutes before requesting another code.');
  });

  it('starts no countdown for "try again later": there is no wait to count', () => {
    expect(handle({ success: false, error: 'Too many codes have been requested. Try again later.', errorCode: 'otp_rate_limited' })).toBe(false);
    expect(countdown.isRateLimited).toBe(false);
  });
});
