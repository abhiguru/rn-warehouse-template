/**
 * Connection history (WH-177, Part A of the offline capture spec; backend migration 188).
 *
 * While the app is in the foreground and signed in, a "gap" is a stretch in which the phone reaches the facility's server
 * neither over the internet nor over the warehouse network. The gap starts and ends on the reachability decision the app
 * already makes (`useIsOffline`: NetInfo's probe of the facility's own `hello`, and the LAN fallback of lanTransport.ts), so being
 * reachable on the warehouse network only is not a gap. It also ends when the app leaves the foreground or the session ends.
 *
 * Nothing here polls, sets a timer or keeps the app awake: the tracker is fed by events that already happen (the NetInfo listener
 * of netReachability.ts, the LAN status of lanTransport.ts, AppState and the session change) and by the three save screens.
 * A closed gap is a note: how long it lasted (the monotonic clock, `performance.now`), the saves tried and the answers lost during
 * it. A note holds no customer, document, amount, address or location (the server adds the device from the session).
 *
 * Notes are kept on the phone (AsyncStorage, up to 500, dropped after 30 days) apart from the list caches, and are NOT removed at
 * sign-out: they wait until they are handed over (`submit_connection_notes`) on the next successful contact: a gap that ends
 * because the server is reachable again, the app coming back to the foreground, or a sign-in. A failed hand-over leaves the notes
 * for the next of those; nothing retries on a timer.
 *
 * Each note is stamped when it is made with the session scope the list caches use (`getSessionCacheScope`: server origin,
 * facility instance id and signed-in subject). A hand-over sends only the notes whose stamp is the current session's; the others
 * stay on the phone until their own facility and user sign in again, and the 500-note and 30-day limits still age them out. A gap
 * open when the facility or user changes is closed under the old stamp: the session end closes it at once (the session-scoped
 * clear), while the scope still names the old session. The scope and "signed in" are read again only once the stored credentials
 * have settled (`onCredentialsSettled`, told from inside the credential job after a sign-in stored its tokens or a sign-out or
 * replaced session cleared them), so the read is queued behind that write, and at start once the saved server is loaded
 * (`readConnectionSession`). A token refresh of the same session is not told and changes nothing. A note without a stamp (the first stored format) is dropped when read, and so is a note made while no scope
 * is known.
 *
 * A save tried is a GRN, dispatch or invoice Save pressed during a gap (`noteSavePressed`), or one that ended as an offline failure
 * with no gap open (`noteSaveEndedOffline`). A lost answer is counted separately (`noteLostAnswer`). A save or lost answer
 * outside any gap is kept as a note of length 0: it counts as a save or an answer lost, not as a gap.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppState, type AppStateStatus } from 'react-native';
import type { NetInfoState } from '@react-native-community/netinfo';
import { backendHasFeature } from './backendFeatures';
import { getLanStatus, subscribeLanStatus } from './lanTransport';
import { getSessionGeneration, onCredentialsSettled } from './sessionLifecycle';
import { registerSessionScoped } from './sessionScopedRegistry';
import { createLogger } from '@/utils/logger';

const log = createLogger('ConnectionHistory');

const STORAGE_KEY = 'connection_gap_notes_v1';
/** Notes kept on the phone. */
export const MAX_NOTES = 500;
/** A note not handed over after this long is dropped. */
export const NOTE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** The server accepts at most this many notes in one hand-over. */
const BATCH = 500;

/** What is kept of a closed gap. `endedAt` is the wall clock at the end, used only to age the note until it is handed over. */
export interface GapNote {
  id: string;
  endedAt: number;
  /** The session scope (origin, instance id, subject) the note was made under; only that session hands it over. */
  scope: string;
  /** Seconds; 0 for a save or lost answer outside any gap. */
  lengthS: number;
  savesTried: number;
  lostAnswers: number;
}

// -----------------------------------------------------------------------------
// The tracker (pure: no storage, no listeners)
// -----------------------------------------------------------------------------

export interface TrackerDeps {
  /** A monotonic clock in milliseconds. */
  mono: () => number;
  wall: () => number;
  newId: () => string;
  /** A note is complete (the caller stamps it with its session scope). */
  onNote: (note: Omit<GapNote, 'scope'>) => void;
  /** A gap ended because the server could be reached again (not by leaving the foreground or the session). */
  onRecovered: () => void;
}

