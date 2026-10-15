import { localizeDigits, setLanguage, t } from '..';
import { priceTypeLabel, weightBandLabel } from '@/features/item-pricing/utils/priceLabels';

afterEach(() => setLanguage('en'));

describe('pricing in Gujarati', () => {
  it('counts the fields to fix', () => {
    expect(t('pricing.form.fixFields', { count: 1 }, 'gu')).toBe('૧ વિગત સુધારો.');
    expect(t('pricing.form.fixFields', { count: 3 }, 'gu')).toBe('૩ વિગતો સુધારો.');
    expect(t('pricing.form.fixFields', { count: 1 })).toBe('Fix 1 field.');
    expect(t('pricing.form.fixFields', { count: 3 })).toBe('Fix 3 fields.');
  });
  it('writes the range of goods-received dates with થી and સુધી after the dates', () => {
    expect(t('pricing.item.range', { from: '૧ ઑક્ટો ૨૦૨૬', to: '૩૧ ઑક્ટો ૨૦૨૬' }, 'gu')).toBe('૧ ઑક્ટો ૨૦૨૬ થી ૩૧ ઑક્ટો ૨૦૨૬ સુધી આવેલા જથ્થા માટે');
    expect(t('pricing.item.range', { from: '1 Oct 2026', to: '31 Oct 2026' })).toBe('Lots received 1 Oct 2026 – 31 Oct 2026');
    expect(t('pricing.item.since', { date: '૧ એપ્રિલ ૨૦૨૬' }, 'gu')).toBe('૧ એપ્રિલ ૨૦૨૬ થી આવેલા જથ્થા માટે');
  });
  it('shows a tax rate in Gujarati digits', () => {
    expect(t('pricing.row.tax', { percent: localizeDigits('18', 'gu') }, 'gu')).toBe('ટેક્સ ૧૮%');
    expect(t('pricing.item.taxValue', { percent: localizeDigits('5', 'gu') }, 'gu')).toBe('ભાડું અને મજૂરી પર ૫%');
  });
  it('keeps the owner\'s word મૂળ દર for the default rate, once, with no extra tag (P-19)', () => {
    expect(t('pricing.item.default', undefined, 'gu')).toBe('મૂળ દર');
    expect(t('pricing.action.addDefault', undefined, 'gu')).toBe('મૂળ દર ઉમેરો');
    expect(t('pricing.customerRate.title', { customer: 'ફિક્શનલ' }, 'gu')).toBe('ફિક્શનલ નો પોતાનો દર');
  });
  it('counts customer rates and old rates', () => {
    expect(t('pricing.tag.customerRates', { count: 1 }, 'gu')).toBe('૧ વેપારીનો દર');
    expect(t('pricing.tag.customerRates', { count: 3 }, 'gu')).toBe('૩ વેપારીના દર');
    expect(t('pricing.item.showOld', { count: 1 }, 'gu')).toBe('૧ જૂનો દર બતાવો');
    expect(t('pricing.item.showOld', { count: 2 }, 'gu')).toBe('૨ જૂના દર બતાવો');
  });
  it('names the price history and what happened to a price', () => {
    expect(t('pricing.history.open', undefined, 'gu')).toBe('ઇતિહાસ');
    expect(t('pricing.history.title', undefined, 'gu')).toBe('દરનો ઇતિહાસ');
    expect(['insert', 'update', 'delete', 'truncate'].map(action => t(`pricing.history.action.${action}` as 'pricing.history.action.insert', undefined, 'gu')))
      .toEqual(['દર ઉમેરાયો', 'દર બદલાયો', 'દર ડિલીટ થયો', 'બધા દર કાઢી નખાયા']);
    // The default price keeps the owner's word (glossary: મૂળ દર).
    expect(t('pricing.history.defaultPrice', undefined, 'gu')).toBe('મૂળ દર');
    expect(t('pricing.history.pricesRemoved', { count: 1 }, 'gu')).toBe('૧ દર કાઢી નખાયો');
    expect(t('pricing.history.pricesRemoved', { count: 12 }, 'gu')).toBe('૧૨ દર કાઢી નખાયા');
    expect(t('pricing.history.pricesRemoved', { count: 1 })).toBe('1 price removed');
    expect(t('pricing.history.changeLabel', { label: 'માસિક દર', old: '₹૫', new: '₹૬' }, 'gu')).toBe('માસિક દર: ₹૫ બદલાઈને ₹૬');
  });
  it('labels a weight band and a price type in the language of the moment', () => {
    expect(weightBandLabel(0, 50)).toBe('0–50 kg');
    expect(priceTypeLabel('monthly')).toBe('Monthly');
    setLanguage('gu');
    expect(weightBandLabel(0, 50)).toBe('૦–૫૦ કિલો');
    expect(priceTypeLabel('one_time')).toBe('એક વખત');
  });
});
