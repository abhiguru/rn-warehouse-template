/**
 * The days a report asks for. They are plain calendar days ('YYYY-MM-DD') from
 * the phone's own calendar; the report RPCs take them as `date`.
 */
import { toLocalISODate } from '@/utils/formatters';

/** Today as a plain day. */
export function getToday(): string {
  return toLocalISODate(new Date());
}

/**
 * The first day of "the last N days", today included: the last 120 days are
 * today and the 119 days before it. This is the count the period selector on
 * the report screens uses, so every report covers the same days for a period.
 */
export function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - (Math.max(1, days) - 1));
  return toLocalISODate(date);
}
