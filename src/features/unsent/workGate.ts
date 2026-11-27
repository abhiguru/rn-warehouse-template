/**
 * What the unsent work stops (WH-301, product/tech/app-offline-unsent-work.md sections 5 and 6): new work at the 2-hour
 * limit, and sign-out, leaving or switching the facility and removing the account while anything is unsent. Reading and
 * search are never asked. With the offline feature off nothing is stopped (criterion 14).
 */
import { hasCapability } from '@/config/facilityCapabilities';
import { getUnsentSummary, oldestUnsentAgeMs, ownUnsentCount } from './unsentStore';

export type WorkGate = { ok: true } | { ok: false; count: number; oldestAgeMs: number | null };
export type AccountGate = { ok: true } | { ok: false; count: number | null };

/** May a new record, change or edit be started (or saved)? */
export function canStartWork(): WorkGate {
  if (!hasCapability('sync')) return { ok: true };
  const summary = getUnsentSummary();
  if (!summary.limitReached) return { ok: true };
  // Unreadable: the count is unknown, and the age cannot be told.
  if (summary.unreadable) return { ok: false, count: 0, oldestAgeMs: null };
  return { ok: false, count: summary.count, oldestAgeMs: oldestUnsentAgeMs() };
}

/** May the person sign out, leave or switch the facility, or remove the account? Unfinished forms never refuse (Product PQ1). */
export function accountActionAllowed(): AccountGate {
  if (!hasCapability('sync')) return { ok: true };
  if (getUnsentSummary().unreadable) return { ok: false, count: null };
  const count = ownUnsentCount();
  return count === 0 ? { ok: true } : { ok: false, count };
}
