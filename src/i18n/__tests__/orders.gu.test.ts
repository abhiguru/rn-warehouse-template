import { setLanguage, t } from '..';
import { formatPackages } from '@/utils/packagingWord';

describe('orders in Gujarati', () => {
  afterEach(() => setLanguage('en'));
  it('counts bags without changing the noun', () => {
    // The count word follows the app's language, the sentence the one asked for.
    const add = (count: number, name: string, packaging: string | null, lng?: 'gu') => {
      setLanguage(lng ?? 'en');
      return t('orders.catalog.addPacks', { packs: formatPackages(count, packaging), name }, lng);
    };
    expect(add(1, 'બટાકા', 'Bag', 'gu')).toBe('બટાકા ના ૧ નંગ ઉમેરો');
    expect(add(10, 'બટાકા', 'Bag', 'gu')).toBe('બટાકા ના ૧૦ નંગ ઉમેરો');
    expect(add(10, 'Potato', 'Bag')).toBe('Add 10 bags of Potato');
    expect(add(1, 'Potato', null)).toBe('Add 1 bag of Potato');
    expect(add(10, 'Tamarind', 'Box')).toBe('Add 10 boxes of Tamarind');
    expect(t('orders.catalog.removePacks', { packs: formatPackages(1, 'Crate'), name: 'Tamarind' })).toBe('Remove 1 crate of Tamarind');
  });
  it('puts the customer name first in the screen title', () => {
    expect(t('orders.screen.title', { name: 'રમેશ ટ્રેડર્સ' }, 'gu')).toBe('ઑર્ડર: રમેશ ટ્રેડર્સ');
  });
  it('formats a count in Gujarati digits with Indian grouping', () => {
    expect(t('orders.catalog.addCount', { count: 1200 }, 'gu')).toBe('ઉમેરો (૧,૨૦૦)');
  });
  it('leaves a GRN number as it is stored', () => {
    expect(t('orders.catalog.grn', { number: 'G0012' }, 'gu')).toBe('આવક પાવતી G0012');
  });
  it('asks before unsaved selections are left, with the count in Gujarati digits', () => {
    expect(t('orders.catalog.discardTitle', undefined, 'gu')).toBe('પસંદગી છોડી દેવી છે?');
    expect(t('orders.catalog.discardMessage', { count: 1 }, 'gu')).toBe('૧ જથ્થાના ફેરફાર સચવાયા નથી.');
    expect(t('orders.catalog.discardMessage', { count: 12 }, 'gu')).toBe('૧૨ જથ્થાના ફેરફાર સચવાયા નથી.');
    expect(t('orders.catalog.discardMessage', { count: 1 })).toBe('Changes to 1 lot have not been saved.');
    expect(t('orders.catalog.discardMessage', { count: 12 })).toBe('Changes to 12 lots have not been saved.');
    expect(t('orders.catalog.discardSelections', undefined, 'gu')).toBe('પસંદગી છોડી દો');
  });
  it('says which lot is being saved, the total first as Gujarati reads', () => {
    expect(t('orders.catalog.savingProgress', { done: 3, total: 20 }, 'gu')).toBe('૨૦ માંથી ૩ સાચવી રહ્યા છીએ…');
    expect(t('orders.catalog.savingProgress', { done: 3, total: 20 })).toBe('Saving 3 of 20…');
  });
  it('sums up the lots that were not saved, one lot in the singular', () => {
    expect(t('orders.catalog.notSavedSummary', { count: 1 }, 'gu')).toBe('૧ જથ્થો સચવાયો નથી. તેના પર કારણ જુઓ.');
    expect(t('orders.catalog.notSavedSummary', { count: 2 }, 'gu')).toBe('૨ જથ્થા સચવાયા નથી. દરેક પર કારણ જુઓ.');
    expect(t('orders.catalog.notSavedSummary', { count: 12 }, 'gu')).toBe('૧૨ જથ્થા સચવાયા નથી. દરેક પર કારણ જુઓ.');
    expect(t('orders.catalog.notSavedSummary', { count: 1 })).toBe('1 lot was not saved. See the reason on it.');
    expect(t('orders.catalog.notSavedSummary', { count: 2 })).toBe('2 lots were not saved. See the reason on each.');
  });
});
