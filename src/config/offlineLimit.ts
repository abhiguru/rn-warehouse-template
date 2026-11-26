/**
 * How long the profile kept on the phone may open a session with no answer from the server (WH-349): 30 days since
 * the server last confirmed that person, which is the session's idle limit applied with no connection. The 90-day
 * absolute limit of a session stays the server's to apply.
 *
 * All times are the device clock's. A server answer for the person writes `confirmedAt` and restarts `seenAt`; an
 * offline read only moves `seenAt` forward, so a clock set back behind a time the phone has already shown is noticed.
 * When the elapsed time cannot be told, the limit counts as passed.
 */
export const OFFLINE_IDLE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;
/** A smaller step back is a clock correction, not a clock set back (the same margin as src/config/sessionEnd.ts). */
export const CLOCK_SET_BACK_TOLERANCE_MS = 5 * 60 * 1000;

export interface ConfirmationTimes {
  /** When the copy was written; the confirmation time of a copy kept before `confirmedAt` was. */
  cachedAt?: number | undefined;
  /** When the server last answered for this person. */
  confirmedAt?: number | undefined;
  /** The latest time the phone's clock has shown to a read of the copy since then. */
  seenAt?: number | undefined;
}

export const isStoredTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function isOfflineLimitPassed(times: ConfirmationTimes, now: number): boolean {
  const confirmed: unknown = times.confirmedAt ?? times.cachedAt;
  if (!isStoredTime(confirmed)) return true;
  const seen: unknown = times.seenAt ?? confirmed;
  if (!isStoredTime(seen)) return true;
  if (now < Math.max(confirmed, seen) - CLOCK_SET_BACK_TOLERANCE_MS) return true;
  return now - confirmed >= OFFLINE_IDLE_LIMIT_MS;
}
