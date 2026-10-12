/**
 * Avatar initials come from the letters and digits of a name, as whole
 * characters: a symbol or emoji in front of a name is not an initial and is
 * never cut in half. Every screen reads them from avatarInitials (the Avatar,
 * the customer list and the profile), so the same name gives the same initials
 * everywhere (docs/STYLE_GUIDE.md §3.2).
 */
import { avatarInitials } from '../avatar';

/** The rule before the fix: the first UTF-16 unit of each of the first two words. */
const initialsBeforeTheFix = (name: string | null | undefined): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
};

/** Names whose first two words already start with a letter or a digit: the initials are what they always were. */
const UNCHANGED: Array<[string, string]> = [
  ['Sunrise Agro Foods', 'SA'],
  ['24 Seven Foods', '2S'],
  ['Élan Exports', 'ÉE'],
  ['élan exports', 'ÉE'],
  ['ગ્રીન વેલી', 'ગવ'],
  ['Patel traders', 'PT'],
  ['ß-Works Ltd', 'SSL'],
  ['Dev', 'D'],
  ['  dev ', 'D'],
  ['green   valley\tstores', 'GV'],
  ['A B C D', 'AB'],
  ['', '?'],
  ['   ', '?'],
];

/** Names with a symbol or emoji at the front of a word: the old rule drew a symbol, or half an emoji. */
const FIXED: Array<[string, string]> = [
  ['(A-One) Traders & Co.', 'AT'],
  ['🧊 Ice Depot', 'ID'],
  ['🧊Ice Depot', 'ID'],
  ['Ice 🧊 Depot', 'ID'],
  ['Acme & Sons', 'AS'],
  ['"Sai" Cold Storage', 'SC'],
  ['#1 Traders', '1T'],
  ['🧊 Fruit', 'F'],
];

/** No word has a letter or digit: the first character of each of the first two words, whole. */
const NO_LETTERS: Array<[string, string]> = [
  ['🧊', '🧊'],
  ['🧊 🍎 ❄', '🧊🍎'],
  ['# -', '#-'],
  ['!!', '!'],
];

/** encodeURIComponent throws on half of a surrogate pair. */
const wellFormed = (text: string) => {
  expect(() => encodeURIComponent(text)).not.toThrow();
};

describe('avatarInitials', () => {
  it.each(UNCHANGED)('gives "%s" the initials it always had: %s', (name, initials) => {
    expect(avatarInitials(name)).toBe(initials);
    // The rule before the fix agrees on these names.
    expect(initialsBeforeTheFix(name)).toBe(initials);
  });

  it.each(FIXED)('takes the letters of "%s": %s', (name, initials) => {
    expect(avatarInitials(name)).toBe(initials);
    wellFormed(avatarInitials(name));
    // The rule before the fix gave something else (a symbol, or half of an emoji).
    expect(initialsBeforeTheFix(name)).not.toBe(initials);
  });

  it.each(NO_LETTERS)('keeps the plain rule for "%s": %s', (name, initials) => {
    expect(avatarInitials(name)).toBe(initials);
    wellFormed(avatarInitials(name));
  });

  it('never cuts an emoji in half, whatever the name is', () => {
    // The rule before the fix did, for the name in the report.
    expect(() => encodeURIComponent(initialsBeforeTheFix('🧊 Ice Depot'))).toThrow();
    for (const [name] of [...UNCHANGED, ...FIXED, ...NO_LETTERS]) wellFormed(avatarInitials(name));
  });

  it('has an answer for a missing name', () => {
    expect(avatarInitials(null)).toBe('?');
    expect(avatarInitials(undefined)).toBe('?');
  });
});
