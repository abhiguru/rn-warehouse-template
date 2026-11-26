/**
 * What the report readers share (WH-299, product/tech/app-offline-read-from-copy.md section 8): days in India, sums of
 * `weight * quantity` that do not drift the way floating point does, and the server's rounding of whole numbers.
 */
import { businessDate, businessDayStart, enCompare } from '@/features/phone-copy/pgCompat';

export type Row = Record<string, unknown>;
export const parseRow = (text: string): Row => JSON.parse(text) as Row;
export const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** A text or number as text; null for anything else. */
export const scalarText = (value: unknown): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
export const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** The day ('YYYY-MM-DD') a stored time falls on in India, as `warehouse_security.business_date`; null for none. */
export const dayOf = (time: unknown): string | null => (typeof time === 'string' ? businessDate(time) : null);

const DAY_MS = 86_400_000;
const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
/** `date - date`: whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);
export function addDays(day: string, days: number): string {
  const moved = new Date((dayNumber(day) + days) * DAY_MS);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${moved.getUTCFullYear()}-${two(moved.getUTCMonth() + 1)}-${two(moved.getUTCDate())}`;
}
/** `warehouse_security.business_day_start(day)` in microseconds. */
export const dayStartUs = (day: string): number => businessDayStart(day) * 1000;
/** The moment a day in India ends and the next begins, in microseconds: `business_day_start(day + 1)`. */
export const dayEndUs = (day: string): number => dayStartUs(addDays(day, 1));

/** Weights are summed as millionths so that `weight * quantity` adds up exactly. */
export const WEIGHT_UNITS = 1_000_000;
/** SQL for `weight * <quantity>` in millionths over the lot `t`; summed, then `fromUnits`. */
export const weightUnits = (quantity: string): string => `CAST(round(t.weight * ${WEIGHT_UNITS}) AS INTEGER) * ${quantity}`;
export const fromUnits = (units: number | null | undefined): number | null =>
  units === null || units === undefined ? null : units / WEIGHT_UNITS;
export const weightSum = (units: number | null | undefined): number => fromUnits(units) ?? 0;

/** Postgres `round(sum / count)` of whole numbers: halves go away from zero. */
export function roundedAverage(sum: number, count: number): number {
  const twice = Math.abs(sum) * 2 + count;
  const rounded = Math.floor(twice / (2 * count));
  return sum < 0 ? -rounded : rounded;
}

/** `round(part * 100.0 / whole, 1)`, worked out in whole numbers. */
export function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((part * 2000 + whole) / (2 * whole)) / 10;
}

export const compareText = (a: unknown, b: unknown): number => enCompare(textOf(a), textOf(b));
export const compareIds = (a: unknown, b: unknown): number => {
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
};
