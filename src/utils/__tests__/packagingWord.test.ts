import { setLanguage } from '@/i18n';
import { formatPackages, packNoun, packNounCapital, packageUnit, packagingWord } from '../packagingWord';

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
});
