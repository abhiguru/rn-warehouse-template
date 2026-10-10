/**
 * One Gujarati word per idea across the areas (docs/GUJARATI_GLOSSARY.md), and the
 * pieces the integration pass added: the calendar words and the wizard step names.
 */
import { setLanguage, t } from '..';
import { gujaratiCalendar } from '../calendar';
import { en } from '../locales/en';
import { gu } from '../locales/gu';
import type { Plural } from '../types';
import { grnSteps } from '@/features/grn/utils/grnStepLabels';
import { dispatchSteps } from '@/components/DispatchStepIndicator';
import { invoiceSteps } from '@/components/InvoiceStepIndicator';
import { customerSteps } from '@/features/customer/customerStepLabels';
import { GRN_STEP_COUNT } from '@/constants/grnSteps';
import { DISPATCH_STEP_COUNT } from '@/constants/dispatchSteps';
import { CUSTOMER_TOTAL_STEPS } from '@/constants/customerSteps';

jest.mock('@/store/hooks', () => ({ useAppDispatch: () => jest.fn(), useAppSelector: () => undefined }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => setLanguage('en'));

type Text = string | Plural;
const isText = (value: unknown): value is Text =>
  typeof value === 'string' || (typeof value === 'object' && value !== null && typeof (value as Plural).other === 'string' && typeof (value as Plural).one === 'string');
function flatten(table: unknown, prefix = ''): [string, Text][] {
  return Object.entries(table as Record<string, unknown>).flatMap(([name, value]) =>
    isText(value) ? [[`${prefix}${name}`, value] as [string, Text]] : flatten(value, `${prefix}${name}.`));
}
const asString = (value: Text) => (typeof value === 'string' ? value : `${value.one} | ${value.other}`);
const ENGLISH = flatten(en);
const GUJARATI = new Map(flatten(gu));

describe('one word per idea', () => {
  it('names the review step ચકાસણી in every wizard', () => {
    setLanguage('gu');
    expect([t('grn.steps.review'), t('dispatch.steps.review'), t('invoice.steps.review'), t('customers.steps.review.shortLabel'), t('customers.review.title')])
      .toEqual(Array(5).fill('ચકાસણી'));
    expect(t('invoice.review.title')).toBe('ઇન્વૉઇસની ચકાસણી');
  });

  it('names the first tab of a details page સારાંશ, and the people section સંપર્ક', () => {
    setLanguage('gu');
    expect([t('grn.tabs.overview'), t('dispatch.tabs.overview'), t('invoice.tabs.overview')]).toEqual(Array(3).fill('સારાંશ'));
    expect([t('grn.overview.participants'), t('dispatch.details.participants')]).toEqual(['સંપર્ક', 'સંપર્ક']);
  });

  it('does not use the words that were replaced', () => {
    // સમીક્ષા and ઝાંખી (review, overview), સંબંધિત લોકો (participants), ભાવ for a storage rate, હજી (spelled હજુ), જોબ (spelled જૉબ).
    // Wording review with the owner (2026-10-10): વપરાશકર્તા, ભૂમિકા, સેશન, ઍક્સેસ, સાઇન ઇન, ડિસ્કાઉન્ટ, લોટ and બોરી as a count gave way to
    // યુઝર, હોદ્દો, લૉગિન, મંજૂરી, છૂટ, જથ્થો and નંગ. બોરી stays only as a kind of packing (items.form.packagingPlaceholder).
    const replaced = /સમીક્ષા|ઝાંખી|સંબંધિત લોકો|ભાવ|હજી|જોબ|વપરાશકર્તા|ભૂમિકા|સેશન|ઍક્સેસ|સાઇન ઇન|સાઇન આઉટ|ડિસ્કાઉન્ટ|રાઉન્ડ ઑફ|ડેશબોર્ડ|રીડિંગ/;
    const found = [...GUJARATI].filter(([key, value]) => replaced.test(asString(value)) || (/બોરી/.test(asString(value)) && key !== "items.form.packagingPlaceholder")).map(([key]) => key);
    expect(found).toEqual([]);
  });

  it('keeps role (હોદ્દો), status (સ્થિતિ), sign-in (લૉગિન) and access (મંજૂરી) to their one word', () => {
    // રોલ, સ્ટેટસ, સત્ર and એક્સેસ are other spellings or words; સ્ક્રોલ (scroll) is a different word.
    const wrong = [...GUJARATI].filter(([, value]) => /(^|[^઀-૿])રોલ|સ્ટેટસ|(^|[^઀-૿])સત્ર|એક્સેસ/.test(asString(value))).map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it('gives the same English text the same Gujarati in every area, except where the meaning differs', () => {
    // English texts that mean different things in different places. Each has a reason; a new one needs one too.
    const DIFFERENT_ON_PURPOSE: Record<string, string> = {
      'edit': 'a button (ફેરફાર કરો) and the title of the dispatch form in edit mode (ફેરફાર)',
      'edit invoice': 'the title of the form (a noun phrase) and a button (a command)',
      'in stock': 'the status (સ્ટોકમાં છે) and the label beside a number (સ્ટોકમાં)',
      'grn': 'the bottom tab (આવક) and a narrow column (also આવક since the wording review); the full name is આવક પાવતી',
      'order': 'a customer order and the sort order (ક્રમ)',
      'invoices': 'the bottom tab only is બિલ: glossary',
      'kg': 'kg stays in narrow columns: glossary',
      'from {{from}}': 'a filter chip and "valid from" on a price',
      'recent': 'agrees with a different noun in each place',
      'latest {{date}}': 'agrees with the document: the latest GRN (પાવતી, feminine) and the latest invoice',
      'from': 'start date and start number: glossary rule 4',
      'to': 'end date and end number: glossary rule 4',
      'dispatched': 'the label beside a count, an order status (જાવક થઈ) and a report column',
      'custom': 'a price of its own and a period of chosen dates',
      'base': 'the base amount of an invoice line and the base band of a price',
      'remove {{name}}?': 'an item (feminine) and a person',
      'deactivate {{name}}?': 'an item (feminine) and a person',
      'it may have been deleted.': 'an item (feminine) and a price (masculine)',
      'of {{total}}': 'a fragment that sits in a different sentence in each place',
      'critical': 'a sensor status and a battery level',
      'cancel customer': 'the create and the edit form: English has one text for both',
    };
    const groups = new Map<string, Map<string, string[]>>();
    for (const [key, value] of ENGLISH) {
      const english = asString(value).trim().toLowerCase();
      const gujarati = asString(GUJARATI.get(key) ?? '');
      const byGujarati = groups.get(english) ?? new Map<string, string[]>();
      byGujarati.set(gujarati, [...(byGujarati.get(gujarati) ?? []), key]);
      groups.set(english, byGujarati);
    }
    const differing = [...groups].filter(([, byGujarati]) => byGujarati.size > 1);
    const unexplained = differing
      .filter(([english]) => !(english in DIFFERENT_ON_PURPOSE))
      .map(([english, byGujarati]) => ({ english, gujarati: Object.fromEntries(byGujarati) }));
    expect(unexplained).toEqual([]);
    // An entry that no longer differs is removed from the list, so the list stays true.
    const stale = Object.keys(DIFFERENT_ON_PURPOSE).filter(english => !differing.some(([text]) => text === english));
    expect(stale).toEqual([]);
  });
});

describe('calendar words', () => {
  // The keys react-native-paper-dates 0.22 reads (its TranslationsType).
  const KEYS = ['save', 'selectSingle', 'selectMultiple', 'selectRange', 'notAccordingToDateFormat', 'mustBeHigherThan', 'mustBeLowerThan',
    'mustBeBetween', 'dateIsDisabled', 'previous', 'next', 'typeInDate', 'pickDateFromCalendar', 'close', 'hour', 'minute'];

  it('has every text the calendar asks for, in Gujarati whatever the app language is', () => {
    const calendar = gujaratiCalendar() as unknown as Record<string, string | ((...args: string[]) => string)>;
    expect(Object.keys(calendar).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      const value = calendar[key];
      const text = typeof value === 'function' ? value('01/10/2026', '31/10/2026') : value;
      expect(text).toMatch(/[઀-૿]/);
      expect(text).not.toMatch(/components\.calendar|\{\{/);
    }
    expect(calendar.save).toBe('સાચવો');
    expect((calendar.mustBeBetween as (a: string, b: string) => string)('01/10/2026', '31/10/2026')).toBe('તારીખ 01/10/2026 અને 31/10/2026 વચ્ચે હોવી જોઈએ');
  });

  it('keeps the English source equal to what the library shows in English', () => {
    expect(t('components.calendar.selectSingle')).toBe('Select date');
    expect(t('components.calendar.mustBeBetween', { start: 'a', end: 'b' })).toBe('Must be between a - b');
  });
});

describe('wizard step names have one source each', () => {
  it('follows the language at the time of the call', () => {
    expect(grnSteps().map(step => step.label)).toEqual(['GRN details', 'Items', 'Review']);
    expect(dispatchSteps().map(step => step.label)).toEqual(['Dispatch details', 'Items', 'Review']);
    expect(invoiceSteps().map(step => step.label)).toEqual(['Details', 'Items', 'Review']);
    expect(customerSteps().map(step => step.label)).toEqual(['Basic information', 'Address and tax details', 'Documents and review']);
    setLanguage('gu');
    expect(grnSteps().map(step => step.label)).toEqual(['આવક પાવતીની વિગતો', 'આઇટમ', 'ચકાસણી']);
    expect(dispatchSteps().map(step => step.label)).toEqual(['જાવકની વિગતો', 'આઇટમ', 'ચકાસણી']);
    expect(invoiceSteps().map(step => step.label)).toEqual(['વિગતો', 'આઇટમ', 'ચકાસણી']);
    expect(customerSteps().map(step => step.shortLabel)).toEqual(['મુખ્ય માહિતી', 'વિગતો', 'ચકાસણી']);
  });

  it('matches the step counts kept with the step numbers', () => {
    expect(grnSteps()).toHaveLength(GRN_STEP_COUNT);
    expect(dispatchSteps()).toHaveLength(DISPATCH_STEP_COUNT);
    expect(customerSteps()).toHaveLength(CUSTOMER_TOTAL_STEPS);
  });
});
