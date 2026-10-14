import { railKey, sortForRail, railLetters } from '../railKey';

describe('railKey (G-21)', () => {
  it.each([
    ['(A-One) Traders & Co.', 'A'],
    ['apex cold chain', 'A'],
    ['Élan Exports', 'E'],
    ['🧊 Ice Depot', 'I'],
    ['  "Quoted" Foods', 'Q'],
    ['24 Seven Foods', '#'],
    ['પટેલ ટ્રેડર્સ', 'ગુ'],
    ['', '#'],
    ['---', '#'],
  ])('%s -> %s', (name, key) => {
    expect(railKey(name)).toBe(key);
  });
});

describe('sortForRail', () => {
  it('puts digit names last and folds accents', () => {
    const rows = [{ name: '24 Seven Foods' }, { name: 'Acme Foods' }, { name: 'Élan Exports' }];
    expect(sortForRail(rows).map(r => r.name)).toEqual(['Acme Foods', 'Élan Exports', '24 Seven Foods']);
  });
  it('puts Gujarati between Z and #', () => {
    const rows = [{ name: '1 Foods' }, { name: 'પટેલ' }, { name: 'Zeta' }, { name: 'Alpha' }];
    expect(sortForRail(rows).map(r => r.name)).toEqual(['Alpha', 'Zeta', 'પટેલ', '1 Foods']);
  });
});

describe('railLetters', () => {
  it('shows A-Z, then ગુ and # only when used', () => {
    expect(railLetters(new Set(['A']))).toHaveLength(26);
    const withBoth = railLetters(new Set(['A', 'ગુ', '#']));
    expect(withBoth.slice(-2)).toEqual(['ગુ', '#']);
    expect(railLetters(new Set(['#'])).slice(-1)).toEqual(['#']);
    expect(railLetters(new Set(['#']))).not.toContain('ગુ');
  });
});
