/**
 * What the facility's backend release can do, told by the release itself and not guessed from a failed call.
 *
 * `get-public-config` publishes `backendRelease` (the release tag) and `schemaHead` (the file name of the newest
 * applied migration, such as `00000000000126_sessions_and_source_limits`). This module keeps them per server, in
 * memory, from the same places that keep the facility's capabilities (operatorBootstrap.ts, openFacility.ts), and
 * answers one question: does this backend have a feature the app can also do without?
 *
 * The table below is the whole of it: a feature, and the migration that introduced it. A backend whose newest
 * migration is lower is older, and the app leaves the feature out on purpose and says nothing. A backend that
 * does not say (no `schemaHead`: a release from before the field existed, or a source archive) is treated as OLDER:
 * `schemaHead` exists only from the release that also contains every migration in the table, so a backend without it
 * can only be an earlier one, and it keeps working exactly as it did before the table existed (the app leaves the
 * feature out and the call falls back silently). The cost is that such a backend loses a check it may have; the
 * alternative, treating unknown as current, would stop order-line edits on every facility not yet upgraded.
 */
import { getActiveOperatorServer } from './operatorServer';

type ServerIdentity = { origin: string; instanceId: string };
export type BackendRelease = { backendRelease: string | null; schemaHead: string | null };

/** Features the app can do without, and the number of the migration that introduced each. */
const INTRODUCED_BY_MIGRATION = {
  /** `p_expected_updated_at` on update_order_item_quantity and remove_item_from_order (owner decision D1). */
  orderLineVersion: 121,
  /** `suggest_document_number`, `get_document_numbering` and `set_document_numbering`, and the `NUMBER_FORMAT` refusal (WS-8). */
  documentNumbering: 127,
  /** `get_rack_presets` and `set_rack_presets`: the facility's Floor and Chamber buttons for a rack. */
  rackPresets: 131,
} as const;
export type BackendFeature = keyof typeof INTRODUCED_BY_MIGRATION;

const byServer = new Map<string, BackendRelease>();
const keyOf = (server: ServerIdentity): string => `${server.origin}|${server.instanceId}`;

const nameOrNull = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_.+-]{1,100}$/.test(value) ? value : null;

/** The number a migration file name starts with (`00000000000126_x` is 126), or null when it has none. */
export function migrationNumber(schemaHead: string | null | undefined): number | null {
  const digits = /^(\d+)_/.exec(schemaHead ?? '')?.[1];
  return digits === undefined ? null : Number(digits);
}

/** Records what a server's public config says about its release. Anything but a plain name is taken as absent. */
export function setFacilityRelease(server: ServerIdentity, config: { backendRelease?: unknown; schemaHead?: unknown }): void {
  byServer.set(keyOf(server), { backendRelease: nameOrNull(config.backendRelease), schemaHead: nameOrNull(config.schemaHead) });
}

/** The active server's release as last told; both null when nothing is known for it. */
export function getFacilityRelease(): BackendRelease {
  const active = getActiveOperatorServer();
  return (active && byServer.get(keyOf(active))) || { backendRelease: null, schemaHead: null };
}

/**
 * True only when the active server's release says it has the feature. A server that has not said (nothing recorded,
 * no `schemaHead`) counts as older (see the top of this file).
 */
export function backendHasFeature(feature: BackendFeature): boolean {
  const head = migrationNumber(getFacilityRelease().schemaHead);
  return head !== null && head >= INTRODUCED_BY_MIGRATION[feature];
}

/** Tests only. */
export function resetFacilityRelease(): void {
  byServer.clear();
}
