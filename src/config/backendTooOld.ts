/**
 * The facility the phone is signed in to runs a backend below `MIN_BACKEND_MIGRATION`: told by its public config
 * (`schemaHead`), recorded where the release is (operatorBootstrap.ts after every verification, openFacility.ts when a
 * facility is opened), and shown by `BootstrapApp` (app/_layout.tsx) as `BackendTooOldScreen`. Same shape as appTooOld.ts.
 * A backend that does not say its schema head never sets it.
 */
import { MIN_BACKEND_MIGRATION, backendBelowFloor, setFacilityRelease } from './backendFeatures';
import { getActiveOperatorServer } from './operatorServer';
import { registerSessionScoped } from './sessionScopedRegistry';

export type BackendTooOldInfo = { migration: number; minimum: number };

let tooOld: BackendTooOldInfo | null = null;
const listeners = new Set<() => void>();
export const getBackendTooOld = (): BackendTooOldInfo | null => tooOld;
export const subscribeBackendTooOld = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function set(next: BackendTooOldInfo | null): void {
  // The same answer again keeps the object, so a screen reading it does not render again for nothing.
  if (tooOld === next || (tooOld && next && tooOld.migration === next.migration && tooOld.minimum === next.minimum)) return;
  tooOld = next;
  for (const listener of [...listeners]) listener();
}
export const clearBackendTooOld = (): void => set(null);

/**
 * Records the release a server's public config names, and, when that server is the active one, whether it is below the
 * floor. A config for another server (a preview) changes nothing on screen.
 */
export function noteBackendRelease(
  server: { origin: string; instanceId: string },
  config: { backendRelease?: unknown; schemaHead?: unknown }
): void {
  setFacilityRelease(server, config);
  const active = getActiveOperatorServer();
  if (!active || active.origin !== server.origin || active.instanceId !== server.instanceId) return;
  const head = typeof config.schemaHead === 'string' ? backendBelowFloor(config.schemaHead) : null;
  set(head === null ? null : { migration: head, minimum: MIN_BACKEND_MIGRATION });
}

registerSessionScoped('backend-too-old', () => clearBackendTooOld());
