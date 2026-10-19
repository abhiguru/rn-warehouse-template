/**
 * Shared formatting utilities for consistent display across the app
 */

import { getLanguage, localizeDigits, normalizeDigits } from '@/i18n/language';
import { commonWords } from '@/i18n/locales/common';

/** The calendar and unit words of the app's language. */
const words = () => commonWords(getLanguage());

/**
 * A number with Indian grouping, in the digits of the app's language. Every
 * number the app formats goes through here; identifiers do not (see
 * `formatIdentifier` in `@/i18n/language`).
 */
const indianFormats = new Map<string, Intl.NumberFormat>();

const indianNumber = (value: number, options?: Intl.NumberFormatOptions): string => {
  // Building an Intl formatter is slow on Hermes, so one is kept for each set of options.
  const key = options ? JSON.stringify(options) : '';
  let format = indianFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-IN', options);
    indianFormats.set(key, format);
  }
  return localizeDigits(format.format(value));
};

/**
 * Format a number as Indian Rupee currency
 * Uses Intl.NumberFormat for proper localization
 *
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string (e.g., "₹1,23,456.78")
 */
export const formatCurrency = (
  amount: number | null | undefined,
  options?: {
    showSymbol?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string => {
  const {
    showSymbol = true,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options || {};

  if (amount === null || amount === undefined || isNaN(amount)) {
    return localizeDigits(showSymbol ? '₹0' : '0');
  }

  const formatted = indianNumber(amount, { minimumFractionDigits, maximumFractionDigits });

  return showSymbol ? `₹${formatted}` : formatted;
};

/**
 * Format a number with Indian number system grouping (lakhs, crores)
 *
 * @param num - The number to format
 * @param decimals - Optional number of decimal places to show
 * @returns Formatted number string (e.g., "1,23,456" or "8.5")
 */
export const formatNumber = (
  num: number | null | undefined,
  decimals?: number
): string => {
  if (num === null || num === undefined || isNaN(num)) {
    return localizeDigits(decimals !== undefined ? '0'.padEnd(2 + decimals, '0').replace('00', '0.') : '0');
  }
  return indianNumber(num, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/**
 * Format a weight with Indian grouping and up to two decimals, no trailing
 * zeros (style guide §12.3), e.g. "1,250.5 kg".
 *
 * @param weight - Weight in kg
 * @param decimals - Maximum number of decimal places (default 2)
 */
export const formatWeight = (
  weight: number | null | undefined,
  decimals: number = 2
): string => {
  if (weight === null || weight === undefined || isNaN(weight)) {
    return `${localizeDigits('0')} ${words().kg}`;
  }
  return `${indianNumber(weight, { maximumFractionDigits: decimals })} ${words().kg}`;
};

/**
 * The weight of one bag, box or crate, which is the only weight a lot stores,
 * worded so it cannot be read as a total (style guide §12.3): "50 kg each".
 * Null when there is no weight to show: the caller then shows no weight at all.
 * That is a weight that is missing, not a finite number, or zero or less once
 * it is rounded to `decimals`, which is how it would be written: 0.004 is no
 * weight ("0 kg each" says nothing), 0.5 is "0.5 kg each".
 *
 * @param weight - Weight of one package in kg
 * @param decimals - Maximum number of decimal places (default 2)
 */
export const formatWeightEach = (
  weight: number | null | undefined,
  decimals: number = 2
): string | null => {
  if (weight === null || weight === undefined) return null;
  // A weight that reaches here as text ("50" in a server answer) is read as its number, as it always was.
  const kg = Number(weight);
  if (!Number.isFinite(kg) || Number(kg.toFixed(decimals)) <= 0) return null;
  return words().each.replace('{w}', formatWeight(kg, decimals));
};

/**
 * Format quantity with optional unit
 *
 * @param qty - The quantity
 * @param unit - Optional unit label
 * @returns Formatted quantity string
 */
export const formatQuantity = (
  qty: number | null | undefined,
  unit?: string
): string => {
  if (qty === null || qty === undefined || isNaN(qty)) {
    return unit ? `${localizeDigits('0')} ${unit}` : localizeDigits('0');
  }
  const formatted = indianNumber(qty);
  return unit ? `${formatted} ${unit}` : formatted;
};

/**
 * A count with its noun, singular when 1 (§12.3): "1 item", "12 items",
 * "1 bag", "1,200 bags". Pass the plural when it is not noun + "s".
 */
export const formatCount = (
  count: number | null | undefined,
  singular: string,
  plural: string = `${singular}s`
): string => {
  const n = count === null || count === undefined || isNaN(count) ? 0 : count;
  // Another language names the noun by its English singular; an unknown noun stays English.
  const translated = words().nouns[singular];
  const noun = translated ? translated[n === 1 ? 0 : 1] : n === 1 ? singular : plural;
  return `${indianNumber(n)} ${noun}`;
};

/** Parse a date-only string in local time, a timestamp, or a Date; null when invalid. */
export const toDate = (date: string | Date | null | undefined): Date | null => {
  if (!date) return null;
  let d: Date;
  if (typeof date === 'string') {
    d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseLocalISODate(date) : new Date(date);
  } else {
    d = date;
  }
  return isNaN(d.getTime()) ? null : d;
};

type DateFormat = 'short' | 'medium' | 'long' | 'compact';

/** The numbers of a calendar day. The month counts from 0, as a Date's does. */
interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** A calendar day as `formatDate` writes it. `thisYear` is the year that `short` leaves out. */
const writeDate = ({ year, month, day }: CalendarDay, format: DateFormat, thisYear: number): string => {
  const dayText = localizeDigits(String(day));
  const yearText = localizeDigits(String(year));
  if (format === 'long') return `${dayText} ${words().monthsLong[month]} ${yearText}`;
  const monthText = words().monthsShort[month];
  if ((format === 'short' || format === 'compact') && year === thisYear) return `${dayText} ${monthText}`;
  return `${dayText} ${monthText} ${yearText}`;
};

/**
 * Format a date for display (style guide §12.3). Month names are spelled out
 * here rather than taken from the device locale, so every phone shows the same
 * text (some engines print "Sept" for en-IN).
 *
 * - `medium` (default): "9 Oct 2026"
 * - `short`: "9 Oct" in the current year, otherwise "9 Oct 2026" (list rows)
 * - `long`: "9 October 2026"
 * - `compact`: same as `short`; kept for older callers
 *
 * The current year is India's: the facility's year turns over at midnight
 * there, whatever the clock zone of the phone. The day itself is read as
 * before: a plain day as it is written, an instant in the phone's zone. A
 * report prints an instant with `formatIndiaDate` instead.
 *
 * Returns "—" when the date is missing or invalid.
 */
export const formatDate = (
  date: string | Date | null | undefined,
  format: DateFormat = 'medium'
): string => {
  const d = toDate(date);
  if (!d) return '—';
  return writeDate({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }, format, indiaYear());
};

/**
 * A date as day/month/year with two digits each, "01/06/23", in the language's digits. For the invoice items table only
 * (owner, 2026-10-19), where a column of dates must line up and a month name would not; the app's other dates stay
 * `formatDate`. Returns "—" when the date is missing or invalid.
 */
export const formatDateShort = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '—';
  const two = (n: number) => String(n).padStart(2, '0');
  return localizeDigits(`${two(d.getDate())}/${two(d.getMonth() + 1)}/${two(d.getFullYear() % 100)}`);
};

/** Month titles (§12.3): "October 2026" (long, timelines), "Oct 2026" (short, report rows), "Oct" (narrow, chart axes). */
export const formatMonth = (
  date: string | Date | null | undefined,
  format: 'short' | 'long' | 'narrow' = 'long'
): string => {
  const d = toDate(date);
  if (!d) return '—';
  // Chart axes: the month alone, "Oct".
  if (format === 'narrow') return words().monthsShort[d.getMonth()];
  const names = format === 'long' ? words().monthsLong : words().monthsShort;
  return `${names[d.getMonth()]} ${localizeDigits(String(d.getFullYear()))}`;
};

/** "4:05 pm" (§12.3). */
export const formatTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '—';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${localizeDigits(`${h % 12 === 0 ? 12 : h % 12}:${m}`)} ${h < 12 ? words().am : words().pm}`;
};

/** "9 Oct 2026, 4:05 pm" (§12.3). */
export const formatDateTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
};

/**
 * A financial year for display: "2026-27" or the backend's "2027-2028", in the
 * language's digits (a period, not an identifier). Values sent to the backend
 * stay as they are: never send the result of this.
 */
export const formatFinancialYear = (year: string | number | null | undefined): string =>
  year === null || year === undefined ? '' : localizeDigits(String(year));

/**
 * The 10-digit national number in a typed or stored mobile number. The country
 * code is dropped only from a 12-digit number and a trunk 0 only from an
 * 11-digit one: "9198765432" is a complete number that happens to begin with
 * 91. Anything else is returned as its digits. Digits typed as ૦-૯ count.
 */
export const nationalMobileDigits = (mobile: string | null | undefined): string => {
  const digits = normalizeDigits(mobile ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
};

/**
 * Mobile number with the +91 prefix and 5 + 5 grouping (§12.3):
 * "9876543210" or "+919876543210" -> "+91 98765 43210". Other lengths are
 * returned trimmed and unchanged.
 */
export const formatMobile = (mobile: string | null | undefined): string => {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (national.length !== 10) return mobile.trim();
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
};

/** One decimal, true minus sign, no space (§12.3): "−18.5°C". */
export const formatTemperature = (celsius: number | null | undefined): string => {
  if (celsius === null || celsius === undefined || isNaN(celsius)) return '—';
  const fixed = Math.abs(celsius).toFixed(1);
  return localizeDigits(`${celsius < 0 && fixed !== '0.0' ? '\u2212' : ''}${fixed}°C`);
};

/**
 * Format a percentage value
 *
 * @param value - The value (0-100 or 0-1 depending on isDecimal)
 * @param isDecimal - Whether the value is a decimal (0-1) or percentage (0-100)
 * @returns Formatted percentage string (e.g., "12.5%")
 */
export const formatPercentage = (
  value: number | null | undefined,
  isDecimal: boolean = false
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return localizeDigits('0%');
  }
  const percentage = isDecimal ? value * 100 : value;
  return localizeDigits(`${percentage.toFixed(1)}%`);
};

/**
 * Convert a Date object to ISO date string (YYYY-MM-DD) in local timezone
 * This avoids timezone offset issues when saving dates
 *
 * @param date - Date object to convert
 * @returns ISO date string in local timezone (e.g., "2025-10-29")
 */
export const toLocalISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * The calendar day of a form's date value, as the server is to be told it.
 *
 * A day is sent as 'YYYY-MM-DD' built from the phone's own calendar. An instant
 * will not do: a date picker gives local midnight, which in India is 18:30 UTC
 * of the day before, and the server takes the day from the text it is sent.
 *
 * @param value - a plain day, a Date, or a timestamp (from a picker or from the server)
 * @returns the local day; text that is not a date is returned unchanged
 */
export const toCalendarDay = (value: string | Date): string => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  return toLocalISODate(date);
};

/** India Standard Time, the zone the facilities keep their books in. It has no summer time. */
export const IST_OFFSET = '+05:30';

/**
 * Today's calendar day in India, as a Date whose local year, month and day are
 * that day. A report's period is counted from it, so the month and the
 * financial year turn over with the facility's books and not with the clock
 * zone of a phone that is abroad.
 */
export const todayInIST = (now: Date = new Date()): Date => {
  const india = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  return new Date(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate());
};

/**
 * The calendar day in India of a value from the server, as "YYYY-MM-DD".
 *
 * A plain "2026-10-12" is already a day and is returned as it is. An instant (an
 * ISO string with a time, such as the "2026-09-30T20:00:00+00:00" of a timestamptz
 * column, or a Date) is moved to India time (+05:30) and its year, month and day
 * taken with the UTC getters, so the result does not depend on the zone of the
 * phone: that instant is 1 Oct, not 30 Sep. Reports group by this day, as the
 * facility's books do. A time written without a zone is read in the phone's zone.
 * Empty or unreadable gives "".
 */
export const indiaDay = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const instant = typeof value === 'string' ? new Date(value) : value;
  const time = instant.getTime();
  if (Number.isNaN(time)) return '';
  const india = new Date(time + (5 * 60 + 30) * 60_000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(india.getUTCFullYear(), 4)}-${pad(india.getUTCMonth() + 1)}-${pad(india.getUTCDate())}`;
};

/** The year it is in India at a moment: the year `formatDate` leaves out of a short date. */
const indiaYear = (now: Date = new Date()): number => Number(indiaDay(now).slice(0, 4));

/**
 * The numbers of a plain day ("2026-10-12"), taken from its text and from UTC
 * arithmetic only, so the zone of the phone has no part in them. A day past the
 * end of its month runs on into the next, as `new Date(year, month, day)` does.
 */
const calendarDay = (day: string): (CalendarDay & { weekday: number }) | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth(), day: utc.getUTCDate(), weekday: utc.getUTCDay() };
};

/**
 * A date of a report, written as `formatDate` writes one and read on India's
 * calendar. A plain day is printed as it is; an instant (the timestamptz of an
 * invoice or a GRN) is printed as the day it fell on in India (`indiaDay`), not
 * in the zone of the phone, so a card names the same day as the heading above
 * it and as the facility's books. `short` leaves out India's current year.
 *
 * `now` is the moment the current year is read at; a test passes its own.
 * Returns "—" when the date is missing or unreadable.
 */
export const formatIndiaDate = (
  value: string | Date | null | undefined,
  format: DateFormat = 'medium',
  now: Date = new Date()
): string => {
  const day = calendarDay(indiaDay(value));
  return day ? writeDate(day, format, indiaYear(now)) : '—';
};

/**
 * The first and the last moment of a calendar day in India, for a range the
 * server reads as moments (timestamptz). The zone is written out, so the range
 * is the same day whatever the phone's or the database's clock zone is.
 */
export const startOfDayIST = (day: string): string => `${day}T00:00:00${IST_OFFSET}`;
export const endOfDayIST = (day: string): string => `${day}T23:59:59.999${IST_OFFSET}`;

/**
 * Both ends of a date range for an RPC that applies the range only when both
 * are given (`p_date_from IS NULL OR p_date_to IS NULL OR ... BETWEEN`): an end
 * that was not asked for is set far enough out to mean "open". With neither
 * end there is no range.
 */
export const closeDateRange = (
  from: string | null | undefined,
  to: string | null | undefined
): { from: string; to: string } | null =>
  from || to
    ? { from: from || startOfDayIST('1900-01-01'), to: to || endOfDayIST('9999-12-31') }
    : null;

/**
 * Parse an ISO date string (YYYY-MM-DD) to a Date object in local timezone
 * This avoids timezone offset issues when reading dates
 *
 * @param dateString - ISO date string (e.g., "2025-10-29")
 * @returns Date object at midnight local time
 */
export const parseLocalISODate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Section header for date-grouped lists (§12.3): "Today", "Yesterday",
 * "Tue, 6 Oct", or "Tue, 6 Oct 2025" outside the current year.
 *
 * "Today" is the phone's own today, as it is in the requests of the GRN,
 * dispatch and invoice lists, which count their "Today" and "Yesterday" filters
 * from it (`toRequest`). The two change together or not at all. A report counts
 * from India's today and uses `formatIndiaSectionDate`.
 */
export const formatSectionDate = (dateString: string): string => {
  const date = toDate(dateString);
  if (!date) return '—';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return words().today;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return words().yesterday;
  }
  return `${words().weekdaysShort[date.getDay()]}, ${formatDate(date, 'short')}`;
};

