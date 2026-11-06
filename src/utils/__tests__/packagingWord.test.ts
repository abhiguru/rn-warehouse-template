import { setLanguage } from '@/i18n';
import { formatPackages, packNoun, packNounFor, packNounCapital, packageUnit, packagingWord, sharedPackaging, cleanPackaging, itemWithPackaging, displayPackaging, itemWordOfLots, MIXED_PACKAGING } from '../packagingWord';

afterEach(() => setLanguage('en'));

describe('packagingWord', () => {
  it('names Bag, Box and Crate (any case, singular or plural), reads any other word as the item own custom word (WH-41), and a blank as bag', () => {
    expect(packagingWord('Box')).toBe('box');
    expect(packagingWord(' boxes ')).toBe('box');
    expect(packagingWord('CRATE')).toBe('crate');
    expect(packagingWord('Bag')).toBe('bag');
    expect(packagingWord('Tin')).toBe('custom');
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

  it('shows an item\'s own word as typed, with no plural and no translation; only a mixed total says units (WH-41)', () => {
    expect(packagingWord('Unit')).toBe('custom');
    expect(formatPackages(3, 'Units')).toBe('3 Units');
    expect(packageUnit('unit')).toBe('unit');
    expect(packNounCapital('Units')).toBe('Units');
    expect(formatPackages(12, 'Katta')).toBe('12 Katta');
    expect(formatPackages(1, 'Katta')).toBe('1 Katta');
    expect(packNounFor(12, 'Trey')).toBe('Trey');
    expect(formatPackages(3, MIXED_PACKAGING)).toBe('3 units');
    setLanguage('gu');
    expect(formatPackages(12, 'Katta')).toBe('૧૨ Katta');
  });

  it('ignores outer spaces and invisible characters, and the case, when it matches a word (WH-9)', () => {
    expect(packagingWord('﻿Box ')).toBe('box');
    expect(packagingWord(' crate ')).toBe('crate');
    expect(packagingWord(' bags ')).toBe('bag');
    expect(cleanPackaging('  Katta  ')).toBe('Katta');
    expect(sharedPackaging(['Katta', ' katta '])).toBe('Katta');
    expect(sharedPackaging(['Katta', 'Trey'])).toBe(MIXED_PACKAGING);
  });

  it('puts the word beside the item name, a blank reading Bag (WH-46)', () => {
    expect(itemWithPackaging('Egg', 'Trey')).toBe('Egg · Trey');
    expect(itemWithPackaging('Egg', null)).toBe('Egg · Bag');
    expect(itemWithPackaging('Egg', 'boxes')).toBe('Egg · Box');
    expect(displayPackaging('  ')).toBe('Bag');
    expect(itemWordOfLots(['Box', 'Crate'])).toBe(MIXED_PACKAGING);
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
