import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import { amountText, parseDiscountInput, parseRateInput } from '../amountInput';

const money = (amount: number) => `₹${amount}`;

afterEach(() => setLanguage('en'));

describe('a line rate as typed', () => {
  it('reads whole numbers and decimals', () => {
    expect(parseRateInput('charge', '5')).toEqual({ text: '5', value: 5, error: null });
    expect(parseRateInput('charge', '5.5')).toEqual({ text: '5.5', value: 5.5, error: null });
    expect(parseRateInput('tax', '2.5')).toEqual({ text: '2.5', value: 2.5, error: null });
    expect(parseRateInput('labour_rate', '.75')).toEqual({ text: '.75', value: 0.75, error: null });
  });

  it('keeps a number that is still being typed', () => {
    expect(parseRateInput('charge', '5.')).toEqual({ text: '5.', value: 5, error: null });
    expect(parseRateInput('charge', '.')).toEqual({ text: '.', value: null, error: null });
    expect(parseRateInput('charge', '0')).toEqual({ text: '0', value: 0, error: null });
    expect(parseRateInput('charge', '0.5').value).toBe(0.5);
  });

  it('reads an empty field as no figure, not as zero: a 0 must be typed', () => {
    expect(parseRateInput('labour_rate', '')).toEqual({ text: '', value: null, error: null });
    expect(parseRateInput('charge', '  ')).toEqual({ text: '', value: null, error: null });
  });

  it('reads digits typed in Gujarati', () => {
    expect(parseRateInput('charge', '૫.૫૦')).toEqual({ text: '5.50', value: 5.5, error: null });
  });

  it.each(['1,500', 'Rs 5', '5..5', '5.555', '1e3', '--5', '5 5'])('does not read "%s" as a number', (typed) => {
    const parsed = parseRateInput('charge', typed);

    expect(parsed.value).toBeNull();
    expect(parsed.error).toBe(t('invoice.validation.rateNotNumber'));
  });

  it('refuses a negative rate', () => {
    expect(parseRateInput('charge', '-5')).toMatchObject({ value: null, error: t('invoice.validation.chargeRange') });
    expect(parseRateInput('labour_rate', '-0.5')).toMatchObject({ value: null, error: t('invoice.validation.labourRateRange') });
    expect(parseRateInput('tax', '-1')).toMatchObject({ value: null, error: t('invoice.validation.taxRange') });
  });

  it('holds each field to the range the server accepts', () => {
    // A line's charge is held to 9999.99 on entry (owner, 2026-10-19); the server takes up to 999999, and Next and Save keep that range.
    expect(parseRateInput('charge', '9999.99').value).toBe(9999.99);
    expect(parseRateInput('charge', '10000')).toMatchObject({ value: null, error: t('invoice.validation.chargeRange') });
    expect(parseRateInput('charge', '9999.995')).toMatchObject({ value: null });
    expect(parseRateInput('labour_rate', '999999').value).toBe(999999);
    expect(parseRateInput('labour_rate', '1000000')).toMatchObject({ value: null, error: t('invoice.validation.labourRateRange') });
    expect(parseRateInput('tax', '100').value).toBe(100);
    expect(parseRateInput('tax', '100.5')).toMatchObject({ value: null, error: t('invoice.validation.taxRange') });
  });

  it('has its messages in Gujarati', () => {
    setLanguage('gu');
    for (const message of [
      parseRateInput('charge', '-5').error,
      parseRateInput('labour_rate', '1000000').error,
      parseRateInput('tax', '101').error,
      parseRateInput('charge', '1,500').error,
    ]) {
      expect(message).toMatch(/[઀-૿]/);
    }
  });
});

describe('the discount as typed', () => {
  it('reads a discount, a surcharge and an empty field', () => {
    expect(parseDiscountInput('250.50', 998, money)).toEqual({ text: '250.50', value: 250.5, error: null });
    expect(parseDiscountInput('-40', 998, money)).toEqual({ text: '-40', value: -40, error: null });
    expect(parseDiscountInput('', 998, money)).toEqual({ text: '', value: 0, error: null });
    expect(parseDiscountInput('૨૫૦', 998, money).value).toBe(250);
  });

  it.each(['-', '.', '-.'])('waits while "%s" is being typed', (typed) => {
    expect(parseDiscountInput(typed, 998, money)).toEqual({ text: typed, value: null, error: null });
  });

  it('does not read a thousands separator as the end of the number', () => {
    expect(parseDiscountInput('1,500', 5000, money)).toMatchObject({ value: null, error: t('invoice.summary.discountNotNumber') });
  });

  it('refuses a discount above the amount before discount', () => {
    expect(parseDiscountInput('5000', 998, money)).toMatchObject({
      value: null,
      error: t('invoice.summary.discountTooLarge', { amount: '₹998' }),
    });
    // The whole amount would take the total to exactly 0, which a discount may not do.
    expect(parseDiscountInput('998', 998, money)).toMatchObject({ value: null, error: t('invoice.summary.discountTotalZero') });
    expect(parseDiscountInput('997.99', 998, money).value).toBe(997.99);
  });
});

describe('the text a field starts with', () => {
  it('is empty for zero and the plain number otherwise', () => {
    expect(amountText(0)).toBe('');
    expect(amountText(5.5)).toBe('5.5');
    expect(amountText(-40)).toBe('-40');
    expect(amountText(undefined)).toBe('');
  });
});

describe('a discount that would take the total to 0', () => {
  const describeMax = (amount: number) => `₹${amount}`;

  it('is refused under Discount with the sentence of the rule, at the amount before discount', () => {
    expect(parseDiscountInput('184', 184, describeMax)).toEqual({
      text: '184', value: null, error: "A discount can't take the total to ₹0. To charge nothing, set the charge to 0 and give a reason.",
    });
    expect(parseDiscountInput('184.00', 184, describeMax).error).toBe(t('invoice.summary.discountTotalZero'));
  });

  it('allows a discount that leaves something to pay, and still says "more than" above the amount', () => {
    expect(parseDiscountInput('183.99', 184, describeMax)).toMatchObject({ value: 183.99, error: null });
    expect(parseDiscountInput('184.01', 184, describeMax).error).toBe(t('invoice.summary.discountTooLarge', { amount: '₹184' }));
  });

  it('does not refuse a discount of 0 on an invoice of 0', () => {
    expect(parseDiscountInput('0', 0, describeMax)).toMatchObject({ value: 0, error: null });
  });

  it('is worded in Gujarati with the digit ૦', () => {
    setLanguage('gu');
    expect(parseDiscountInput('184', 184, describeMax).error).toContain('₹૦');
  });
});
