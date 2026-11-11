/**
 * A facility on its local network only (WH-146). Its server has no public address, so the manifest names a placeholder
 * origin, `https://wh-<12 hex>.local-only.invalid` (backend scripts/ingress.mjs `localOnlyOrigin`; `.invalid` never
 * resolves, RFC 2606). The placeholder is only the key the app files the facility's tokens and caches under: the facility
 * is told apart by its `instanceId`, and the only path to it is its address on the warehouse network.
 *
 * No imports: the config layer, the transport and the screens all use it.
 */

/** The placeholder origin the server names for this `instanceId`: its first 12 characters without dashes, lower case. */
export const localOnlyOrigin = (instanceId: string): string =>
  `https://wh-${instanceId.replace(/-/g, '').slice(0, 12).toLowerCase()}.local-only.invalid`;

export const isLocalOnlyOrigin = (origin: unknown): boolean =>
  typeof origin === 'string' && /^https:\/\/wh-[0-9a-f]{12}\.local-only\.invalid$/.test(origin);
