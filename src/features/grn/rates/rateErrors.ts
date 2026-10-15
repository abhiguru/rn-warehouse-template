/**
 * The refusals of save_grn / update_grn about the rates (backend migration 86) and the app's words for them.
 * A refusal rolls the whole save back: the GRN is not saved, and the Review step reads the rates again.
 */
import { t } from '@/i18n';
import { formatDate } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';

/** The codes that mean "the rates are not right"; the Review step reads them again and says so. */
export const RATE_REFUSAL_CODES = [
  'RATE_MISSING',
  'RATE_PLANNED',
  'BANDS_OVERLAP',
  'GRN_INVOICED',
  'RATE_NOT_FOR_GRN',
  'INVALID_BANDS',
  'INVALID_BAND',
  'INVALID_AMOUNT',
  'INVALID_SCOPE',
  'INVALID_DATE',
] as const;

export type RateRefusalCode = (typeof RATE_REFUSAL_CODES)[number];

export const isRateRefusalCode = (code: unknown): code is RateRefusalCode =>
  typeof code === 'string' && (RATE_REFUSAL_CODES as readonly string[]).includes(code);

/** A rate refusal as thrown out of the service call. `data` is the server's `data` block. */
export class RateRefusal extends Error {
  constructor(public code: RateRefusalCode, message: string, public data?: unknown) {
    super(message);
    this.name = 'RateRefusal';
  }
}

/** The facility's server has no `p_rates` yet (migration 86 missing). */
export const serverNeedsUpdateForRates = (): Error => new Error(t('grn.review.ratesServerNeedsUpdate'));

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/**
 * The text to show for a refusal, in the app's words where the code says enough, else the server's text.
 * `serverMessage` is what the call carried (already passed through serverText).
 */
export function rateRefusalText(code: string, data: unknown, serverMessage: string): string {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  switch (code) {
    case 'RATE_MISSING': {
      const lines = Array.isArray(d.lines) ? d.lines.length : 0;
      return lines > 0 ? t('grn.review.rateErr.missing', { count: lines }) : t('grn.review.rateErr.missingSome');
    }
    case 'RATE_PLANNED':
      return isDay(d.starts_on) ? t('grn.review.rateErr.planned', { date: formatDate(d.starts_on.slice(0, 10), 'medium') }) : t('grn.review.rateErr.plannedSome');
    case 'BANDS_OVERLAP':
      return t('grn.review.rateErr.overlap');
    case 'GRN_INVOICED':
      return t('grn.review.rateErr.invoiced');
    case 'RATE_NOT_FOR_GRN':
      return t('grn.review.rateErr.notForGrn');
    default:
      return serverText(serverMessage, t('grn.review.rateErr.generic'));
  }
}
