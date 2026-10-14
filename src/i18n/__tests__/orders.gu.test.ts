import { t } from '..';

describe('orders in Gujarati', () => {
  it('counts bags without changing the noun', () => {
    expect(t('orders.catalog.addBags', { count: 1, name: 'બટાકા' }, 'gu')).toBe('બટાકા ના ૧ નંગ ઉમેરો');
    expect(t('orders.catalog.addBags', { count: 10, name: 'બટાકા' }, 'gu')).toBe('બટાકા ના ૧૦ નંગ ઉમેરો');
    expect(t('orders.catalog.addBags', { count: 10, name: 'Potato' })).toBe('Add 10 bags of Potato');
    expect(t('orders.catalog.addBags', { count: 1, name: 'Potato' })).toBe('Add 1 bag of Potato');
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
  it('sums up the lots that were not saved', () => {
    expect(t('orders.catalog.notSavedSummary', { count: 2 }, 'gu')).toBe('૨ જથ્થા સચવાયા નથી. દરેક પર કારણ જુઓ.');
    expect(t('orders.catalog.notSavedSummary', { count: 1 })).toBe('1 lot was not saved. See the reason on it.');
    expect(t('orders.catalog.notSavedSummary', { count: 2 })).toBe('2 lots were not saved. See the reason on each.');
  });
});
