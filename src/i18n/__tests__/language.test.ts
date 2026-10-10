import {
  deviceLanguage,
  formatIdentifier,
  getLanguage,
  languageFromLocale,
  localizeDigits,
  normalizeDigits,
  onLanguageChange,
  resolveLanguage,
  setLanguage,
} from '../language';

afterEach(() => setLanguage('en'));

describe('digits', () => {
  it('shows ૦-૯ in Gujarati and leaves English alone', () => {
    expect(localizeDigits('1,23,456.50', 'gu')).toBe('૧,૨૩,૪૫૬.૫૦');
    expect(localizeDigits('0123456789', 'gu')).toBe('૦૧૨૩૪૫૬૭૮૯');
    expect(localizeDigits('1,23,456.50', 'en')).toBe('1,23,456.50');
  });
  it('follows the app language when none is given', () => {
    expect(localizeDigits('24')).toBe('24');
    setLanguage('gu');
    expect(localizeDigits('24')).toBe('૨૪');
  });
  it('turns typed Gujarati digits into 0-9, in any language, and leaves other text alone', () => {
    expect(normalizeDigits('૧૨૩')).toBe('123');
    expect(normalizeDigits('DD૦૦૧૦ બટાકા 7')).toBe('DD0010 બટાકા 7');
    expect(Number(normalizeDigits('૪૫.૫'))).toBe(45.5);
  });
  it('round-trips', () => {
    expect(normalizeDigits(localizeDigits('2026-10-07', 'gu'))).toBe('2026-10-07');
  });
  it('shows an identifier exactly as stored, whatever the language', () => {
    setLanguage('gu');
    expect(formatIdentifier('DV0198')).toBe('DV0198');
    expect(formatIdentifier(53)).toBe('53');
    expect(formatIdentifier(null)).toBe('');
  });
});

describe('language choice', () => {
  it('reads Gujarati from a locale tag and English from anything else', () => {
    expect(languageFromLocale('gu')).toBe('gu');
    expect(languageFromLocale('gu-IN')).toBe('gu');
    expect(languageFromLocale('gu_IN')).toBe('gu');
    expect(languageFromLocale('GU-in')).toBe('gu');
    expect(languageFromLocale('en-IN')).toBe('en');
    expect(languageFromLocale('hi-IN')).toBe('en');
    expect(languageFromLocale('guz-KE')).toBe('en');
    expect(languageFromLocale(undefined)).toBe('en');
  });
  it('uses the saved choice, and the phone only for "system"', () => {
    expect(resolveLanguage('gu', 'en')).toBe('gu');
    expect(resolveLanguage('en', 'gu')).toBe('en');
    expect(resolveLanguage('system', 'gu')).toBe('gu');
    expect(resolveLanguage(undefined, 'gu')).toBe('gu');
  });
  it('reads the phone language without throwing', () => {
    expect(['en', 'gu']).toContain(deviceLanguage());
  });
  it('tells listeners once per change', () => {
    const seen: string[] = [];
    const stop = onLanguageChange(language => seen.push(language));
    setLanguage('gu');
    setLanguage('gu');
    setLanguage('en');
    stop();
    setLanguage('gu');
    expect(seen).toEqual(['gu', 'en']);
    expect(getLanguage()).toBe('gu');
  });
});
