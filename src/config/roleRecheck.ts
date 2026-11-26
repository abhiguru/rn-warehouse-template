/**
 * After an offline start nothing is changed on the server until the person's role and customer assignments have been
 * read again (WH-346). The session restore (src/store/slices/authSlice.ts) holds the session's writes here with the
 * read that confirms them; the gated fetch (src/config/supabaseConfig.ts) is the one place that waits for it, so every
 * write path is covered. Reads, the token refresh and sign-out are never held: the confirming read needs them.
 *
 * A held write asks for the read now and goes on only when it succeeds; otherwise it is refused with the identity
 * gate's own signal, so the app behaves as for any unconfirmed session (nothing was sent). A failed read is also
 * repeated on its own, after the waits below, until it succeeds or the session ends.
 */
import { getSessionGeneration } from './sessionLifecycle';
import { registerSessionScoped } from './sessionScopedRegistry';

/** The waits between failed reads; the last one repeats. The same steps as the phone copy's sync. */
export const ROLE_RECHECK_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;

interface Hold {
  /** The session generation whose writes are held. */
  generation: number;
  /** True once the role and assignments were read from the server and applied. */
  reread: () => Promise<boolean>;
  failures: number;
  timer?: ReturnType<typeof setTimeout> | undefined;
  running?: Promise<boolean> | undefined;
}

let hold: Hold | null = null;

function drop(): void {
  clearTimeout(hold?.timer);
  hold = null;
}

// A session that ended or was replaced has nothing left to confirm; its waiting writes fail on the generation check.
// Only such a hold is dropped: no teardown ever releases the writes of the session that is still current.
registerSessionScoped(
  'role-recheck',
  () => {
    if (hold && hold.generation !== getSessionGeneration()) drop();
  },
  { onGenerationChange: true }
);

/** One read at a time: callers that arrive while it runs share its result. */
function attempt(current: Hold): Promise<boolean> {
  if (current.running) return current.running;
  clearTimeout(current.timer);
  current.timer = undefined;
  const running = Promise.resolve()
    .then(current.reread)
    .catch(() => false)
    .then(confirmed => {
      current.running = undefined;
      if (hold !== current) return false;
      if (confirmed) {
        hold = null;
        return true;
      }
      const wait = ROLE_RECHECK_BACKOFF_MS[Math.min(current.failures, ROLE_RECHECK_BACKOFF_MS.length - 1)];
      current.failures += 1;
      current.timer = setTimeout(() => void attempt(current), wait);
      // Under Node (tests) a waiting attempt must not keep the process alive.
      (current.timer as { unref?: () => void }).unref?.();
      return false;
    });
  current.running = running;
  return running;
}

/**
 * Holds the writes of session `generation` until `reread` answers true, and asks it at once. A session restored again
 * keeps its hold and is confirmed by the newer `reread`. Nothing happens when that session has already ended.
 */
export function holdWritesForRoleRecheck(generation: number, reread: () => Promise<boolean>): void {
  if (generation !== getSessionGeneration()) return;
  if (hold?.generation === generation) hold.reread = reread;
  else {
    drop();
    hold = { generation, reread, failures: 0 };
  }
  void attempt(hold);
}

export const isRoleRecheckPending = (generation = getSessionGeneration()): boolean => hold?.generation === generation;

/** The server has just answered: the read is asked now and the waits start over. */
export function retryRoleRecheckNow(): void {
  if (!hold) return;
  hold.failures = 0;
  void attempt(hold);
}

/**
 * What a write of session `generation` waits for. Resolves once that session's role is confirmed. Throws the gated
 * fetch's signals (they stay English, see `awaitIdentityGate`) when it could not be, or the session changed meanwhile.
 */
export async function awaitRoleRecheck(generation: number): Promise<void> {
  const current = hold;
  const confirmed = current?.generation !== generation || (await attempt(current));
  if (generation !== getSessionGeneration()) throw new Error('Session changed');
  if (!confirmed) throw new Error('Warehouse identity verification required');
}
