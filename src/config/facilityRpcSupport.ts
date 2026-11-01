/**
 * Whether the facility's backend has a function the app can also do without, learned from the function's own answer
 * (PostgREST's PGRST202 "could not find the function" means the backend is older), in memory only.
 *
 * Used where a newer function adds a feature and no migration number in `backendFeatures.ts` is the better test: the
 * app tries, and records what the answer says. Until an answer has come the function is unknown (`undefined`), and a
 * screen offers the feature; after a PGRST202 it is `false` and the screen hides the feature. Kept per server (origin
 * and instance id) and read for the active server only, like facilityGrnPaging.ts.
 */
import { getActiveOperatorServer } from './operatorServer';

export type SupportedRpc = 'sensorHourly' | 'userSessions';

const byServer = new Map<string, Map<SupportedRpc, boolean>>();
const listeners = new Set<() => void>();

const activeKey = (): string | null => {
  const active = getActiveOperatorServer();
  return active ? `${active.origin}|${active.instanceId}` : null;
};

/** Records what the active server answered for a function: `false` when it does not exist, `true` when it answered. */
export function noteRpcSupport(name: SupportedRpc, supported: boolean): void {
  const key = activeKey();
  if (!key) return;
  const known = byServer.get(key) ?? new Map<SupportedRpc, boolean>();
  // The same answer again keeps the state, so a screen reading it does not render again for nothing.
  if (known.get(name) === supported) return;
  known.set(name, supported);
  byServer.set(key, known);
  for (const listener of [...listeners]) listener();
}

/** `false` when the active server is known not to have the function, `true` when it answered, else `undefined`. */
export function rpcSupport(name: SupportedRpc): boolean | undefined {
  const key = activeKey();
  return key ? byServer.get(key)?.get(name) : undefined;
}

export function subscribeRpcSupport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetRpcSupport(): void {
  byServer.clear();
  for (const listener of [...listeners]) listener();
}

/** PostgREST says the function does not exist on this backend (an older release). */
export function isMissingFunction(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 'PGRST202' || (typeof e?.message === 'string' && /could not find the function/i.test(e.message));
}
