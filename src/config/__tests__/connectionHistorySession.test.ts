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
  noteLostAnswer,
  noteNetInfoState,
  resetConnectionHistoryForTests,
} from '../connectionHistory';
import { getSessionGeneration } from '../sessionLifecycle';
import { initializeSupabase, invalidateStoredTokenCache, signOut, storeTokens } from '../supabaseConfig';
import { clearOperatorServer, saveOperatorServer } from '../operatorServer';

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
jest.mock('expo-crypto', () => ({ randomUUID: () => `note-${++mockCounter}` }));
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
  installConnectionHistory();
});

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  mockCounter = 0;
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
  await storeTokens(jwt('user-a', 'session-2'), REFRESH, Date.now() + 3600 * 1000, getSessionGeneration(), { refresh: true });
  await settle();
  expect(await readSaved()).toEqual([]);

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

  await storeTokens(jwt('user-a', 'session-2'), REFRESH, Date.now() + 3600 * 1000, getSessionGeneration(), { refresh: true });
  await settle();
  expect(rpc).not.toHaveBeenCalled();
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
