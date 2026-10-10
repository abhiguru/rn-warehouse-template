import { t, setLanguage, type TranslationKey } from '..';
import { en } from '../locales/en';
import { gu } from '../locales/gu';
import type { Plural } from '../types';

afterEach(() => setLanguage('en'));

type Entry = { key: string; en: string | Plural; gu: string | Plural | undefined };
const isPlural = (value: unknown): value is Plural =>
  typeof value === 'object' && value !== null && typeof (value as Plural).other === 'string' && typeof (value as Plural).one === 'string';

/** Every text of both tables, side by side. */
function entries(source: unknown, other: unknown, prefix = ''): Entry[] {
  return Object.entries(source as Record<string, unknown>).flatMap(([name, value]) => {
    const key = `${prefix}${name}`;
    const match = (other as Record<string, unknown> | undefined)?.[name];
    if (typeof value === 'string' || isPlural(value)) return [{ key, en: value, gu: match as Entry['gu'] }];
    return entries(value, match, `${key}.`);
  });
}
const ALL = entries(en, gu);
const texts = (value: string | Plural) => (typeof value === 'string' ? [value] : [value.one, value.other]);
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();

describe('t', () => {
  it('returns the text of the app language', () => {
    expect(t('settings.language.title')).toBe('Language');
    setLanguage('gu');
    expect(t('settings.language.title')).toBe('ભાષા');
  });
  it('can be asked for one language whatever the app language is', () => {
    expect(t('settings.language.title', undefined, 'gu')).toBe('ભાષા');
  });
  it('fills placeholders; a string is used as it is', () => {
    expect(t('settings.language.optionLabel', { language: 'ગુજરાતી' })).toBe('ગુજરાતી language');
  });
  it('returns the key itself when the key is unknown', () => {
    expect(t('no.such.key' as TranslationKey)).toBe('no.such.key');
  });
});

describe('translation tables', () => {
  it('have text in both languages for every key', () => {
    expect(ALL.length).toBeGreaterThan(0);
    const missing = ALL.filter(entry => entry.gu === undefined || texts(entry.gu).some(text => text.trim() === '')).map(entry => entry.key);
    const emptyEnglish = ALL.filter(entry => texts(entry.en).some(text => text.trim() === '')).map(entry => entry.key);
    expect({ missing, emptyEnglish }).toEqual({ missing: [], emptyEnglish: [] });
  });

  it('use the same placeholders in both languages', () => {
    const different = ALL.filter(entry => {
      if (entry.gu === undefined) return false;
      const english = new Set(texts(entry.en).flatMap(placeholders));
      const gujarati = new Set(texts(entry.gu).flatMap(placeholders));
      return [...english].sort().join() !== [...gujarati].sort().join();
    }).map(entry => entry.key);
    expect(different).toEqual([]);
  });

  it('keep a plural a plural', () => {
    const different = ALL.filter(entry => entry.gu !== undefined && isPlural(entry.en) !== isPlural(entry.gu)).map(entry => entry.key);
    expect(different).toEqual([]);
  });

  it('write Gujarati in Gujarati script and never use Latin digits in it', () => {
    // Words kept in English letters by the glossary, and placeholders, are allowed.
    const KEPT = /\{\{\w+\}\}|GRN|GST|PAN|OTP|AM|PM|kg|ID|SMS|PDF|GCSA|QR|URL|HTTPS?|OK|Wi-Fi|WhatsApp|English/g;
    const problems = ALL.filter(entry => {
      if (entry.gu === undefined) return false;
      return texts(entry.gu).some(text => {
        const rest = text.replace(KEPT, '');
        return /[0-9]/.test(rest) || (!/[઀-૿]/.test(rest) && /[A-Za-z]{2,}/.test(rest));
      });
    }).map(entry => entry.key);
    expect(problems).toEqual([]);
  });
});
