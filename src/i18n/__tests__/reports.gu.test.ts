import { t, setLanguage } from '..';
import { formatCount, formatDate, formatNumber } from '@/utils/formatters';

afterEach(() => setLanguage('en'));

describe('reports in Gujarati', () => {
  it('writes a period with its day count in Gujarati digits', () => {
    expect(t('reports.period.lastDays', { count: 120 }, 'gu')).toBe('છેલ્લા ૧૨૦ દિવસ');
    expect(t('reports.period.days', { count: 364 }, 'gu')).toBe('૩૬૪ દિવસ');
  });

  it('puts "થી … સુધી" after the dates of a range', () => {
    setLanguage('gu');
    expect(t('reports.period.dateRange', { from: formatDate('2026-06-01'), to: formatDate('2026-10-10') })).toBe(
      `${formatDate('2026-06-01')}થી ${formatDate('2026-10-10')} સુધી`
    );
    expect(t('reports.period.dateRange', { from: 'A', to: 'B' }, 'en')).toBe('A – B');
  });

  it('keeps a document number in 0-9 and formats counts around it', () => {
    setLanguage('gu');
    expect(t('reports.shared.grnNumber', { number: '2026/0145' })).toBe('આવક પાવતી 2026/0145');
    expect(t('reports.stockSummary.stockOf', { stock: formatNumber(1250), total: formatNumber(4000) })).toBe('૪,૦૦૦માંથી ૧,૨૫૦');
  });

  it('says how long stock has been lying, with the age after the number', () => {
    setLanguage('gu');
    expect(t('reports.titles.stockAging')).toBe('માલ કેટલા દિવસથી પડ્યો છે');
    expect(t('reports.stockAging.ageOld', { age: formatCount(130, 'day') })).toBe('૧૩૦ દિવસથી પડ્યો છે');
    expect(t('reports.stockAging.bucketOver364')).toBe('૩૬૪ દિવસથી વધુ');
    expect(
      t('reports.stockAging.dispatchedIn', { quantity: formatNumber(300), dispatches: formatCount(3, 'dispatch', 'dispatches') })
    ).toBe('૩ જાવકમાં ૩૦૦');
  });
});

describe('activity reports in Gujarati', () => {
  it('describes the stock trend as one sentence', () => {
    expect(
      t(
        'reports.customerActivity.trend.summaryRange',
        { first: '૧,૨૦૦', firstMonth: 'જૂન ૨૦૨૬', latest: '૮૫૦', lastMonth: 'ઑક્ટો ૨૦૨૬', highest: '૧,૫૦૦' },
        'gu'
      )
    ).toBe('સ્ટોક જૂન ૨૦૨૬માં ૧,૨૦૦ હતો, ઑક્ટો ૨૦૨૬માં ૮૫૦ થયો. સૌથી વધુ ૧,૫૦૦.');
  });

  it('formats a raw count and keeps the noun unchanged after a number', () => {
    expect(t('reports.invoiceHistory.paidCount', { count: 12 }, 'gu')).toBe('ચૂકવેલ (૧૨)');
    expect(t('reports.dispatchActivity.bagUnit', { count: 5 }, 'gu')).toBe('નંગ');
  });

  it('keeps a dispatch number as stored', () => {
    expect(t('reports.dispatchActivity.cardLabel', { number: 'DD0003', date: 'x', supervisor: 'y', bags: 'z' }, 'gu')).toBe(
      'જાવક DD0003, x, y, z'
    );
  });
});
