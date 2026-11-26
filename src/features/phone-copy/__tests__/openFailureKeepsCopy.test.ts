/**
 * WH-355 and WH-364: the phone copy is erased only for a file SQLite proves unreadable with a key that was read. A key
 * that cannot be read or written, a database that will not open, a full disk or any other passing error keeps the copy
 * and tries again, online or offline, however long it lasts; failures while offline never count toward anything. A new
 * key is written before the old file goes.
 *
 * Real: copyKey, copyDriver, copySchema, copyDb, the sync engine and its store, the session-scoped registry. Faked at
 * the edge: `expo-sqlite`, `expo-secure-store` (a map that fails on request), `expo-file-system`, NetInfo, AppState, the
 * signed-in person and the server's sync answers (src/tests/phoneCopy/phoneEnv.ts).
 *
 * Not covered here: Product's condition that the lists still load from the server while the copy cannot open. That
 * routing (WH-299's `copyRoute`) is not on this branch.
 */
import { bootPhone, env, eraseEverything, resetEnv, setReachable, type Phone } from '@/tests/phoneCopy/phoneEnv';
import { failStatement, fakeDatabaseNames, statementLog } from '@/tests/phoneCopy/fakeExpoSqlite';
import { grnRow } from '@/tests/phoneCopy/fakeFeed';

