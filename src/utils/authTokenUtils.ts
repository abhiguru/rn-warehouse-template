/**
 * Centralized Auth Token Utilities
 *
 * Provides consistent access to authentication tokens across the app.
 * Uses the custom session manager, including single-flight token refresh.
 *
 * Updated to support S2/S3 SecureStore migration.
 */

import {
  clearStoredTokens,
  ensureValidTokens,
  getStoredToken,
  storeTokens,
} from '@/config/supabaseConfig';

export interface AuthTokenResult {
  token: string | null;
  source: 'supabase' | 'securestore' | 'asyncstorage' | 'none';
  expiresAt?: number;
}

/**
 * Get the current authentication token.
 * Renews an expired access token before reading the stored session.
 *
 * @returns Promise with token, source, and optional expiry
 */
export async function getAuthToken(): Promise<AuthTokenResult> {
  try {
    if (!(await ensureValidTokens())) return { token: null, source: 'none' };
    const stored = await getStoredToken();
    return stored.isValid && stored.authToken
      ? {
          token: stored.authToken,
          source: 'securestore',
          expiresAt: stored.expiresAt,
        }
      : { token: null, source: 'none' };
  } catch {
    return { token: null, source: 'none' };
  }
}

/**
 * Get just the token string (convenience function)
 *
 * @returns Promise with token string or null
 */
export async function getAuthTokenString(): Promise<string | null> {
  const result = await getAuthToken();
  return result.token;
}

/**
 * Check if user is authenticated
 *
 * @returns Promise with boolean indicating authentication status
 */
export async function isAuthenticated(): Promise<boolean> {
  const result = await getAuthToken();
  return result.token !== null;
}

/**
 * Read a complete securely persisted session, including one-way legacy migration.
 *
 * @returns Promise with refresh token or null
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    return (await getStoredToken()).refreshToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Store auth tokens in SecureStore
 *
 * @param accessToken - The access token
 * @param refreshToken - The refresh token (optional)
 * @param expiresAt - Token expiry timestamp in milliseconds (optional)
 */
export async function storeAuthTokens(
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<void> {
  // Partial updates could pair credentials from different sessions.
  await storeTokens(accessToken, refreshToken ?? '', expiresAt ?? 0);
}

/**
 * Clear all auth tokens from SecureStore and AsyncStorage
 */
export async function clearAuthTokens(): Promise<void> {
  await clearStoredTokens();
}

/**
 * Check if token will expire soon (within specified minutes)
 *
 * @param withinMinutes - Check if token expires within this many minutes (default: 5)
 * @returns Promise with boolean indicating if token expires soon
 */
export async function tokenExpiresSoon(
  withinMinutes: number = 5
): Promise<boolean> {
  const result = await getAuthToken();

  if (!result.token || !result.expiresAt) {
    return false;
  }

  const expiresInMs = result.expiresAt - Date.now();
  const thresholdMs = withinMinutes * 60 * 1000;

  return expiresInMs < thresholdMs;
}
