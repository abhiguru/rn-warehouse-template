/**
 * Which state the offline status bar shows (WH-298; Design product/design/offline-capture.md Part 1, 1.5, with the
 * answer to P9; contract 8.2). Pure: no React, no clock.
 */
import type { CopyPhase } from './syncStore';

/** Unsent work (WH-301; `null` while the offline feature is off). */
export interface UnsentSummary {
  count: number;
  /** When the oldest unsent item turns 2 hours old (ms). */
  sendBy: number;
  limitReached: boolean;
  /** The unsent file could not be read (Design 4.6): no count, critical. */
  unreadable?: boolean;
  /** Own items kept but not sendable (role lowered, account deactivated): information only (Design 4.9). */
  waitingForAdmin?: number;
  /** Own items the server holds or rejected and the person has not opened (WH-304, Design 7.9 DQ6); line 2 says so when nothing is unsent. */
  held?: number;
}

export interface StatusBarInput {
  phase: CopyPhase;
  /** A sync is loading the copy (the first stage shows "Loading the warehouse onto this phone…"). */
  loading: boolean;
  offline: boolean;
  current: boolean;
  lastRunFailed: boolean;
  /** The server's time of the copy (ms), or null. */
  asOf: number | null;
  storageLow: boolean;
  unsent: UnsentSummary | null;
  running: boolean;
}

export type StatusBarRow = 1 | 2 | 3 | 4 | 5 | 7;
export type OfflineStatusKey =
  | 'upToDate' | 'updating' | 'offline' | 'updateFailed' | 'firstLoad' | 'notReady'
  | 'storageLow' | 'opening' | 'openFailed';
export type StatusBarIcon =
  | 'check-circle-outline' | 'sync' | 'cloud-off-outline' | 'cloud-refresh-outline' | 'cloud-download-outline'
  | 'clock-alert-outline' | 'harddisk' | 'cloud-alert-outline';

export interface StatusBarView {
  /** The line-1 row of Design 1.5. */
  row: StatusBarRow;
  /** Row 8: unsent work past 2 hours. */
  limit: boolean;
  /** Row 9: storage running short. */
  storage: boolean;
  tone: 'neutral' | 'critical';
  icon: StatusBarIcon;
  line1: { key: OfflineStatusKey; time?: number }[];
  line2: { key: 'unsent' | 'sending' | 'unsentLimit' | 'unsentUnreadable' | 'waitingForAdmin' | 'heldLine'; count: number; time?: number } | null;
  action: 'retry' | null;
  actionDisabled: boolean;
}

/**
 * A customer account's bar (WH-306, Design 9.1): drawn only while the first load is not done (rows 5 and 7 and the states
 * before the copy is opened), and nowhere else; no line 2. Those rows are the ones of the two phases before the copy is ready.
 */
export const customerBarShown = (phase: CopyPhase): boolean => phase === 'empty' || phase === 'stage1';

/** What the bar draws: a row of 1.5, or one of the two states before the copy is opened. */
export type StatusBarContent = Pick<StatusBarView, 'tone' | 'icon' | 'line1' | 'line2' | 'action' | 'actionDisabled'>;

/** Before the copy is opened (Design 1.5): still opening after the empty wait, or an attempt has failed. */
export function deriveOpeningBar(input: { failed: boolean; retrying: boolean }): StatusBarContent {
  return {
    tone: 'neutral',
    icon: input.failed ? 'cloud-alert-outline' : 'sync',
    line1: [{ key: input.failed ? 'openFailed' : 'opening' }],
    line2: null,
    action: input.failed ? 'retry' : null,
    actionDisabled: input.retrying,
  };
}

const timed = (key: OfflineStatusKey, asOf: number | null): { key: OfflineStatusKey; time?: number } =>
  asOf === null ? { key } : { key, time: asOf };

/**
 * Line 2 of the bar: what is unsent, held, waiting for an administrator or unreadable. `limitApplies` is false with the
 * feature off, where the 2-hour limit stops nothing (WH-301, Product 2026-11-28): the count is told without the limit line.
 */
export function deriveUnsentLine(unsent: UnsentSummary | null, offline: boolean, limitApplies: boolean): StatusBarView['line2'] {
  if (unsent === null) return null;
  if (unsent.unreadable === true) return { key: 'unsentUnreadable', count: 0 };
  if ((unsent.waitingForAdmin ?? 0) > 0) return { key: 'waitingForAdmin', count: unsent.waitingForAdmin ?? 0 };
  if (unsent.count > 0) {
    if (limitApplies && unsent.limitReached) return { key: 'unsentLimit', count: unsent.count };
    if (offline) return { key: 'unsent', count: unsent.count, time: unsent.sendBy };
    return { key: 'sending', count: unsent.count };
  }
  // Nothing unsent: the person's held items are told (the unsent text wins when there is one).
  if ((unsent.held ?? 0) > 0) return { key: 'heldLine', count: unsent.held ?? 0 };
  return null;
}

export function deriveStatusBar(input: StatusBarInput): StatusBarView {
  let row: StatusBarRow;
  let icon: StatusBarIcon;
  let line1: StatusBarView['line1'];
  const notLoaded = input.phase === 'empty' || input.phase === 'stage1';
  if (notLoaded && input.loading && !input.offline) {
    row = 5;
    icon = 'cloud-download-outline';
    line1 = [{ key: 'firstLoad' }];
  } else if (notLoaded) {
    row = 7;
    icon = 'cloud-off-outline';
    line1 = [{ key: 'notReady' }];
  } else if (input.offline) {
    row = 3;
    icon = 'cloud-off-outline';
    line1 = [timed('offline', input.asOf)];
  } else if (input.current) {
    row = 1;
    icon = 'check-circle-outline';
    line1 = [{ key: 'upToDate' }];
  } else if (input.lastRunFailed) {
    row = 4;
    icon = 'cloud-refresh-outline';
    line1 = [timed('updateFailed', input.asOf)];
  } else {
    row = 2;
    icon = 'sync';
    line1 = [timed('updating', input.asOf)];
  }

  let action: StatusBarView['action'] = row === 4 || row === 7 ? 'retry' : null;
  const storage = input.storageLow;
  if (storage) {
    line1 = [{ key: 'storageLow' }];
    icon = 'harddisk';
    action = null;
  }

  const unsent = input.unsent;
  const unreadable = unsent?.unreadable === true;
  const limit = unsent !== null && (unreadable || (unsent.count > 0 && unsent.limitReached));
  const line2 = deriveUnsentLine(unsent, input.offline, true);
  if (limit) {
    icon = 'clock-alert-outline';
    action = null;
  }

  return {
    row,
    limit,
    storage,
    tone: limit || storage ? 'critical' : 'neutral',
    icon,
    line1,
    line2,
    action,
    actionDisabled: input.running,
  };
}

/**
 * Joins two sentences for a screen reader: ". " between them, and only a space when the first already ends in its own
 * mark (a full stop or "…"), so it never reads ".." (WH-301, Design 1.5 row 6).
 */
export function joinSentences(first: string, second: string): string {
  return `${first}${/[.…]$/.test(first) ? ' ' : '. '}${second}`;
}

/** Line 2 of these kinds opens "Unsent items"; the unreadable and waiting-for-administrator lines are information only. */
export const line2OpensUnsent = (line2: StatusBarView['line2']): boolean =>
  line2 !== null && line2.key !== 'unsentUnreadable' && line2.key !== 'waitingForAdmin';
