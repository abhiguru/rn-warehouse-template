/**
 * Connection notes are kept per facility and user (WH-177, Opus review): a note is stamped with the session scope
 * (`getSessionCacheScope`) when it is made, only the session that made it hands it over, a gap open at a switch is closed
 * under the old scope, and a note without a stamp is dropped.
 */
import type { NetInfoState } from '@react-native-community/netinfo';
import { asPhone } from '@/tests/helpers/phoneKind';
import {
  handOverConnectionNotes,
  installConnectionHistory,
  noteLostAnswer,
  noteNetInfoState,
  readNotes,
  resetConnectionHistoryForTests,
} from '../connectionHistory';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
  },
}));

let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `note-${++mockCounter}` }));

let mockScope: string | null = null;
jest.mock('@/utils/cacheManager', () => ({ getSessionCacheScope: async () => mockScope }));

let mockFeature = true;
jest.mock('../backendFeatures', () => ({ backendHasFeature: () => mockFeature }));

const mockRpc = jest.fn();
jest.mock('../supabaseConfig', () => ({ getAuthenticatedClient: async () => ({ rpc: mockRpc }) }));

let mockOnSessionChange: (() => void) | null = null;
jest.mock('../sessionLifecycle', () => ({
  onCredentialsSettled: (listener: () => void) => { mockOnSessionChange = listener; return () => undefined; },
  getSessionGeneration: () => mockGeneration,
}));
let mockGeneration = 0;
jest.mock('../sessionScopedRegistry', () => ({ registerSessionScoped: jest.fn() }));
jest.mock('../lanTransport', () => ({
  getLanStatus: () => ({ path: 'public', failure: null }),
  subscribeLanStatus: () => () => undefined,
}));

const KEY = 'connection_gap_notes_v1';
const scope = (origin: string, subject: string) => JSON.stringify([origin, `instance-${origin}`, subject]);
const FACILITY_A = scope('https://a.example.test', 'user-1');
const FACILITY_B = scope('https://b.example.test', 'user-1');
const OTHER_USER_A = scope('https://a.example.test', 'user-2');

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
/** The session changes to `next` (null: signed out), as the session lifecycle announces it. */
const switchTo = async (next: string | null) => {
  mockScope = next;
  mockOnSessionChange?.();
  await settle();
};
const stored = () => JSON.parse(mockStore.get(KEY) ?? '[]') as { id: string; scope: string; lengthS: number; lostAnswers: number }[];
const sentIds = () => mockRpc.mock.calls.flatMap(([, args]) => (args.p_notes as { id: string }[]).map(n => n.id));

let now = 0;
beforeAll(() => {
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  installConnectionHistory();
});
beforeEach(async () => {
  jest.clearAllMocks();
  mockStore.clear();
  mockCounter = 0;
  now = 0;
  mockScope = null;
  mockFeature = false; // notes pile up; a test turns the hand-over on when it wants one
  resetConnectionHistoryForTests();
  mockRpc.mockImplementation(async (_name: string, args: { p_notes: { id: string }[] }) => ({
    data: { success: true, data: { done: args.p_notes.map(n => n.id) } },
    error: null,
  }));
  await settle();
});

describe('WH-411: the moment of signing in also names the session', () => {
  const namings = () => mockRpc.mock.calls.filter(([name]) => name === 'set_session_device_name');

  it('once at sign-in, not again when the same session is read again, and for the next session', async () => {
    const restore = asPhone('android');
    try {
      mockFeature = true;
      mockGeneration = 41;
      await switchTo(FACILITY_A);
      expect(namings()).toEqual([['set_session_device_name', { p_device_name: expect.stringMatching(/^Samsung SM-A156E/) }]]);
      await switchTo(FACILITY_A);
      expect(namings()).toHaveLength(1);
      mockGeneration = 42;
      await switchTo(FACILITY_B);
      expect(namings()).toHaveLength(2);
    } finally {
      restore();
      mockGeneration = 0;
    }
  });

  it('signed out names nothing', async () => {
    const restore = asPhone('android');
    try {
      mockFeature = true;
      mockGeneration = 43;
      await switchTo(null);
      expect(namings()).toEqual([]);
    } finally {
      restore();
      mockGeneration = 0;
    }
  });
});

describe.each([
  ['facility A to B and back to A', FACILITY_A, FACILITY_B],
  ['user 1 to user 2 at one facility, and back', FACILITY_A, OTHER_USER_A],
])('notes of %s', (_name, first, second) => {
  it('are not sent to the other session, and are sent when their own session is back', async () => {
    await switchTo(first);
    noteLostAnswer();
    await settle();
    expect(stored()).toEqual([expect.objectContaining({ scope: first, lostAnswers: 1 })]);
    const noteId = stored()[0].id;

    await switchTo(second);
    mockFeature = true;
    await handOverConnectionNotes();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(stored().map(n => n.id)).toEqual([noteId]);

    await switchTo(first);
    expect(sentIds()).toEqual([noteId]);
    expect(stored()).toEqual([]);
  });

  it('a note of the second session goes only to the second session', async () => {
    await switchTo(first);
    noteLostAnswer();
    await settle();
    await switchTo(second);
    noteLostAnswer();
    await settle();
    const [firstNote, secondNote] = stored();
    expect([firstNote.scope, secondNote.scope]).toEqual([first, second]);

    mockFeature = true;
    await handOverConnectionNotes();
    expect(sentIds()).toEqual([secondNote.id]);
    expect(stored().map(n => n.id)).toEqual([firstNote.id]);
  });
});

it('drops a note without a stamp when reading, and keeps the stamped ones', async () => {
  const base = { endedAt: Date.now(), lengthS: 5, savesTried: 0, lostAnswers: 0 };
  mockStore.set(KEY, JSON.stringify([
    { id: 'old-format', ...base },
    { id: 'empty-stamp', ...base, scope: '' },
    { id: 'stamped', ...base, scope: FACILITY_A },
  ]));
  expect((await readNotes()).map(n => n.id)).toEqual(['stamped']);

  await switchTo(FACILITY_A);
  mockFeature = true;
  await handOverConnectionNotes();
  expect(sentIds()).toEqual(['stamped']);
});

it('makes no note while no scope is known (signed out)', async () => {
  await switchTo(null);
  noteLostAnswer();
  await settle();
  expect(stored()).toEqual([]);
});

it('closes a gap that is open at a switch under the old scope', async () => {
  await switchTo(FACILITY_A);
  now = 1000;
  noteNetInfoState({ isConnected: false, isInternetReachable: false } as unknown as NetInfoState);
  now = 6000; // five seconds into the gap
  await switchTo(FACILITY_B);

  expect(stored()).toEqual([expect.objectContaining({ scope: FACILITY_A, lengthS: 5 })]);

  // The gap that goes on at B is B's own: it is stamped with B when it ends.
  now = 9000;
  noteNetInfoState({ isConnected: true, isInternetReachable: true } as unknown as NetInfoState);
  await settle();
  expect(stored().map(n => [n.scope, n.lengthS])).toEqual([[FACILITY_A, 5], [FACILITY_B, 3]]);
});
