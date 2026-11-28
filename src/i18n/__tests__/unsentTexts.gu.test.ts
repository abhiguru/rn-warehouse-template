/**
 * WH-301, Design offline-capture.md 4.9 (2026-11-26): the deduction line for another person's unsent dispatches (PQ4b) and
 * the status bar's line 2 for items waiting for an administrator (PQ5). Words, and Gujarati digits for counts, as the design gives them.
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - The design names the keys `lessOtherPerson` and `waitingForAdmin` (with one/other forms like `unsent`) but not their group:
 *    `waitingForAdmin` is looked up in `components.offlineStatus` (Part 1 puts the bar's keys there); `lessOtherPerson` in
 *    `components.offlineRead` or `components.offlineStatus`, whichever holds it (the 2.4 sibling `lessNotSent` has no key in the code yet).
 *    Say so if the group is another and the test follows it.
 * ============================================
 */
import { t, setLanguage } from '..';

afterEach(() => setLanguage('en'));

const lookup = (groups: string[], name: string, options: Record<string, unknown>, language: 'en' | 'gu') => {
  for (const group of groups) {
    const key = `${group}.${name}`;
    const text = (t as (k: string, o?: Record<string, unknown>, l?: string) => string)(key, options, language);
    if (text !== key && text !== '') return text;
  }
  return '(no such key)';
};
const bar = (count: number, language: 'en' | 'gu') => lookup(['components.offlineStatus'], 'waitingForAdmin', { count }, language);

describe('items waiting for an administrator (PQ5)', () => {
  it('one item and many items, in English', () => {
    expect(bar(1, 'en')).toBe('1 item you recorded is waiting for an administrator.');
    expect(bar(3, 'en')).toBe('3 items you recorded are waiting for an administrator.');
  });

  it('in Gujarati, with Gujarati digits', () => {
    expect(bar(1, 'gu')).toBe('તમે નોંધેલી ૧ એન્ટ્રી એડમિનના નિર્ણય માટે રાહ જુએ છે.');
    expect(bar(3, 'gu')).toBe('તમે નોંધેલી ૩ એન્ટ્રી એડમિનના નિર્ણય માટે રાહ જુએ છે.');
  });
});

describe('photos kept at save (Design 4.9, 2026-11-26)', () => {
  const kept = (count: number, language: 'en' | 'gu') => (t as (k: string, o?: Record<string, unknown>, l?: string) => string)('offline.photosKept', { count }, language);

  it('one photo and many photos, in English', () => {
    expect(kept(1, 'en')).toBe("1 photo couldn't be sent yet. It's kept on this phone and sent when the connection is better.");
    expect(kept(3, 'en')).toBe("3 photos couldn't be sent yet. They're kept on this phone and sent when the connection is better.");
  });

  it('in Gujarati, with Gujarati digits', () => {
    expect(kept(1, 'gu')).toBe('૧ ફોટો હજુ મોકલી શકાયો નથી. તે આ ફોનમાં સાચવેલો છે અને કનેક્શન સારું થાય ત્યારે મોકલાશે.');
    expect(kept(3, 'gu')).toBe('૩ ફોટો હજુ મોકલી શકાયા નથી. તે આ ફોનમાં સાચવેલા છે અને કનેક્શન સારું થાય ત્યારે મોકલાશે.');
  });
});
