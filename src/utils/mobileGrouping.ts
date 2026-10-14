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
