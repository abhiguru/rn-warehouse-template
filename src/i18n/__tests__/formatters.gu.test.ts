import {
  formatCount,
  formatCurrency,
  formatDate,
  formatMonth,
  formatNumber,
  formatQuantity,
  formatRelativeTime,
  formatSectionDate,
  formatTime,
  formatWeight,
  formatWeightEach,
} from '@/utils/formatters';
import { setLanguage } from '../language';
import { commonWords } from '../locales/common';

afterEach(() => setLanguage('en'));

describe('formatters in English (unchanged)', () => {
  it('formats numbers, money, weight and counts', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
    expect(formatCurrency(1906)).toBe('₹1,906');
    expect(formatWeight(4000, 0)).toBe('4,000 kg');
    expect(formatWeightEach(50)).toBe('50 kg each');
    expect(formatCount(1, 'item')).toBe('1 item');
    expect(formatCount(1200, 'bag')).toBe('1,200 bags');
    expect(formatCount(2, 'dispatch', 'dispatches')).toBe('2 dispatches');
  });
  it('formats dates and times', () => {
    expect(formatDate(new Date(2021, 9, 7))).toBe('07/10/21');
    expect(formatTime(new Date(2021, 9, 7, 16, 5))).toBe('4:05 pm');
    expect(formatSectionDate(new Date().toISOString())).toBe('Today');
  });
});

describe('formatters in Gujarati', () => {
  beforeEach(() => setLanguage('gu'));

  it('uses Gujarati digits with Indian grouping', () => {
    expect(formatNumber(1234567)).toBe('૧૨,૩૪,૫૬૭');
    expect(formatNumber(0)).toBe('૦');
    expect(formatCurrency(1906)).toBe('₹૧,૯૦૬');
    expect(formatCurrency(null)).toBe('₹૦');
    expect(formatQuantity(45)).toBe('૪૫');
  });
  it('writes weight in કિલો', () => {
    expect(formatWeight(4000, 0)).toBe('૪,૦૦૦ કિલો');
    expect(formatWeight(null)).toBe('૦ કિલો');
  });
  it('says a weight is the weight of each package, with દરેક before it', () => {
    expect(formatWeightEach(50)).toBe('દરેક ૫૦ કિલો');
    expect(formatWeightEach(1250.5)).toBe('દરેક ૧,૨૫૦.૫ કિલો');
    expect(formatWeightEach(0)).toBeNull();
    expect(formatWeightEach(null)).toBeNull();
  });
  it('names counted things in Gujarati, the same after 1 and after many', () => {
    expect(formatCount(1, 'item')).toBe('૧ આઇટમ');
    expect(formatCount(3, 'item')).toBe('૩ આઇટમ');
    expect(formatCount(1200, 'bag')).toBe('૧,૨૦૦ નંગ');
    expect(formatCount(2, 'dispatch', 'dispatches')).toBe('૨ જાવક');
    expect(formatCount(0, 'invoice')).toBe('૦ ઇન્વૉઇસ');
    // The owner's word for user (glossary; G-38), as in the Users title above the count.
    expect(formatCount(7, 'user')).toBe('૭ યુઝર');
  });
  it('keeps an unknown noun in English rather than dropping it', () => {
    expect(formatCount(2, 'widget')).toBe('૨ widgets');
  });
  it('writes dates as DD/MM/YY in Gujarati digits', () => {
    expect(formatDate(new Date(2021, 9, 7))).toBe('૦૭/૧૦/૨૧');
    expect(formatDate(new Date(2021, 7, 15))).toBe('૧૫/૦૮/૨૧');
    expect(formatMonth(new Date(2021, 0, 1), 'long')).toBe('જાન્યુઆરી ૨૦૨૧');
    expect(formatMonth(new Date(2021, 0, 1), 'narrow')).toBe('જાન્યુ');
  });
  it('writes the year in the current year too', () => {
    const today = new Date();
    const text = formatDate(new Date(today.getFullYear(), 0, 5));
    expect(text).toBe(`૦૫/૦૧/${String(today.getFullYear()).slice(-2).replace(/\d/g, digit => '૦૧૨૩૪૫૬૭૮૯'[Number(digit)])}`);
  });
  it('writes times with Gujarati digits and AM/PM', () => {
    expect(formatTime(new Date(2021, 9, 7, 16, 5))).toBe('૪:૦૫ PM');
    expect(formatTime(new Date(2021, 9, 7, 0, 30))).toBe('૧૨:૩૦ AM');
  });
  it('says today and yesterday in Gujarati, and writes other days as dates', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    expect(formatSectionDate(now.toISOString())).toBe('આજે');
    expect(formatSectionDate(yesterday.toISOString())).toBe('ગઈકાલે');
    expect(formatSectionDate('2021-10-07')).toBe('૦૭/૧૦/૨૧');
  });
  it('says how long ago in Gujarati', () => {
    expect(formatRelativeTime(new Date(Date.now() - 10_000).toISOString())).toBe('હમણાં જ');
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('૫ મિનિટ પહેલાં');
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('૩ કલાક પહેલાં');
  });
});

describe('calendar words', () => {
  it('has twelve months and seven weekdays in each language', () => {
    for (const language of ['en', 'gu'] as const) {
      const words = commonWords(language);
      expect(words.monthsShort).toHaveLength(12);
      expect(words.monthsLong).toHaveLength(12);
      expect(words.weekdaysShort).toHaveLength(7);
    }
  });
});
