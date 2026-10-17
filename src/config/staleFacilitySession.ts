/**
 * Facilities whose session may still be on this phone for a central person who is no longer
 * the one signed in (docs/CENTRAL_LOGIN.md, "An open belongs to the person it began for").
 *
 * An entry is written as soon as an exchange is found to have finished for the previous person
 * (src/config/openFacility.ts), before its facility session is left, so a restart at any point
 * of that cleanup still knows; it is removed again when the normal leave succeeds. It holds the
 * facility's origin and instance only, never a secret.
 *
 * For the same run of the app, the session generation of the earlier session is also kept, in
 * memory only (`staleGenerationOf`): once the generation has moved, that session has been ended
 * or replaced, and a session stored at the facility since then is someone else's.
 *
 * While a facility is listed, its session is not restored at start (initializeAuth in
 * src/store/slices/authSlice.ts) and it is not opened (openFacility). The cleanup is tried
 * again at start, on every return to the foreground and before such an open
 * (`retryStaleFacilityCleanup` in src/store/operatorSwitch.ts); the entry is removed once
 * the cleanup has run.
 *
 * This file imports only AsyncStorage, so the auth slice can read it without a cycle.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STALE_FACILITY_KEY = 'central_stale_facility_sessions_v1';

export type StaleFacility = { origin: string; instanceId: string };

export const isSameFacility = (server: StaleFacility | null | undefined, facility: StaleFacility): boolean =>
  Boolean(server) && server!.origin === facility.origin && server!.instanceId === facility.instanceId;

function parse(raw: string | null): StaleFacility[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is StaleFacility =>
          Boolean(entry) && typeof entry.origin === 'string' && typeof entry.instanceId === 'string'
      )
      .map(({ origin, instanceId }) => ({ origin, instanceId }));
  } catch {
    return [];
  }
}

// Writes run one after another, so two changes never read the same list and lose one.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * The facilities listed now. A store that cannot be read counts as an empty list: the entry
 * only backs up the forced sign-out that has already run, and a phone whose storage cannot be
 * read must still be able to open its facilities.
 */
export async function loadStaleFacilities(): Promise<StaleFacility[]> {
  try {
    return parse(await AsyncStorage.getItem(STALE_FACILITY_KEY));
  } catch {
    return [];
  }
}

/** True while a facility at `origin` is listed (with `instanceId`, only that instance of it). */
export async function isStaleFacility(origin: string, instanceId?: string): Promise<boolean> {
  return (await loadStaleFacilities()).some(entry => entry.origin === origin && (instanceId === undefined || entry.instanceId === instanceId));
}

const key = (facility: StaleFacility) => `${facility.origin}|${facility.instanceId}`;
const generations = new Map<string, number>();

/** The session generation of the earlier session at this facility, while this run of the app knows it. */
export const staleGenerationOf = (facility: StaleFacility): number | undefined => generations.get(key(facility));

/** The earlier session's generation is no longer a reliable sign of it (its cleanup was not complete). */
export function forgetStaleGeneration(facility: StaleFacility): void {
  generations.delete(key(facility));
}

/**
 * Adds the facility to the list; `generation` is that of the earlier session, kept in memory.
 * Throws when the phone could not write the entry (the generation is kept all the same).
 */
export function markStaleFacility(facility: StaleFacility, generation?: number): Promise<void> {
  if (generation !== undefined) generations.set(key(facility), generation);
  return serial(async () => {
    const list = parse(await AsyncStorage.getItem(STALE_FACILITY_KEY));
    if (list.some(entry => isSameFacility(entry, facility))) return;
    await AsyncStorage.setItem(
      STALE_FACILITY_KEY,
      JSON.stringify([...list, { origin: facility.origin, instanceId: facility.instanceId }])
    );
  });
}

/** Removes the facility from the list. True when it is no longer listed. */
export function clearStaleFacility(facility: StaleFacility): Promise<boolean> {
  generations.delete(key(facility));
  return serial(async () => {
    const list = parse(await AsyncStorage.getItem(STALE_FACILITY_KEY));
    const rest = list.filter(entry => !isSameFacility(entry, facility));
    if (rest.length === list.length) return true;
    if (rest.length === 0) await AsyncStorage.removeItem(STALE_FACILITY_KEY);
    else await AsyncStorage.setItem(STALE_FACILITY_KEY, JSON.stringify(rest));
    return true;
  }).catch(() => false);
}
