/**
 * The capabilities of the facility the app is connected to, from its public config
 * (`capabilities` in get-public-config), in memory only.
 *
 * They are set where the app adopts a server's public config: operatorBootstrap.ts after
 * every verification (cold start, server change, return to the foreground) and
 * openFacility.ts when a facility is opened from My facilities. Not in discoverOperator,
 * which also previews servers the app does not switch to.
 *
 * They are kept per server (origin and instance id) and read for the active server only,
 * so a server change never shows the previous facility's capabilities. They belong to the
 * server, not to the session: a sign-out and sign-in on the same server does not run
 * discovery again, and must not lose them. A server whose config has not been read in
 * this run gets DEMO_CAPABILITIES.
 */
import { DEMO_CAPABILITIES, type FacilityCapabilities } from './demoCapabilities';
import { getActiveOperatorServer } from './operatorServer';

export type { FacilityCapabilities } from './demoCapabilities';
export type CapabilityName = keyof FacilityCapabilities;

type ServerIdentity = { origin: string; instanceId: string };

const NAMES: readonly CapabilityName[] = ['printing', 'sensors', 'realtime', 'customerDocuments'];

const byServer = new Map<string, FacilityCapabilities>();
const listeners = new Set<() => void>();

const keyOf = (server: ServerIdentity): string => `${server.origin}|${server.instanceId}`;

/**
 * The four capabilities from a config's `capabilities` value: each known key that is true
 * or false is taken, anything else (a missing key, a string, a number, an unknown key, a
 * value that is not an object) leaves the demo default.
 */
export function normalizeCapabilities(raw: unknown): FacilityCapabilities {
  const result: FacilityCapabilities = { ...DEMO_CAPABILITIES };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const record = raw as Record<string, unknown>;
  for (const name of NAMES) {
    const value = record[name];
    if (typeof value === 'boolean') result[name] = value;
  }
  return result;
}

const same = (a: FacilityCapabilities, b: FacilityCapabilities): boolean => NAMES.every((name) => a[name] === b[name]);

/** Records a server's capabilities from its public config. */
export function setFacilityCapabilities(server: ServerIdentity, raw: unknown): void {
  const key = keyOf(server);
  const next = normalizeCapabilities(raw);
  const previous = byServer.get(key);
  // The same answer again (every foreground verification) keeps the object, so a screen
  // reading it through useSyncExternalStore does not render again for nothing.
  if (previous && same(previous, next)) return;
  byServer.set(key, next);
  for (const listener of [...listeners]) listener();
}

/** The active server's capabilities; DEMO_CAPABILITIES when none are known for it. */
export function getFacilityCapabilities(): FacilityCapabilities {
  const active = getActiveOperatorServer();
  return (active && byServer.get(keyOf(active))) || DEMO_CAPABILITIES;
}

export function hasCapability(name: CapabilityName): boolean {
  return getFacilityCapabilities()[name];
}

/** Called when any server's capabilities change. A change of the active server is announced by onOperatorServerChange. */
export function subscribeFacilityCapabilities(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetFacilityCapabilities(): void {
  byServer.clear();
  for (const listener of [...listeners]) listener();
}
