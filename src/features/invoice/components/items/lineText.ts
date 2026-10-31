/**
 * The read-only texts of a dispatch line, shared by the sideways table (LineRow.tsx, and the widths in
 * itemsLayout.ts, which are sized to these same texts) and the line card (LineCard.tsx): date, duration,
 * days and quantity (both write the date as 01/06/26). Pure; the numbers are in the language's digits.
 */
import { nb } from '@/components/common/DetailTable';
import { t as tr } from '@/i18n';
import { formatCount, formatDate, formatNumber, formatSpokenDate } from '@/utils/formatters';
import type { InvoiceItemData } from '@/types/invoice.types';

/** The dispatch date as the app writes dates ("09/10/26"), from the stored date. */
export const dateText = (date: string): string => formatDate(date);

/** The same date in words for a screen reader: "9 Oct 2026". */
export const spokenDateText = (date: string): string => formatSpokenDate(date);

/** "1.6 months", or "One-time" for a one-time GRN, from the stored duration in months. */
export const durationText = (duration: number, oneTime: boolean): string =>
  oneTime ? tr('invoice.items.oneTime') : formatCount(Math.round(duration * 10) / 10, 'month');

/** The months column of the sideways table: the number alone ("1", "1.6", same rounding as `durationText`), or "One-time"; the heading says "Months". */
export const monthsText = (duration: number, oneTime: boolean): string =>
  oneTime ? tr('invoice.items.oneTime') : formatNumber(Math.round(duration * 10) / 10);

/** A day or quantity count ("48", "120") in the language's digits. */
export const countText = (value: number): string => formatNumber(value);

/** The date column of the sideways table: "01/06/26", the same as `dateText`. */
export const tableDateText = (date: string): string => formatDate(date);

export const lineDate = (item: InvoiceItemData): string => dateText(item.dispatch_date);
export const lineTableDate = (item: InvoiceItemData): string => tableDateText(item.dispatch_date);
export const lineDuration = (item: InvoiceItemData, oneTime: boolean): string => durationText(item.duration, oneTime);
export const lineMonths = (item: InvoiceItemData, oneTime: boolean): string => monthsText(item.duration, oneTime);
export const lineDays = (item: InvoiceItemData): string => countText(item.no_of_days);
export const lineQty = (item: InvoiceItemData): string => countText(item.qty);

/** "09/10/26 · 1.6 months · 48 days", or "9 Oct · One-time". */
export const lineMeta = (item: InvoiceItemData, oneTime: boolean): string => {
  const date = lineDate(item);
  if (oneTime) return nb(`${date} · ${tr('invoice.items.oneTime')}`);
  return nb(`${date} · ${lineDuration(item, false)} · ${formatCount(item.no_of_days, 'day')}`);
};

/** "09/10/26 · 1.6 months · 48 days · Qty 120": the read-only second line of a line card. */
export const lineSubline = (item: InvoiceItemData, oneTime: boolean): string =>
  nb(`${lineMeta(item, oneTime)} · ${tr('invoice.items.qtyOf', { qty: lineQty(item) })}`);