export interface TrackerFlags {
  foreground: boolean;
  signedIn: boolean;
  /** Neither path reaches the server (the same decision as `useIsOffline`). */
  offline: boolean;
}

export interface GapTracker {
  setFlags: (flags: Partial<TrackerFlags>) => void;
  getFlags: () => TrackerFlags;
  isInGap: () => boolean;
  /** A GRN, dispatch or invoice Save was pressed. Counts when a gap is open. */
  noteSavePressed: () => void;
  /** A save ended as an offline failure. Counts unless its press was counted in the open gap. */
  noteSaveEndedOffline: () => void;
  /** A save's answer was lost. */
  noteLostAnswer: () => void;
}

export function createGapTracker(deps: TrackerDeps): GapTracker {
  const flags: TrackerFlags = { foreground: true, signedIn: false, offline: false };
  let open: { startedAt: number; savesTried: number; lostAnswers: number; pressCounted: boolean } | null = null;

  const note = (lengthS: number, savesTried: number, lostAnswers: number) => {
    if (lengthS === 0 && savesTried === 0 && lostAnswers === 0) return;
    deps.onNote({ id: deps.newId(), endedAt: deps.wall(), lengthS, savesTried, lostAnswers });
  };

  const evaluate = () => {
    const shouldBeOpen = flags.foreground && flags.signedIn && flags.offline;
    if (shouldBeOpen && !open) {
      open = { startedAt: deps.mono(), savesTried: 0, lostAnswers: 0, pressCounted: false };
    } else if (!shouldBeOpen && open) {
      const closed = open;
      open = null;
      const lengthS = Math.max(1, Math.ceil((deps.mono() - closed.startedAt) / 1000));
      note(lengthS, closed.savesTried, closed.lostAnswers);
      // Reachable again: only when the app is still in the foreground and signed in does this say anything about the server.
      if (flags.foreground && flags.signedIn && !flags.offline) deps.onRecovered();
    }
  };

  return {
    setFlags(next) {
      let changed = false;
      for (const key of Object.keys(next) as (keyof TrackerFlags)[]) {
        const value = next[key];
        if (value !== undefined && flags[key] !== value) {
          flags[key] = value;
          changed = true;
        }
      }
      if (changed) evaluate();
    },
    getFlags: () => ({ ...flags }),
    isInGap: () => open !== null,
    noteSavePressed() {
      if (!open) return;
      open.savesTried += 1;
      open.pressCounted = true;
    },
    noteSaveEndedOffline() {
      if (open) {
        // The press of this save was counted in this gap: it is the same save.
        if (open.pressCounted) open.pressCounted = false;
        else open.savesTried += 1;
        return;
      }
      if (flags.signedIn) note(0, 1, 0);
    },
    noteLostAnswer() {
      if (open) open.lostAnswers += 1;
      else if (flags.signedIn) note(0, 0, 1);
    },
  };
}

/** `useIsOffline`'s decision without React: not connected, or connected with the facility's `hello` unreachable and no warehouse network path. */
export function isOfflineDecision(
  net: { isConnected: boolean | null; isInternetReachable: boolean | null } | null,
  lan: { path: 'public' | 'lan'; failure: string | null }
): boolean {
  if (!net) return false;
  // Not known yet is not a gap: nothing is claimed without knowing.
  if (net.isConnected === false) return true;
  if (net.isConnected && net.isInternetReachable === false) return !(lan.path === 'lan' && lan.failure === null);
  return false;
}

// -----------------------------------------------------------------------------
// Storage: one queue, so two writes never lose each other
// -----------------------------------------------------------------------------

const isNote = (value: unknown): value is GapNote => {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Record<string, unknown>;
  const count = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  return (
    typeof n.id === 'string' &&
    n.id !== '' &&
    typeof n.scope === 'string' &&
    n.scope !== '' &&
    typeof n.endedAt === 'number' &&
    Number.isFinite(n.endedAt) &&
    count(n.lengthS) &&
    count(n.savesTried) &&
    count(n.lostAnswers)
  );
};

function parse(raw: string | null, now: number): GapNote[] {
  if (!raw) return [];
  try {
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    // A note stamped in the future (the clock was set back) is kept: it ages from now on.
    return stored.filter(isNote).filter(n => now - n.endedAt <= NOTE_MAX_AGE_MS).slice(-MAX_NOTES);
  } catch {
    return [];
  }
}

