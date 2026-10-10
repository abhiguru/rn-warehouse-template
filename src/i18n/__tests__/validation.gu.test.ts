import * as yup from 'yup';
import { setLanguage, t } from '..';
import {
  createStepValidator,
  imageUrlArrayField,
  itemsArrayField,
  quantityField,
  requiredStringField,
} from '@/utils/validationHelpers';
import { ValidationError, validatePhone, validatePositiveDecimal, validatePositiveInt, validateSafeText } from '@/utils/inputValidation';

afterEach(() => setLanguage('en'));

const messageOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a validation error');
};

describe('validation in Gujarati', () => {
  it('writes a limit in Gujarati digits and keeps the field name given', () => {
    expect(t('validation.field.maxChars', { field: 'નોંધ', max: '૨૮૦' }, 'gu')).toBe('નોંધ વધુમાં વધુ ૨૮૦ અક્ષરનું હોવું જોઈએ');
    expect(t('validation.field.required', { field: 'વેપારી' }, 'gu')).toBe('વેપારી જરૂરી છે');
  });

  it('counts items without changing the noun', () => {
    expect(t('validation.field.minItems', { count: 1 }, 'gu')).toBe('ઓછામાં ઓછી એક આઇટમ જરૂરી છે');
    expect(t('validation.field.minItems', { count: 3 }, 'gu')).toBe('ઓછામાં ઓછી ૩ આઇટમ જરૂરી છે');
    expect(t('validation.field.minItems', { count: 1 })).toBe('At least one item is required');
    expect(t('validation.field.minItems', { count: 3 })).toBe('At least 3 items are required');
    expect(t('validation.field.maxImages', { count: 10 }, 'gu')).toBe('વધુમાં વધુ ૧૦ ફોટો ઉમેરી શકાય');
  });

  it('tells the person to use English letters and digits where only those are accepted', () => {
    setLanguage('gu');
    expect(messageOf(() => validateSafeText('માલ', 'વાહન નંબર'))).toBe(
      'વાહન નંબર માં ન ચાલે તેવા અક્ષરો છે. અંગ્રેજી અક્ષરો અને આંકડા વાપરો; ખાલી જગ્યા અને સાદાં વિરામચિહ્નો ચાલશે.'
    );
  });
});

describe('shared yup helpers', () => {
  // Built once, in English, as the schema files do when they are loaded.
  const schema = yup.object({
    note: requiredStringField(() => t('common.notes'), 5),
    qty: quantityField(undefined, 2),
    photos: imageUrlArrayField(1),
    items: itemsArrayField(yup.object({ id: yup.string() }), 2),
  });
  const validate = createStepValidator(schema);

  it('keeps the English messages as they were', async () => {
    const result = await validate({ note: 'too long a note', qty: 1, photos: ['https://a.test/1', 'https://a.test/2'], items: [{}] });
    expect(result.errors).toEqual({
      note: 'Notes must be at most 5 characters',
      qty: 'Quantity must be at least 2',
      photos: 'Maximum 1 images allowed',
      items: 'At least 2 items are required',
    });
    expect((await validate({ qty: 3, items: [{}, {}] })).errors).toEqual({ note: 'Notes is required' });
  });

  it('follows a language chosen after the schema was built', async () => {
    setLanguage('gu');
    const result = await validate({ note: 'too long a note', qty: 1, photos: [], items: [{}] });
    expect(result.errors).toEqual({
      note: 'નોંધ વધુમાં વધુ ૫ અક્ષરનું હોવું જોઈએ',
      qty: 'જથ્થો ઓછામાં ઓછું ૨ હોવું જોઈએ',
      items: 'ઓછામાં ઓછી ૨ આઇટમ જરૂરી છે',
    });
  });

  it('does not group a limit: 1000 stays 1000 in English and becomes ૧૦૦૦ in Gujarati', () => {
    expect(messageOf(() => validatePositiveInt(5000, 'Limit', { max: 1000 }))).toBe('Limit must be at most 1000');
    setLanguage('gu');
    expect(messageOf(() => validatePositiveInt(5000, 'મર્યાદા', { max: 1000 }))).toBe('મર્યાદા વધુમાં વધુ ૧૦૦૦ હોવું જોઈએ');
  });
});

describe('typed numbers', () => {
  it('reads ૦-૯ the same as 0-9', () => {
    expect(validatePositiveInt('૧૨')).toBe(12);
    expect(validatePositiveDecimal('૧૨.૫')).toBe(12.5);
    expect(validatePhone('૯૮૭૬૫૪૩૨૧૦')).toBe('9876543210');
    expect(() => validatePositiveInt('abc')).toThrow(ValidationError);
  });
});
