import { setLanguage, t } from '..';
import { formatCount, formatNumber, formatWeight } from '@/utils/formatters';

afterEach(() => setLanguage('en'));

describe('lists in Gujarati', () => {
  it('uses the glossary wording on the cards', () => {
    expect(t('lists.card.showDetails', undefined, 'gu')).toBe('આઇટમની વિગતો માટે ટૅપ કરો');
    expect(t('lists.card.hideDetails', undefined, 'gu')).toBe('વિગતો છુપાવો');
    expect(t('lists.order.statusOpen', undefined, 'gu')).toBe('બાકી');
    expect(t('lists.queue.title', undefined, 'gu')).toBe('ઑર્ડરની કતાર');
  });

  it('counts the items left over without changing the noun', () => {
    expect(t('lists.orderGroup.moreItems', { count: 1 })).toBe('1 more item');
    expect(t('lists.orderGroup.moreItems', { count: 3 })).toBe('3 more items');
    expect(t('lists.orderGroup.moreItems', { count: 1 }, 'gu')).toBe('બીજી ૧ આઇટમ');
    expect(t('lists.orderGroup.moreItems', { count: 12 }, 'gu')).toBe('બીજી ૧૨ આઇટમ');
  });

  it('keeps document and vehicle numbers as stored, and formats the quantities', () => {
    setLanguage('gu');
    expect(t('lists.grn.cardTitle', { number: 'Z0797' })).toBe('આવક પાવતી Z0797');
    expect(t('lists.card.vehicle', { number: 'GJ01AB1234' })).toBe('વાહન GJ01AB1234');
    expect(t('lists.dispatch.itemRowRack', { item: 'બટાકા', rack: 'B7', weight: formatWeight(50, 0), grn: 'Z0797', quantity: 1200 })).toBe(
      'બટાકા, રેક B7, ૫૦ કિલો, આવક પાવતી Z0797, ૧,૨૦૦ નંગ જાવક'
    );
    expect(t('lists.grn.stockCount', { stock: formatNumber(4500) })).toBe('સ્ટોકમાં ૪,૫૦૦');
    expect(t('lists.orderGroup.itemRowLow', { item: 'લસણ', stock: 5, quantity: 40 })).toBe('લસણ, સ્ટોક ૫, જથ્થો ૪૦, ઓછો સ્ટોક');
  });

  it('builds whole sentences around a count that is already worded', () => {
    setLanguage('gu');
    expect(t('lists.section.label', { title: 'આજે', countText: formatCount(3, 'dispatch', 'dispatches') })).toBe('આજે, ૩ જાવક');
    expect(t('lists.grn.showDetailsOf', { items: formatCount(2, 'item') })).toBe('આ આવક પાવતીમાં ૨ આઇટમ. આઇટમની વિગતો બતાવો');
    expect(t('lists.queue.countLabel', { orders: formatCount(14, 'order') })).toBe('કતારમાં ૧૪ ઑર્ડર');
    expect(t('lists.orderGroup.skippedMessage', { items: '• લસણ: સ્ટોક નથી', itemCount: formatCount(2, 'item') })).toBe(
      'આ આઇટમની જાવક થઈ શકશે નહીં:\n\n• લસણ: સ્ટોક નથી\n\n૨ આઇટમ સાથે જાવક બનાવવી છે?'
    );
    expect(t('lists.orderGroup.updatedBy', { time: '૨ કલાક પહેલાં', name: 'Asha' })).toBe('૨ કલાક પહેલાં, Asha દ્વારા');
  });
});
