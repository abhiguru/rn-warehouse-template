/**
 * What the app knows of the unsent work, in memory (WH-301, product/tech/app-offline-unsent-work.md sections 2, 5 and 9):
 * the rows of the file, the person they are read for, and `UnsentSummary`, which the status bar, the gate and the account
 * actions read synchronously. Rebuilt from the file after every write and every change of session.
 */
import { useSyncExternalStore } from 'react';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { onSessionChange } from '@/config/sessionLifecycle';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger, loggableError } from '@/utils/logger';
import './lotChangeKind';
import './photosKind';
import { startSendEngine } from './sendEngine';
import { getUnsentDb } from './unsentDb';
import { allItems, onUnsentChange, UNSENT_STATES, type ItemRow } from './unsentRows';
import { cannotSendUnsent } from './unsentRole';
import { startWorkClock, UNSENT_LIMIT_MS, workNow } from './workClock';

const logger = createLogger('[unsent]');

export interface UnsentSummary {
  /** Own items not sent yet (a photo group is one); 0 while the file cannot be read or the items wait for an administrator. */
  count: number;
  /** The clock time to send by (ms since the epoch); 0 when no unsent record is counted. */
  sendBy: number;
  limitReached: boolean;
  /** The file could not be read: nothing is known, the limit counts as passed (Design 4.6, DQ2). */
  unreadable: boolean;
  /** Own items kept but not sendable because the role is now customer (Product PQ5). */
  waitingForAdmin: number;
}

const state = {
  started: false,
  unreadable: false,
  scope: null as string | null,
  rows: [] as ItemRow[],
  version: 0,
  loading: Promise.resolve(),
  summary: { count: 0, sendBy: 0, limitReached: false, unreadable: false, waitingForAdmin: 0 } as UnsentSummary,
};

function createListeners() {
  const listeners = new Set<() => void>();
  return {
    add: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire: (): void => {
      for (const listener of [...listeners]) listener();
    },
  };
}
const listeners = createListeners();

/** Own rows that are still unsent. */
export const ownUnsentRows = (): ItemRow[] =>
  state.scope === null ? [] : state.rows.filter(row => row.scope === state.scope && UNSENT_STATES.includes(row.state));

function build(): UnsentSummary {
  if (state.unreadable) return { count: 0, sendBy: 0, limitReached: true, unreadable: true, waitingForAdmin: 0 };
  const counted = ownUnsentRows();
  if (counted.length > 0 && cannotSendUnsent()) return { count: 0, sendBy: 0, limitReached: false, unreadable: false, waitingForAdmin: counted.length };
  // Waiting photos are the only copy of a photo but never start the clock (Product PQ2).
  const starting = counted.filter(row => row.kind !== 'photos');
  let sendBy = 0;
  let limitReached = false;
  if (starting.length > 0) {
    const age = workNow() - Math.min(...starting.map(row => row.recorded_tick));
    limitReached = age >= UNSENT_LIMIT_MS;
    sendBy = Date.now() + (UNSENT_LIMIT_MS - age);
  }
  // A photos item waiting for its record counts with the record, once (WH-161).
  const own = counted.filter(row => !(row.kind === 'photos' && row.depends_on !== null && counted.some(other => other.id === row.depends_on)));
  return { count: own.length, sendBy, limitReached, unreadable: false, waitingForAdmin: 0 };
}

/** The summary now. The same object while nothing in it changed (for `useSyncExternalStore`). */
export function getUnsentSummary(): UnsentSummary {
  const next = build();
  const last = state.summary;
  const same =
    next.count === last.count &&
    next.limitReached === last.limitReached &&
    next.unreadable === last.unreadable &&
    next.waitingForAdmin === last.waitingForAdmin &&
    Math.abs(next.sendBy - last.sendBy) < 1000;
  if (!same) state.summary = next;
  return state.summary;
}

/** The oldest own unsent record's age on the work clock, or null when none starts the clock. */
export function oldestUnsentAgeMs(): number | null {
  const starting = ownUnsentRows().filter(row => row.kind !== 'photos');
  return starting.length === 0 ? null : workNow() - Math.min(...starting.map(row => row.recorded_tick));
}

export const isUnsentReadable = (): boolean => !state.unreadable;
export const currentUnsentScope = (): string | null => state.scope;
/** All rows loaded, every person's (the strip of other people's items and the sweep read them). */
export const loadedUnsentRows = (): readonly ItemRow[] => state.rows;

export const subscribeUnsent = listeners.add;

async function reload(): Promise<void> {
  const version = (state.version += 1);
  try {
    const scope = await getSessionCacheScope();
    const rows = await allItems();
    if (version !== state.version) return;
    state.scope = scope;
    state.rows = rows;
    state.unreadable = false;
  } catch (error) {
    if (version !== state.version) return;
    logger.warn('The unsent-work file could not be read', loggableError(error));
    state.unreadable = true;
    state.rows = [];
  }
  listeners.fire();
}

/** Loads the snapshot again from the file. */
export function refreshUnsent(): Promise<void> {
  state.loading = state.loading.then(reload, reload);
  return state.loading;
}

/**
 * Called at app open: opens the file, starts the work clock, loads the snapshot. A file that cannot be read is kept as it
 * is and reported as unreadable (the limit then counts as passed, the account actions are refused); it is read again after
 * the next change of session or write.
 */
export async function initUnsent(): Promise<void> {
  if (!state.started) {
    state.started = true;
    startSendEngine();
    onUnsentChange(refreshUnsent);
    onSessionChange(() => {
      state.scope = null;
      listeners.fire();
      void refreshUnsent();
    });
  }
  try {
    const db = await getUnsentDb();
    const [newest] = await db.all<{ top: number | null; n: number }>('SELECT max(recorded_tick) AS top, count(*) AS n FROM items');
    await startWorkClock(db, newest && newest.n > 0 ? newest.top : null);
  } catch (error) {
    logger.warn('The unsent-work file could not be opened at start', loggableError(error));
  }
  await refreshUnsent();
}

/** The summary as a hook. */
export function useUnsentSummary(): UnsentSummary {
  return useSyncExternalStore(subscribeUnsent, getUnsentSummary, getUnsentSummary);
}

/**
 * Whether this phone keeps unsent work (an item not sent yet, or an unfinished form) for the person of the saved sign-in,
 * for the screens that cannot start a session: "away too long" and "Sign in again" say it is kept (Design 11.2, 12.3). Asked
 * of the file, with no session loaded. When the saved sign-in cannot be read, the facility's items of anyone count. A file
 * that cannot be read says nothing: the screen does not promise what cannot be checked.
 */
export async function hasKeptWork(): Promise<boolean> {
  try {
    const db = await getUnsentDb();
    const scope = await getSessionCacheScope();
    const server = getActiveOperatorServer();
    const mine = (own: string): boolean => {
      if (scope !== null) return own === scope;
      const [origin, instance] = JSON.parse(own) as string[];
      return server !== null && origin === server.origin && instance === server.instanceId;
    };
    const items = await db.all<{ scope: string }>(`SELECT scope FROM items WHERE state IN ('saved', 'sending', 'refused')`);
    const forms = await db.all<{ scope: string }>('SELECT scope FROM forms');
    return [...items, ...forms].some(row => mine(row.scope));
  } catch (error) {
    logger.warn('Whether unsent work is kept could not be told', loggableError(error));
    return false;
  }
}
