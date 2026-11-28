/**
 * "A write to the facility just succeeded" (WH-299). Every write the app sends passes `sessionFetch`
 * (src/config/supabaseConfig.ts), which calls `noteFacilityWrite` for each one the server accepted (unless the caller
 * opted out with `quietWrite: true`, as the unsent send pass does). The phone copy listens
 * (src/features/phone-copy/syncEngine.ts) and asks for a sync, so what a person saved online is in the copy
 * the screens read. The listener list lives here so the config layer does not import the phone copy.
 */

import { registerSessionScoped } from './sessionScopedRegistry';

/** `photoStep` is true for a register, confirm or cancel call of a photo upload (WH-401); the sync engine holds only those. */
type FacilityWriteListener = (photoStep: boolean) => void;

/** The three RPC steps of one photo upload (WH-397). Only these may be held back while a photo upload is active (WH-401). */
const PHOTO_STEP_RPC = /^(register|confirm|cancel)_(grn|dispatch)_image_upload$/;

const listeners = new Set<FacilityWriteListener>();

/** Told after each successful write to the facility's data (not Storage objects or edge functions). */
export function subscribeFacilityWrite(listener: FacilityWriteListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the request layer once the server accepted a write. Never throws. */
export function noteFacilityWrite(photoStep = false): void {
  for (const listener of [...listeners]) {
    try {
      listener(photoStep);
    } catch {
      // A listener's failure must not fail the write that already succeeded.
    }
  }
}

const activeUploadHolds = new Set<symbol>();
const holdReleaseListeners = new Set<() => void>();

// Clear active upload hold tokens on session end so a stale release from the old session is a no-op.
registerSessionScoped('facility-write-upload-holds', () => {
  activeUploadHolds.clear();
});

/** True while at least one online photo upload hold token is active (WH-397). */
export function hasActiveUploadHold(): boolean {
  return activeUploadHolds.size > 0;
}

/** Told when the last active upload hold token is released (WH-397). */
export function subscribeUploadHoldReleased(listener: () => void): () => void {
  holdReleaseListeners.add(listener);
  return () => {
    holdReleaseListeners.delete(listener);
  };
}

/**
 * Acquires a unique hold token so the after-write sync waits for the photo upload (or batch) to finish rather than
 * syncing once per photo (WH-397). Returns an idempotent release function for this token only.
 */
export function holdAfterWriteSync(): () => void {
  const token = Symbol('upload-hold');
  activeUploadHolds.add(token);
  return () => {
    if (!activeUploadHolds.delete(token)) return;
    if (activeUploadHolds.size > 0) return;
    for (const listener of [...holdReleaseListeners]) {
      try {
        listener();
      } catch {
        // A listener's failure must not fail upload cleanup.
      }
    }
  };
}

/** Runs `fn` with an active after-write sync hold token, always releasing it on completion or failure (WH-397). */
export async function withAfterWriteSyncHold<T>(fn: () => Promise<T>): Promise<T> {
  const release = holdAfterWriteSync();
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * RPCs that are not reads by name (`READ_RPC` in supabaseConfig.ts) but change nothing the copy holds: checks, a number
 * suggestion, a seen marker, the sign-in and enrollment functions, the language and the connection notes.
 */
const NOT_COPY_RPC =
  /^(can_make_bills|suggest_document_number|mark_held_item_seen|make_pairing_code|set_my_language|revoke_session|operator_review_enrollment|review_enrollment_again|submit_connection_notes)$/;

/**
 * Called for each request the request layer classed as a write (`mutation`: not `isReadRequest`, so a GET, a HEAD, a read
 * RPC by NAME such as get_*, search_*, check_*, list_*, count_*, which includes every get_sync_* call of the sync feed,
 * and Storage sign and list calls never arrive here) and that the server accepted. Only the facility's data (PostgREST
 * tables and functions) counts: a Storage object or an edge function (photos, documents) changes nothing the copy holds.
 */
export function noteDataWrite(input: RequestInfo | URL): void {
  const url = (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).split(/[?#]/)[0];
  if (!url.includes('/rest/v1/')) return;
  const rpc = /\/rest\/v1\/rpc\/([A-Za-z0-9_]+)$/.exec(url)?.[1];
  if (rpc !== undefined && NOT_COPY_RPC.test(rpc)) return;
  noteFacilityWrite(rpc !== undefined && PHOTO_STEP_RPC.test(rpc));
}
