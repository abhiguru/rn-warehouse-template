import { basicInfoSchema, detailsSchema, formatMobile } from '../customerValidation';
import { nationalMobileDigits } from '@/utils/formatters';
import { validatePhone } from '@/utils/inputValidation';

const mobileIsValid = (mobile: string) =>
  basicInfoSchema.validateAt('mobile', { mobile }).then(() => true, () => false);
const contactMobileIsValid = (contact_mobile: string) =>
  detailsSchema.validateAt('contact_mobile', { contact_mobile }).then(() => true, () => false);

describe('mobile numbers that begin with 91', () => {
  // 91987 65432 is a complete 10-digit number, not a country code and 8 digits.
  const NATIONAL = '9198765432';

  it('reads the national number without touching a 10-digit number', () => {
    expect(nationalMobileDigits(NATIONAL)).toBe(NATIONAL);
    expect(nationalMobileDigits('9876543210')).toBe('9876543210');
  });

  it('drops the country code only from a 12-digit number, and a leading 0 from 11 digits', () => {
    expect(nationalMobileDigits('919198765432')).toBe(NATIONAL);
    expect(nationalMobileDigits('+91 98765 43210')).toBe('9876543210');
    expect(nationalMobileDigits('0 98765 43210')).toBe('9876543210');
    expect(nationalMobileDigits('૯૮૭૬૫૪૩૨૧૦')).toBe('9876543210');
  });

  it('leaves a number that is still being typed alone', () => {
    expect(nationalMobileDigits('91')).toBe('91');
    expect(nationalMobileDigits('919876')).toBe('919876');
  });

  it('is accepted as a customer mobile and as a contact mobile', async () => {
    expect(await mobileIsValid(NATIONAL)).toBe(true);
    expect(await contactMobileIsValid(NATIONAL)).toBe(true);
    expect(await mobileIsValid(`91${NATIONAL}`)).toBe(true);
  });

  it('still rejects numbers that are not 10 digits or do not start with 6-9', async () => {
    expect(await mobileIsValid('98765432')).toBe(false);
    expect(await mobileIsValid('5198765432')).toBe(false);
    expect(await mobileIsValid('91987654321')).toBe(false);
    expect(await contactMobileIsValid('91987')).toBe(false);
  });

  it('is sent in the same 12-digit shape as every other number', () => {
    expect(formatMobile(NATIONAL)).toBe(`91${NATIONAL}`);
    expect(formatMobile('9876543210')).toBe('919876543210');
    expect(formatMobile('919876543210')).toBe('919876543210');
  });

  it('passes the general phone check', () => {
    expect(validatePhone(NATIONAL)).toBe(NATIONAL);
    expect(validatePhone('919876543210')).toBe('9876543210');
  });
});
