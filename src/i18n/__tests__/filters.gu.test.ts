import { setLanguage, t } from '..';
import { formatDate, formatNumber } from '@/utils/formatters';

afterEach(() => setLanguage('en'));

describe('filters in Gujarati', () => {
  it('counts results without changing the noun, in Gujarati digits', () => {
    expect(t('filters.results.item.show', { count: 1 }, 'gu')).toBe('૧ આઇટમ બતાવો');
    expect(t('filters.results.item.show', { count: 24 }, 'gu')).toBe('૨૪ આઇટમ બતાવો');
    expect(t('filters.results.dispatch.show', { count: 1234 }, 'gu')).toBe('૧,૨૩૪ જાવક બતાવો');
    expect(t('filters.results.invoice.none', undefined, 'gu')).toBe('કોઈ ઇન્વૉઇસ મળતું નથી');
    expect(t('filters.bar.openAllApplied', { count: 3 }, 'gu')).toBe('ફિલ્ટર, ૩ લાગુ છે. સૉર્ટ અને ફિલ્ટર ખોલો');
    expect(t('filters.picker.selected', { count: 12 }, 'gu')).toBe('પસંદ કરેલા (૧૨)');
  });

  it('puts "થી … સુધી" after the values of a range', () => {
    setLanguage('gu');
    const year = new Date().getFullYear();
    expect(t('filters.chip.dateBetween', { from: formatDate(`${year}-10-01`, 'short'), to: formatDate(`${year}-10-07`, 'short') })).toBe('૧ ઑક્ટોથી ૭ ઑક્ટો સુધી');
    expect(t('filters.chip.numberBetweenUnit', { min: formatNumber(10), max: formatNumber(1500), unit: t('filters.unit.kg') })).toBe('૧૦થી ૧,૫૦૦ કિલો સુધી');
    expect(t('filters.chip.atLeastUnit', { min: formatNumber(40), unit: t('filters.unit.bags') })).toBe('૪૦ નંગ કે વધુ');
    expect(t('filters.chip.upTo', { max: formatNumber(99) })).toBe('૯૯ સુધી');
  });

  it('leaves a document number as it was typed', () => {
    expect(t('filters.chip.textBetween', { from: 'DD0010', to: 'DD0020' }, 'gu')).toBe('DD0010થી DD0020 સુધી');
    expect(t('filters.bar.searchRange', { from: 'DD0010', to: 'DD0020' }, 'gu')).toBe(
      'નંબર DD0010થી DD0020 સુધી, તમારી શોધમાંથી વાંચ્યા છે. તેના બદલે આ શબ્દોને લખાણ તરીકે શોધો'
    );
    expect(t('filters.empty.noMatchSearch.grn', { search: 'Z0797' }, 'gu')).toBe('"Z0797" સાથે કોઈ આવક પાવતી મળતી નથી');
  });

  it('puts the verb last in the spoken chip labels', () => {
    expect(t('filters.bar.sortedBy', { label: 'તારીખ', direction: 'સૌથી નવા પહેલાં' }, 'gu')).toBe('તારીખ મુજબ સૉર્ટ કરેલું, સૌથી નવા પહેલાં. સૉર્ટ બદલો');
    expect(t('filters.bar.removeFilter', { name: 'આઇટમ સાથે' }, 'gu')).toBe('આઇટમ સાથે ફિલ્ટર કાઢી નાખો');
    expect(t('filters.bar.filterBy', { label: 'વેપારી' }, 'gu')).toBe('વેપારી મુજબ ફિલ્ટર કરો');
    expect(t('filters.range.cellLabelUnit', { label: 'વજન', name: 'ઓછામાં ઓછું', unit: 'કિલો' }, 'gu')).toBe('વજન, ઓછામાં ઓછું, કિલોમાં');
  });
});