let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>, fallback: T): Promise<T> {
  const run = queue.then(job).catch((error: unknown) => {
    log.warn('Storage failed; connection notes were skipped', { name: error instanceof Error ? error.name : undefined });
    return fallback;
  });
  queue = run;
  return run;
}

async function write(notes: GapNote[]): Promise<void> {
  if (notes.length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
  else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function storeNote(note: GapNote): Promise<void> {
  return enqueue(async () => {
    const notes = parse(await AsyncStorage.getItem(STORAGE_KEY), Date.now());
    notes.push(note);
    await write(notes.slice(-MAX_NOTES));
  }, undefined);
}

/** The notes waiting on the phone, oldest first. Never rejects. */
export function readNotes(): Promise<GapNote[]> {
  return enqueue(async () => parse(await AsyncStorage.getItem(STORAGE_KEY), Date.now()), [] as GapNote[]);
}

function removeNotes(ids: ReadonlySet<string>): Promise<void> {
  return enqueue(async () => {
    const notes = parse(await AsyncStorage.getItem(STORAGE_KEY), Date.now());
    await write(notes.filter(n => !ids.has(n.id)));
  }, undefined);
}

// -----------------------------------------------------------------------------
// Hand-over
// -----------------------------------------------------------------------------

let handingOver = false;
/** A hand-over was asked for while one was running (perhaps for the session before): run once more when it ends. */
let handOverAgain = false;

/** The notes as `submit_connection_notes` takes them: the age is seconds since the gap began (its length plus the time since it ended). */
export function toWireNotes(notes: readonly GapNote[], now: number) {
  return notes.slice(0, BATCH).map(n => ({
    id: n.id,
    age_s: n.lengthS + Math.max(0, Math.round((now - n.endedAt) / 1000)),
    length_s: n.lengthS,
    saves_tried: n.savesTried,
    lost_answers: n.lostAnswers,
  }));
}

/**
 * Hands the waiting notes to the server and removes the ones it holds. Only while the app can reach the server (foreground,
 * signed in, no gap) and the backend has migration 188. Never rejects; a failure leaves the notes for the next contact.
 */
export async function handOverConnectionNotes(): Promise<void> {
  if (handingOver) {
    handOverAgain = true;
    return;
  }
  handOverAgain = false;
  const flags = tracker.getFlags();
  if (!flags.foreground || !flags.signedIn || flags.offline) return;
  if (!backendHasFeature('connectionHistory')) return;
  handingOver = true;
  try {
    // Loaded when used: the data layer is not needed to track a gap.
    const { getAuthenticatedClient } = require('./supabaseConfig') as typeof import('./supabaseConfig');
    const { getSessionGeneration } = require('./sessionLifecycle') as typeof import('./sessionLifecycle');
    const { getSessionCacheScope } = require('@/utils/cacheManager') as typeof import('@/utils/cacheManager');
    // Taken before the scope is read: a session change after this abandons the run, so one session's notes never go up
    // through the next session's client.
    const generation = getSessionGeneration();
    const scope = await getSessionCacheScope();
    if (scope === null || generation !== getSessionGeneration()) return;
    for (;;) {
      const notes = (await readNotes()).filter(n => n.scope === scope);
      if (notes.length === 0) return;
      const client = await getAuthenticatedClient();
      if (generation !== getSessionGeneration()) return;
      const { data, error } = await client.rpc('submit_connection_notes', { p_notes: toWireNotes(notes, Date.now()) });
      if (generation !== getSessionGeneration() || error || data?.success !== true || !Array.isArray(data?.data?.done)) return;
      const done = new Set<string>(data.data.done.filter((id: unknown): id is string => typeof id === 'string'));
      if (done.size === 0) return;
      await removeNotes(done);
      if (notes.length <= BATCH) return;
    }
  } catch {
    log.warn('Hand-over of connection notes failed; they stay on the phone');
  } finally {
    handingOver = false;
    if (handOverAgain) {
      handOverAgain = false;
      void handOverConnectionNotes();
    }
  }
}

// -----------------------------------------------------------------------------
// The one tracker and its feeds
// -----------------------------------------------------------------------------

const monotonicNow = (): number => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** The session scope notes are stamped with now; null while signed out or not known. */
let currentScope: string | null = null;

const tracker: GapTracker = createGapTracker({
  mono: monotonicNow,
  wall: () => Date.now(),
  newId: () => Crypto.randomUUID(),
  onNote: note => {
    // The scope is replaced only after the gap is closed, so a gap that ends at a switch is stamped with the old session.
    if (currentScope !== null) void storeNote({ ...note, scope: currentScope });
  },
  onRecovered: () => {
    void handOverConnectionNotes();
  },
});

/** The last NetInfo state (only the two fields the decision reads). */
let lastNet: { isConnected: boolean | null; isInternetReachable: boolean | null } | null = null;
let installed = false;

function reevaluate(): void {
  tracker.setFlags({ offline: isOfflineDecision(lastNet, getLanStatus()) });
}

/** Called by the NetInfo listener of netReachability.ts for every event; never throws. */
export function noteNetInfoState(state: NetInfoState): void {
  try {
    lastNet = { isConnected: state.isConnected ?? null, isInternetReachable: state.isInternetReachable ?? null };
    reevaluate();
  } catch {
    /* the history is an observer; it never changes what the app does */
  }
}

export const noteSavePressed = (): void => tracker.noteSavePressed();
export const noteSaveEndedOffline = (): void => tracker.noteSaveEndedOffline();
export const noteLostAnswer = (): void => tracker.noteLostAnswer();

/** Counts the reads of the session scope; only the latest one is applied. */
let scopeRead = 0;

/**
 * Reads the session scope and sets "signed in" from it. Called at install, after the start-up loads the saved server
 * (`readConnectionSession`; the scope names the server, so it is null before) and by `onCredentialsSettled`, from inside the
 * credential job that has just written, so the read is queued behind that write. A read overtaken by a newer one, or by a session change
 * (which is followed by a write that tells again), is dropped.
 */
async function refreshSignedIn(): Promise<void> {
  const run = ++scopeRead;
  const generation = getSessionGeneration();
  let scope: string | null;
  try {
    const { getSessionCacheScope } = require('@/utils/cacheManager') as typeof import('@/utils/cacheManager');
    scope = await getSessionCacheScope();
  } catch {
    scope = null;
  }
  if (run !== scopeRead || generation !== getSessionGeneration()) return;
  const changed = scope !== currentScope;
  const wasSignedIn = tracker.getFlags().signedIn;
  // A different facility or user: close what is open under the old stamp first.
  if (changed) tracker.setFlags({ signedIn: false });
  currentScope = scope;
  tracker.setFlags({ signedIn: scope !== null });
  // A sign-in hands over; the same signed-in session read again changes nothing (no gap closed, nothing re-stamped).
  if (scope !== null && (changed || !wasSignedIn)) void handOverConnectionNotes();
}

/**
 * Reads the session again once the start-up has loaded the saved server (bootstrapApp, after `verifySelectedOperator`, whatever
 * its outcome): a session saved before the app was closed is found here. The same session read again changes nothing.
 */
export function readConnectionSession(): void {
  if (installed) void refreshSignedIn();
}

/**
 * Starts listening (bootstrapApp, once; safe to call again). The feeds are events the app already has: the LAN status, AppState
 * and the stored credentials settling after a sign-in or sign-out. The NetInfo feed is `noteNetInfoState`.
 */
export function installConnectionHistory(): void {
  if (installed) return;
  installed = true;
  tracker.setFlags({ foreground: AppState.currentState === 'active' || AppState.currentState === undefined });
  subscribeLanStatus(() => {
    try {
      reevaluate();
    } catch {
      /* observer only */
    }
  });
  AppState.addEventListener('change', (state: AppStateStatus) => {
    tracker.setFlags({ foreground: state === 'active' });
    if (state === 'active') void handOverConnectionNotes();
  });
  onCredentialsSettled(() => {
    void refreshSignedIn();
  });
  void refreshSignedIn();
}

// The open gap belongs to the session that ends here; the notes already closed stay on the phone until handed over.
registerSessionScoped('connection-history-gap', () => {
  tracker.setFlags({ signedIn: false });
});

/** Tests only: forget the feeds. */
export function resetConnectionHistoryForTests(): void {
  lastNet = null;
  currentScope = null;
  scopeRead = 0;
  handingOver = false;
  handOverAgain = false;
  queue = Promise.resolve();
  tracker.setFlags({ signedIn: false, offline: false, foreground: true });
}