const DAY_MS = 24 * 60 * 60_000;

/**
 * Section header over a day of a report, on India's calendar: "Today",
 * "Yesterday", "Tue, 6 Oct", or "Tue, 6 Oct 2025" outside India's current year.
 *
 * The day is `indiaDay(value)` and today is the day it is in India at `now`, as
 * the report's own request counts it (`todayInIST`): both sides of the
 * comparison are India's, so a phone abroad shows what a phone at the facility
 * shows. India has no summer time, so yesterday is the day 24 hours before.
 */
export const formatIndiaSectionDate = (value: string | Date | null | undefined, now: Date = new Date()): string => {
  const day = indiaDay(value);
  const date = calendarDay(day);
  if (!date) return '—';
  if (day === indiaDay(now)) return words().today;
  if (day === indiaDay(new Date(now.getTime() - DAY_MS))) return words().yesterday;
  return `${words().weekdaysShort[date.weekday]}, ${writeDate(date, 'short', indiaYear(now))}`;
};

/**
 * Format a date for relative time display (e.g., "2h ago", "Yesterday")
 *
 * @param dateString - ISO date string
 * @param older - how a time a day or more ago is written. By default the date
 *   in the phone's zone; a report passes India's (`formatIndiaDate`).
 * @param now - the time it is measured from (tests and callers that hold one clock reading)
 * @returns Relative time string
 */
export const formatRelativeTime = (
  dateString: string,
  older: (date: Date) => string = date => formatDate(date, 'short'),
  now: Date = new Date()
): string => {
  // Handle undefined/null/empty input
  if (!dateString) {
    return '—';
  }

  const date = new Date(dateString);

  // Handle invalid date
  if (isNaN(date.getTime())) {
    return '—';
  }

  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  // Handle negative time (future dates)
  if (diffMins < 0) {
    return words().justNow;
  }

  if (diffMins < 1) return words().justNow;
  if (diffMins < 60) return words().minutesAgo.replace('{n}', localizeDigits(String(diffMins)));
  if (diffHours < 24) return words().hoursAgo.replace('{n}', localizeDigits(String(diffHours)));
  return older(date);
};
