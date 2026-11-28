/**
 * Which kinds of records a sync changed (WH-299, product/tech/app-offline-read-from-copy.md section 11.1; Product's
 * PR9): the engine notes them as each write is committed and publishes them once when the run ends, so a screen reads
 * again only when what it shows changed. A run that changed nothing publishes nothing.
 */
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import type { EntityName } from './copySchema';

export interface CopyChanges {
  /** Grows with every publication. */
  seq: number;
  kinds: ReadonlySet<EntityName>;
}

const state = { seq: 0, pending: new Set<EntityName>() };
/** Mounted screens; each removes itself. */
const listeners = new Set<(changes: CopyChanges) => void>();

export function subscribeCopyChanges(listener: (changes: CopyChanges) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Kinds written to the copy and not yet published. */
export function noteCopyChange(kinds: Iterable<EntityName>): void {
  for (const kind of kinds) state.pending.add(kind);
}

/** Tells the screens what changed since the last publication; nothing when nothing did. */
export function publishCopyChanges(): void {
  if (!state.pending.size) return;
  const changes: CopyChanges = { seq: ++state.seq, kinds: state.pending };
  state.pending = new Set<EntityName>();
  for (const listener of [...listeners]) listener(changes);
}

/** The copy is erased, or the session ends: nothing is left to tell. */
export function forgetCopyChanges(): void {
  state.pending = new Set<EntityName>();
}

registerSessionScoped('copy-changes', forgetCopyChanges);
