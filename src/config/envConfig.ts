/**
 * Environment Configuration for React Native
 *
 * Configuration is loaded dynamically from Supabase Edge Functions:
 * - Public config from: /functions/v1/get-public-config (no auth required)
 * - Full config from: /functions/v1/get-config (auth required)
 *
 * Set EXPO_PUBLIC_CONFIG_API_URL in your .env file to point to your
 * local Supabase Docker instance (default: http://localhost:18000).
 *
 * Android USB/emulator: use adb reverse tcp:18000 tcp:18000.
 * Keep the supported demo origin http://localhost:18000.
 */

/**
 * Base URL for configuration API
 * Reads from EXPO_PUBLIC_CONFIG_API_URL env var (set in .env)
 * Defaults to local Docker Supabase on port 18000
 */
export const CONFIG_API_BASE_URL =
  process.env.EXPO_PUBLIC_CONFIG_API_URL || 'http://localhost:18000';

/**
 * App configuration metadata
 */
export const APP_CONFIG = {
  name: process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager',
  company: process.env.EXPO_PUBLIC_COMPANY_NAME || 'Your Company',
  useSupabaseAuth: true,
  useDevAuth: __DEV__,
} as const;

// =============================================================================
// Central login (docs/CENTRAL_LOGIN.md)
// =============================================================================

/**
 * The origin of an address the central identity service may be called at, or
 * null. It must be `https://`. A development build also accepts
 * `http://localhost:PORT` and `http://127.0.0.1:PORT` (a service started on
 * the developer's machine); a release build never does.
 */
export function parseCentralOrigin(value: string | undefined, dev: boolean): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
  // A host name is the same in any letter case; the origin is kept in lower case.
  const origin = url.origin.toLowerCase();
  if (url.protocol === 'https:') return origin;
  const host = url.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1';
  if (dev && url.protocol === 'http:' && local && url.port) return origin;
  return null;
}

export type CentralLoginConfig = {
  /** The address the app calls. */
  origin: string;
  /** The issuer name facilities trust (`centralLogin.issuer` of a facility, `iss` of a token). */
  issuer: string;
};

/**
 * Both values are fixed when the app is built; Expo inlines `EXPO_PUBLIC_*`.
 * An origin that is not acceptable (plain http in a release build, a path, a
 * typing mistake) gives null: central login stays off rather than half on.
 */
export function readCentralLoginConfig(
  origin: string | undefined,
  issuer: string | undefined,
  dev: boolean
): CentralLoginConfig | null {
  const parsed = parseCentralOrigin(origin, dev);
  if (!parsed) return null;
  return { origin: parsed, issuer: (issuer ?? '').trim() || parsed };
}

const CENTRAL_LOGIN = readCentralLoginConfig(
  process.env.EXPO_PUBLIC_CENTRAL_ORIGIN,
  process.env.EXPO_PUBLIC_CENTRAL_ISSUER,
  __DEV__
);

/** The central service of this build, or null when the build names none. */
export const getCentralLoginConfig = (): CentralLoginConfig | null => CENTRAL_LOGIN;

/** Central login is on only when the build names the central origin. */
export const isCentralLoginConfigured = (): boolean => CENTRAL_LOGIN !== null;

/**
 * The label of the terms of use the person accepts on central sign-in, sent as
 * `terms_version`. It follows the date on app/terms-of-service.tsx ("Last
 * updated: December 2025"): change both together.
 */
export const TERMS_VERSION = '2025-12';
