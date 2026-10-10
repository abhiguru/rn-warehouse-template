/**
 * Texts built from a storage price's numbers, in the app's language.
 * Call while rendering (docs/I18N.md rule 2).
 */
import { localizeDigits, t } from '@/i18n';

/** "0–50 kg". The numbers are shown as stored (no grouping), in the digits of the language. */
export const weightBandLabel = (min: number, max: number): string =>
  t('pricing.weightBand', { min: localizeDigits(String(min)), max: localizeDigits(String(max)) });

/** "One-time" or "Monthly" for the stored price type. */
export const priceTypeLabel = (priceType: 'one_time' | 'monthly'): string =>
  priceType === 'one_time' ? t('pricing.type.one_time') : t('pricing.type.monthly');
