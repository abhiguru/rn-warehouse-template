/**
 * WH-144: an English text with no Gujarati text shows in English when the app is in Gujarati, and the other texts stay
 * in Gujarati. The Gujarati table is replaced by the real one with three texts removed: a string, a text with a
 * placeholder and a plural.
 */
import { setLanguage, t } from '..';
import { gu as realGu } from '../locales/gu';

jest.mock('../locales/gu', () => {
  const { gu } = jest.requireActual('../locales/gu');
  const language = { ...gu.settings.language };
  delete language.title;
  delete language.optionLabel;
  const list = { ...gu.users.list };
  delete list.customersAssigned;
  return { gu: { ...gu, settings: { ...gu.settings, language }, users: { ...gu.users, list } } };
});

afterEach(() => setLanguage('en'));

describe('an English-only text in Gujarati mode', () => {
  it('the fixture really lacks the keys', () => {
    expect((realGu.settings.language as Record<string, unknown>).title).toBeUndefined();
    expect((realGu.users.list as Record<string, unknown>).customersAssigned).toBeUndefined();
  });

  it('shows the English text, for a text, for a text with a placeholder and for a plural', () => {
    setLanguage('gu');
    expect(t('settings.language.title')).toBe('Language');
    expect(t('settings.language.optionLabel', { language: 'ગુજરાતી' })).toBe('ગુજરાતી language');
    expect(t('users.list.customersAssigned', { count: 1 })).toMatch(/ customer assigned$/); // the English singular form (the digit follows the phone language)
    expect(t('users.list.customersAssigned', { count: 12 })).toMatch(/customers assigned$/);
  });

  it('leaves every other text in Gujarati', () => {
    setLanguage('gu');
    expect(t('auth.review.screenTitle')).toBe('મંજૂરીની અરજીઓ');
  });

  it('does not touch English mode', () => {
    expect(t('settings.language.title')).toBe('Language');
  });
});

describe('WH-197: an English fallback is English throughout in Gujarati mode', () => {
  it('keeps 0-9 digits, not Gujarati digits', () => {
    setLanguage('gu');
    expect(t('users.list.customersAssigned', { count: 1 })).toBe('1 customer assigned');
    expect(t('users.list.customersAssigned', { count: 12 })).toBe('12 customers assigned');
  });

  it('uses the English plural rule: zero is plural', () => {
    setLanguage('gu');
    expect(t('users.list.customersAssigned', { count: 0 })).toBe('0 customers assigned');
  });

  it('a text that has a Gujarati text still gets Gujarati digits', () => {
    setLanguage('gu');
    expect(t('users.list.customersAssigned', { count: 1 }, 'en')).toBe('1 customer assigned');
    expect(t('auth.review.screenTitle')).toBe('મંજૂરીની અરજીઓ');
  });
});
