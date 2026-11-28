/**
 * WH-298, spec A step 4 and step 26, decision 7 (contract sections 4 and 5; T7, T8, T9, T11, T12, T13, T14): the key,
 * the one encrypted file per server and person, and its erasure with the session. T10 (no plain header on the device)
 * and T56 (the files are gone on the phone) are device checks.
 *
 * Real: copyKey, copyDriver, copySchema, copyDb, syncStore, the session-scoped registry and `clearSessionScopedState`.
 * Faked at the edge: `expo-sqlite`, `expo-secure-store`, `expo-file-system` (see tests/phoneEnv.ts).
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives; the open points are marked) =====
 *  - `@/features/phone-copy/copyKey`: `loadCopyKey()`, `makeCopyKey(scope)`, `forgetCopyKey()` (never throws);
 *    secure-store key `secure_phone_copy_key`, JSON `{scope, keyHex}`, option `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
 *  - `@/features/phone-copy/copyDb`: `openCopy(scope): Promise<CopyDriver>` (the handle; `all(sql, params)` as the contract's
 *    `CopyDriver`), `eraseCopy()` (never throws). Tables `meta(k, v)` with keys `schema_version`, `scope`, `phase`.
 *  - The first statement on a new connection is `PRAGMA key = "x'<keyHex>'"` (contract 4.2).
 *  - `deleteCopyFile` removes the database through expo-sqlite's `deleteDatabaseAsync` (the fake's file list is what is checked).
 *  - `@/features/phone-copy/syncStore`: `getSyncSnapshot().phase` is 'empty' after an erase.
 *  - `clearSessionScopedState(dispatch)` (src/store/sessionScopedState.ts) runs the entry registered as `phone-copy`.
 * ===========================================================================================
 */
import { bootPhone, env, eraseEverything, resetEnv, type Phone } from '@/tests/phoneCopy/phoneEnv';
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

beforeEach(() => { resetEnv(); });
afterEach(async () => { await eraseEverything(); });

const marker = async (phone: Phone, scope: string) => {
  const db = await phone.copyDb.openCopy(scope);
  await db.run("INSERT OR REPLACE INTO meta(k, v) VALUES ('marker', 'kept')");
};
const hasMarker = async (phone: Phone, scope: string) => {
  const db = await phone.copyDb.openCopy(scope);
  return (await db.all<{ v: string }>("SELECT v FROM meta WHERE k = 'marker'")).length === 1;
};

