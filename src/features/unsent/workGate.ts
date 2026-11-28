/**
 * What the unsent work stops (WH-301, product/tech/app-offline-unsent-work.md sections 5 and 6): new work at the 2-hour
 * limit, and sign-out, leaving or switching the facility and removing the account while anything is unsent. Reading and
 * search are never asked. With the offline feature off the 2-hour limit stops no work (nothing new can pile up), but
 * the account actions are still refused while anything is unsent.
 */
import { hasCapability } from '@/config/facilityCapabilities';
import { getUnsentSummary, oldestUnsentAgeMs, ownUnsentCount } from './unsentStore';

export type WorkGate = { ok: true } | { ok: false; count: number; oldestAgeMs: number | null };
export type AccountGate = { ok: true } | { ok: false; count: number | null };
export type RefusedAction = 'signOut' | 'leaveFacility' | 'switchFacility' | 'deleteAccount';

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
export function accountActionAllowed(action?: RefusedAction): AccountGate {
  const summary = getUnsentSummary();
  if (summary.unreadable) {
    // With sync on, an unreadable file always refuses (WH-301). With sync off, deleting the account could destroy the file,
    // while sign-out/leaving/switching only refuse when waiting items were last known for this person (WH-396).
    if (hasCapability('sync')) return { ok: false, count: null };
    if (action === 'deleteAccount') return summary.fileExists === false ? { ok: true } : { ok: false, count: null };
    return summary.knownWaiting ? { ok: false, count: null } : { ok: true };
  }
  const count = ownUnsentCount();
  return count === 0 ? { ok: true } : { ok: false, count };
}
