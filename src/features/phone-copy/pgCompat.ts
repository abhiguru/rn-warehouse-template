/**
 * The server's rules the phone's reads must reproduce, in JavaScript (WH-299,
 * product/tech/app-offline-read-from-copy.md sections 2.1, 7 and 8). Pure.
 */
import { searchTerms } from '@/features/filters/searchMatch';

/** `warehouse_security.search_terms`: the words of a search, lower-cased. */
export function pgSearchTerms(query: string | null | undefined): string[] {
  return searchTerms(query);
}

/** `ILIKE '%term%'` with the term taken literally, over a text already lower-cased. */
export function containsLiteral(haystackLc: string | null, termLc: string): boolean {
  return haystackLc?.includes(termLc) === true;
}

/**
 * An `ILIKE` whose pattern the server does not escape (`%` and `_` stay wildcards), over a lower-cased column: the SQL
 * to put after the column, and its parameter.
 */
export function likeUnescaped(pattern: string): { sql: string; param: string } {
  return { sql: "LIKE ? ESCAPE '\\'", param: pattern.toLowerCase() };
}

/** Postgres `round(numeric)`: halves go away from zero. */
export function pgRound(value: number, digits = 0): number {
  // Shifting through the decimal text keeps 1.005 a half, which multiplying by 100 would not.
  const shift = (n: number, by: number): number => {
    const [mantissa, exponent = '0'] = String(n).split('e');
    return Number(`${mantissa}e${Number(exponent) + by}`);
  };
  const rounded = shift(Math.round(shift(Math.abs(value), digits)), -digits);
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** The business day is India's: UTC+05:30, with no daylight saving. */
const IST_OFFSET_MS = 19_800_000;

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** A time as the server writes it, in microseconds since 1970 (its own precision); null when it is none. */
export function parseTimestampUs(iso: string | null | undefined): number | null {
  const parts = iso ? TIMESTAMP.exec(iso) : null;
  if (!parts) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '', zone = 'Z'] = parts;
  const whole = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    offsetMinutes = (zone.startsWith('-') ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || '0'));
  }
  return (whole - offsetMinutes * 60_000) * 1000 + Number(fraction.padEnd(6, '0').slice(0, 6));
}

/** The day ('YYYY-MM-DD') a moment falls on in India. */
export function businessDate(isoOrMs: string | number): string {
  const us = typeof isoOrMs === 'string' ? parseTimestampUs(isoOrMs) : isoOrMs * 1000;
  if (us === null) throw new Error('not a time');
  // The UTC fields of the shifted moment are the day and time in India.
  const india = new Date(Math.floor(us / 1000) + IST_OFFSET_MS);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${india.getUTCFullYear()}-${two(india.getUTCMonth() + 1)}-${two(india.getUTCDate())}`;
}

/** The first moment (ms) of a day in India. */
export function businessDayStart(day: string): number {
  const us = parseTimestampUs(day);
  if (us === null) throw new Error('not a day');
  return us / 1000 - IST_OFFSET_MS;
}

/** "Today" for the stock reports (Product's PR4): the phone's day in India, never before the day the copy was confirmed. */
export function copyToday(asOf: string, nowMs: number = Date.now()): string {
  const phone = businessDate(nowMs);
  const confirmed = businessDate(asOf);
  return phone > confirmed ? phone : confirmed;
}

/** The digits of a mobile number (ASCII digits). */
export function mobileDigits(mobile: string | null | undefined): string {
  return (mobile ?? '').replace(/[^0-9]/g, '');
}

/** `utils.mobile_key`: the digits without India's 91 or the leading 0. */
export function mobileKey(mobile: string | null | undefined): string {
  const digits = mobileDigits(mobile);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** The one comparator of the copy's reads (section 7.3): the database's en_US order. */
export const enCollator: Intl.Collator = new Intl.Collator('en', { ignorePunctuation: true });

/**
 * `uuid_extract_timestamp`: the moment inside a version 1 or version 7 uuid, in microseconds since 1970; null for any
 * other version or text (the rows then sort after the ones that have one, as Postgres puts nulls last).
 */
export function uuidTimestampUs(id: string | null | undefined): number | null {
  const parts = id ? /^([0-9a-f]{8})-([0-9a-f]{4})-([17])([0-9a-f]{3})-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(id) : null;
  if (!parts) return null;
  if (parts[3] === '7') return Number(BigInt(`0x${parts[1]}${parts[2]}`) * 1000n);
  // Version 1: 100-nanosecond intervals since 1582-10-15.
  const intervals = BigInt(`0x${parts[4]}${parts[2]}${parts[1]}`);
  return Number((intervals - 122192928000000000n) / 10n);
}

/** en_US order, then code-unit order so it is the same on every run; a missing text comes last. */
export function enCompare(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return enCollator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}
