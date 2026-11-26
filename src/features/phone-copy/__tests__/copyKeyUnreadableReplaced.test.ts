/**
 * WH-365: a phone copy whose key stays unreadable while the sign-in reads is replaced by the phone itself: after 3 failed
 * key reads in a row, at least one on a fresh start (the count survives a restart), and only with the server reachable.
 * A new key is written before the old file goes, the copy loads again from the server, and the sign-in is not touched.
 * A key that reads at any point resets the count. Offline, and with 3 reads in one run of the app, nothing is replaced.
 *
 * Real: copyKey, copyDriver, copySchema, copyDb, copyKeyReadTries, the sync engine and its store. Faked at the edge:
 * `expo-sqlite`, `expo-secure-store` (a map that fails on request), `expo-file-system`, NetInfo, AppState, the signed-in
 * person and the server's sync answers (src/tests/phoneCopy/phoneEnv.ts), and AsyncStorage as a map that outlives a
 * restart (`bootPhone` loads every module afresh, as a kill and reopen does).
 *
 * Not covered here: unsent work is stored apart from the copy (spec step 21) and no unsent entry exists in these fakes,
 * so "unsent work is never touched" is not asserted; only the sign-in's keys are.
 */
import { bootPhone, env, eraseEverything, resetEnv, setReachable, type Phone } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { grnRow } from '@/tests/phoneCopy/fakeFeed';

