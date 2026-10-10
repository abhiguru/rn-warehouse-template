import { t } from '..';

describe('items in Gujarati', () => {
  it('puts the limit before the count of characters', () => {
    expect(t('items.form.charCountLabel', { count: 12, max: 80 }, 'gu')).toBe('૮૦ માંથી ૧૨ અક્ષર');
    expect(t('items.form.charCountLabel', { count: 12, max: 80 })).toBe('12 of 80 characters');
  });
  it('keeps a typed item name as it is', () => {
    expect(t('items.delete.deletedMessage', { name: 'Onion A1' }, 'gu')).toBe('Onion A1 ડિલીટ થઈ.');
  });
  it('shows the number of saved items in Gujarati digits', () => {
    expect(t('items.summary.titleCount', { title: t('items.summary.title', undefined, 'gu'), count: 3 }, 'gu')).toBe('સાચવેલી આઇટમ (૩)');
  });
  it('names the thing to delete inside the sentence', () => {
    // Whole sentences for the usual list of items; a caller's own word only fits the English form.
    expect(t('items.summary.item.deleteTitle', undefined, 'gu')).toBe('આઇટમ ડિલીટ કરવી છે?');
    expect(t('items.summary.item.deleteTitle')).toBe('Delete item?');
    expect(t('items.summary.deleteTitle', { entity: 'lot' })).toBe('Delete lot?');
  });
});
