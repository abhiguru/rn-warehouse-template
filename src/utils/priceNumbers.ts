import { normalizeDigits } from '@/i18n';

/**
 * The number in a price-form field, or null when the text is not a plain
 * non-negative number with at most `maxDecimals` decimals. `parseFloat` is not
 * used to decide: it reads "1,250" as 1 and gives NaN for "--5", and NaN is
 * neither below zero nor above a maximum, so both used to pass the checks.
 */
export function priceNumber(text: string | null | undefined, maxDecimals: number = 2): number | null {
  const cleaned = normalizeDigits(text ?? '').trim();
  const decimals = maxDecimals > 0 ? `(\\.\\d{1,${maxDecimals}})?` : '';
  const lead = maxDecimals > 0 ? `|\\.\\d{1,${maxDecimals}}` : '';
  if (!new RegExp(`^(\\d+${decimals}${lead})$`).test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * The most a rent may be wherever one is typed (owner, 2026-10-20): the same as the invoice line Charge. The server
 * accepts up to 999999; the app holds to this lower limit.
 */
export const RENT_MAX = 9999.99;

/** The rent in a price-form field, or null when it is not a number with at most 2 decimals from 0 to RENT_MAX. */
export function rentNumber(text: string | null | undefined): number | null {
  const n = priceNumber(text, 2);
  return n !== null && n <= RENT_MAX ? n : null;
}

/** The most a labour rate may be (the server's limit and the invoice's). */
export const LABOUR_MAX = 999999;

/** The labour rate in a price-form field, or null when it is not a number with at most 2 decimals from 0 to LABOUR_MAX. */
export function labourNumber(text: string | null | undefined): number | null {
  const n = priceNumber(text, 2);
  return n !== null && n <= LABOUR_MAX ? n : null;
}

/**
 * What a rent field holds after a key press: the typed text when it is still on its way to a rent (digits and one
 * point, at most 2 decimals, not above RENT_MAX), else the text it held before, so the extra digit is not taken.
 * ૦-૯ are read as 0-9 for the check; the text is kept as typed.
 */
export function acceptRentText(previous: string, typed: string): string {
  const plain = normalizeDigits(typed).trim();
  if (plain === '') return typed;
  if (!/^\d*\.?\d{0,2}$/.test(plain)) return previous;
  const n = plain === '.' ? 0 : Number(plain);
  // A stored rent above the limit may still be shortened: text that is not above the old number is taken.
  const before = priceNumber(previous, 2);
  if (n > RENT_MAX && !(before !== null && n <= before)) return previous;
  return typed;
}
