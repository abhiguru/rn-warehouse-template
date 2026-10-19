/**
 * Whether the facility the app is connected to pages its GRN list by receipt (backend migration 98),
 * learned from the list's own answers, in memory only.
 *
 * A request that asks for receipt pages (`page_by: 'receipt'`) is answered with `pagination.unit`:
 * `receipt` from a facility with migration 98, `line` from one without it. The app records that here so
 * the Stock filter can leave out "Low stock" on a facility that would answer it wrongly (the staff list
 * returns every line, the customer list none; code review 2026-10-18, R1-07 and R3-02).
 *
 * Kept per server (origin and instance id) and read for the active server only, like
 * facilityCapabilities.ts, and forgotten when the active server is another one (a server change rebuilds the
 * navigation tree, so screens read it again). Until a list answer has come, the facility is
 * not known to have migration 98.
 */
import { getActiveOperatorServer } from './operatorServer';

const byServer = new Map<string, boolean>();
const listeners = new Set<() => void>();
/** The server `byServer` was learned from. */
let learnedFrom: string | null = null;

const activeKey = (): string | null => {
  const active = getActiveOperatorServer();
  return active ? `${active.origin}|${active.instanceId}` : null;
};

/** A server switch forgets what the previous server answered. Checked on every read and write. */
const forgetOtherServers = (key: string | null) => {
  if (key === learnedFrom) return;
  byServer.clear();
  learnedFrom = key;
};

const notify = () => {
  for (const listener of [...listeners]) listener();
};

/** Records what the active server's latest GRN list answer paged by. Only for a request that asked for receipt pages. */
export function noteGrnPagingUnit(unit: 'line' | 'receipt'): void {
  const key = activeKey();
  forgetOtherServers(key);
  if (!key) return;
  const next = unit === 'receipt';
  // The same answer again keeps the state, so a screen reading it does not render again for nothing.
  if (byServer.get(key) === next) return;
  byServer.set(key, next);
  notify();
}

/** Whether the active server is known to page the GRN list by receipt (backend migration 98). */
export function facilityPagesGrnsByReceipt(): boolean {
  const key = activeKey();
  forgetOtherServers(key);
  return key !== null && byServer.get(key) === true;
}

export function subscribeFacilityGrnPaging(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetFacilityGrnPaging(): void {
  byServer.clear();
  learnedFrom = null;
  notify();
}
