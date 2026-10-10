import { setLanguage } from '@/i18n';
import { parseQuickSearch } from '../parseQuickSearch';

afterEach(() => setLanguage('en'));

// Saturday 10 October 2026, 02:00 local time: before 05:30, when the UTC date is still the 9th.
const today = new Date(2026, 9, 10, 2, 0, 0);
const grn = { today, dates: true, range: 'document' as const };
const invoice = { today, dates: true, range: 'integer' as const, financialYear: true };
const day = (iso: string) => ({ from: iso, to: iso });

describe('parseQuickSearch', () => {
  it('leaves ordinary words as text', () => {
    expect(parseQuickSearch('  lakeview   garlic ', grn)).toEqual({ text: 'lakeview garlic' });
    expect(parseQuickSearch('', grn)).toEqual({ text: '' });
  });

  it('reads every date form the app shows or a user would type', () => {
    const cases: [string, string][] = [
      ['today', '2026-10-10'],
      ['Yesterday', '2026-10-09'],
      ['7 Oct', '2026-10-07'],
      ['07 oct 2026', '2026-10-07'],
      ['7 October', '2026-10-07'],
      ['7 sept 25', '2025-09-07'],
      ['7/10', '2026-10-07'],
      ['07/10/26', '2026-10-07'],
      ['7/10/2025', '2025-10-07'],
      ['7-10-2026', '2026-10-07'],
      ['7.10.2026', '2026-10-07'],
    ];
    for (const [typed, iso] of cases) {
      expect(parseQuickSearch(typed, grn)).toEqual({ text: '', date: day(iso) });
    }
  });

  it('uses the local day, not the UTC day, before 05:30 in India', () => {
    expect(parseQuickSearch('today', grn).date).toEqual(day('2026-10-10'));
  });

  it('reads a month with a year as the whole month', () => {
    expect(parseQuickSearch('Oct 2026', grn)).toEqual({ text: '', date: { from: '2026-10-01', to: '2026-10-31' } });
    expect(parseQuickSearch('february 2024', grn).date).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('does not guess: a bare number, a month alone, an impossible day and a day-month with a dash stay text', () => {
    for (const typed of ['12', 'oct', '2026', '31 feb', '32/10', '7-10', 'october garlic']) {
      expect(parseQuickSearch(typed, grn)).toEqual({ text: typed });
    }
  });

  it('keeps the other words as text around a date', () => {
    expect(parseQuickSearch('garlic 7 oct lakeview', grn)).toEqual({ text: 'garlic lakeview', date: day('2026-10-07') });
    expect(parseQuickSearch('garlic 7 oct 2025', grn)).toEqual({ text: 'garlic', date: day('2025-10-07') });
  });

  it('takes only the first date', () => {
    expect(parseQuickSearch('today yesterday', grn)).toEqual({ text: 'yesterday', date: day('2026-10-10') });
  });

  it('reads a document number range with the same letters on both sides', () => {
    expect(parseQuickSearch('A0010-A0020', grn)).toEqual({ text: '', range: { from: 'A0010', to: 'A0020' } });
    expect(parseQuickSearch('dv0101 to DV0110 garlic', grn)).toEqual({ text: 'garlic', range: { from: 'dv0101', to: 'DV0110' } });
  });

  it('does not read a range from different letters, a number with a hyphen in it, or two words joined by "to"', () => {
    for (const typed of ['A0010-B0020', 'G-12', 'pkg-red', 'road to town', '10-20']) {
      expect(parseQuickSearch(typed, grn)).toEqual({ text: typed });
    }
  });

  it('reads whole-number ranges and financial years only where the list has them', () => {
    expect(parseQuickSearch('10-20', invoice)).toEqual({ text: '', range: { from: '10', to: '20' } });
    expect(parseQuickSearch('10 to 20', invoice)).toEqual({ text: '', range: { from: '10', to: '20' } });
    expect(parseQuickSearch('20-10', invoice)).toEqual({ text: '20-10' });
    expect(parseQuickSearch('FY 2026 sunrise', invoice)).toEqual({ text: 'sunrise', financialYear: 2026 });
    expect(parseQuickSearch('fy2026-27', invoice)).toEqual({ text: '', financialYear: 2026 });
    expect(parseQuickSearch('fy 2026', grn)).toEqual({ text: 'fy 2026' });
  });

  it('recognises nothing when the list turns recognition off', () => {
    expect(parseQuickSearch('today A0010-A0020', { today })).toEqual({ text: 'today A0010-A0020' });
  });

  describe('typed in Gujarati', () => {
    it('reads Gujarati digits as the same numbers', () => {
      expect(parseQuickSearch('૭/૧૦', grn)).toEqual({ text: '', date: day('2026-10-07') });
      expect(parseQuickSearch('૦૭/૧૦/૨૦૨૫', grn)).toEqual({ text: '', date: day('2025-10-07') });
      expect(parseQuickSearch('૭ oct ૨૦૨૬', grn)).toEqual({ text: '', date: day('2026-10-07') });
      expect(parseQuickSearch('૧૦-૨૦', invoice)).toEqual({ text: '', range: { from: '10', to: '20' } });
      expect(parseQuickSearch('FY ૨૦૨૬ sunrise', invoice)).toEqual({ text: 'sunrise', financialYear: 2026 });
      // Digits inside ordinary text are normalised too, so ૧૨ finds what 12 finds.
      expect(parseQuickSearch('rack ૧૨', grn)).toEqual({ text: 'rack 12' });
    });

    it('reads Gujarati month names, short and full', () => {
      const cases: [string, string][] = [
        ['૭ ઑક્ટો', '2026-10-07'],
        ['૭ ઑક્ટોબર', '2026-10-07'],
        ['7 ઑક્ટોબર 2025', '2025-10-07'],
        ['૧ જાન્યુ', '2026-01-01'],
        ['૧૫ ઑગસ્ટ ૨૦૨૫', '2025-08-15'],
        ['૩ મે', '2026-05-03'],
        ['૯ સપ્ટે ૨૫', '2025-09-09'],
        // ઑ typed as ઓ, as many keyboards give it
        ['૭ ઓક્ટોબર', '2026-10-07'],
      ];
      for (const [typed, iso] of cases) {
        expect(parseQuickSearch(typed, grn)).toEqual({ text: '', date: day(iso) });
      }
      expect(parseQuickSearch('ડિસેમ્બર ૨૦૨૬', grn)).toEqual({ text: '', date: { from: '2026-12-01', to: '2026-12-31' } });
      expect(parseQuickSearch('ફેબ્રુ 2024', grn)).toEqual({ text: '', date: { from: '2024-02-01', to: '2024-02-29' } });
      // A month name alone is still never guessed at.
      expect(parseQuickSearch('ઑક્ટોબર', grn)).toEqual({ text: 'ઑક્ટોબર' });
      expect(parseQuickSearch('૩૧ ફેબ્રુઆરી', grn)).toEqual({ text: '૩૧ ફેબ્રુઆરી'.replace('૩૧', '31') });
    });

    it('reads આજે and ગઈકાલે as today and yesterday', () => {
      expect(parseQuickSearch('આજે', grn)).toEqual({ text: '', date: day('2026-10-10') });
      expect(parseQuickSearch('ગઈકાલે', grn)).toEqual({ text: '', date: day('2026-10-09') });
      expect(parseQuickSearch('ગઇકાલે બટાકા', grn)).toEqual({ text: 'બટાકા', date: day('2026-10-09') });
      expect(parseQuickSearch('આજે', { today })).toEqual({ text: 'આજે' });
    });

    it('reads થી as the word between the two ends of a range', () => {
      expect(parseQuickSearch('DD0010 થી DD0020', grn)).toEqual({ text: '', range: { from: 'DD0010', to: 'DD0020' } });
      expect(parseQuickSearch('DD0010થી DD0020', grn)).toEqual({ text: '', range: { from: 'DD0010', to: 'DD0020' } });
      expect(parseQuickSearch('DD0010થી DD0020 સુધી garlic', grn)).toEqual({ text: 'garlic', range: { from: 'DD0010', to: 'DD0020' } });
      expect(parseQuickSearch('૧૦ થી ૨૦', invoice)).toEqual({ text: '', range: { from: '10', to: '20' } });
      expect(parseQuickSearch('૧૦થી ૨૦ સુધી', invoice)).toEqual({ text: '', range: { from: '10', to: '20' } });
      // Not a range: the words stay text, including "થી" and "સુધી".
      expect(parseQuickSearch('DD0010 થી DC0020', grn)).toEqual({ text: 'DD0010 થી DC0020' });
      expect(parseQuickSearch('20 થી 10', invoice)).toEqual({ text: '20 થી 10' });
      expect(parseQuickSearch('સુધી', grn)).toEqual({ text: 'સુધી' });
    });

    it('reads the same whatever the app language is', () => {
      setLanguage('gu');
      expect(parseQuickSearch('7 Oct', grn)).toEqual({ text: '', date: day('2026-10-07') });
      expect(parseQuickSearch('A0010 to A0020', grn)).toEqual({ text: '', range: { from: 'A0010', to: 'A0020' } });
      expect(parseQuickSearch('૭ ઑક્ટો', grn)).toEqual({ text: '', date: day('2026-10-07') });
    });
  });
});
