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
  it('writes a validity period with થી and સુધી after the dates', () => {
    expect(t('pricing.card.validFromTo', { from: '૧ ઑક્ટો', to: '૩૧ ઑક્ટો' }, 'gu')).toBe('૧ ઑક્ટો થી ૩૧ ઑક્ટો સુધી');
    expect(t('pricing.card.validFromTo', { from: '1 Oct', to: '31 Oct' })).toBe('From 1 Oct to 31 Oct');
  });
  it('shows a tax rate in Gujarati digits', () => {
    expect(t('pricing.card.tax', { percent: localizeDigits('18', 'gu') }, 'gu')).toBe('ટેક્સ ૧૮%');
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
