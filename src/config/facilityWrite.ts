/**
 * "A write to the facility just succeeded" (WH-299). Every write the app sends passes `sessionFetch`
 * (src/config/supabaseConfig.ts), which calls `noteFacilityWrite` for each one the server accepted. The phone copy
 * listens (src/features/phone-copy/syncEngine.ts) and asks for a sync, so what a person saved online is in the copy
 * the screens read. The listener list lives here so the config layer does not import the phone copy.
 */

const listeners = new Set<() => void>();

/** Told after each successful write to the facility's data (not Storage objects or edge functions). */
export function subscribeFacilityWrite(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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

/**
 * Called for each write the server accepted. Only the facility's data (PostgREST tables and functions) counts: a Storage
 * object or an edge function (photos, documents) changes nothing the copy holds.
 */
export function noteDataWrite(input: RequestInfo | URL): void {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.split(/[?#]/)[0].includes('/rest/v1/')) noteFacilityWrite();
}
