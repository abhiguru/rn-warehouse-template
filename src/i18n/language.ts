/**
 * The app's language, and the digit rules that go with it (docs/GUJARATI_GLOSSARY.md).
 *
 * This module has no dependencies, so formatters, services and the store can all
 * read the language without pulling in the translation library.
 *
 * Digits: in Gujarati, counts, weights, amounts, dates and times are shown in
 * ૦-૯. Identifiers (receipt, dispatch and invoice numbers, vehicle, GST, PAN,
 * phone numbers, login codes) are shown as typed: never pass them to
 * `localizeDigits`; use `formatIdentifier` so the choice is visible in the code.
 */
export type AppLanguage = 'en' | 'gu';
export type LanguagePreference = 'system' | AppLanguage;

export const LANGUAGES: { value: AppLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  // A language is named in its own script, whatever the app's language is.
  { value: 'gu', label: 'ગુજરાતી' },
];

let current: AppLanguage = 'en';
const listeners = new Set<(language: AppLanguage) => void>();

export const getLanguage = (): AppLanguage => current;

/** Set the language for formatters and everything else outside React. Use `applyLanguage` in `@/i18n` from the app. */
export function setLanguage(language: AppLanguage): void {
  if (language === current) return;
  current = language;
  listeners.forEach(listener => listener(language));
}

export function onLanguageChange(listener: (language: AppLanguage) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const GUJARATI_ZERO = 0x0ae6;
const LATIN_DIGIT = /[0-9]/g;
const GUJARATI_DIGIT = /[૦-૯]/g;

/** 0-9 as ૦-૯ in Gujarati; unchanged in English. For numbers the app formats, never for identifiers. */
export function localizeDigits(text: string, language: AppLanguage = current): string {
  if (language !== 'gu') return text;
  return text.replace(LATIN_DIGIT, digit => String.fromCharCode(GUJARATI_ZERO + Number(digit)));
}

/** ૦-૯ as 0-9, whatever the language: for anything a person typed before it is parsed, searched or sent. */
export function normalizeDigits(text: string): string {
  return text.replace(GUJARATI_DIGIT, digit => String(digit.charCodeAt(0) - GUJARATI_ZERO));
}

/** An identifier exactly as stored. It exists so that leaving digits alone is a visible decision. */
export const formatIdentifier = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

/** Gujarati for a locale tag that starts with "gu" ("gu", "gu-IN", "gu_IN"); English for anything else. */
export const languageFromLocale = (tag: string | null | undefined): AppLanguage =>
  /^gu([-_]|$)/i.test((tag ?? '').trim()) ? 'gu' : 'en';

/** The phone's language, read without a native module. English when it cannot be read. */
export function deviceLanguage(): AppLanguage {
  try {
    return languageFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
}

/** The language to use for a saved preference. */
export const resolveLanguage = (preference: LanguagePreference | undefined, device: AppLanguage = deviceLanguage()): AppLanguage =>
  preference === 'en' || preference === 'gu' ? preference : device;
