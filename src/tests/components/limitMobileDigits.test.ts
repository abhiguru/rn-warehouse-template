import { limitMobileDigits } from '@/utils/mobileGrouping';

describe('limitMobileDigits', () => {
  it('keeps ten digits and drops the rest as they are typed', () => {
    expect(limitMobileDigits('9876543210')).toBe('9876543210');
    expect(limitMobileDigits('98765432101')).toBe('9876543210');
    expect(limitMobileDigits('98765 432109')).toBe('9876543210');
  });

  it('keeps a ten digit number that begins with 91', () => {
    expect(limitMobileDigits('9187654321')).toBe('9187654321');
    expect(limitMobileDigits('91876543210')).toBe('9187654321');
  });

  it('removes the country code of a pasted number', () => {
    expect(limitMobileDigits('+91 98765 43210')).toBe('9876543210');
    expect(limitMobileDigits('919876543210')).toBe('9876543210');
  });

  it('reads Gujarati digits and ignores letters and spaces', () => {
    expect(limitMobileDigits('૯૮૭૬૫ ૪૩૨૧૦')).toBe('9876543210');
    expect(limitMobileDigits('98a76 5')).toBe('98765');
    expect(limitMobileDigits('')).toBe('');
  });
});
