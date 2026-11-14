/**
 * WH-197: the text a share or print alert shows for a thrown failure. Never the raw message; the log carries only the
 * error's class and code.
 */
import { setLanguage, t } from '@/i18n';
import { AppError } from '../appError';
import { failureTextForPeople } from '../failureTextForPeople';

const GENERIC = 'Failed to share PDF';
const RAW = 'Fictional raw English detail 7731';

let warn: jest.SpyInstance;
let logged: () => string;
beforeEach(() => {
  const spies = ['log', 'info', 'warn', 'error', 'debug'].map(method => jest.spyOn(console, method as 'log').mockImplementation(() => {}));
  warn = spies[2];
  logged = () => JSON.stringify(spies.flatMap(spy => spy.mock.calls));
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

describe('failureTextForPeople', () => {
  it('gives the text of a reason the app knows, in the app\'s language', () => {
    const text = failureTextForPeople(new Error('Insufficient stock'), GENERIC);
    expect(text).not.toBe(GENERIC);
    expect(text).not.toBe('Insufficient stock');
    setLanguage('gu');
    expect(failureTextForPeople(new Error('Insufficient stock'), GENERIC)).not.toBe(text);
  });

  it('gives the connection text for a network failure and for a timeout', () => {
    expect(failureTextForPeople(new TypeError('Network request failed'), GENERIC)).toBe(t('errors.parsed.network'));
    expect(failureTextForPeople(new AppError('NETWORK', 'x'), GENERIC)).toBe(t('errors.parsed.network'));
    expect(failureTextForPeople(new AppError('TIMEOUT', 'x'), GENERIC)).toBe(t('errors.parsed.network'));
  });

  it('gives the generic text for a message it does not know, and for no message', () => {
    expect(failureTextForPeople(new Error(RAW), GENERIC)).toBe(GENERIC);
    expect(failureTextForPeople(new Error('Session changed'), GENERIC)).toBe(GENERIC);
    expect(failureTextForPeople(new Error('Warehouse identity verification required'), GENERIC)).toBe(GENERIC);
    expect(failureTextForPeople(new Error(''), GENERIC)).toBe(GENERIC);
    expect(failureTextForPeople({ weird: true }, GENERIC)).toBe(GENERIC);
    expect(failureTextForPeople(undefined, GENERIC)).toBe(GENERIC);
  });

  it('never returns the raw message of an error that is not the app\'s own', () => {
    for (const message of [RAW, 'Session changed', 'Share cancelled by system', 'EACCES: permission denied']) {
      expect(failureTextForPeople(new Error(message), GENERIC)).not.toBe(message);
    }
  });

  it('keeps the message of an error the app raised itself (it is worded for people)', () => {
    expect(failureTextForPeople(new AppError('REFUSED', 'This document is larger than 25 MB.'), GENERIC)).toBe('This document is larger than 25 MB.');
  });

  it('logs only the error class and code, never the message', () => {
    failureTextForPeople(new AppError('REFUSED', RAW), GENERIC);
    failureTextForPeople(new TypeError(RAW), GENERIC);
    expect(warn).toHaveBeenCalled();
    const text = logged();
    expect(text).not.toContain(RAW);
    expect(text).toContain('AppError');
    expect(text).toContain('REFUSED');
    expect(text).toContain('TypeError');
  });
});
