import { setLanguage, t } from '..';
import { en } from '../locales/en';
import { grnSteps } from '@/features/grn/utils/grnStepLabels';
import { parseReceiptQuantity, parseReceiptWeight, validateStep2 } from '@/features/grn/schemas/grnValidation';
import { getGRNStockStatus } from '@/features/grn/utils/grnStockStatus';
import { formatCount, formatNumber } from '@/utils/formatters';

afterEach(() => setLanguage('en'));

describe('grn texts in Gujarati', () => {
  it('names the document આવક પાવતી and leaves its number as stored', () => {
    expect(t('grn.details.titleWithNumber', { number: 'DV0198' }, 'gu')).toBe('આવક પાવતી DV0198');
    expect(t('grn.review.createGrn', undefined, 'gu')).toBe('આવક પાવતી બનાવો');
    expect(t('common.grnNumber', undefined, 'gu')).toBe('આવક પાવતી નંબર');
  });

  it('puts the count in ૦-૯ and keeps the noun unchanged in a plural', () => {
    expect(t('grn.review.confirmCreateNumbered', { number: 'DV0198', count: 1 }, 'gu')).toBe(
      '૧ આઇટમ સાથે આવક પાવતી DV0198 બનાવવી છે?'
    );
    expect(t('grn.review.confirmCreateNumbered', { number: 'DV0198', count: 12 }, 'gu')).toBe(
      '૧૨ આઇટમ સાથે આવક પાવતી DV0198 બનાવવી છે?'
    );
    expect(t('grn.review.confirmCreateNumbered', { number: 'DV0198', count: 12 })).toBe(
      'Create GRN DV0198 with 12 items?'
    );
  });

  it('orders "dispatched of total" the Gujarati way, with Indian grouping', () => {
    expect(t('grn.dispatches.dispatchedOfTotal', { dispatched: 250, total: 1200 }, 'gu')).toBe('૧,૨૦૦ માંથી ૨૫૦');
    expect(t('grn.dispatches.dispatchedOfTotal', { dispatched: 250, total: 1200 })).toBe('250 of 1,200');
  });

  it('builds a sentence from formatted values', () => {
    setLanguage('gu');
    expect(t('grn.sourceGrns.receivedBags', { bags: formatCount(50, 'bag') })).toBe('આવક ૫૦ નંગ');
    expect(t('grn.upload.fileTooLarge', { size: formatNumber(12.34, 1) })).toBe(
      'ફાઇલ (૧૨.૩MB) બહુ મોટી છે. વધુમાં વધુ ૧૦MB ચાલશે.'
    );
    expect(t('grn.form.forExample', { example: 'GJ01AB1234' })).toBe('દા.ત. GJ01AB1234');
  });

  it('keeps the English wording of the texts the wizard already showed', () => {
    expect(t('grn.upload.fileTooLarge', { size: formatNumber(12.34, 1) })).toBe(
      'File size (12.3MB) exceeds maximum limit (10MB)'
    );
    expect(t('grn.itemsStep.itemsWillBeLost', { count: 1 })).toBe('1 item will be lost.');
    expect(t('grn.itemsStep.itemsWillBeLost', { count: 3 })).toBe('3 items will be lost.');
    expect(t('grn.photos.limitPerItem', { count: 2 })).toBe('You can add up to 2 photos per item.');
  });
});

describe('grn code that follows the language', () => {
  it('resolves validation messages when the error is reported', async () => {
    const item = { item_table_id: '', item_name: 'Potato', qty: '0', stock: '0', weight: '50' };
    const english = await validateStep2({ items: [item] });
    expect(english.errors['items[0].qty']).toBe('Quantity must be at least 1');
    expect(english.errors['items[0].item_table_id']).toBe('Please select an item from the catalog');

    setLanguage('gu');
    const gujarati = await validateStep2({ items: [item] });
    expect(gujarati.errors['items[0].qty']).toBe('નંગ ઓછામાં ઓછા ૧ હોવા જોઈએ');
    expect(gujarati.errors['items[0].item_table_id']).toBe('યાદીમાંથી આઇટમ પસંદ કરો');
  });

  it('reads typed ૦-૯ as the same number as 0-9', () => {
    expect(parseReceiptQuantity('૧૨૫')).toBe(125);
    expect(parseReceiptQuantity(' ૧૨5 ')).toBe(125);
    expect(parseReceiptWeight('૫૦')).toBe(50);
    expect(parseReceiptQuantity('૧૨ નંગ')).toBeNull();
    expect(parseReceiptQuantity('૦')).toBeNull();
  });

  it('names the wizard steps in the language at the time of the call', () => {
    expect(grnSteps()).toEqual([
      { label: 'GRN details', shortLabel: 'Details' },
      { label: 'Items', shortLabel: 'Items' },
      { label: 'Review', shortLabel: 'Review' },
    ]);
    setLanguage('gu');
    expect(grnSteps()).toEqual([
      { label: 'આવક પાવતીની વિગતો', shortLabel: 'વિગતો' },
      { label: 'આઇટમ', shortLabel: 'આઇટમ' },
      { label: 'ચકાસણી', shortLabel: 'ચકાસણી' },
    ]);
  });

  it('labels the stock status in the language at the time of the call', () => {
    expect(getGRNStockStatus(0, 100)?.label).toBe('Fully dispatched');
    setLanguage('gu');
    expect(getGRNStockStatus(0, 100)?.label).toBe('પૂરી જાવક થઈ');
    expect(getGRNStockStatus(10, 100)?.label).toBe('ઓછો સ્ટોક');
    expect(getGRNStockStatus(80, 100)?.label).toBe('સ્ટોકમાં છે');
  });

  it('has the grn namespace in the tables', () => {
    expect(Object.keys(en.grn).length).toBeGreaterThan(10);
  });
});
