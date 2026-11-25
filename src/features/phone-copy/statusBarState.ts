/**
 * Which state the offline status bar shows (WH-298; Design product/design/offline-capture.md Part 1, 1.5, with the
 * answer to P9; contract 8.2). Pure: no React, no clock.
 */
import type { CopyPhase } from './syncStore';

/** Unsent work (WH-301 supplies it; WH-298 passes null). */
export interface UnsentSummary {
  count: number;
  /** When the oldest unsent item turns 2 hours old (ms). */
  sendBy: number;
  limitReached: boolean;
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
  | 'upToDate' | 'updating' | 'offline' | 'updateFailed' | 'firstLoad' | 'olderLoading' | 'olderPaused' | 'notReady'
  | 'storageLow';
export type StatusBarIcon =
  | 'check-circle-outline' | 'sync' | 'cloud-off-outline' | 'cloud-refresh-outline' | 'cloud-download-outline'
  | 'clock-alert-outline' | 'harddisk';

export interface StatusBarView {
  /** The line-1 row of Design 1.5. */
  row: StatusBarRow;
  /** Row 6: the second stage of the first load. */
  olderLoading: boolean;
  /** Row 8: unsent work past 2 hours. */
  limit: boolean;
  /** Row 9: storage running short. */
  storage: boolean;
  tone: 'neutral' | 'critical';
  icon: StatusBarIcon;
  line1: { key: OfflineStatusKey; time?: number }[];
  line2: { key: 'unsent' | 'sending' | 'unsentLimit'; count: number; time?: number } | null;
  action: 'retry' | null;
  actionDisabled: boolean;
}

const timed = (key: OfflineStatusKey, asOf: number | null): { key: OfflineStatusKey; time?: number } =>
  asOf === null ? { key } : { key, time: asOf };

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

  const olderLoading = input.phase === 'stage2';
  // Offline nothing loads, so the second sentence says when it will (Design's answer to P9).
  if (olderLoading) line1 = [...line1, { key: input.offline ? 'olderPaused' : 'olderLoading' }];

  let action: StatusBarView['action'] = row === 4 || row === 7 ? 'retry' : null;
  const storage = input.storageLow;
  if (storage) {
    line1 = [{ key: 'storageLow' }];
    icon = 'harddisk';
    action = null;
  }

  let line2: StatusBarView['line2'] = null;
  const unsent = input.unsent;
  const limit = unsent !== null && unsent.count > 0 && unsent.limitReached;
  if (unsent && unsent.count > 0) {
    if (limit) line2 = { key: 'unsentLimit', count: unsent.count };
    else if (input.offline) line2 = { key: 'unsent', count: unsent.count, time: unsent.sendBy };
    else line2 = { key: 'sending', count: unsent.count };
  }
  if (limit) {
    icon = 'clock-alert-outline';
    action = null;
  }

  return {
    row,
    olderLoading,
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