// The phone's AsyncStorage: a map that a restart does not empty.
const mockPersisted = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockPersisted.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockPersisted.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockPersisted.delete(key); }),
  },
}));
jest.mock('@/lib/queryClient', () => ({ queryClient: { cancelQueries: jest.fn(async () => {}), clear: jest.fn() } }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ clearItemRatesCache: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ clearStandardRateCache: jest.fn() }));
jest.mock('@/services/autocomplete-service', () => ({ clearAutocompleteCache: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/config/lanPhotos', () => ({ sweepLanPhotos: jest.fn(async () => {}) }));
jest.mock('expo-image', () => ({ Image: { clearDiskCache: jest.fn(async () => true), clearMemoryCache: jest.fn(async () => true) } }));

const KEY_NAME = 'secure_phone_copy_key';
const SIGN_IN_KEYS = ['secure_auth_token', 'secure_refresh_token', 'cached_user_profile'];

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-11-26T07:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
  resetEnv();
  mockPersisted.clear();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

/** A phone with a finished load of one receipt, with a sign-in kept in secure storage. */
async function loadedPhone() {
  env.feed.rows.goodsreceived.push(grnRow('g1'));
  const first = bootPhone();
  await first.engine.startPhoneCopy();
  expect(await first.engine.syncNow('open')).toBe('done');
  for (const key of SIGN_IN_KEYS) env.secure.set(key, `fictional-${key}`);
}

type Store = { getItemAsync: jest.Mock; setItemAsync: jest.Mock };
/** The app started afresh, the copy key's reads (and, with `writes`, its writes) failing while `fault.on` is true. */
async function restartWithKeyFault(writes = false) {
  const phone = bootPhone();
  const store = require('expo-secure-store') as Store;
  const fault = { on: true, writes };
  const realGet = store.getItemAsync.getMockImplementation()!;
  store.getItemAsync.mockImplementation(async (key: string, ...rest: unknown[]) => {
    if (key === KEY_NAME && fault.on) throw new Error('Keystore not available');
    return realGet(key, ...rest);
  });
  const realSet = store.setItemAsync.getMockImplementation()!;
  store.setItemAsync.mockImplementation(async (key: string, ...rest: unknown[]) => {
    if (key === KEY_NAME && fault.on && fault.writes) throw new Error('Keystore not available');
    return (realSet as (...args: unknown[]) => Promise<void>)(key, ...rest);
  });
  await phone.engine.startPhoneCopy();
  return { phone, fault };
}
const keyOnPhone = () => env.secure.get(KEY_NAME);
const signIn = () => SIGN_IN_KEYS.map(key => env.secure.get(key));
const receiptIds = async (phone: Phone) => {
  const db = await phone.copyDb.openCopy((await phone.scope())!);
  return (await db.all<{ id: string }>('SELECT id FROM goodsreceived')).map(r => r.id);
};

describe('a key that stays unreadable, online (WH-365)', () => {
  it('3 failed reads across a restart: the copy is replaced and loaded again, and the person stays signed in', async () => {
    await loadedPhone();
    const oldKey = keyOnPhone();
    const signedIn = signIn();
    env.feed.rows.goodsreceived.push(grnRow('g2')); // arrives while the old copy cannot be read

    const second = await restartWithKeyFault();
    expect(await second.phone.engine.syncNow('open')).toBe('failed'); // 1: first on this run
    const third = await restartWithKeyFault();
    expect(await third.phone.engine.syncNow('open')).toBe('failed'); // 2: fresh start
    expect(keyOnPhone()).toBe(oldKey);
    expect(fakeDatabaseNames()).toHaveLength(1);

    expect(await third.phone.engine.syncNow('open')).toBe('done'); // 3: replaced

    expect(keyOnPhone()).not.toBe(oldKey);
    expect(fakeDatabaseNames()).toHaveLength(1);
    third.fault.on = false;
    expect(await receiptIds(third.phone)).toEqual(['g1', 'g2']); // loaded again from the server
    expect(third.phone.syncStore.getSyncSnapshot().openFailed).toBe(false);
    expect(signIn()).toEqual(signedIn);
    expect(await third.phone.scope()).toEqual(await second.phone.scope());
  });

  it('3 failed reads in one run of the app, none on a fresh start: the copy is kept', async () => {
    await loadedPhone();
    const oldKey = keyOnPhone();
    const files = fakeDatabaseNames();
    const { phone } = await restartWithKeyFault();

    for (let run = 0; run < 5; run++) {
      expect(await phone.engine.syncNow('open')).toBe('failed');
      await jest.advanceTimersByTimeAsync(60_000);
    }

    expect(keyOnPhone()).toBe(oldKey);
    expect(fakeDatabaseNames()).toEqual(files);
    expect(phone.syncStore.getSyncSnapshot().openFailed).toBe(true);
  });

  it('a key that reads in between resets the count: two failures before and one after do not replace the copy', async () => {
    await loadedPhone();
    const oldKey = keyOnPhone();
    const a = await restartWithKeyFault();
    expect(await a.phone.engine.syncNow('open')).toBe('failed');
    const b = await restartWithKeyFault();
    expect(await b.phone.engine.syncNow('open')).toBe('failed');
    const good = bootPhone();
    await good.engine.startPhoneCopy();
    expect(await good.engine.syncNow('open')).toBe('done'); // the key reads: the count goes
    const c = await restartWithKeyFault();

    expect(await c.phone.engine.syncNow('open')).toBe('failed');

    expect(keyOnPhone()).toBe(oldKey);
    expect(c.phone.syncStore.getSyncSnapshot().openFailed).toBe(true);
  });
});

describe('a key that stays unreadable, offline (WH-365)', () => {
  it('offline the copy is never replaced; once the server is reachable and the key still fails, it is', async () => {
    await loadedPhone();
    const oldKey = keyOnPhone();
    const files = fakeDatabaseNames();
    const a = await restartWithKeyFault();
    await setReachable(false);
    await a.phone.engine.syncNow('open');
    const b = await restartWithKeyFault();
    await setReachable(false);
    for (let run = 0; run < 4; run++) {
      await b.phone.engine.syncNow('open');
      await jest.advanceTimersByTimeAsync(60_000);
    }

    expect(keyOnPhone()).toBe(oldKey);
    expect(fakeDatabaseNames()).toEqual(files);

    await setReachable(true);
    expect(await b.phone.engine.syncNow('open')).toBe('done');
    expect(keyOnPhone()).not.toBe(oldKey);
    b.fault.on = false;
    expect(await receiptIds(b.phone)).toEqual(['g1']);
  });
});

describe('erasing the copy for "Sign in again" when its key cannot be read (WH-363)', () => {
  it('removes the file and the key without reading the key, and the next sign-in gets a fresh copy with a new key', async () => {
    await loadedPhone();
    const oldKey = keyOnPhone();
    const { phone, fault } = await restartWithKeyFault();
    const store = require('expo-secure-store') as Store;
    store.getItemAsync.mockClear();

    await phone.copyDb.eraseCopy();

    expect(keyOnPhone()).toBeUndefined();
    expect(fakeDatabaseNames()).toEqual([]);
    expect(store.getItemAsync.mock.calls.map(call => call[0])).not.toContain(KEY_NAME);

    // The person signs in again: the key store answers, and a new empty copy loads from the server.
    fault.on = false;
    const next = bootPhone();
    await next.engine.startPhoneCopy();
    expect(await next.engine.syncNow('open')).toBe('done');
    expect(keyOnPhone()).toBeDefined();
    expect(keyOnPhone()).not.toBe(oldKey);
    expect(await receiptIds(next)).toEqual(['g1']);
  });
});

describe('the new key is written before the old file goes (WH-365)', () => {
  it('a new key that cannot be written leaves the old file and key, and the copy is replaced on a later run', async () => {
    await loadedPhone();
    const oldKey = keyOnPhone();
    const files = fakeDatabaseNames();
    const a = await restartWithKeyFault(true);
    await a.phone.engine.syncNow('open');
    const b = await restartWithKeyFault(true);
    await b.phone.engine.syncNow('open');

    expect(await b.phone.engine.syncNow('open')).toBe('failed'); // 3rd: the replacement cannot write its key

    expect(keyOnPhone()).toBe(oldKey);
    expect(fakeDatabaseNames()).toEqual(files);
    expect(b.phone.syncStore.getSyncSnapshot().openFailed).toBe(true);

    b.fault.writes = false;
    expect(await b.phone.engine.syncNow('open')).toBe('done');
    expect(keyOnPhone()).not.toBe(oldKey);
  });
});
