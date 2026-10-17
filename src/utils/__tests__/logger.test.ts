import { createLogger } from '../logger';

const logger = createLogger('Test');

/** What the logger writes for an error, as one string. */
function written(message: unknown, ...args: unknown[]): string {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  logger.error(message, ...args);
  const text = spy.mock.calls.map((call) => call.join(' ')).join('\n');
  spy.mockRestore();
  // The time stamp at the start is not part of what is being checked.
  return text.replace(/^\[[^\]]*\]\s*/, '');
}

describe('what the logger hides', () => {
  it.each([
    ['the app\'s own 12-digit form', { mobile: '919876543210' }, '919876543210'],
    ['a 10-digit number', { mobile: '9876543210' }, '9876543210'],
    ['a number with +91', '+919876543210', '9876543210'],
    ['a number inside a sentence', 'OTP sent to 919876543210 just now', '919876543210'],
  ])('a phone number in %s', (_name, value, secret) => {
    const text = written('Customer save failed', value);

    expect(text).not.toContain(secret);
    expect(text).toContain('[REDACTED_PHONE]');
  });

  it.each([
    [{ otp: '123456' }],
    [{ otp_code: 482913 }],
    [{ verification_code: '4821' }],
    ['The OTP is 123456'],
    ['login code: 482913'],
  ])('a login code in %j', (value) => {
    const text = written('Sign-in failed', value);

    expect(text).not.toMatch(/123456|482913|4821/);
    expect(text).toContain('[REDACTED_OTP]');
  });
});

describe('what the logger keeps', () => {
  it.each([
    [{ invoice_no: 2026 }, '2026'],
    [{ amount: 12500.5 }, '12500.5'],
    [{ inv_fin_year: 2026, total: 998 }, '998'],
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }, '23505'],
    ['Invoice line charge must be between 0 and 999999', '999999'],
  ])('ordinary numbers in %j', (value, kept) => {
    const text = written('Invoice save failed', value);

    expect(text).toContain(kept);
    expect(text).not.toContain('REDACTED');
  });
});

describe('an error object', () => {
  it('is written as its name and message, not as "{}", and is still redacted', () => {
    const text = written('Refresh failed', new TypeError('network down for 919888880001'));

    expect(text).toContain('TypeError: network down for [REDACTED_PHONE]');
    expect(text).not.toContain('{}');
    expect(text).not.toContain('919888880001');
  });
});
