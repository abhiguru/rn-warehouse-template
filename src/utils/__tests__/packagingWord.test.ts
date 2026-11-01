import { setLanguage } from '@/i18n';
import { formatPackages, packNoun, packNounFor, packNounCapital, packageUnit, packagingWord, sharedPackaging, MIXED_PACKAGING } from '../packagingWord';

afterEach(() => setLanguage('en'));

describe('packagingWord', () => {
  it('names Bag, Box and Crate (any case, singular or plural), and says bag for anything else', () => {
    expect(packagingWord('Box')).toBe('box');
    expect(packagingWord(' boxes ')).toBe('box');
    expect(packagingWord('CRATE')).toBe('crate');
    expect(packagingWord('Bag')).toBe('bag');
    expect(packagingWord('Tin')).toBe('bag');
    expect(packagingWord('')).toBe('bag');
    expect(packagingWord(null)).toBe('bag');
    expect(packagingWord(undefined)).toBe('bag');
  });

  it('writes counts, plurals and labels in English', () => {
    expect(formatPackages(1, 'Box')).toBe('1 box');
    expect(formatPackages(12, 'Box')).toBe('12 boxes');
    expect(formatPackages(2, 'Crate')).toBe('2 crates');
    expect(formatPackages(1200, 'Bag')).toBe('1,200 bags');
    expect(formatPackages(3, undefined)).toBe('3 bags');
    expect(packNounCapital('Box')).toBe('Boxes');
    expect(packNoun('Crate')).toBe('crates');
    expect(packNounFor(1, 'Box')).toBe('box');
    expect(packNounFor(12, 'Box')).toBe('boxes');
    expect(packageUnit('Box')).toBe('box');
    expect(packageUnit(null)).toBe('bag');
  });

  it('writes them in Gujarati with Gujarati digits', () => {
    setLanguage('gu');
    expect(formatPackages(12, 'Box')).toBe('૧૨ બૉક્સ');
    expect(formatPackages(2, 'Crate')).toBe('૨ ક્રેટ');
    expect(formatPackages(5, 'Bag')).toBe('૫ નંગ');
    expect(packNounCapital('Box')).toBe('બૉક્સ');
    expect(packageUnit('Box')).toBe('બૉક્સ');
  });

  it('shares one packaging across lines only when all lines agree', () => {
    expect(sharedPackaging(['Box', 'boxes'])).toBe('box');
    expect(sharedPackaging(['Box', 'Bag'])).toBe(MIXED_PACKAGING);
    expect(sharedPackaging([MIXED_PACKAGING, MIXED_PACKAGING])).toBe(MIXED_PACKAGING);
    expect(sharedPackaging([])).toBeUndefined();
  });

  it('keeps an item\'s own "Unit"/"Units" as bags on per-item texts; only a mixed total says units', () => {
    expect(packagingWord('Unit')).toBe('bag');
    expect(formatPackages(3, 'Units')).toBe('3 bags');
    expect(packageUnit('unit')).toBe('bag');
    expect(packNounCapital('Units')).toBe('Bags');
    expect(formatPackages(3, MIXED_PACKAGING)).toBe('3 units');
  });

  it('counts lines of mixed packaging as units, in Gujarati નંગ', () => {
    expect(formatPackages(1, sharedPackaging(['Box', 'Bag']))).toBe('1 unit');
    expect(formatPackages(4, sharedPackaging(['Box', 'Crate']))).toBe('4 units');
    expect(formatPackages(4, sharedPackaging(['Box', 'Box']))).toBe('4 boxes');
    expect(packNounCapital(sharedPackaging(['Box', 'Bag']))).toBe('Units');
    setLanguage('gu');
    expect(formatPackages(4, sharedPackaging(['Box', 'Bag']))).toContain('નંગ');
    setLanguage('en');
  });
});
