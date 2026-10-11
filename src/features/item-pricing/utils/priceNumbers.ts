import { normalizeDigits } from '@/i18n';

/**
 * The number in a price-form field, or null when the text is not a plain
 * non-negative number with at most `maxDecimals` decimals. `parseFloat` is not
 * used to decide: it reads "1,250" as 1 and gives NaN for "--5", and NaN is
 * neither below zero nor above a maximum, so both used to pass the checks.
 */
export function priceNumber(text: string | null | undefined, maxDecimals: number = 2): number | null {
  const cleaned = normalizeDigits(text ?? '').trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`).test(cleaned)) return null;
  return Number(cleaned);
}
