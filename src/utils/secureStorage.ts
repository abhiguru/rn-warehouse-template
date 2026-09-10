/**
 * Secure Token Storage Utility
 *
 * Uses expo-secure-store for encrypted token storage on device.
 * Falls back to AsyncStorage only for non-sensitive data.
 *
 * Security improvements:
 * - Tokens stored in device keychain/keystore (encrypted)
 * - No base64 obfuscation - proper encryption used
 * - Separate storage for sensitive vs non-sensitive data
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageLogger } from './logger';

// Keys for secure storage (sensitive data)
const SECURE_KEYS = {
  AUTH_TOKEN: 'secure_auth_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  TOKEN_EXPIRES_AT: 'secure_token_expires_at',
} as const;

// Keys for regular storage (non-sensitive data)
const STORAGE_KEYS = {
  CACHED_USER_PROFILE: 'cached_user_profile',
  SESSION_MARKER: 'session_marker',
} as const;

/**
 * Store authentication tokens securely in device keychain/keystore
 */
export const storeTokensSecurely = async (
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> => {
  try {
    await Promise.all([
      SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, accessToken),
      SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
      SecureStore.setItemAsync(SECURE_KEYS.TOKEN_EXPIRES_AT, expiresAt.toString()),
    ]);

    storageLogger.info('Tokens stored securely in keychain/keystore');
  } catch (error) {
    storageLogger.error('Error storing tokens securely:', error);
    throw error;
  }
};

/**
 * Retrieve authentication tokens from secure storage
 */
export const getStoredTokensSecurely = async (): Promise<{
  authToken: string | null;
  refreshToken: string | null;
  expiresAt: number;
  isValid: boolean;
  type: 'jwt' | null;
}> => {
  try {
    const [authToken, refreshToken, expiresAtStr] = await Promise.all([
      SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN),
      SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN),
      SecureStore.getItemAsync(SECURE_KEYS.TOKEN_EXPIRES_AT),
    ]);

    if (authToken && refreshToken && expiresAtStr) {
      const expiresAt = parseInt(expiresAtStr, 10);
      const now = Date.now();

      // Check if token is still valid (with 5-minute buffer)
      if (expiresAt > now + 5 * 60 * 1000) {
        return {
          authToken,
          refreshToken,
          expiresAt,
          isValid: true,
          type: 'jwt',
        };
      } else {
        // Tokens expired - clean up
        storageLogger.info('Tokens expired, cleaning up');
        await clearStoredTokensSecurely();
      }
    }

    return {
      authToken: null,
      refreshToken: null,
      expiresAt: 0,
      isValid: false,
      type: null,
    };
  } catch (error) {
    storageLogger.error('Error retrieving tokens:', error);
    return {
      authToken: null,
      refreshToken: null,
      expiresAt: 0,
      isValid: false,
      type: null,
    };
  }
};

/**
 * Clear all stored authentication tokens from secure storage
 */
export const clearStoredTokensSecurely = async (): Promise<void> => {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN),
      SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN_EXPIRES_AT),
    ]);

    storageLogger.info('All tokens cleared from secure storage');
  } catch (error) {
    storageLogger.error('Error clearing tokens:', error);
    throw error;
  }
};

/**
 * Migrate tokens from old AsyncStorage (base64) to SecureStore
 * This is a one-time migration function
 */
export const migrateTokensToSecureStorage = async (): Promise<boolean> => {
  try {
    // Check if we already have tokens in secure storage
    const secureTokens = await getStoredTokensSecurely();
    if (secureTokens.isValid) {
      storageLogger.info('Tokens already in secure storage, skipping migration');
      return true;
    }

    // Try to get tokens from old AsyncStorage
    const [oldAuthToken, oldRefreshToken, oldExpiresAt] = await Promise.all([
      AsyncStorage.getItem('auth_token'),
      AsyncStorage.getItem('refresh_token'),
      AsyncStorage.getItem('token_expires_at'),
    ]);

    if (oldAuthToken && oldRefreshToken && oldExpiresAt) {
      // Decode base64 tokens if needed
      const authToken = decodeOldToken(oldAuthToken);
      const refreshToken = decodeOldToken(oldRefreshToken);
      const expiresAt = parseInt(oldExpiresAt, 10);

      // Store in secure storage
      await storeTokensSecurely(authToken, refreshToken, expiresAt);

      // Clear old AsyncStorage tokens
      await AsyncStorage.multiRemove(['auth_token', 'refresh_token', 'token_expires_at']);

      storageLogger.info('Successfully migrated tokens to secure storage');
      return true;
    }

    return false;
  } catch (error) {
    storageLogger.error('Error during migration:', error);
    return false;
  }
};

/**
 * Helper to decode old base64-encoded tokens
 */
const decodeOldToken = (encoded: string): string => {
  try {
    // Check if it looks like a JWT (contains periods)
    if (encoded.includes('.')) {
      return encoded; // Already decoded
    }
    // Decode base64
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    // Fallback to plain token
    return encoded;
  }
};

/**
 * Store user profile in cache (non-sensitive)
 */
export const cacheUserProfile = async (profile: unknown): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CACHED_USER_PROFILE,
      JSON.stringify(profile)
    );
    storageLogger.info('User profile cached');
  } catch (error) {
    storageLogger.error('Error caching profile:', error);
  }
};

/**
 * Get cached user profile (non-sensitive)
 */
export const getCachedUserProfile = async (): Promise<unknown | null> => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE);
    if (cached) {
      storageLogger.info('Cached user profile found');
      return JSON.parse(cached);
    }
  } catch (error) {
    storageLogger.error('Error getting cached profile:', error);
  }
  return null;
};

/**
 * Clear user profile cache
 */
export const clearUserProfileCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE);
    storageLogger.info('User profile cache cleared');
  } catch (error) {
    storageLogger.error('Error clearing profile cache:', error);
  }
};

/**
 * Clear all stored data (tokens + cache)
 */
export const clearAllStoredData = async (): Promise<void> => {
  try {
    await Promise.all([
      clearStoredTokensSecurely(),
      clearUserProfileCache(),
      AsyncStorage.removeItem(STORAGE_KEYS.SESSION_MARKER),
    ]);

    storageLogger.info('All stored data cleared');
  } catch (error) {
    storageLogger.error('Error clearing all data:', error);
    throw error;
  }
};
