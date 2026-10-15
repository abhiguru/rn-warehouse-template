import { normalizeDigits } from '@/i18n';

/**
 * Indian mobile numbers are written 5 + 5 ("98765 43210"). Used by the sign-in
 * phone field and the customer form while the person types; the stored value
 * stays the ten digits.
 */
export const groupMobileDigits = (phone: string): string => {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length <= 10) {
    return digitsOnly.length > 5 ? `${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}` : digitsOnly;
  }
  return phone;
};

/**
 * What the sign-in field keeps of typed or pasted text: at most ten digits. ૦-૯ typed on a
 * Gujarati keyboard count as 0-9, and a pasted "+91 98765 43210" loses its country code.
 */
export const limitMobileDigits = (text: string): string => {
  const digits = normalizeDigits(text).replace(/\D/g, '');
  return (digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits).slice(0, 10);
};
