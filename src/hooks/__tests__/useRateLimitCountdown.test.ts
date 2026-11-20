import { act, renderHook } from '@testing-library/react-native';
import { setLanguage, t } from '@/i18n';
import { useRateLimitCountdown } from '../useRateLimitCountdown';

type Countdown = ReturnType<typeof useRateLimitCountdown>;
let result: { current: Countdown };
// The hook's latest return value, read at the time of each check.
const countdown = new Proxy({} as Countdown, {
  get: (_target, key) => result.current[key as keyof Countdown],
});

beforeEach(async () => {
  jest.useFakeTimers();
  ({ result } = await renderHook(() => useRateLimitCountdown()));
});

afterEach(() => {
  jest.useRealTimers();
  setLanguage('en');
});

const handle = async (error: unknown): Promise<boolean> => {
  let handled = false;
  await act(() => {
    handled = result.current.handleRateLimitError(error);
  });
  return handled;
};

describe('useRateLimitCountdown', () => {
  it('starts from the number the app returned, whatever language its sentence is in', async () => {
    setLanguage('gu');
    // What signInWithPhone returns when the app's own limit applies.
    const message = t('errors.auth.otpWaitSeconds', { seconds: '૪૫' });
    expect(await handle({ success: false, error: message, rateLimited: true, retryAfterSeconds: 45 })).toBe(true);
    expect(countdown.isRateLimited).toBe(true);
    expect(countdown.secondsRemaining).toBe(45);
    expect(countdown.countdownText).toBe('૦:૪૫');
    expect(countdown.message).toBe('બીજો OTP મગાવતાં પહેલાં ૪૫ સેકન્ડ રાહ જુઓ.');
  });

  it('does not find a wait time inside a translated sentence', async () => {
    setLanguage('gu');
    expect(await handle(t('errors.auth.otpWaitSeconds', { seconds: '૪૫' }))).toBe(false);
    expect(countdown.isRateLimited).toBe(false);
  });

  it('has no countdown for the daily limit, which carries no wait', async () => {
    expect(await handle({ success: false, error: t('errors.auth.otpDailyLimit'), rateLimited: true, retryAfterSeconds: undefined })).toBe(false);
    expect(countdown.isRateLimited).toBe(false);
  });

  it('still reads the wait time from English server text', async () => {
    expect(await handle('Too many OTP requests. Please wait 30 seconds before trying again.')).toBe(true);
    expect(countdown.secondsRemaining).toBe(30);
    expect(countdown.countdownText).toBe('0:30');
    expect(countdown.message).toBe('Too many OTP requests. Please wait 30 seconds before trying again.');
  });

  it('writes its own messages in the app language', async () => {
    expect(await handle('rate limit exceeded')).toBe(true);
    expect(countdown.message).toBe('Too many requests. Please wait before trying again.');
    await act(() => countdown.clearRateLimit());
    setLanguage('gu');
    await act(() => countdown.triggerRateLimit(90000));
    expect(countdown.message).toBe('ઘણી બધી વિનંતીઓ થઈ. ફરી પ્રયાસ કરતાં પહેલાં ૧:૩૦ રાહ જુઓ.');
  });
});

// Backend migration 44: the server says how long to wait, or names a limit that has no wait.
describe('limits the server applies to sign-in codes', () => {
  it('counts down from the 15 minutes of the slow lane, not from a fixed 60 seconds', async () => {
    expect(await handle({ success: false, error: 'Please wait 15 minutes before requesting another code.', errorCode: 'otp_wait', retryAfterSeconds: 900 })).toBe(true);
    expect(countdown.secondsRemaining).toBe(900);
    expect(countdown.countdownText).toBe('15:00');
    expect(countdown.message).toBe('Please wait 15 minutes before requesting another code.');
  });

  it('starts no countdown for "try again later": there is no wait to count', async () => {
    expect(await handle({ success: false, error: 'Too many codes have been requested. Try again later.', errorCode: 'otp_rate_limited' })).toBe(false);
    expect(countdown.isRateLimited).toBe(false);
  });
});