jest.mock('@/lib/queryClient', () => ({ queryClient: { cancelQueries: jest.fn(async () => {}), clear: jest.fn() } }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ clearItemRatesCache: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ clearStandardRateCache: jest.fn() }));
jest.mock('@/services/autocomplete-service', () => ({ clearAutocompleteCache: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/config/lanPhotos', () => ({ sweepLanPhotos: jest.fn(async () => {}) }));
jest.mock('expo-image', () => ({ Image: { clearDiskCache: jest.fn(async () => true), clearMemoryCache: jest.fn(async () => true) } }));

const KEY_NAME = 'secure_phone_copy_key';
const SCOPE_A = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-1']);
const SCOPE_B = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-2']);

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-11-26T07:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
  resetEnv();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

/** A phone with a finished load of one receipt, then the app killed and started again. */
async function loadedThenRestarted(): Promise<Phone> {
  env.feed.rows.goodsreceived.push(grnRow('g1'));
  const first = bootPhone();
  await first.engine.startPhoneCopy();
  expect(await first.engine.syncNow('open')).toBe('done');
  return bootPhone();
}

type Store = { getItemAsync: jest.Mock; setItemAsync: jest.Mock };
/** The secure store of the booted app: the copy key's reads (or writes) fail while `fault.on` is true. */
function keyFault(kind: 'read' | 'write') {
  const store = require('expo-secure-store') as Store;
  const fault = { on: true };
  const method = kind === 'read' ? store.getItemAsync : store.setItemAsync;
  const real = method.getMockImplementation()!;
  method.mockImplementation(async (key: string, ...rest: unknown[]) => {
    if (key === KEY_NAME && fault.on) throw new Error('Keystore not available');
    return real(key, ...rest);
  });
  return fault;
}
const keyOnPhone = () => env.secure.get(KEY_NAME);
const receiptIds = async (phone: Phone) => {
  const db = await phone.copyDb.openCopy((await phone.scope())!);
  return (await db.all<{ id: string }>('SELECT id FROM goodsreceived')).map(r => r.id);
};
const minutes = (n: number) => jest.advanceTimersByTimeAsync(n * 60_000);

describe('a key that cannot be read keeps the copy (WH-355)', () => {
  it('online, however many runs and however long: the file and key stay, and the copy reads again once the store answers', async () => {
    const phone = await loadedThenRestarted();
    const key = keyOnPhone();
    const files = fakeDatabaseNames();
    const fault = keyFault('read');
    await phone.engine.startPhoneCopy();
    const keyWritesBefore = env.secureWrites.filter(w => w.key === KEY_NAME).length;

    for (let run = 0; run < 8; run++) {
      expect(await phone.engine.syncNow('open')).toBe('failed');
      await minutes(1);
    }

    expect(fakeDatabaseNames()).toEqual(files);
    expect(keyOnPhone()).toBe(key);
    expect(env.secureWrites.filter(w => w.key === KEY_NAME)).toHaveLength(keyWritesBefore);
    expect(phone.syncStore.getSyncSnapshot().openFailed).toBe(true);

    fault.on = false;
    expect(await phone.engine.syncNow('open')).toBe('done');
    expect(await receiptIds(phone)).toEqual(['g1']);
  });

  it('offline failures and one after reconnecting keep the copy (WH-364)', async () => {
    const phone = await loadedThenRestarted();
    const key = keyOnPhone();
    const files = fakeDatabaseNames();
    const fault = keyFault('read');
    await phone.engine.startPhoneCopy();
    await setReachable(false);
    for (let run = 0; run < 6; run++) {
      await phone.engine.syncNow('open');
      await minutes(1);
    }
    await setReachable(true);
    expect(await phone.engine.syncNow('open')).toBe('failed');

    expect(fakeDatabaseNames()).toEqual(files);
    expect(keyOnPhone()).toBe(key);
    fault.on = false;
    expect(await phone.engine.syncNow('open')).toBe('done');
    expect(await receiptIds(phone)).toEqual(['g1']);
  });

  it('a file that looks corrupt while the key could not be read is not opened, and the copy stays', async () => {
    const phone = await loadedThenRestarted();
    const key = keyOnPhone();
    const fault = keyFault('read');
    failStatement(/sqlite_master/, Object.assign(new Error('file is not a database'), { code: 'ERR_SQLITE_NOTADB' }));
    await phone.engine.startPhoneCopy();
    const statementsBefore = statementLog().length;

    expect(await phone.engine.syncNow('open')).toBe('failed');

    expect(statementLog().slice(statementsBefore).filter(sql => /sqlite_master/.test(sql))).toEqual([]);
    expect(fakeDatabaseNames()).toHaveLength(1);
    expect(keyOnPhone()).toBe(key);
    fault.on = false;
  });
});

describe('a copy that cannot be opened for another reason is kept and tried again (WH-355)', () => {
  it.each([
    ['online', true],
    ['offline', false],
  ])('%s: a database that will not open, for minutes of runs, is never replaced; the bar can offer Try again', async (_label, online) => {
    const phone = await loadedThenRestarted();
    const key = keyOnPhone();
    const files = fakeDatabaseNames();
    for (let i = 0; i < 10; i++) failStatement(/sqlite_master/, new Error("database is locked"));
    await phone.engine.startPhoneCopy();
    await setReachable(online);

    for (let run = 0; run < 6; run++) {
      await phone.engine.syncNow('open');
      await minutes(1);
    }

    expect(fakeDatabaseNames()).toEqual(files);
    expect(keyOnPhone()).toBe(key);
    expect(phone.syncStore.getSyncSnapshot().openFailed).toBe(true);
    await setReachable(true);
    let outcome = await phone.engine.syncNow('open'); // the planned failures run out, and the next run opens it
    for (let again = 0; again < 10 && outcome !== 'done'; again++) {
      await minutes(1);
      outcome = await phone.engine.syncNow('open');
    }
    expect(outcome).toBe('done');
    expect(await receiptIds(phone)).toEqual(['g1']);
  });
});

describe('a file proven unreadable with a key that was read is erased at once', () => {
  it('on its first open, a new empty copy with a new key is made and loaded again', async () => {
    const phone = await loadedThenRestarted();
    const oldKey = keyOnPhone();
    failStatement(/sqlite_master/, Object.assign(new Error('file is not a database'), { code: 'ERR_SQLITE_NOTADB' }));
    await phone.engine.startPhoneCopy();

    expect(await phone.engine.syncNow('open')).toBe('done');

    expect(keyOnPhone()).not.toBe(oldKey);
    expect(await receiptIds(phone)).toEqual(['g1']); // loaded again from the server
  });
});

describe('the new key is written before the old file goes (WH-355)', () => {
  it('a key that cannot be written leaves the old copy and its key, and it reads again afterwards', async () => {
    const first = bootPhone();
    const db = await first.copyDb.openCopy(SCOPE_A);
    await db.run("INSERT OR REPLACE INTO meta(k, v) VALUES ('marker', 'kept')");
    const key = keyOnPhone();
    const files = fakeDatabaseNames();
    const second = bootPhone();
    const fault = keyFault('write');

    // Another person opens the phone: the copy must be replaced, and the new key cannot be stored.
    await expect(second.copyDb.openCopy(SCOPE_B)).rejects.toThrow();

    expect(fakeDatabaseNames()).toEqual(files);
    expect(keyOnPhone()).toBe(key);
    fault.on = false;
    const again = bootPhone();
    const reopened = await again.copyDb.openCopy(SCOPE_A);
    expect(await reopened.all("SELECT v FROM meta WHERE k = 'marker'")).toEqual([{ v: 'kept' }]);
  });

  it('when the key is written, the old file is replaced by an empty copy of the new scope', async () => {
    const first = bootPhone();
    const db = await first.copyDb.openCopy(SCOPE_A);
    await db.run("INSERT OR REPLACE INTO meta(k, v) VALUES ('marker', 'kept')");
    const key = keyOnPhone();
    const second = bootPhone();

    const next = await second.copyDb.openCopy(SCOPE_B);

    expect(await next.all("SELECT v FROM meta WHERE k = 'marker'")).toEqual([]);
    expect(keyOnPhone()).not.toBe(key);
    expect(fakeDatabaseNames()).toHaveLength(1);
  });
});
