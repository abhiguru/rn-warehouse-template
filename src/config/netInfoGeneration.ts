/**
 * Counts how many times NetInfo was configured again (src/config/netReachability.ts).
 *
 * `NetInfo.configure` stops every listener added before it ("calling this will stop all previously added
 * listeners from being called again"). A hook that listens (useNetworkStatus) reads this count and
 * subscribes again when it changes. No imports, so the hook does not pull in the server code.
 */
let generation = 0;
const listeners = new Set<() => void>();

export const getNetInfoGeneration = (): number => generation;

export function subscribeNetInfoGeneration(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bumpNetInfoGeneration(): void {
  generation += 1;
  for (const listener of [...listeners]) listener();
}
