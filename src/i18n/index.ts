/**
 * The app's text in English and Gujarati.
 *
 *   import { t } from '@/i18n';
 *   t('filters.clearAll')
 *   t('filters.showItems', { count: 24 })      // picks one/other by count
 *   t('grn.list.noMatch', { search: 'garlic' })
 *
 * Rules (docs/I18N.md):
 *  - Call `t` while rendering or inside a function, never at module level: a
 *    constant built at import time keeps the language the app started in.
 *  - A number passed as a parameter is formatted for the language (Indian
 *    grouping; ૦-૯ in Gujarati). An identifier (a document or vehicle number)
 *    is passed as a string and is shown as it is.
 *  - Whole sentences with placeholders; never glue translated pieces together.
 *
 * When the language changes the navigation tree is rebuilt (app/_layout.tsx), so
 * components do not need to subscribe to it.
 */
import { getLanguage, localizeDigits, type AppLanguage } from './language';
import { en } from './locales/en';
import { gu } from './locales/gu';
import type { KeyPath, Plural, TranslationParams } from './types';

export * from './language';
export type { TranslationParams } from './types';

export type TranslationKey = KeyPath<typeof en>;

const TABLES: Record<AppLanguage, unknown> = { en, gu };

function lookup(table: unknown, key: string): string | Plural | undefined {
  let node: unknown = table;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && typeof (node as Plural).other === 'string') return node as Plural;
  return undefined;
}

/** English: one for exactly 1. Gujarati: one for 0 and 1 (most nouns do not change, so both forms are usually equal). */
const isOne = (count: number, language: AppLanguage) => (language === 'gu' ? count === 0 || count === 1 : count === 1);

const formatParam = (value: string | number | null | undefined, language: AppLanguage): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return localizeDigits(new Intl.NumberFormat('en-IN').format(value), language);
  return value;
};

/** The text for a key in the app's language (or the one given). An unknown key returns the key itself. */
export function t(key: TranslationKey, params?: TranslationParams, language: AppLanguage = getLanguage()): string {
  const entry = lookup(TABLES[language], key) ?? lookup(en, key);
  if (entry === undefined) return key;
  const count = typeof params?.count === 'number' ? params.count : undefined;
  const text = typeof entry === 'string' ? entry : count !== undefined && isOne(count, language) ? entry.one : entry.other;
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in params ? formatParam(params[name], language) : whole));
}
