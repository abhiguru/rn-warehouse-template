/// <reference types="node" />
/// <reference types="jest" />
/**
 * What every phone-copy test shares: the phone's native edges and the server, and a `bootPhone()` that starts the app's
 * own modules afresh over the files already on the "phone" (a kill and reopen).
 *
 * Faked, and only these: `expo-sqlite` (fakeExpoSqlite.ts), `expo-secure-store` (a map), `expo-file-system` (free space),
 * NetInfo (connectivity), AppState (foreground), the signed-in person (`getSessionIdentity`), and the server's answers to
 * the sync RPCs (fakeFeed.ts, reached through `getAuthenticatedClient().rpc`, the call the contract names).
 * Everything else is the real code of src/features/phone-copy.
 */
import { AppState } from 'react-native';
import type { NetInfoState } from '@react-native-community/netinfo';
import { createFakeFeed, type FakeFeed } from './fakeFeed';
import { expoSqliteModule, resetFakePhone } from './fakeExpoSqlite';

export const SCOPE_ORIGIN = 'https://warehouse.example.test';
export type SecureWrite = { key: string; value: string; options?: Record<string, unknown> };

export const env = {
  feed: createFakeFeed() as FakeFeed,
  subject: 'user-1',
  freeBytes: 5_000_000_000,
  secure: new Map<string, string>(),
  secureWrites: [] as SecureWrite[],
  netListeners: [] as Array<(s: NetInfoState) => void>,
  appListeners: [] as Array<(s: string) => void>,
  appState: 'active',
  reachable: true,
};
const net = (connected: boolean) => ({ type: 'wifi', isConnected: connected, isInternetReachable: connected, details: null }) as unknown as NetInfoState;

/** A brand-new phone, a brand-new server. Call in `beforeEach`. */
export function resetEnv() {
  resetFakePhone();
  env.feed = createFakeFeed();
  env.subject = 'user-1';
  env.freeBytes = 5_000_000_000;
  env.secure.clear();
  env.secureWrites.length = 0;
  env.netListeners = [];
  env.appListeners = [];
  env.appState = 'active';
  env.reachable = true;
  (AppState as unknown as { currentState: string }).currentState = 'active';
}

/** The phone loses or regains its connection; the app's listeners are told, as NetInfo does. */
export async function setReachable(connected: boolean) {
  env.reachable = connected;
  for (const listener of [...env.netListeners]) listener(net(connected));
}
/** The app goes to the background or comes back. */
export async function setForeground(state: 'active' | 'background') {
  env.appState = state;
  (AppState as unknown as { currentState: string }).currentState = state;
  for (const listener of [...env.appListeners]) listener(state);
}

/** The fakes as module factories: `jest.mock('expo-secure-store', () => require('../tests/phoneEnv').mockFactories.secureStore())`. */
export const mockFactories = {
  sqlite: () => expoSqliteModule(),
  secureStore: () => ({
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
    getItemAsync: jest.fn(async (key: string) => env.secure.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string, options?: Record<string, unknown>) => {
      env.secure.set(key, value); env.secureWrites.push({ key, value, options });
    }),
    deleteItemAsync: jest.fn(async (key: string) => { env.secure.delete(key); }),
  }),
  fileSystem: () => ({
    Paths: { get availableDiskSpace() { return env.freeBytes; }, get totalDiskSpace() { return 64_000_000_000; } },
    getFreeDiskStorageAsync: async () => env.freeBytes,
    getInfoAsync: async () => ({ exists: true, size: 1_000_000 }),
    File: class { exists = true; size = 1_000_000; delete() { /* the database files are the fake's */ } },
    Directory: class { exists = true; list() { return []; } },
  }),
  supabase: () => {
    const client = async () => ({ rpc: (name: string, args: Record<string, unknown>) => env.feed.rpc(name, args) });
    return {
      getAuthenticatedClient: client,
      getSupabaseClient: client,
      getSessionIdentity: async () => ({ origin: SCOPE_ORIGIN, instanceId: 'instance-a', subject: env.subject }),
    };
  },
  netinfo: () => ({
    __esModule: true,
    default: {
      fetch: jest.fn(async () => net(env.reachable)),
      addEventListener: jest.fn((listener: (s: NetInfoState) => void) => {
        env.netListeners.push(listener);
        return () => { env.netListeners = env.netListeners.filter(l => l !== listener); };
      }),
    },
  }),
  lan: () => ({ getLanStatus: () => ({ path: 'public', failure: null, lan: null }) }),
};

/** Puts AppState under the test's control (the foreground or background of the app). */
export function controlAppState() {
  (AppState as unknown as { currentState: string }).currentState = env.appState;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: (s: string) => void) => {
    env.appListeners.push(listener);
    return { remove: () => { env.appListeners = env.appListeners.filter(l => l !== listener); } };
  }) as never);
}

/** The app started afresh (modules loaded again) over the phone's files, with every edge faked as above. */
export function bootPhone() {
  jest.resetModules();
  jest.doMock('expo-sqlite', mockFactories.sqlite, { virtual: true }); // main has no expo-sqlite until 4ab537c2
  jest.doMock('expo-secure-store', mockFactories.secureStore);
  jest.doMock('expo-file-system', mockFactories.fileSystem);
  jest.doMock('@/config/supabaseConfig', mockFactories.supabase);
  jest.doMock('@react-native-community/netinfo', mockFactories.netinfo);
  jest.doMock('@/config/lanTransport', mockFactories.lan);
  controlAppState();
  return {
    engine: require('@/features/phone-copy/syncEngine') as typeof import('@/features/phone-copy/syncEngine'),
    syncStore: require('@/features/phone-copy/syncStore') as typeof import('@/features/phone-copy/syncStore'),
    copyDb: require('@/features/phone-copy/copyDb') as typeof import('@/features/phone-copy/copyDb'),
    copyKey: require('@/features/phone-copy/copyKey') as typeof import('@/features/phone-copy/copyKey'),
    queries: require('@/features/phone-copy/copyQueries') as typeof import('@/features/phone-copy/copyQueries'),
    registry: require('@/config/sessionScopedRegistry') as typeof import('@/config/sessionScopedRegistry'),
    scope: async () => (require('@/utils/cacheManager') as typeof import('@/utils/cacheManager')).getSessionCacheScope(),
  };
}
export type Phone = ReturnType<typeof bootPhone>;

/** The rows of one entity table on the phone, read with the real database handle. */
export async function rowsOf(phone: Phone, entity: string) {
  const db = await phone.copyDb.openCopy((await phone.scope())!);
  return db.all<{ id: string; v: string; row: string }>(`SELECT id, v, row FROM ${entity} ORDER BY id`);
}
export const idsOf = async (phone: Phone, entity: string) => (await rowsOf(phone, entity)).map(r => r.id);
export async function metaOf(phone: Phone, key: string) {
  const db = await phone.copyDb.openCopy((await phone.scope())!);
  const [row] = await db.all<{ v: string }>('SELECT v FROM meta WHERE k = ?', [key]);
  return row?.v ?? null;
}
/** Teardown for every test: the real erase of the real copy. */
export async function eraseEverything() {
  const phone = bootPhone();
  await phone.copyDb.eraseCopy();
  jest.restoreAllMocks();
  jest.resetModules();
}
