import { t, setLanguage } from '..';
import { formatInvoiceAmount, formatInvoiceDeduction, savedInvoiceAmounts } from '@/utils/invoiceCalculations';
import { validateItemPricing } from '@/features/invoice/schemas/invoiceValidation';

afterEach(() => setLanguage('en'));

describe('invoice texts in Gujarati', () => {
  it('counts items in ૦-૯ and keeps the noun unchanged after a number', () => {
    expect(t('invoice.items.missingPrice', { count: 1 }, 'gu')).toBe(
      '૧ આઇટમમાં ભાડાનો દર કે સમયગાળો નથી. ૦ થી વધુ દર અને સમયગાળો લખો.'
    );
    expect(t('invoice.items.missingPrice', { count: 12 }, 'gu')).toBe(
      '૧૨ આઇટમમાં ભાડાનો દર કે સમયગાળો નથી. ૦ થી વધુ દર અને સમયગાળો લખો.'
    );
    expect(t('invoice.table.showDispatches', { count: 3 }, 'gu')).toBe('૩ જાવક બતાવો');
  });

  it('keeps the English plural forms as they were', () => {
    expect(t('invoice.items.missingPrice', { count: 1 })).toBe(
      '1 item has no charge or duration. Enter a charge and duration greater than 0.'
    );
    expect(t('invoice.items.missingPrice', { count: 4 })).toBe(
      '4 items have no charge or duration. Enter a charge and duration greater than 0.'
    );
    expect(t('invoice.form.fixFields', { count: 1 })).toBe('Fix the highlighted field, then continue.');
    expect(t('invoice.form.fixFields', { count: 3 })).toBe('Fix the 3 highlighted fields, then continue.');
  });

  it('leaves an invoice number in 0-9 and puts the customer first', () => {
    expect(t('invoice.details.deleteMessageFor', { number: '2555', customer: 'Asha Traders' }, 'gu')).toBe(
      'Asha Traders નું ઇન્વૉઇસ 2555 ડિલીટ થઈ જશે. આ પાછું ફેરવી શકાશે નહીં.'
    );
    expect(t('invoice.label.grnNumber', { number: '813' }, 'gu')).toBe('આવક પાવતી 813');
  });

  it('writes a percentage in ૦-૯', () => {
    expect(t('invoice.label.percent', { value: 18 }, 'gu')).toBe('૧૮%');
    expect(t('invoice.label.percent', { value: 18 })).toBe('18%');
  });

  it('formats invoice money in the language digits', () => {
    expect(formatInvoiceAmount(1906)).toBe('₹1,906.00');
    setLanguage('gu');
    expect(formatInvoiceAmount(1906)).toBe('₹૧,૯૦૬.૦૦');
    expect(formatInvoiceAmount(-250)).toBe('−₹૨૫૦.૦૦');
    expect(formatInvoiceDeduction(250)).toBe('−₹૨૫૦.૦૦');
    expect(t('invoice.review.confirmMessage', { customer: 'Asha Traders', total: formatInvoiceAmount(1906) })).toBe(
      'Asha Traders\nકુલ ₹૧,૯૦૬.૦૦'
    );
  });

  it('names a surcharge in the language and still tells it apart from a discount', () => {
    setLanguage('gu');
    const surcharge = savedInvoiceAmounts({ total: 1050, tax_amount: 50, discount: -100 });
    expect(surcharge.isSurcharge).toBe(true);
    expect(surcharge.adjustmentLabel).toBe('વધારાનો ચાર્જ');
    const discount = savedInvoiceAmounts({ total: 950, tax_amount: 50, discount: 100 });
    expect(discount.isSurcharge).toBe(false);
    expect(discount.adjustmentLabel).toBe('ડિસ્કાઉન્ટ');
  });

  it('gives validation messages in the language in use when validating', async () => {
    const bad = { duration: 0.25, no_of_days: 3, charge: -1, labour_rate: 0, tax: 120 };
    const english = await validateItemPricing(bad);
    expect(english.errors).toMatchObject({
      charge: 'Charge cannot be negative',
      tax: 'Tax cannot exceed 100%',
      duration: 'Duration must be at least 0.5 months',
    });
    setLanguage('gu');
    const gujarati = await validateItemPricing(bad);
    expect(gujarati.errors).toMatchObject({
      charge: 'ભાડાનો દર શૂન્યથી ઓછો ન હોઈ શકે',
      tax: 'ટેક્સ ૧૦૦% થી વધુ ન હોઈ શકે',
      duration: 'સમયગાળો ઓછામાં ઓછો ૦.૫ મહિના હોવો જોઈએ',
    });
  });
});
