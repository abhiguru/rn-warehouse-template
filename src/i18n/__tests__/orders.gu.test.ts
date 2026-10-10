import { t } from '..';

describe('orders in Gujarati', () => {
  it('counts bags without changing the noun', () => {
    expect(t('orders.catalog.addBags', { count: 1, name: 'બટાકા' }, 'gu')).toBe('બટાકા ની ૧ બોરી ઉમેરો');
    expect(t('orders.catalog.addBags', { count: 10, name: 'બટાકા' }, 'gu')).toBe('બટાકા ની ૧૦ બોરી ઉમેરો');
    expect(t('orders.catalog.addBags', { count: 10, name: 'Potato' })).toBe('Add 10 bags of Potato');
    expect(t('orders.catalog.addBags', { count: 1, name: 'Potato' })).toBe('Add 1 bag of Potato');
  });
  it('puts the customer name first in the screen title', () => {
    expect(t('orders.screen.title', { name: 'રમેશ ટ્રેડર્સ' }, 'gu')).toBe('રમેશ ટ્રેડર્સ નો ઑર્ડર');
  });
  it('formats a count in Gujarati digits with Indian grouping', () => {
    expect(t('orders.catalog.addCount', { count: 1200 }, 'gu')).toBe('ઉમેરો (૧,૨૦૦)');
  });
  it('leaves a GRN number as it is stored', () => {
    expect(t('orders.catalog.grn', { number: 'G0012' }, 'gu')).toBe('આવક પાવતી G0012');
  });
});
