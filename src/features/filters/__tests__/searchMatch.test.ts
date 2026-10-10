import { matchesSearch, searchTerms } from '../searchMatch';

// The same cases as the backend's tests/list_search.sql, so the two rules cannot drift.
describe('search terms', () => {
  it('splits into lower-cased words', () => {
    expect(searchTerms('  Lake   50%_x\\ ')).toEqual(['lake', '50%_x\\']);
  });
  it('has no terms for an empty search', () => {
    expect(searchTerms(null)).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
  });
  it('keeps at most eight words', () => {
    expect(searchTerms('a b c d e f g h i j')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });
  it('reads only the first 120 characters', () => {
    expect(searchTerms(`${'x'.repeat(119)} tail`)).toEqual(['x'.repeat(119)]);
  });
});

describe('matches search', () => {
  const srb9 = ['SDB9', 'Search Lakeview Spices', 'GJ05DS0009', 'Search Garlic', 'PKG-RED', 'R7', 'SRB9'];
  const srb100 = ['SDB100', 'Search Hilltop Mart', null, 'Search Garlic', 'PKG_50%', undefined, 'SRB100'];
  const match = (query: string, columns: (string | null | undefined)[]) => matchesSearch(searchTerms(query), columns);

  it('finds a word in any column, whatever its case', () => {
    expect(match('sdb9', srb9)).toBe(true);
    expect(match('HILLTOP', srb100)).toBe(true);
    expect(match('gj05ds', srb9)).toBe(true);
    expect(match('garlic', srb9)).toBe(true);
    expect(match('pkg-red', srb9)).toBe(true);
    expect(match('r7', srb9)).toBe(true);
  });
  it('needs every word, each in any column', () => {
    expect(match('lakeview garlic', srb9)).toBe(true);
    expect(match('lakeview hilltop', srb9)).toBe(false);
    expect(match('lakeview hilltop', srb100)).toBe(false);
  });
  it('takes % and _ literally', () => {
    expect(match('50%', srb100)).toBe(true);
    expect(match('50%', srb9)).toBe(false);
    expect(match('pkg_red', srb9)).toBe(false);
  });
  it('matches everything for a blank search', () => {
    expect(match('  ', srb9)).toBe(true);
  });
  it('matches numbers as text and skips empty columns', () => {
    expect(matchesSearch(['12'], [120, null])).toBe(true);
    expect(matchesSearch(['x'], [null, undefined])).toBe(false);
  });
});
