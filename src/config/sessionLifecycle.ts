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
