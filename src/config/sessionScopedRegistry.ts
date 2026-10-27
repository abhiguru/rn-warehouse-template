/**
 * The one list of things that belong to a single signed-in session on one server.
 *
 * A module that keeps session data outside the Redux store (a cache, a memo keyed by customer or
 * facility, a list of waiting listeners) registers its clear function here. `clearSessionScopedState`
 * (src/store/sessionScopedState.ts) runs every registered clear on logout, forced logout, account
 * deletion and both server-switch paths. A test (src/tests/sessionScopedRegistry.scan.test.ts) fails
 * when a module under src/services or src/features holds module-level state and is neither a
 * registrant nor on its allow-list.
 *
 * This file imports only sessionLifecycle, which imports nothing, so any module may use it.
 */
import type { UnknownAction } from '@reduxjs/toolkit';
import { onSessionChange } from './sessionLifecycle';

export interface SessionScopedContext {
  dispatch: (action: UnknownAction) => unknown;
}

export type SessionScopedClear = (context: SessionScopedContext) => void | Promise<void>;

export interface SessionScopedOptions {
  /**
   * Also run the clear, synchronously, whenever the session generation advances (sign-in, token
   * store or clear, server switch). Set it for a cache that must never serve a request of the
   * previous session even where no full teardown runs.
   */
  onGenerationChange?: boolean;
}

interface Entry {
  clear: SessionScopedClear;
  stopGenerationWatch?: () => void;
}

// Registration order is the order of the teardown. A module that registers itself runs in import order, which is
// before or after the ones sessionScopedState.ts registers depending on who imported what first; each such clear is
// independent of the others.
const entries = new Map<string, Entry>();

/**
 * Registers `clear` under a unique `name`. Registering the same name again replaces the earlier
 * entry (a module evaluated twice must not leave two copies behind).
 */
export function registerSessionScoped(
  name: string,
  clear: SessionScopedClear,
  options: SessionScopedOptions = {}
): void {
  entries.get(name)?.stopGenerationWatch?.();
  entries.delete(name);
  const entry: Entry = { clear };
  if (options.onGenerationChange) {
    // Synchronous, as the onSessionChange listeners it replaces were; a failure is dropped, not thrown into the
    // session change, and a rejection of an async clear is caught instead of left unhandled.
    entry.stopGenerationWatch = onSessionChange(() => {
      try {
        const pending = clear({ dispatch: () => undefined });
        if (pending) pending.catch(() => {});
      } catch {
        /* the next teardown clears it again */
      }
    });
  }
  entries.set(name, entry);
}

/** The registered names, in teardown order. */
export function registeredSessionScopedNames(): string[] {
  return [...entries.keys()];
}

/** Runs every registered clear in registration order, each awaited before the next. */
export async function runSessionScopedClears(context: SessionScopedContext): Promise<void> {
  for (const { clear } of [...entries.values()]) await clear(context);
}
