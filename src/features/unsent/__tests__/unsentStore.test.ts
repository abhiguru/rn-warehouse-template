/**
 * WH-301 slice 1 (product/tech/app-offline-unsent-work.md sections 1, 2, 3 and 12 "Store (S)"): the unsent file, kept apart
 * from the phone copy, surviving a kill, and erased by nothing but what section 1 lists. Test first: nothing is built.
 *
 * Real: src/features/unsent (the store, queue and schema), the copy's database code, the session-scoped registry and
 * `clearSessionScopedState`. Faked at the edge: expo-sqlite (Node's SQLite), secure-store, expo-file-system, NetInfo,
 * AppState, the signed-in person. Nothing here asks whether the unsent file is encrypted (open question with the owner).
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract does not give; marked ASSUMED in src/tests/unsent/unsentPhone.ts) =====
 *  - `initUnsent()` in unsentStore.ts loads the file and the snapshot (the contract says "after the store loads").
 *  - The row view of `listItems()` carries `id` and `state`; the file's name contains `unsent-work`.
 *  - A save of a record needs a kind in the registry: the tests register one (`registerSendKind`).
 * =====================================================================================================================
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { failStatement, fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, bootUnsent as bootUnsentRaw, clearPlannedFailures, keptPhotoFiles, rawRows, restart as restartRaw, server, unsentFileNames } from '@/tests/unsent/unsentPhone';

// A kill or a new boot replaces the modules; the session of the ones being left ends first, so a retry they armed does not
// fire and log after the file is torn down.
const endSession = () => (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
const bootUnsent: typeof bootUnsentRaw = async (...args) => { endSession(); return bootUnsentRaw(...args); };
const restart: typeof restartRaw = async () => { endSession(); return restartRaw(); };

jest.mock('@/lib/queryClient', () => ({ queryClient: { cancelQueries: jest.fn(async () => {}), clear: jest.fn() } }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ clearItemRatesCache: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ clearStandardRateCache: jest.fn() }));
jest.mock('@/services/autocomplete-service', () => ({ clearAutocompleteCache: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/config/lanPhotos', () => ({ sweepLanPhotos: jest.fn(async () => {}) }));
jest.mock('expo-image', () => ({ Image: { clearDiskCache: jest.fn(async () => true), clearMemoryCache: jest.fn(async () => true) } }));

const record = (what = 'GRN for Asha Fictional Traders') => ({ kind: 'testRecord', body: { lines: [{ item: 'Potato', bags: 40 }] }, what, customer: 'Asha Fictional Traders' });

beforeEach(() => { resetEnv(); files.reset(); server.reset(); });
afterEach(async () => {
  // End the session the test's own modules hold: a pass that ended with a transient answer has armed a retry, and that retry
  // must not fire and log after the file is torn down.
  (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
  await new Promise(resolve => setTimeout(resolve, 50));
  await eraseEverything();
});

async function phoneWith(...saves: ReturnType<typeof record>[]) {
  const phone = await bootUnsent();
  phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'transient' }) });
  await phone.store.initUnsent();
  const made = [];
  for (const save of saves) made.push(await phone.queue.enqueue(save));
  return { phone, made };
}

describe('S1: what is saved is still there', () => {
  it('after the app is killed and opened again, the item is listed with its request key and its place in the order', async () => {
    const { made } = await phoneWith(record(), record('Dispatch for Bina Fictional Stores'));
    const next = await restart();
    next.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'transient' }) });
    const items = await next.queue.listItems();
    expect(items.map(i => i.id)).toEqual(made.map(m => m.id));
    expect(items.every(i => i.state === 'saved')).toBe(true);
    const rows = await rawRows<{ id: string; request_key: string; seq: number }>('items', 'ORDER BY seq');
    expect(rows.map(r => r.request_key)).toEqual(made.map(m => m.requestKey));
    expect(rows[0].seq).toBeLessThan(rows[1].seq);
  });

  it('the phone copy being erased (eraseCopy) leaves the unsent file and its items', async () => {
    const { phone, made } = await phoneWith(record());
    await phone.phone.copyDb.eraseCopy();
    expect(unsentFileNames()).toHaveLength(1);
    const next = await restart();
    expect((await next.queue.listItems()).map(i => i.id)).toEqual([made[0].id]);
  });

  it('every session teardown (sign-out, forced sign-out, facility switch, account removal run clearSessionScopedState) leaves it', async () => {
    const { made } = await phoneWith(record());
    const { clearSessionScopedState } = require('@/store/sessionScopedState') as typeof import('@/store/sessionScopedState');
    await clearSessionScopedState(jest.fn());
    expect(unsentFileNames()).toHaveLength(1);
    const next = await restart();
    expect((await next.queue.listItems()).map(i => i.id)).toEqual([made[0].id]);
  });

  it('the unsent file, its rows, forms and photo files are never cleared with the session (section 1): only shown flags are registered, and running the registry leaves the saved work', async () => {
    const { phone } = await phoneWith();
    // Registrations that only reset a flag the screens show are allowed, and named: nothing of the store, rows, forms or files.
    const SHOWN_FLAGS_ONLY = ['unsent-sending-flag', 'facility-write-seen-while-quiet'];
    expect(phone.phone.registry.registeredSessionScopedNames().filter(name => /unsent/i.test(name) && !SHOWN_FLAGS_ONLY.includes(name))).toEqual([]);

    // The registry's teardown, as sign-out, a facility switch and account removal run it: the saved item, its photo, the form and the form's photo stay.
    const saved = await phone.queue.enqueue({ ...record(), photos: [{ file: addPhoto('item.jpg'), role: 'goods' }] });
    const { saveFormDraft, loadFormDraft } = require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
    expect(await saveFormDraft({ kind: 'grn', state: { header: { gr_images: [{ uri: addPhoto('form.jpg') }] }, items: [] } })).toBe(true);
    const filesBefore = keptPhotoFiles().sort();
    expect(filesBefore).toHaveLength(2);

    await phone.phone.registry.runSessionScopedClears({ dispatch: () => undefined });

    expect((await rawRows<{ id: string }>('items')).map(row => row.id)).toEqual([saved.id]);
    expect(await rawRows('item_photos')).toHaveLength(1);
    expect(await rawRows('forms')).toHaveLength(1);
    expect(await loadFormDraft('grn')).not.toBeNull();
    expect(keptPhotoFiles().sort()).toEqual(filesBefore);
  });

  it('is a different file from the phone copy, so the copy and the unsent work never share a database', async () => {
    const { phone } = await phoneWith(record());
    await phone.phone.copyDb.openCopy((await phone.phone.scope())!);
    const names = fakeDatabaseNames();
    expect(names.filter(n => n.includes('unsent-work'))).toHaveLength(1);
    expect(names.filter(n => !n.includes('unsent-work'))).toHaveLength(1);
  });
});

describe('S2: the backup rule', () => {
  it('excludes unsent-work/ from cloud backup and from device transfer, both the Android 12 and the older rules', async () => {
    const written = new Map<string, string>();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wh301-'));
    jest.isolateModules(() => {
      jest.doMock('@expo/config-plugins', () => ({
        AndroidConfig: { Manifest: { getMainApplicationOrThrow: () => ({ $: {} }) } },
        withAndroidManifest: (config: unknown) => config,
        withDangerousMod: (_config: unknown, [, run]: [string, (c: unknown) => Promise<unknown>]) =>
          run({ modRequest: { platformProjectRoot: root } }),
      }));
      (require('../../../../plugins/with-data-extraction-rules.js') as (c: unknown) => unknown)({});
    });
    await new Promise(resolve => setImmediate(resolve));
    const dir = path.join(root, 'app', 'src', 'main', 'res', 'xml');
    for (const name of ['data_extraction_rules.xml', 'backup_rules.xml']) written.set(name, fs.readFileSync(path.join(dir, name), 'utf8'));
    expect(written.get('data_extraction_rules.xml')!.match(/<exclude domain="file" path="unsent-work\/" \/>/g)).toHaveLength(2);
    expect(written.get('backup_rules.xml')).toContain('<exclude domain="file" path="unsent-work/" />');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('S3: a file that cannot be read is never erased', () => {
  const breakOpen = () => { for (let i = 0; i < 40; i += 1) failStatement(/./, new Error('database disk image is malformed')); };

  it('keeps the file, answers that work is blocked and the count unknown, and gives the work back once the file reads again', async () => {
    const { made } = await phoneWith(record());
    breakOpen();
    const next = await bootUnsent();
    await next.store.initUnsent();
    expect(unsentFileNames()).toHaveLength(1);
    expect(next.gate.accountActionAllowed()).toEqual({ ok: false, count: null });
    const gate = next.gate.canStartWork();
    expect(gate.ok).toBe(false);
    clearPlannedFailures();
    const again = await restart();
    expect((await again.queue.listItems()).map(i => i.id)).toEqual([made[0].id]);
    expect(again.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
  });

  it('does not run the erase of the copy over it, nor clearSessionScopedState', async () => {
    await phoneWith(record());
    breakOpen();
    const next = await bootUnsent();
    await next.store.initUnsent();
    const { clearSessionScopedState } = require('@/store/sessionScopedState') as typeof import('@/store/sessionScopedState');
    await clearSessionScopedState(jest.fn());
    expect(unsentFileNames()).toHaveLength(1);
  });
});

describe('S4: a save with photos is one step', () => {
  it('moves the photo files into the unsent folder and keeps one row per photo', async () => {
    const { phone } = await phoneWith();
    const a = addPhoto('a.jpg');
    const b = addPhoto('b.jpg');
    const { id } = await phone.queue.enqueue({ ...record(), photos: [{ file: a, role: 'receipt' }, { file: b, role: 'goods' }] });
    expect(files.held.has(a)).toBe(false);
    expect(files.held.has(b)).toBe(false);
    expect(keptPhotoFiles()).toHaveLength(2);
    expect((await rawRows<{ item_id: string }>('item_photos')).map(r => r.item_id)).toEqual([id, id]);
  });

  it('a failure while writing the photo rows leaves no item, no photo row and no moved file', async () => {
    const { phone } = await phoneWith();
    const a = addPhoto('a.jpg');
    failStatement(/INSERT INTO item_photos/i, new Error('SQLITE_FULL'));
    await expect(phone.queue.enqueue({ ...record(), photos: [{ file: a, role: 'receipt' }] })).rejects.toThrow();
    expect(await rawRows('items')).toEqual([]);
    expect(await rawRows('item_photos')).toEqual([]);
    expect(keptPhotoFiles()).toEqual([]);
    expect(files.held.has(a)).toBe(true);
  });

  it('a double tap on Save asks for one item per call, and each item has its own request key', async () => {
    const { phone } = await phoneWith();
    const [first, second] = await Promise.all([phone.queue.enqueue(record()), phone.queue.enqueue(record())]);
    expect(first.id).not.toBe(second.id);
    expect(first.requestKey).not.toBe(second.requestKey);
    expect(first.requestKey).toMatch(/^warehouse-testRecord-[0-9a-f-]{36}$/);
  });
});

describe('S5: deleting', () => {
  it('removes the item, the items that wait for it and their photo files, together', async () => {
    const { phone, made } = await phoneWith(record());
    const photo = addPhoto('a.jpg');
    await phone.queue.enqueue({ ...record('Photos of that GRN'), kind: 'testRecord', dependsOn: made[0].id, photos: [{ file: photo, role: 'goods' }] });
    const keep = await phone.queue.enqueue(record('Another, independent'));
    await phone.queue.deleteItem(made[0].id);
    expect((await phone.queue.listItems()).map(i => i.id)).toEqual([keep.id]);
    expect(await rawRows('item_photos')).toEqual([]);
    expect(keptPhotoFiles()).toEqual([]);
  });

  it("another person's rows cannot be deleted by this person", async () => {
    const { made } = await phoneWith(record());
    env.subject = 'user-2';
    const other = await restart();
    await other.queue.deleteItem(made[0].id);
    expect((await rawRows('items')).map(r => r.id)).toEqual([made[0].id]);
    expect(await other.queue.listItems()).toEqual([]);
  });

  it("another person's items are listed only as a name and a count, never as rows", async () => {
    await phoneWith(record(), record());
    env.subject = 'user-2';
    const other = await restart();
    expect(await other.queue.listItems()).toEqual([]);
    const people = await other.queue.otherPeople();
    expect(people).toHaveLength(1);
    expect(people[0].count).toBe(2);
  });
});

describe('S6: sent rows', () => {
  it('stay listed with their number through the day and leave on the next business day', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-26T10:00:00+05:30') });
    try {
      const phone = await bootUnsent();
      phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'sent', result: { number: 'GRN 312' } }) });
      await phone.store.initUnsent();
      const { id } = await phone.queue.enqueue(record());
      await phone.engine.sendNow('send-now');
      expect((await phone.queue.listItems()).find(i => i.id === id)?.state).toBe('sent');
      jest.setSystemTime(new Date('2026-11-26T23:30:00+05:30'));
      await phone.engine.sendNow('foreground');
      expect((await phone.queue.listItems()).find(i => i.id === id)?.state).toBe('sent');
      jest.setSystemTime(new Date('2026-11-27T00:30:00+05:30'));
      await phone.engine.sendNow('foreground');
      expect((await phone.queue.listItems()).find(i => i.id === id)).toBeUndefined();
      expect(await rawRows('items')).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('S7: the file is not encrypted (owner, 2026-11-26)', () => {
  it('uses no key: nothing is written to secure storage and no PRAGMA key is sent for it', async () => {
    const { statementLog } = require('@/tests/phoneCopy/fakeExpoSqlite') as typeof import('@/tests/phoneCopy/fakeExpoSqlite');
    await phoneWith(record());
    expect(env.secureWrites).toEqual([]);
    expect(statementLog().filter(sql => /PRAGMA\s+key/i.test(sql))).toEqual([]);
  });

  it('keeps photos in the app-private documents folder, under unsent-work/photos/', async () => {
    const { phone } = await phoneWith();
    await phone.queue.enqueue({ ...record(), photos: [{ file: addPhoto('a.jpg'), role: 'goods' }] });
    expect(keptPhotoFiles()).toHaveLength(1);
    expect(keptPhotoFiles()[0].startsWith('file:///phone/documents/unsent-work/photos/')).toBe(true);
    expect(unsentFileNames()).toHaveLength(1);
  });
});
