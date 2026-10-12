import { t, setLanguage } from '..';
import { formatCount, formatNumber } from '@/utils/formatters';

afterEach(() => setLanguage('en'));

describe('reports in Gujarati', () => {
  it('writes a period with its day count in Gujarati digits', () => {
    expect(t('reports.period.lastDays', { count: 120 }, 'gu')).toBe('છેલ્લા ૧૨૦ દિવસ');
  });

  it('keeps a document number in 0-9 and formats counts around it', () => {
    setLanguage('gu');
    expect(t('reports.shared.grnNumber', { number: '2026/0145' })).toBe('આવક પાવતી 2026/0145');
    expect(t('reports.itemStockSummary.stockOfInStock', { stock: formatNumber(1250), total: formatNumber(4000) })).toBe(
      '૪,૦૦૦માંથી ૧,૨૫૦ સ્ટોકમાં છે'
    );
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

describe('the reviewed Gujarati wording of the report texts', () => {
  it('says how many rows show without a gendered verb', () => {
    expect(t('reports.scaffold.showing', { shown: '૩', total: '૪૦' }, 'gu')).toBe('૪૦માંથી ૩ દેખાય છે');
  });

  it('names the age sort with a plain noun, so the spoken "… મુજબ સૉર્ટ કરેલું" is a sentence', () => {
    expect(t('reports.sort.age', undefined, 'gu')).toBe('દિવસ');
    // The older average-age label is outside this review and is unchanged.
    expect(t('reports.stockAging.averageAge', undefined, 'gu')).toBe('સરેરાશ કેટલા દિવસથી');
  });

  it('says only the loaded items are sorted', () => {
    expect(t('reports.itemStockSummary.sortedAmongLoaded', { count: 40 }, 'gu')).toBe('ફક્ત લોડ થયેલી ૪૦ આઇટમ જ સૉર્ટ થઈ છે');
  });

  it('uses એકાઉન્ટ for the login account and લાઇન for a row of the PDF', () => {
    expect(t('reports.export.notAvailable', undefined, 'gu')).toBe('આ અહેવાલની PDF તમારા એકાઉન્ટ માટે ઉપલબ્ધ નથી.');
    expect(t('reports.export.truncated', { shown: '૫,૦૦૦', total: '૧૨,૩૪૫' }, 'gu')).toBe('આ PDFમાં ૧૨,૩૪૫માંથી પહેલી ૫,૦૦૦ લાઇન જ છે.');
  });
});

describe('units after a stock figure', () => {
  it('is "unit" for exactly 1 in English and "units" otherwise, and "units" when no count is given', () => {
    expect(t('reports.shared.units', { count: 1 })).toBe('unit');
    expect(t('reports.shared.units', { count: 2 })).toBe('units');
    expect(t('reports.shared.units', { count: 0 })).toBe('units');
    expect(t('reports.shared.units')).toBe('units');
    expect(formatCount(1, 'unit')).toBe('1 unit');
    expect(formatCount(1200, 'unit')).toBe('1,200 units');
  });

  it('is the same word for 1 and for more in Gujarati', () => {
    for (const count of [0, 1, 2, 1200]) expect(t('reports.shared.units', { count }, 'gu')).toBe('નંગ');
    setLanguage('gu');
    expect(formatCount(1, 'unit')).toBe('૧ નંગ');
    expect(formatCount(1200, 'unit')).toBe('૧,૨૦૦ નંગ');
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
