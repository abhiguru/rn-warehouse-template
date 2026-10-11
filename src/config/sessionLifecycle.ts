// Invalidate asynchronous work synchronously, before waiting for native storage.
let generation = 0;
let mutations: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export const getSessionGeneration = () => generation;
export const onSessionChange = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function advanceSessionGeneration() {
  generation += 1;
  for (const listener of listeners) listener();
  return generation;
}
export function serializeCredentials<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = mutations.then(operation, operation);
  mutations = result.catch(() => {});
  return result;
}

/**
 * How long before its expiry an access token is renewed: a tenth of the
 * token's lifetime, five minutes at most. A fixed five minutes would renew a
 * token of a facility that sets access_seconds to 300 or less the moment it
 * was issued, on every check and every request. A token that does not state
 * its lifetime (no `iat`) gets the five minutes.
 */
const MAX_RENEW_AHEAD_MS = 5 * 60 * 1000;
export function renewAheadMs(accessToken: string | undefined): number {
  let lifetimeMs = NaN;
  try {
    const payload = accessToken?.split('.')[1];
    const claims = payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) : null;
    lifetimeMs = (Number(claims?.exp) - Number(claims?.iat)) * 1000;
  } catch {
    /* not a token that can be read: the default applies */
  }
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) return MAX_RENEW_AHEAD_MS;
  return Math.min(MAX_RENEW_AHEAD_MS, lifetimeMs / 10);
}
