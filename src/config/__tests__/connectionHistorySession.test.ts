/**
 * Connection notes with the REAL credential flow (WH-177, "scope read after the credentials settle"): supabaseConfig's sign-in,
 * token refresh and sign-out, sessionLifecycle's `onCredentialsSettled`, and the real `getSessionCacheScope`. Only storage
 * (secure store, AsyncStorage), the network (the Supabase client and its RPC) and the backend feature flag are faked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import type { NetInfoState } from '@react-native-community/netinfo';
import {
  handOverConnectionNotes,
  installConnectionHistory,
  readConnectionSession,
  noteLostAnswer,
  noteNetInfoState,
  resetConnectionHistoryForTests,
} from '../connectionHistory';
import * as cacheManager from '@/utils/cacheManager';
import { advanceSessionGeneration, getSessionGeneration } from '../sessionLifecycle';
import { verifySelectedOperator } from '../operatorBootstrap';
import { initializeSupabase, invalidateStoredTokenCache, signOut, storeTokens } from '../supabaseConfig';
import { clearOperatorServer, loadOperatorServer, saveOperatorServer } from '../operatorServer';

jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) } }));
jest.mock('@/services/recent-items-service', () => ({ RecentItemsService: { clearCache: jest.fn(async () => {}) } }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ clearSecureSessionMarker: jest.fn() }));
jest.mock('@/utils/otpRateLimiter', () => ({ checkOTPRateLimit: jest.fn(), recordOTPRequest: jest.fn(), clearAllRateLimits: jest.fn(async () => {}) }));

let mockCounter = 0;
let mockUuidThrows = false;
jest.mock('expo-crypto', () => ({ randomUUID: () => { if (mockUuidThrows) throw new Error('uuid failed'); return `note-${++mockCounter}`; } }));
let mockFeature = true;
jest.mock('../backendFeatures', () => ({ backendHasFeature: () => mockFeature }));

// Only the wait in front of the authenticated client is added; every credential function stays the real one.
let mockClientGate: Promise<void> | undefined;
jest.mock('../supabaseConfig', () => {
  const actual = jest.requireActual('../supabaseConfig');
  return {
    ...actual,
    getAuthenticatedClient: async (...args: unknown[]) => {
      if (mockClientGate) await mockClientGate;
      return actual.getAuthenticatedClient(...args);
    },
  };
});

const NOTES_KEY = 'connection_gap_notes_v1';
const server = { origin: 'https://facility-a.example.test', instanceId: 'instance-aaaa', displayName: 'Sample Facility A', companyName: 'Sample Cold Store A' };
const scopeOf = (subject: string) => JSON.stringify([server.origin, server.instanceId, subject]);
const jwt = (subject: string, session = 'session-1') =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: subject, session_id: session, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }))}.test-signature`;
const REFRESH = 'r'.repeat(64);

const secure = new Map<string, string>();
const rpc = jest.fn();
const from = jest.fn();
let hold: Promise<void> | undefined;
let heldReads = 0;
let now = 0;
let scopeReads: jest.SpyInstance;

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
const signIn = async (subject: string) => {
  await storeTokens(jwt(subject), REFRESH, Date.now() + 3600 * 1000);
  await settle();
};
const putNotes = async (notes: object[]) => AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
const readSaved = async () => JSON.parse((await AsyncStorage.getItem(NOTES_KEY)) ?? '[]') as { id: string; scope: string; lengthS: number; lostAnswers: number }[];
const aNote = (id: string, subject: string) => ({ id, scope: scopeOf(subject), endedAt: Date.now(), lengthS: 5, savesTried: 0, lostAnswers: 0 });
const sentIds = () => rpc.mock.calls.flatMap(([, args]) => (args.p_notes as { id: string }[]).map(n => n.id));
const offline = () => noteNetInfoState({ isConnected: false, isInternetReachable: false } as unknown as NetInfoState);
const online = () => noteNetInfoState({ isConnected: true, isInternetReachable: true } as unknown as NetInfoState);

beforeAll(() => {
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  scopeReads = jest.spyOn(cacheManager, 'getSessionCacheScope'); // calls through; counts the reads
  installConnectionHistory();
});

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  mockCounter = 0;
  mockUuidThrows = false;
  now = 0;
  mockFeature = true;
  mockClientGate = undefined;
  hold = undefined;
  heldReads = 0;
  invalidateStoredTokenCache();
  await AsyncStorage.clear();
  await clearOperatorServer();
  await saveOperatorServer(server, false);
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
    if (hold) { heldReads++; await hold; }
    return secure.get(key) ?? null;
  });
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  jest.mocked(createClient).mockReturnValue({ rpc, from } as unknown as ReturnType<typeof createClient>);
  initializeSupabase('http://localhost:18000', 'local-test-anon');
  rpc.mockReset();
  rpc.mockImplementation(async (_name: string, args: { p_notes: { id: string }[] }) => ({
    data: { success: true, data: { done: args.p_notes.map(n => n.id) } },
    error: null,
  }));
  resetConnectionHistoryForTests();
  await settle();
});

it('1. a sign-in from signed out: the scope is the new user\'s, signed in is true, and the waiting notes are handed over once', async () => {
  await putNotes([aNote('mine', 'user-b'), aNote('other', 'user-a')]);
  await signIn('user-b');

  expect(rpc).toHaveBeenCalledTimes(1);
  expect(sentIds()).toEqual(['mine']);
  // Signed in: a lost answer is noted, under the new scope.
  noteLostAnswer();
  await settle();
  expect((await readSaved()).map(n => [n.scope, n.lostAnswers])).toEqual([[scopeOf('user-a'), 0], [scopeOf('user-b'), 1]]);
});

it('2. A, then B signs in with a gap open: the note is stamped A, and B\'s own gap is stamped B', async () => {
  mockFeature = false; // the notes stay on the phone, so they can be read
  await signIn('user-a');
  now = 1000;
  offline();
  now = 6000; // five seconds into the gap
  await signIn('user-b');

  expect((await readSaved()).map(n => [n.scope, n.lengthS])).toEqual([[scopeOf('user-a'), 5]]);

  now = 9000;
  online();
  await settle();
  expect((await readSaved()).map(n => [n.scope, n.lengthS])).toEqual([[scopeOf('user-a'), 5], [scopeOf('user-b'), 3]]);
});

it('3. a sign-out while a scope read is still running: the read is dropped and signed in ends false', async () => {
  const gate = deferred();
  // The sign-in finishes its write; the scope read that follows it waits on the secure store.
  await storeTokens(jwt('user-a'), REFRESH, Date.now() + 3600 * 1000);
  hold = gate.promise;
  invalidateStoredTokenCache();
  await settle();
  expect(heldReads).toBeGreaterThan(0); // the scope read is under way

  const out = signOut({ localOnly: true });
  gate.resolve();
  hold = undefined;
  await out;
  await settle();

  // Signed out: nothing is noted, and nothing is handed over.
  noteLostAnswer();
  await settle();
  expect(await readSaved()).toEqual([]);
  expect(rpc).not.toHaveBeenCalled();
});

it('4. a token refresh in the same session: the gap stays open and is not split (no note)', async () => {
  mockFeature = false; // the notes stay on the phone, so they can be read
  await signIn('user-a');
  now = 1000;
  offline();
  scopeReads.mockClear();
  await storeTokens(jwt('user-a', 'session-2'), REFRESH, Date.now() + 3600 * 1000, getSessionGeneration(), { refresh: true });
  await settle();
  expect(await readSaved()).toEqual([]);
  // A refresh announces nothing: the scope is not even read again (a spurious announce would read it).
  expect(scopeReads).not.toHaveBeenCalled();

  // The gap was not split by the refresh: it is one gap of seven seconds.
  now = 8000;
  online();
  await settle();
  expect((await readSaved()).map(n => [n.scope, n.lengthS])).toEqual([[scopeOf('user-a'), 7]]);
});

it('4b. a token refresh while online hands nothing over', async () => {
  rpc.mockImplementation(async () => ({ data: null, error: { message: 'unreachable' } }));
  await putNotes([aNote('waiting', 'user-a')]);
  await signIn('user-a');
  expect(rpc).toHaveBeenCalledTimes(1); // the sign-in's hand-over, which failed
  rpc.mockClear();
  scopeReads.mockClear();

  await storeTokens(jwt('user-a', 'session-2'), REFRESH, Date.now() + 3600 * 1000, getSessionGeneration(), { refresh: true });
  await settle();
  expect(rpc).not.toHaveBeenCalled();
  expect(scopeReads).not.toHaveBeenCalled(); // no scope read, so no hand-over was even considered
});

it('5. a refresh whose store fails clears the session: the scope becomes null', async () => {
  await signIn('user-a');
  noteLostAnswer();
  await settle();
  expect(await readSaved()).toHaveLength(1);

  jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('keystore locked'));
  await expect(
    storeTokens(jwt('user-a', 'session-2'), REFRESH, Date.now() + 3600 * 1000, getSessionGeneration(), { refresh: true })
  ).rejects.toThrow();
  await settle();

  noteLostAnswer();
  await settle();
  expect(await readSaved()).toHaveLength(1); // no second note: signed in is false
});

it('6. A\'s hand-over is blocked in getAuthenticatedClient while B signs in: A sends nothing, and B\'s runs after', async () => {
  mockFeature = false;
  await putNotes([aNote('a-note', 'user-a'), aNote('b-note', 'user-b')]);
  await signIn('user-a');
  mockFeature = true;

  const gate = deferred();
  mockClientGate = gate.promise;
  const handOverA = handOverConnectionNotes();
  await settle();
  expect(rpc).not.toHaveBeenCalled();

  await signIn('user-b'); // asks for a hand-over while A's is still waiting
  expect(rpc).not.toHaveBeenCalled();

  mockClientGate = undefined;
  gate.resolve();
  await handOverA;
  await settle();

  expect(sentIds()).toEqual(['b-note']);
  expect((await readSaved()).map(n => n.id)).toEqual(['a-note']);
});

// A scope read that began before a session change and answers late with the OLD session's scope. The real read already
// refuses a stale token, so the late answer is simulated here: the check in refreshSignedIn is what must drop it.
describe('a late scope read of an earlier session is dropped', () => {
  it('3b. after a session change that has not announced yet (the generation check)', async () => {
    mockFeature = false;
    const late = deferred();
    scopeReads.mockImplementationOnce(async () => { await late.promise; return scopeOf('user-b'); });
    await storeTokens(jwt('user-a'), REFRESH, Date.now() + 3600 * 1000); // announces; the read is now waiting
    await settle();

    advanceSessionGeneration(); // a sign-out has begun; its write has not told anyone yet
    late.resolve();
    await settle();

    noteLostAnswer();
    await settle();
    expect(await readSaved()).toEqual([]); // the stale "user-b" was not applied
  });

  it('3c. when a newer read has been applied (the newest-read check)', async () => {
    mockFeature = false;
    const late = deferred();
    scopeReads.mockImplementationOnce(async () => { await late.promise; return scopeOf('user-b'); });
    await storeTokens(jwt('user-a'), REFRESH, Date.now() + 3600 * 1000); // the first read waits
    await settle();
    readConnectionSession(); // a newer read, answered at once by the real code: user-a
    await settle();

    late.resolve(); // the older read now answers user-b
    await settle();

    noteLostAnswer();
    await settle();
    expect((await readSaved()).map(n => n.scope)).toEqual([scopeOf('user-a')]);
  });
});

// A cold start: connection history was installed before the saved server was loaded (as in bootstrapApp), then
// verifySelectedOperator loads it and bootstrapApp's finally calls readConnectionSession().
describe('cold start with a saved session', () => {
  const OPERATOR_KEY = 'operator_server_v1';

  /** The phone as it was when the app was closed: tokens in the secure store, the server saved, nothing loaded yet. */
  async function closedApp({ operator, tokens }: { operator: boolean; tokens: boolean }) {
    if (tokens) await storeTokens(jwt('user-a'), REFRESH, Date.now() + 3600 * 1000); // with the server saved: writes its identity too
    await clearOperatorServer(); // the app is closed: nothing is loaded in memory
    if (operator) await AsyncStorage.setItem(OPERATOR_KEY, JSON.stringify(server));
    invalidateStoredTokenCache();
    resetConnectionHistoryForTests(); // install had run with no server: signed out, no scope
    await settle();
    rpc.mockClear();
    scopeReads.mockClear();
  }

  it('finds the saved session: signed in with its scope, one hand-over, a later gap stamped with it, a second read adds nothing', async () => {
    mockFeature = false;
    await putNotes([aNote('waiting', 'user-a')]);
    await closedApp({ operator: true, tokens: true });
    mockFeature = true;

    await loadOperatorServer();
    readConnectionSession();
    await settle();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sentIds()).toEqual(['waiting']);

    // A note that waits when the second read runs: a second read that handed over again would send it (the first note was
    // already removed, so without this the check below could not fail).
    await putNotes([aNote('second-wait', 'user-a')]);
    readConnectionSession(); // a later bootstrap with the same scope
    await settle();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sentIds()).toEqual(['waiting']);
    expect((await readSaved()).map(n => n.id)).toEqual(['second-wait']);
    await putNotes([]);

    mockFeature = false;
    now = 1000;
    offline();
    now = 4000;
    online();
    await settle();
    expect((await readSaved()).map(n => [n.scope, n.lengthS])).toEqual([[scopeOf('user-a'), 3]]);
  });

  it.each([
    ['an operator but no tokens', { operator: true, tokens: false }],
    ['tokens but no operator', { operator: false, tokens: true }],
  ])('%s: signed out, no note, no RPC', async (_name, saved) => {
    mockFeature = false;
    await putNotes([aNote('waiting', 'user-a')]);
    await closedApp(saved);
    mockFeature = true;

    await loadOperatorServer();
    readConnectionSession();
    await settle();
    noteLostAnswer();
    await settle();

    expect(rpc).not.toHaveBeenCalled();
    expect((await readSaved()).map(n => n.id)).toEqual(['waiting']); // only the one that was waiting
  });

  it('offline (discovery fails): the saved session is still found', async () => {
    mockFeature = false;
    await putNotes([aNote('waiting', 'user-a')]);
    await closedApp({ operator: true, tokens: true });
    mockFeature = true;
    const realFetch = global.fetch;
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    // The phone really is offline: NetInfo says so before the bootstrap runs.
    now = 1000;
    offline();
    try {
      // bootstrapApp: verifySelectedOperator loads the server, discovery throws, the finally reads the session.
      try {
        await verifySelectedOperator(() => true, async () => {});
      } catch {
        /* offline */
      } finally {
        readConnectionSession();
      }
      await settle();
    } finally {
      global.fetch = realFetch;
    }

    // The session is found, but the phone is offline: nothing is handed over while the gap is open.
    expect(rpc).not.toHaveBeenCalled();
    expect((await readSaved()).map(n => n.id)).toEqual(['waiting']);
    // Back online: the gap closes as a note of the saved session's scope, and the hand-over sends it with the waiting one
    // (it only sends notes of the current scope, so the new note carries the saved session's scope).
    now = 4000;
    online();
    await settle();
    expect(sentIds()).toHaveLength(2);
    expect(sentIds()).toContain('waiting');
    const lengths = rpc.mock.calls.flatMap(([, args]) => (args.p_notes as { length_s?: number; lengthS?: number }[]).map(n => n.length_s ?? n.lengthS));
    expect(lengths).toContain(3);
  });
});

describe('a failure while the signed-in state is applied (WH-182)', () => {
  it('is logged and never becomes an unhandled rejection: the gap that a session switch closes fails to get its id', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => { rejections.push(reason); };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.on('unhandledRejection', onRejection);
    try {
      await signIn('user-a');
      now = 1000;
      offline(); // a gap opens under user-a
      mockUuidThrows = true; // closing it needs a note id, and the id source fails
      now = 2000;
      await signIn('user-b'); // a different user: refreshSignedIn closes the open gap first
      await settle();
      expect(warn.mock.calls.some(call => String(call[0]).includes('Reading the signed-in state failed'))).toBe(true);
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
      warn.mockRestore();
    }
  });
});