describe('T7: the key', () => {
  it('is 32 random bytes as 64 lower-case hex, kept in secure storage readable only while unlocked and never moved to another device', async () => {
    const phone = bootPhone();
    const made = await phone.copyKey.makeCopyKey(SCOPE_A);
    expect(made.keyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(made.scope).toBe(SCOPE_A);
    const write = env.secureWrites.find(w => w.key === KEY_NAME)!;
    expect(JSON.parse(write.value)).toEqual({ scope: SCOPE_A, keyHex: made.keyHex });
    expect(write.options).toMatchObject({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    expect(await phone.copyKey.loadCopyKey()).toEqual(made);
  });

  it('a second copy gets a different key, and replaces the first', async () => {
    const phone = bootPhone();
    const first = await phone.copyKey.makeCopyKey(SCOPE_A);
    const second = await phone.copyKey.makeCopyKey(SCOPE_A);
    expect(second.keyHex).not.toBe(first.keyHex);
    expect((await phone.copyKey.loadCopyKey())?.keyHex).toBe(second.keyHex);
  });

  it('forgetCopyKey removes it and never throws, even when secure storage fails', async () => {
    const phone = bootPhone();
    await phone.copyKey.makeCopyKey(SCOPE_A);
    await phone.copyKey.forgetCopyKey();
    expect(await phone.copyKey.loadCopyKey()).toBeNull();
    const SecureStore = require('expo-secure-store') as { deleteItemAsync: jest.Mock };
    SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keystore locked'));
    await expect(phone.copyKey.forgetCopyKey()).resolves.toBeUndefined();
  });
});

describe('T8, T9: opening the copy', () => {
  it('opens an empty copy for this scope, with a new key, schema version and scope recorded, phase empty', async () => {
    const phone = bootPhone();
    const db = await phone.copyDb.openCopy(SCOPE_A);
    const meta = Object.fromEntries((await db.all<{ k: string; v: string }>('SELECT k, v FROM meta')).map(r => [r.k, r.v]));
    expect(meta).toMatchObject({ scope: SCOPE_A, phase: 'empty' });
    expect(Number(meta.schema_version)).toBeGreaterThanOrEqual(1);
    expect(await phone.copyKey.loadCopyKey()).toMatchObject({ scope: SCOPE_A });
    expect(fakeDatabaseNames()).toHaveLength(1);
  });

  it('the first statement on a new connection is PRAGMA key with the stored key', async () => {
    const phone = bootPhone();
    await phone.copyDb.openCopy(SCOPE_A);
    const key = await phone.copyKey.loadCopyKey();
    expect(statementLog()[0]).toBe(`PRAGMA key = "x'${key!.keyHex}'"`);
  });

  it('keeps the copy and its key when the same scope opens again (after a kill)', async () => {
    const first = bootPhone();
    await first.copyDb.openCopy(SCOPE_A);
    await marker(first, SCOPE_A);
    const key = await first.copyKey.loadCopyKey();
    const second = bootPhone();
    expect(await hasMarker(second, SCOPE_A)).toBe(true);
    expect((await second.copyKey.loadCopyKey())?.keyHex).toBe(key!.keyHex);
  });

  it('another person (another scope) never reads the copy: it is erased and a new empty one made with a new key', async () => {
    const first = bootPhone();
    await first.copyDb.openCopy(SCOPE_A);
    await marker(first, SCOPE_A);
    const oldKey = (await first.copyKey.loadCopyKey())!.keyHex;
    const second = bootPhone();
    expect(await hasMarker(second, SCOPE_B)).toBe(false);
    expect((await second.copyKey.loadCopyKey())).toMatchObject({ scope: SCOPE_B });
    expect((await second.copyKey.loadCopyKey())!.keyHex).not.toBe(oldKey);
  });

  it('a file with no key (the key was lost) is erased and a new empty copy made', async () => {
    const first = bootPhone();
    await first.copyDb.openCopy(SCOPE_A);
    await marker(first, SCOPE_A);
    env.secure.delete(KEY_NAME);
    const second = bootPhone();
    expect(await hasMarker(second, SCOPE_A)).toBe(false);
    expect(await second.copyKey.loadCopyKey()).toMatchObject({ scope: SCOPE_A });
  });

  it('a file that does not open (wrong key, corrupt, or restored from a backup) is erased and replaced by an empty copy with a new key', async () => {
    const first = bootPhone();
    await first.copyDb.openCopy(SCOPE_A);
    await marker(first, SCOPE_A);
    const oldKey = (await first.copyKey.loadCopyKey())!.keyHex;
    failStatement(/sqlite_master/, Object.assign(new Error('file is not a database'), { code: 'ERR_SQLITE_NOTADB' }));
    const second = bootPhone();
    await second.copyDb.openCopy(SCOPE_A);
    expect(await hasMarker(second, SCOPE_A)).toBe(false);
    expect((await second.copyKey.loadCopyKey())!.keyHex).not.toBe(oldKey);
  });

  it('a copy made by another schema version (an app update changed the phone\'s schema) is erased, not read', async () => {
    const first = bootPhone();
    const db = await first.copyDb.openCopy(SCOPE_A);
    await marker(first, SCOPE_A);
    await db.run("UPDATE meta SET v = '0' WHERE k = 'schema_version'");
    const second = bootPhone();
    expect(await hasMarker(second, SCOPE_A)).toBe(false);
  });

  it('a copy whose recorded scope is not the one asked for is erased even if the key says otherwise', async () => {
    const first = bootPhone();
    const db = await first.copyDb.openCopy(SCOPE_A);
    await marker(first, SCOPE_A);
    await db.run("UPDATE meta SET v = ? WHERE k = 'scope'", [SCOPE_B]);
    const second = bootPhone();
    expect(await hasMarker(second, SCOPE_A)).toBe(false);
  });
});

describe('T11, T13: erasing with the session (spec step 26, decision 7)', () => {
  async function loadedPhone() {
    filterKeptFeed();
    env.feed.rows.goodsreceived.push(grnRow('g1'));
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    expect(await phone.engine.syncNow('open')).toBe('done');
    return phone;
  }

  it('"phone-copy" is registered with the session teardown (and without onGenerationChange)', async () => {
    const phone = bootPhone();
    require('@/store/sessionScopedState');
    expect(phone.registry.registeredSessionScopedNames()).toContain('phone-copy');
  });

  it('clearSessionScopedState deletes the file, its key, and returns the published state to empty', async () => {
    const phone = await loadedPhone();
    expect(phone.syncStore.getSyncSnapshot().phase).toBe('ready');
    const { clearSessionScopedState } = require('@/store/sessionScopedState') as typeof import('@/store/sessionScopedState');
    await clearSessionScopedState(jest.fn());
    expect(fakeDatabaseNames()).toEqual([]);
    expect(env.secure.has(KEY_NAME)).toBe(false);
    expect(phone.syncStore.getSyncSnapshot().phase).toBe('empty');
  });

  it.each([
    ['sign-out', 'user-1'], ['forced sign-out', 'user-1'], ['account deletion', 'user-1'], ['leaving the facility or a server switch', 'user-1'],
  ])('%s (they all run the same teardown) leaves no copy for the next person', async (_name, subject) => {
    env.subject = subject;
    const phone = await loadedPhone();
    const { clearSessionScopedState } = require('@/store/sessionScopedState') as typeof import('@/store/sessionScopedState');
    await clearSessionScopedState(jest.fn());
    env.subject = 'user-2';
    const next = bootPhone();
    const db = await next.copyDb.openCopy((await next.scope())!);
    expect(await db.all('SELECT id FROM goodsreceived')).toEqual([]);
    expect(phone).toBeDefined();
  });

  it('eraseCopy never throws, even with nothing on the phone', async () => {
    const phone = bootPhone();
    await expect(phone.copyDb.eraseCopy()).resolves.toBeUndefined();
  });

  it('T12: an erase while a page is being written ends it first (the write finishes or rolls back), then the file is gone and nothing is written after', async () => {
    filterKeptFeed();
    env.feed.rows.goodsreceived.push(grnRow('g1'));
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'grn_lock');
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    const run = phone.engine.syncNow('open');
    await gate.opened;
    const erase = phone.copyDb.eraseCopy();
    gate.release();
    await erase;
    await run;
    expect(fakeDatabaseNames()).toEqual([]);
    const writesAfter = statementLog().length;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(statementLog().length).toBe(writesAfter);
  });
});

const DROPPED_ENTITIES = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);
function filterKeptFeed() {
  const rpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') {
      return { ...answer, data: { ...data, entities: (data.entities as string[]).filter(e => !DROPPED_ENTITIES.has(e)) } };
    }
    if (name === 'get_sync_checksums') {
      return { ...answer, data: { ...data, entities: (data.entities as Array<{ e: string }>).filter(e => !DROPPED_ENTITIES.has(e.e)) } };
    }
    return answer;
  };
}

describe('T14: a token refresh is not a new person', () => {
  it('a refresh (session generation advances, same scope) neither erases the copy nor stops a run', async () => {
    filterKeptFeed();
    env.feed.rows.goodsreceived.push(grnRow('g1'));
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'grn_lock');
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    const run = phone.engine.syncNow('open');
    await gate.opened;
    (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
    gate.release();
    expect(await run).toBe('done');
    expect(fakeDatabaseNames()).toHaveLength(1);
    expect(phone.syncStore.getSyncSnapshot().phase).toBe('ready');
  });

  it('a change of scope (another person) stops the run before its next write, and writes nothing for the new person', async () => {
    filterKeptFeed();
    env.feed.rows.goodsreceived.push(grnRow('g1'));
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'grn_lock');
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    const run = phone.engine.syncNow('open');
    await gate.opened;
    env.subject = 'user-2';
    gate.release();
    expect(await run).toBe('stopped');
    const db = await phone.copyDb.openCopy(SCOPE_B);
    expect(await db.all('SELECT id FROM goodsreceived')).toEqual([]);
  });
});
