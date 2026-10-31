/**
 * Texts for rates, in the app's language. Call while rendering (docs/I18N.md rule 2).
 * Days are 'YYYY-MM-DD' strings; calendar maths never goes through UTC.
 */
import { localizeDigits, t } from '@/i18n';
import { formatCurrency, formatDate, formatSpokenDate, parseLocalISODate, toLocalISODate, todayInIST } from '@/utils/formatters';
import type { PriceType } from '@/types/item-pricing.types';
import { weightBandLabel } from './utils/priceLabels';
import { packageUnit } from '@/utils/packagingWord';

/** "₹11.00" */
export const money = (amount: number): string => formatCurrency(amount, { minimumFractionDigits: 2 });

/** "per bag, per month" / "per bag, once"; "per box" ... for a Box item (Bag, Box and Crate by the item's packaging) */
export const unitText = (priceType: PriceType, packaging?: string | null): string =>
  t(priceType === 'one_time' ? 'pricing.unit.oneTime' : 'pricing.unit.monthly', { unit: packageUnit(packaging) });

/** "₹2.00 per bag, charged once at dispatch": the labour of one bag, box or crate (the item's packaging; "bag" when unknown). */
export const labourText = (amount: string, packaging?: string | null): string =>
  t('pricing.item.labourValue', { amount, unit: packageUnit(packaging) });

/** "0–40 kg" */
export const bandText = (min: number, max: number): string => weightBandLabel(min, max);

/** A day with its year, in the digits of the language. */
export const dateText = (isoDay: string): string => formatDate(isoDay);

/** The same day in words for a screen reader: "9 Oct 2026". */
export const spokenDateText = (isoDay: string): string => formatSpokenDate(isoDay);

/** "01/01/25 – 31/03/26"; with no end day, only the start day (the caller words "Since …"). */
export const rangeText = (fromDay: string, toDay?: string | null): string =>
  toDay ? `${dateText(fromDay)} – ${dateText(toDay)}` : dateText(fromDay);

/** Calendar maths on a day string, in local time. */
export const addDays = (isoDay: string, days: number): string => {
  const d = parseLocalISODate(isoDay);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
};

/** Today as the facility keeps its books: the calendar day in India, whatever zone the phone is set to. */
export const todayDay = (now: Date = new Date()): string => toLocalISODate(todayInIST(now));

/** "₹6.00–₹9.50", or one amount when the bands cost the same. */
export const rentRange = (min: number, max: number): string => (min === max ? money(min) : `${money(min)}–${money(max)}`);

/** "5" for one tax rate, "0–5" for bands that differ (digits in the language; the caller adds the % sign). */
export const percentRange = (min: number, max: number): string =>
  min === max ? localizeDigits(String(min)) : `${localizeDigits(String(min))}–${localizeDigits(String(max))}`;
