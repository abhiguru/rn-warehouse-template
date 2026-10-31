import { setLanguage } from '@/i18n';
import { dateText, rangeText } from '../rateText';
import { t } from '@/i18n';

afterEach(() => setLanguage('en'));

describe('rate dates always carry the year (P-21), as two digits', () => {
  const days = ['2025-01-01', '2026-03-31', '2026-10-14', '2027-01-01'];

  it('every date and range has a two-digit year', () => {
    for (const day of days) expect(dateText(day)).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
    expect(rangeText('2025-01-01', '2026-03-31')).toBe('01/01/25 – 31/03/26');
  });

  it('the sentences built from them keep the year: since, range, upcoming, stops, ends', () => {
    const texts = [
      t('pricing.item.since', { date: dateText('2026-04-01') }),
      t('pricing.item.range', { from: dateText('2026-04-01'), to: dateText('2026-12-31') }),
      t('pricing.item.upcoming', { date: dateText('2027-01-01'), amount: '₹12.00', unit: 'x' }),
      t('pricing.item.stops', { date: dateText('2027-03-31') }),
      t('pricing.tag.newRate', { date: dateText('2027-01-01') }),
      t('pricing.tag.rateEnds', { date: dateText('2027-03-31') }),
    ];
    for (const text of texts) expect(text).toMatch(/\d{2}\/\d{2}\/\d{2}/);
  });

  it('Gujarati dates use Gujarati digits for the year too', () => {
    setLanguage('gu');
    expect(dateText('2027-01-01')).toBe('૦૧/૦૧/૨૭');
    expect(rangeText('2025-01-01', '2026-03-31')).toMatch(/૨૫.*૨૬/);
    expect(rangeText('2025-01-01', '2026-03-31')).not.toMatch(/[0-9]/);
  });
});
