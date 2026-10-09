import {
  formatCount,
  formatDate,
  formatDateTime,
  formatMobile,
  formatRelativeTime,
  formatSectionDate,
  formatTemperature,
  formatTime,
  formatWeight,
} from '../formatters';
import { avatarColors, avatarIndex, avatarInitials } from '../avatar';
import { AA, BRANDS, contrastRatio, getTokens } from '@/theme/tokens';

const thisYear = new Date().getFullYear();

describe('style guide §12.3 formats', () => {
  it('formats dates with fixed month names', () => {
    expect(formatDate('2026-09-22')).toBe('22 Sep 2026');
    expect(formatDate('2026-10-09', 'long')).toBe('9 October 2026');
    expect(formatDate(`${thisYear}-10-06`, 'short')).toBe('6 Oct');
    expect(formatDate('2019-10-06', 'short')).toBe('6 Oct 2019');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  it('formats times and date-times in 12-hour form', () => {
    const d = new Date(2026, 9, 9, 16, 5);
    expect(formatTime(d)).toBe('4:05 pm');
    expect(formatTime(new Date(2026, 9, 9, 0, 30))).toBe('12:30 am');
    expect(formatDateTime(d)).toBe('9 Oct 2026, 4:05 pm');
  });

  it('formats section headers', () => {
    const today = new Date();
    expect(formatSectionDate(today.toISOString())).toBe('Today');
    expect(formatSectionDate('2019-10-08')).toBe('Tue, 8 Oct 2019');
  });

  it('formats relative times under a day, then the date', () => {
    const fiveMin = new Date(Date.now() - 5 * 60000).toISOString();
    const threeH = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatRelativeTime(fiveMin)).toBe('5 min ago');
    expect(formatRelativeTime(threeH)).toBe('3 h ago');
    expect(formatRelativeTime('2019-10-08T10:00:00Z')).toBe('8 Oct 2019');
  });

  it('formats mobiles, counts, weights and temperatures', () => {
    expect(formatMobile('9876543210')).toBe('+91 98765 43210');
    expect(formatMobile('+91 98765-43210')).toBe('+91 98765 43210');
    expect(formatMobile('12345')).toBe('12345');
    expect(formatCount(1, 'item')).toBe('1 item');
    expect(formatCount(1200, 'bag')).toBe('1,200 bags');
    expect(formatCount(2, 'dispatch', 'dispatches')).toBe('2 dispatches');
    expect(formatWeight(1250.5)).toBe('1,250.5 kg');
    expect(formatWeight(40)).toBe('40 kg');
    expect(formatTemperature(-18.5)).toBe('−18.5°C');
    expect(formatTemperature(4)).toBe('4.0°C');
    expect(formatTemperature(-0.01)).toBe('0.0°C');
  });
});

describe('avatars', () => {
  it('takes initials from the first two words', () => {
    expect(avatarInitials('Sunrise Agro Foods')).toBe('SA');
    expect(avatarInitials('  dev ')).toBe('D');
    expect(avatarInitials('')).toBe('?');
  });

  it('picks a stable colour that keeps initials readable in every theme', () => {
    expect(avatarIndex('abc', 9)).toBe(avatarIndex('abc', 9));
    for (const brand of BRANDS) {
      for (const mode of ['light', 'dark'] as const) {
        const t = getTokens(brand, mode);
        for (let i = 0; i < 40; i++) {
          const { background, text } = avatarColors(`customer-${i}`, t);
          expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(AA.text);
        }
      }
    }
  });
});
