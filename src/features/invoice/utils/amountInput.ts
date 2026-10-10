/**
 * Reading what is typed into the invoice's number fields: the line rates
 * (charge, labour rate, tax) and the discount.
 *
 * A field keeps the typed text while it is being edited, so "5." is not turned
 * back into "5" between two key presses. The number is only taken from text
 * that is a complete number and inside the range the server accepts; anything
 * else is reported and never stored, so "1,500" is not read as 1.
 */
import { normalizeDigits, t } from '@/i18n';

export type RateField = 'charge' | 'labour_rate' | 'tax';

/** The largest value the server accepts for a line (backend migration 41). The smallest is 0. */
export const RATE_MAX: Record<RateField, number> = {
  charge: 999999,
  labour_rate: 999999,
  tax: 100,
};

export interface ParsedAmount {
  /** The text with ૦-૯ read as 0-9. */
  text: string;
  /** The number to store, or null when the text is not one (unfinished or wrong). */
  value: number | null;
  /** What to tell the person, or null when the text is fine or only unfinished. */
  error: string | null;
}

// Up to two decimals: the server stores rates and money as NUMERIC(12,2).
const UNSIGNED = /^(\d+\.?\d{0,2}|\.\d{1,2})$/;
const SIGNED = /^-?(\d+\.?\d{0,2}|\.\d{1,2})$/;
/** Text that can still become a number: a lone minus, a lone dot. */
const UNFINISHED = /^-?\.?$/;

const rangeMessage = (field: RateField): string =>
  field === 'charge'
    ? t('invoice.validation.chargeRange')
    : field === 'labour_rate'
      ? t('invoice.validation.labourRateRange')
      : t('invoice.validation.taxRange');

/** A line rate as typed. An empty field is 0, which the server allows. */
export function parseRateInput(field: RateField, typed: string): ParsedAmount {
  const text = normalizeDigits(typed).trim();
  if (text === '') return { text, value: 0, error: null };
  if (text === '.') return { text, value: null, error: null };
  // A minus sign followed by a number (or nothing yet): the number is below the range.
  if (/^-(\d+\.?\d*|\.\d*)?$/.test(text)) return { text, value: null, error: rangeMessage(field) };
  if (!UNSIGNED.test(text)) return { text, value: null, error: t('invoice.validation.rateNotNumber') };
  const value = Number(text);
  if (value > RATE_MAX[field]) return { text, value: null, error: rangeMessage(field) };
  return { text, value, error: null };
}

/**
 * The discount as typed. A negative discount is a surcharge and is allowed;
 * a discount above `maxDiscount` (the amount before the discount) is not.
 */
export function parseDiscountInput(typed: string, maxDiscount: number, describeMax: (amount: number) => string): ParsedAmount {
  const text = normalizeDigits(typed).trim();
  if (text === '') return { text, value: 0, error: null };
  if (UNFINISHED.test(text)) return { text, value: null, error: null };
  if (!SIGNED.test(text)) return { text, value: null, error: t('invoice.summary.discountNotNumber') };
  const value = Number(text);
  if (value > maxDiscount) {
    return { text, value: null, error: t('invoice.summary.discountTooLarge', { amount: describeMax(maxDiscount) }) };
  }
  return { text, value, error: null };
}

/** The text a number field starts with: empty for 0, as the placeholder shows the zero. */
export const amountText = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) && value !== 0 ? String(value) : '';
