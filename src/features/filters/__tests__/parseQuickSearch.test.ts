import { parseQuickSearch } from '../parseQuickSearch';

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
});
