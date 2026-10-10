/**
 * Words the formatters need in each language: calendar names, day words, units
 * and the nouns that follow a count. Gujarati follows docs/GUJARATI_GLOSSARY.md.
 *
 * English is the source: Gujarati must have the same keys (checked by a test).
 */
import type { AppLanguage } from '../language';

export interface CommonWords {
  monthsShort: string[];
  monthsLong: string[];
  weekdaysShort: string[];
  today: string;
  yesterday: string;
  justNow: string;
  /** "{n}" is replaced by the number. */
  minutesAgo: string;
  hoursAgo: string;
  am: string;
  pm: string;
  kg: string;
  /** Nouns after a count, by their English singular: [one, many]. */
  nouns: Record<string, [string, string]>;
}

const en: CommonWords = {
  monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthsLong: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: 'Today',
  yesterday: 'Yesterday',
  justNow: 'Just now',
  minutesAgo: '{n} min ago',
  hoursAgo: '{n} h ago',
  am: 'am',
  pm: 'pm',
  kg: 'kg',
  // English builds its plurals in formatCount; only the Gujarati table needs entries.
  nouns: {},
};

// A Gujarati noun does not change after a number (glossary rule 3), so both forms are the same.
const same = (word: string): [string, string] => [word, word];

const gu: CommonWords = {
  monthsShort: ['જાન્યુ', 'ફેબ્રુ', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન', 'જુલાઈ', 'ઑગસ્ટ', 'સપ્ટે', 'ઑક્ટો', 'નવે', 'ડિસે'],
  monthsLong: [
    'જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન',
    'જુલાઈ', 'ઑગસ્ટ', 'સપ્ટેમ્બર', 'ઑક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર',
  ],
  weekdaysShort: ['રવિ', 'સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ'],
  today: 'આજે',
  yesterday: 'ગઈકાલે',
  justNow: 'હમણાં જ',
  minutesAgo: '{n} મિનિટ પહેલાં',
  hoursAgo: '{n} કલાક પહેલાં',
  am: 'AM',
  pm: 'PM',
  kg: 'કિલો',
  nouns: {
    item: same('આઇટમ'),
    bag: same('નંગ'),
    dispatch: same('જાવક'),
    GRN: same('આવક પાવતી'),
    invoice: same('ઇન્વૉઇસ'),
    order: same('ઑર્ડર'),
    customer: same('વેપારી'),
    photo: same('ફોટો'),
    image: same('ફોટો'),
    day: same('દિવસ'),
    month: same('મહિનો'),
    unit: same('નંગ'),
    price: same('દર'),
    user: same('વપરાશકર્તા'),
    filter: same('ફિલ્ટર'),
    result: same('પરિણામ'),
  },
};

const WORDS: Record<AppLanguage, CommonWords> = { en, gu };

export const commonWords = (language: AppLanguage): CommonWords => WORDS[language];
