/**
 * "My facilities": the person's own list of facilities, kept on this device
 * per central person (docs/CENTRAL_LOGIN.md).
 *
 * The central service does not know which facilities a person uses, so the
 * list cannot come from it. It is stored in AsyncStorage under
 * `central_facilities_v1:<central user id>` and holds no secret: an address, a
 * name, a city, the status the facility last answered with and when it was
 * last opened. No token is ever written here. It is kept on central sign-out
 * and removed by "Delete my account".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCentralState, setCentralState, type FacilityStatus } from './centralState';
import { isCentralLoginConfigured } from './envConfig';
import { getActiveOperatorServer } from './operatorServer';

export const CENTRAL_FACILITIES_PREFIX = 'central_facilities_v1:';

export type MyFacility = {
  /** The facility's server address, and its audience at the central service. */
  origin: string;
  /** The installation's id from its discovery document; null until it was first reached. */
  instanceId: string | null;
  name: string;
  city: string;
  status: FacilityStatus;
  /** ISO time of the last sign-in or access request there; null when never opened. */
  lastOpenedAt: string | null;
  addedAt: string;
};

const STATUSES: readonly FacilityStatus[] = ['approved', 'requested', 'revoked', 'link_needed', 'unavailable'];
const keyFor = (userId: string) => `${CENTRAL_FACILITIES_PREFIX}${userId}`;

const listeners = new Set<() => void>();
/** Called after every change of any person's list. */
export function onMyFacilitiesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const changed = () => {
  for (const listener of [...listeners]) listener();
};

// One change at a time: a read-modify-write of the list must not interleave with another.
let queue: Promise<unknown> = Promise.resolve();
const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
};

function clean(value: unknown): MyFacility | null {
  const entry = value as Partial<MyFacility> | null;
  if (!entry || typeof entry !== 'object' || typeof entry.origin !== 'string' || !entry.origin.startsWith('https://')) return null;
  if (typeof entry.name !== 'string' || !entry.name) return null;
  return {
    origin: entry.origin,
    instanceId: typeof entry.instanceId === 'string' && entry.instanceId ? entry.instanceId : null,
    name: entry.name,
    city: typeof entry.city === 'string' ? entry.city : '',
    status: STATUSES.includes(entry.status as FacilityStatus) ? (entry.status as FacilityStatus) : 'unavailable',
    lastOpenedAt: typeof entry.lastOpenedAt === 'string' && entry.lastOpenedAt ? entry.lastOpenedAt : null,
    addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : '',
  };
}

/** Newest-opened first; facilities never opened follow, newest-added first, then by name. */
export function sortMyFacilities(list: readonly MyFacility[]): MyFacility[] {
  return [...list].sort((a, b) => {
    if (a.lastOpenedAt !== b.lastOpenedAt) {
      if (a.lastOpenedAt === null) return 1;
      if (b.lastOpenedAt === null) return -1;
      return a.lastOpenedAt < b.lastOpenedAt ? 1 : -1;
    }
    if (a.addedAt !== b.addedAt) return a.addedAt < b.addedAt ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

async function read(userId: string): Promise<MyFacility[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.map(clean).filter((entry): entry is MyFacility => {
      if (!entry || seen.has(entry.origin)) return false;
      seen.add(entry.origin);
      return true;
    });
  } catch {
    return [];
  }
}

const write = (userId: string, list: MyFacility[]) => AsyncStorage.setItem(keyFor(userId), JSON.stringify(list));

/** The person's list, in the order the screen shows it. */
export async function loadMyFacilities(userId: string): Promise<MyFacility[]> {
  if (!userId) return [];
  return sortMyFacilities(await serialize(() => read(userId)));
}

/**
 * Adds a facility, or updates the name and city of one already on the list.
 * A new entry starts as `unavailable`: nothing is known about it until it has
 * been opened once.
 */
export async function addMyFacility(
  userId: string,
  facility: { origin: string; name: string; city?: string; instanceId?: string | null }
): Promise<void> {
  if (!userId) return;
  await serialize(async () => {
    const list = await read(userId);
    const existing = list.find(entry => entry.origin === facility.origin);
    if (existing) {
      existing.name = facility.name || existing.name;
      if (facility.city !== undefined && facility.city !== '') existing.city = facility.city;
      if (facility.instanceId) existing.instanceId = facility.instanceId;
    } else {
      list.push({
        origin: facility.origin,
        instanceId: facility.instanceId ?? null,
        name: facility.name,
        city: facility.city ?? '',
        status: 'unavailable',
        lastOpenedAt: null,
        addedAt: new Date().toISOString(),
      });
    }
    await write(userId, list);
  });
  changed();
}

/**
 * Records what a facility answered. `opened` also moves it to the top of the
 * list. A facility that is not on the list is left alone.
 */
export async function updateMyFacility(
  userId: string,
  origin: string,
  change: { status?: FacilityStatus; opened?: boolean; instanceId?: string; name?: string }
): Promise<void> {
  if (!userId) return;
  const found = await serialize(async () => {
    const list = await read(userId);
    const entry = list.find(item => item.origin === origin);
    if (!entry) return false;
    if (change.status) entry.status = change.status;
    if (change.opened) entry.lastOpenedAt = new Date().toISOString();
    if (change.instanceId) entry.instanceId = change.instanceId;
    if (change.name && !entry.name) entry.name = change.name;
    await write(userId, list);
    return true;
  });
  if (found) changed();
}

export async function removeMyFacility(userId: string, origin: string): Promise<void> {
  if (!userId) return;
  await serialize(async () => {
    const list = await read(userId);
    await write(userId, list.filter(entry => entry.origin !== origin));
  });
  changed();
}

/** "Delete my account": the list of that person leaves the device. */
export async function deleteMyFacilities(userId: string): Promise<void> {
  if (!userId) return;
  await serialize(() => AsyncStorage.removeItem(keyFor(userId)));
  changed();
}

/**
 * True when the list can be skipped at start: exactly one approved facility
 * and nothing else waiting (no request pending, no number to confirm).
 */
export function soleApprovedFacility(list: readonly MyFacility[]): MyFacility | null {
  const approved = list.filter(entry => entry.status === 'approved');
  const waiting = list.some(entry => entry.status === 'requested' || entry.status === 'link_needed');
  return approved.length === 1 && !waiting ? approved[0] : null;
}

/**
 * A facility's own SMS sign-in finished while central login is on (a facility
 * that does not accept association sign-in): record it on the person's list.
 * Nothing happens without central login or a central session.
 */
export async function noteFacilitySmsSignIn(status: 'approved' | 'requested'): Promise<void> {
  if (!isCentralLoginConfigured()) return;
  const user = getCentralState().user;
  const server = getActiveOperatorServer();
  if (!user || !server) return;
  await updateMyFacility(user.id, server.origin, { status, opened: true }).catch(() => {});
  // Either way the facility's sign-in screens are done with: a session has been
  // stored, or the waiting screen takes over and the way on is My facilities.
  setCentralState({ facilitySmsOrigin: null });
}
