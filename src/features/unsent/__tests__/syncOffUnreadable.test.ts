/**
 * WH-396 (Product 2026-11-28): with the offline feature off, an unsent file that cannot be opened refuses sign-out, leaving
 * and switching only when the phone knows items of this person were waiting when it last read the file; removing the account
 * is refused whenever the file exists; a phone with no unsent file never creates one and refuses nothing.
 *
 * Real: the unsent store, queue, gate and send engine. Faked at the edge: expo-sqlite (Node's SQLite, with the database
 * folder named so the app can tell whether the file exists), the phone's files, AsyncStorage (one map that survives a kill),
 * NetInfo, AppState, the signed-in person.
 */
import { env, eraseEverything, mockFactories, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { failStatement } from '@/tests/phoneCopy/fakeExpoSqlite';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { bootUnsent, clearPlannedFailures, server, unsentFileNames, type UnsentPhone } from '@/tests/unsent/unsentPhone';

// AsyncStorage survives a kill, as on a phone.
jest.mock('@react-native-async-storage/async-storage', () => {
  const holder = globalThis as unknown as { __keptStorage?: Map<string, string> };
  const kept = (holder.__keptStorage ??= new Map<string, string>());
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => kept.get(key) ?? null,
      setItem: async (key: string, value: string) => { kept.set(key, value); },
      removeItem: async (key: string) => { kept.delete(key); },
      getAllKeys: async () => [...kept.keys()],
      multiGet: async (keys: string[]) => keys.map(key => [key, kept.get(key) ?? null]),
      multiSet: async (pairs: [string, string][]) => { for (const [key, value] of pairs) kept.set(key, value); },
      multiRemove: async (keys: string[]) => { for (const key of keys) kept.delete(key); },
    },
  };
});
const storage = () => (globalThis as unknown as { __keptStorage: Map<string, string> }).__keptStorage;

const FOLDER = '/phone/sqlite';
const realSqlite = mockFactories.sqlite;
beforeAll(() => {
  mockFactories.sqlite = () => {
    const sqlite = realSqlite();
    return {
      ...sqlite,
      defaultDatabaseDirectory: FOLDER,
      openDatabaseAsync: async (name: string) => {
        const db = await sqlite.openDatabaseAsync(name);
        files.held.set(`file://${FOLDER}/${name}`, 1);
        return db;
      },
    };
  };
});
afterAll(() => { mockFactories.sqlite = realSqlite; });

const ACTIONS = ['signOut', 'leaveFacility', 'switchFacility', 'deleteAccount'] as const;
const waits = { kind: 'testRecord', body: {}, what: 'New GRN', customer: 'asha Traders' };

async function boot(sync: boolean): Promise<UnsentPhone> {
  (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
  const phone = await bootUnsent({ sync });
  phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'transient' }) });
  await phone.store.initUnsent();
  return phone;
}
const gate = (phone: UnsentPhone) => phone.gate as unknown as typeof import('@/features/unsent/workGate');
const answers = (phone: UnsentPhone) => ACTIONS.map(action => gate(phone).accountActionAllowed(action));
const refresh = () => (require('@/features/unsent/unsentStore') as typeof import('@/features/unsent/unsentStore')).refreshUnsent();
const line = (phone: UnsentPhone) =>
  (require('@/features/phone-copy/statusBarState') as typeof import('@/features/phone-copy/statusBarState'))
    .deriveUnsentLine(phone.store.getUnsentSummary() as never, false, { sending: false });
const breakFile = () => { for (let i = 0; i < 200; i += 1) failStatement(/./, new Error('database disk image is malformed')); };
const ALLOWED = { ok: true };
const REFUSED = { ok: false, count: null };

beforeEach(() => { resetEnv(); files.reset(); server.reset(); storage?.()?.clear(); });
afterEach(async () => {
  clearPlannedFailures();
  (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
  await new Promise(resolve => setTimeout(resolve, 50));
  await eraseEverything();
});

describe('WH-396: the offline feature off', () => {
  it('a phone with no unsent file creates none, and allows all four actions', async () => {
    const phone = await boot(false);
    await phone.engine.sendNow('send-now');
    await refresh();
    expect(unsentFileNames()).toEqual([]);
    expect(answers(phone)).toEqual([ALLOWED, ALLOWED, ALLOWED, ALLOWED]);
    expect(line(phone)).toBeNull();
  });

  it('the feature turned on later opens the file then', async () => {
    const phone = await boot(false);
    expect(unsentFileNames()).toEqual([]);
    phone.setSyncCapability(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(unsentFileNames()).toHaveLength(1);
  });

  it('an unreadable file with no items known to be waiting: sign-out, leaving and switching are allowed with no bar line; removing the account is refused', async () => {
    await boot(true); // the file exists, and holds nothing
    breakFile();
    const phone = await boot(false);
    expect(phone.store.getUnsentSummary()).toMatchObject({ unreadable: true });
    expect(answers(phone)).toEqual([ALLOWED, ALLOWED, ALLOWED, REFUSED]);
    expect(line(phone)).toBeNull();
    expect(unsentFileNames()).toHaveLength(1);
  });

  it('an unreadable file that held waiting items when last read (remembered over a kill): all four are refused, with the unreadable line', async () => {
    const first = await boot(true);
    await first.queue.enqueue(waits);
    await first.engine.sendNow('send-now');
    await refresh();
    breakFile();
    const phone = await boot(false);
    expect(phone.store.getUnsentSummary()).toMatchObject({ unreadable: true });
    expect(answers(phone)).toEqual([REFUSED, REFUSED, REFUSED, REFUSED]);
    expect(line(phone)).toEqual({ key: 'unsentUnreadable', count: 0 });
  });

  it('what is known of one person is not told of another, and is forgotten only by a clean read that finds nothing', async () => {
    const first = await boot(true);
    const mine = await first.queue.enqueue(waits);
    await first.engine.sendNow('send-now');
    await refresh();

    // Another person on this phone, reading the file cleanly with nothing of theirs, keeps the first person's mark.
    env.subject = 'user-2';
    await boot(true);
    breakFile();
    const other = await boot(false);
    expect(gate(other).accountActionAllowed('signOut')).toEqual(ALLOWED);
    clearPlannedFailures();

    env.subject = 'user-1';
    await boot(true);
    breakFile();
    const back = await boot(false);
    expect(gate(back).accountActionAllowed('signOut')).toEqual(REFUSED);
    clearPlannedFailures();

    // A clean read with the item gone forgets it.
    const clean = await boot(true);
    await clean.queue.deleteItem(mine.id);
    await refresh();
    breakFile();
    const after = await boot(false);
    expect(gate(after).accountActionAllowed('signOut')).toEqual(ALLOWED);
  });
});

describe('WH-396: the offline feature on is unchanged', () => {
  it('an unreadable file refuses all four actions, whatever was known', async () => {
    await boot(true);
    breakFile();
    const phone = await boot(true);
    expect(answers(phone)).toEqual([REFUSED, REFUSED, REFUSED, REFUSED]);
  });
});
