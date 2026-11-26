/**
 * What the sync engine tells the app about the phone copy (WH-298, contract 7.1): read with useSyncExternalStore
 * (src/hooks/usePhoneCopyStatus.ts). The same snapshot object until something in it changes.
 */
export type CopyPhase = 'empty' | 'stage1' | 'stage2' | 'ready';

export interface SyncSnapshot {
  /** 'unknown' until the capability and the format are known for this session. */
  feature: 'unknown' | 'on' | 'off';
  phase: CopyPhase;
  running: null | 'first-load' | 'changes' | 'reload' | 'checksums';
  /** A full sync within the last minute and the server reachable. */
  current: boolean;
  /** The server's time of what the copy holds (ISO), shown as "Last updated". */
  asOf: string | null;
  /** The last finished run failed and no run has succeeded since. */
  lastRunFailed: boolean;
  storageLow: boolean;
  /** Size of the file and its -wal. */
  copyBytes: number | null;
  /** Free space on the phone when the size was read (Settings' note); absent until then. */
  freeBytes?: number | null;
  /**
   * The first real state is not known yet: the copy is not open, or it holds nothing usable and the run that says
   * what happens next has not begun. The bar is then empty (Design 1.5); `phase` says nothing about the phone.
   */
  pending?: boolean;
}

const INITIAL: SyncSnapshot = {
  feature: 'unknown',
  phase: 'empty',
  running: null,
  current: false,
  asOf: null,
  lastRunFailed: false,
  storageLow: false,
  copyBytes: null,
  pending: true,
};

const store = { snapshot: INITIAL, listeners: new Set<() => void>() };

export function subscribeSync(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function getSyncSnapshot(): SyncSnapshot {
  return store.snapshot;
}

/** Changes the snapshot; listeners hear only of a real change. */
export function updateSyncSnapshot(patch: Partial<SyncSnapshot>): void {
  const current = store.snapshot;
  const keys = Object.keys(patch) as (keyof SyncSnapshot)[];
  if (keys.every(key => current[key] === patch[key])) return;
  store.snapshot = { ...current, ...patch };
  for (const listener of [...store.listeners]) listener();
}

/** Back to the state of a phone with no copy (after an erase). */
export function resetSyncSnapshot(patch: Partial<SyncSnapshot> = {}): void {
  store.snapshot = INITIAL;
  updateSyncSnapshot(patch);
  for (const listener of [...store.listeners]) listener();
}
