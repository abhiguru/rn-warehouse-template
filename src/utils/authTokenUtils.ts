/**
 * Centralized Auth Token Utilities
 *
 * Provides consistent access to authentication tokens across the app.
 * Tries Supabase session first, then SecureStore, then legacy AsyncStorage.
 *
 * Updated to support S2/S3 SecureStore migration.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getSupabaseClient } from '@/config/supabaseConfig';

// SecureStore keys (must match supabaseConfig.ts)
const SECURE_KEYS = {
  AUTH_TOKEN: 'secure_auth_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  TOKEN_EXPIRES: 'secure_token_expires',
} as const;

// Older fallback storage base64-encoded JWTs; do not send that encoding as a token.
const decodeLegacyToken = (value: string | null): string | null => {
  if (!value || value.includes('.')) return value;
  try { return atob(value); } catch { return null; }
};

export interface AuthTokenResult {
  token: string | null;
  source: 'supabase' | 'securestore' | 'asyncstorage' | 'none';
  expiresAt?: number;
}

/**
 * Get the current authentication token.
 * Checks in order: Supabase session -> SecureStore -> Legacy AsyncStorage
 *
 * @returns Promise with token, source, and optional expiry
 */
export async function getAuthToken(): Promise<AuthTokenResult> {
  try {
    // Try Supabase session first
    const { data: { session } } = await getSupabaseClient().auth.getSession();

    if (session?.access_token) {
      return {
        token: session.access_token,
        source: 'supabase',
        expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
      };
    }

    // Try SecureStore (S2/S3 fix - tokens now stored securely)
    const secureToken = await SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);
    const secureExpiresStr = await SecureStore.getItemAsync(SECURE_KEYS.TOKEN_EXPIRES);

    if (secureToken) {
      const expiresAt = secureExpiresStr ? parseInt(secureExpiresStr, 10) : undefined;

      // Check if token is expired
      if (expiresAt && expiresAt < Date.now()) {
        console.warn('[AuthTokenUtils] SecureStore token expired, clearing...');
        await clearAuthTokens();
        return { token: null, source: 'none' };
      }

      return {
        token: secureToken,
        source: 'securestore',
        expiresAt,
      };
    }

    // Fallback to legacy AsyncStorage JWT tokens (for migration)
    const storedLegacyToken = await AsyncStorage.getItem('auth_token');
    const legacyToken = decodeLegacyToken(storedLegacyToken);
    const legacyExpiresStr = await AsyncStorage.getItem('token_expires_at');

    if (legacyToken) {
      const expiresAt = legacyExpiresStr ? parseInt(legacyExpiresStr, 10) : undefined;

      // Check if token is expired
      if (expiresAt && expiresAt < Date.now()) {
        console.warn('[AuthTokenUtils] Legacy token expired, clearing...');
        await clearAuthTokens();
        return { token: null, source: 'none' };
      }

      // Migrate to SecureStore
      console.log('[AuthTokenUtils] Migrating token from AsyncStorage to SecureStore');
      await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, legacyToken);
      if (legacyExpiresStr) {
        await SecureStore.setItemAsync(SECURE_KEYS.TOKEN_EXPIRES, legacyExpiresStr);
      }
      const legacyRefresh = await AsyncStorage.getItem('refresh_token');
      if (legacyRefresh) {
        await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, decodeLegacyToken(legacyRefresh)!);
      }
      // Clear legacy storage
      await AsyncStorage.multiRemove(['auth_token', 'refresh_token', 'token_expires_at']);

      return {
        token: legacyToken,
        source: 'securestore', // Now in SecureStore after migration
        expiresAt,
      };
    }

    return { token: null, source: 'none' };
  } catch (error) {
    console.error('[AuthTokenUtils] Error getting auth token:', error);
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
 * Get refresh token from SecureStore (with AsyncStorage fallback)
 *
 * @returns Promise with refresh token or null
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    // Try SecureStore first
    const secureToken = await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
    if (secureToken) {
      return secureToken;
    }

    // Fallback to legacy AsyncStorage
    return decodeLegacyToken(await AsyncStorage.getItem('refresh_token'));
  } catch (error) {
    console.error('[AuthTokenUtils] Error getting refresh token:', error);
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
  try {
    await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, accessToken);

    if (refreshToken) {
      await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    }

    if (expiresAt) {
      await SecureStore.setItemAsync(SECURE_KEYS.TOKEN_EXPIRES, expiresAt.toString());
    }
  } catch (error) {
    console.error('[AuthTokenUtils] Error storing auth tokens:', error);
    throw error;
  }
}

/**
 * Clear all auth tokens from SecureStore and AsyncStorage
 */
export async function clearAuthTokens(): Promise<void> {
  try {
    // Clear from SecureStore
    await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN_EXPIRES).catch(() => {});

    // Also clear any legacy tokens from AsyncStorage
    await AsyncStorage.multiRemove([
      'auth_token',
      'refresh_token',
      'token_expires_at',
    ]);
  } catch (error) {
    console.error('[AuthTokenUtils] Error clearing auth tokens:', error);
    throw error;
  }
}

/**
 * Check if token will expire soon (within specified minutes)
 *
 * @param withinMinutes - Check if token expires within this many minutes (default: 5)
 * @returns Promise with boolean indicating if token expires soon
 */
export async function tokenExpiresSoon(withinMinutes: number = 5): Promise<boolean> {
  const result = await getAuthToken();

  if (!result.token || !result.expiresAt) {
    return false;
  }

  const expiresInMs = result.expiresAt - Date.now();
  const thresholdMs = withinMinutes * 60 * 1000;

  return expiresInMs < thresholdMs;
}
