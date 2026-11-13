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
  // WH-144: a pull request may add an English text without a Gujarati one (the app shows the English text); the
  // release check (`npm run i18n:release-check`, scripts/i18n-review.test.mjs) is what fails on a missing Gujarati text.
  // A Gujarati text that IS given must not be blank, because a blank string would hide the English fallback.
  it('have no blank text in either language; a Gujarati text may be missing (the English shows)', () => {
    expect(ALL.length).toBeGreaterThan(0);
    const blank = ALL.filter(entry => entry.gu !== undefined && texts(entry.gu).some(text => text.trim() === '')).map(entry => entry.key);
    const emptyEnglish = ALL.filter(entry => texts(entry.en).some(text => text.trim() === '')).map(entry => entry.key);
    expect({ blank, emptyEnglish }).toEqual({ blank: [], emptyEnglish: [] });
  });

  it('have no Gujarati key that English lacks (an extra or stale key), and the same kind of text under each key', () => {
    // Walks the Gujarati table: every leaf must be in English, as a string for a string and a plural for a plural.
    const stale: string[] = [];
    const walk = (guNode: unknown, enNode: unknown, prefix: string) => {
      for (const [name, value] of Object.entries(guNode as Record<string, unknown>)) {
        const key = `${prefix}${name}`;
        const english = (enNode as Record<string, unknown> | undefined)?.[name];
        if (english === undefined) stale.push(key);
        else if (typeof value === 'string' || isPlural(value)) {
          if (typeof value === 'string' ? typeof english !== 'string' : !isPlural(english)) stale.push(`${key} (different kind of text)`);
        } else walk(value, english, `${key}.`);
      }
    };
    walk(gu, en, '');
    expect(stale).toEqual([]);
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
    const KEPT = /\{\{\w+\}\}|GRN|GST|PAN|OTP|AM|PM|kg|ID|SMS|PDF|QR|URL|HTTPS?|OK|Wi-Fi|WhatsApp|English/g;
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
