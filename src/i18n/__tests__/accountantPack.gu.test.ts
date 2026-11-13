/**
 * WH-158: the texts of the two new screens, English and the Gujarati drafts, verbatim from the spec's table (specs/accountant-pack-and-tally-file.md);
 * the 13 field labels in the order of the contract; CGST, SGST, IGST and UPI stay in Latin letters; no Latin digit in a Gujarati sentence.
 * Written BEFORE the build.
 */
import { en } from '../locales/en';
import { gu } from '../locales/gu';
import { setLanguage, t } from '..';

afterEach(() => setLanguage('en'));
const at = (table: unknown, key: string) => key.split('.').reduce<any>((node, part) => node?.[part], table);

const TEXTS: [string, string, string][] = [
  ['reports.titles.accountantPack', 'Accountant pack', 'હિસાબનીશ માટેની ફાઇલો'],
  ['nav.reports.descriptions.accountantPack', "Month's invoices, receipts and stock for your accountant", 'મહિનાના ઇન્વૉઇસ, આવક અને સ્ટોક, તમારા હિસાબનીશ માટે'],
  ['reports.accountantPack.makePack', 'Make pack', 'ફાઇલો બનાવો'],
  ['reports.accountantPack.packNote', 'The pack holds customer names, GSTINs and amounts. Send it only to your accountant.', 'આ ફાઇલોમાં વેપારીઓના નામ, જીએસટીઆઈએન અને રકમ છે. ફક્ત તમારા હિસાબનીશને જ મોકલો.'],
  ['reports.accountantPack.packEmpty', 'No invoices or receipts in this period.', 'આ સમયગાળામાં કોઈ ઇન્વૉઇસ કે આવક નથી.'],
  ['reports.accountantPack.packOneYear', 'Choose dates inside one financial year.', 'એક જ નાણાકીય વર્ષની તારીખો પસંદ કરો.'],
  ['reports.accountantPack.packTooLarge', 'This pack is too large. Choose a shorter period.', 'આ ફાઇલો બહુ મોટી છે. ટૂંકો સમયગાળો પસંદ કરો.'],
  ['settings.accountantExport.title', 'Accountant export', 'હિસાબની નિકાસ'],
  ['settings.accountantExport.help', 'The ledger names your accountant uses in Tally.', 'તમારા હિસાબનીશ ટેલીમાં જે ખાતાના નામ વાપરે છે તે.'],
];

it.each(TEXTS)('[crit 12] %s: English and Gujarati are the spec\'s words', (key, english, gujarati) => {
  expect(at(en, key)).toBe(english);
  expect(at(gu, key)).toBe(gujarati);
  setLanguage('gu');
  expect(t(key as never)).toBe(gujarati);
  setLanguage('en');
  expect(t(key as never)).toBe(english);
  expect(gujarati).not.toMatch(/[0-9]/);
});

const LABELS: [string, string][] = [
  ['storage_taxable', 'Storage rent (taxable)'], ['storage_exempt', 'Storage rent (exempt)'], ['labour', 'Labour'], ['cgst', 'CGST'],
  ['sgst', 'SGST'], ['igst', 'IGST'], ['discount', 'Discount'], ['round_off', 'Round-off'], ['receipt_cash', 'Cash'], ['receipt_upi', 'UPI'],
  ['receipt_bank_transfer', 'Bank transfer'], ['receipt_cheque', 'Cheque'], ['receipt_other', 'Other receipts'],
];

it('[crit 12] the 13 field labels, in the contract\'s order (keys as the ledger names\' keys)', () => {
  expect(Object.keys(at(en, 'settings.accountantExport.fields'))).toEqual(LABELS.map(([key]) => key));
  for (const [key, label] of LABELS) expect(at(en, `settings.accountantExport.fields.${key}`)).toBe(label);
});

it.each(LABELS)('[crit 12] %s has a Gujarati draft; CGST, SGST, IGST and UPI stay in Latin letters', (key, label) => {
  const gujarati = at(gu, `settings.accountantExport.fields.${key}`);
  expect(typeof gujarati).toBe('string');
  expect(gujarati.length).toBeGreaterThan(0);
  expect(gujarati).not.toMatch(/[0-9]/);
  if (['cgst', 'sgst', 'igst', 'receipt_upi'].includes(key)) expect(gujarati).toContain(label);
  else {
    expect(gujarati).toMatch(/[઀-૿]/);
    expect(gujarati).not.toBe(label);
  }
});
