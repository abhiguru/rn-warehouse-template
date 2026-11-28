/**
 * "A write to the facility just succeeded" (WH-299). Every write the app sends passes `sessionFetch`
 * (src/config/supabaseConfig.ts), which calls `noteFacilityWrite` for each one the server accepted. The phone copy
 * listens (src/features/phone-copy/syncEngine.ts) and asks for a sync, so what a person saved online is in the copy
 * the screens read. The listener list lives here so the config layer does not import the phone copy.
 */

import { registerSessionScoped } from './sessionScopedRegistry';

type FacilityWriteListener = () => void;

const listeners = new Set<FacilityWriteListener>();

/** Told after each successful write to the facility's data (not Storage objects or edge functions). */
export function subscribeFacilityWrite(listener: FacilityWriteListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const quietListeners = new Set<() => void>();

/**
 * Told when a data write was accepted while a quiet scope was open. No sync is asked for here (the send pass asks for one
 * at its end); the sync engine only marks a sync as owed, so a save screen's bounded wait covers the write.
 */
export function subscribeQuietWrite(listener: () => void): () => void {
  quietListeners.add(listener);
  return () => {
    quietListeners.delete(listener);
  };
}

/** Called by the request layer once the server accepted a write. Never throws. */
export function noteFacilityWrite(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
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

let quietDepth = 0;
let writeSeenWhileQuiet = false;
registerSessionScoped('facility-write-seen-while-quiet', () => {
  writeSeenWhileQuiet = false;
});

/**
 * True once if a data write was accepted while a quiet scope was open, then false again. The send engine asks at the end of
 * a pass: a person's own save made during the pass is indistinguishable from the pass's sends inside the scope, so the pass
 * always asks for one sync afterwards when this says yes, whether or not it sent anything (WH-299).
 */
export function takeWriteSeenWhileQuiet(): boolean {
  const seen = writeSeenWhileQuiet;
  writeSeenWhileQuiet = false;
  return seen;
}

/**
 * Runs `fn` with writes not noted. The send engine runs its pass inside it: it asks for its own sync after a pass, so its
 * sends must not each ask for one (WH-299). A counter, so nested or overlapping scopes end correctly.
 */
export async function withoutWriteNote<T>(fn: () => Promise<T>): Promise<T> {
  quietDepth += 1;
  try {
    return await fn();
  } finally {
    quietDepth -= 1;
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
  if (quietDepth > 0) {
    writeSeenWhileQuiet = true;
    for (const listener of [...quietListeners]) {
      try {
        listener();
      } catch {
        // A listener's failure must not fail the write that already succeeded.
      }
    }
    return;
  }
  noteFacilityWrite();
}
