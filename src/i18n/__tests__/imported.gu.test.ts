/** WH-180: every new key has English and a Gujarati draft; Gujarati digits for counts, amounts and dates, none for identifiers. */
import { en } from '../locales/en';
import { gu } from '../locales/gu';
import { setLanguage, t } from '..';

afterEach(() => setLanguage('en'));

const KEYS = [
  'common.importedTag',
  'common.importedReadOnly',
  'common.importedDocument.grn',
  'common.importedDocument.dispatch',
  'common.importedDocument.invoice',
  'common.importedDocument.payment',
  'grn.rates.setRates',
  'grn.rates.opensRatesStep',
  'errors.pdf.refusalSeveralTitle',
  'errors.pdf.refusalSeveral',
];
const at = (table: unknown, key: string) => key.split('.').reduce<any>((node, part) => node?.[part], table);

it.each(KEYS)('%s exists in English and in Gujarati, and they differ', key => {
  const english = at(en, key);
  const gujarati = at(gu, key);
  expect(typeof english).toBe('string');
  expect(english.length).toBeGreaterThan(0);
  expect(typeof gujarati).toBe('string');
  expect(gujarati.length).toBeGreaterThan(0);
  expect(gujarati).not.toBe(english);
  expect(/[઀-૿]/.test(gujarati)).toBe(true);
});

it.each(KEYS)('%s carries no Latin digit in Gujarati text', key => {
  // None of the new sentences holds an identifier, so a 0-9 digit would be a count, amount or date left in Latin digits.
  expect(at(gu, key)).not.toMatch(/[0-9]/);
});

it('the sentences keep the same placeholders in both languages', () => {
  const holes = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
  for (const key of KEYS) expect(holes(at(gu, key))).toEqual(holes(at(en, key)));
});

it('reads through t() in both languages', () => {
  expect(t('common.importedTag')).toBe('Imported');
  setLanguage('gu');
  expect(t('common.importedTag')).toBe('ઇમ્પોર્ટ કરેલ');
});
