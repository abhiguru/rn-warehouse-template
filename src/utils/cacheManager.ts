/**
 * Cache Manager Utility
 *
 * Provides standardized caching patterns for service data with automatic expiry,
 * versioning, and cleanup capabilities.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';
import { createLogger } from './logger';
import { CACHE_DURATION_DEFAULT_MS } from '@/config/cacheConfig';

const cacheLogger = createLogger('CacheManager');

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  cacheKey: string;
  version?: string;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Cache expiry time in milliseconds (default: 5 minutes) */
  expiryMs?: number;
  /** Cache version for invalidation (default: '1.0') */
  version?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Default cache expiry time (5 minutes) - imported from centralized config
 */
const DEFAULT_CACHE_EXPIRY_MS = CACHE_DURATION_DEFAULT_MS;

/**
 * Generate a cache key based on prefix and parameters
 *
 * @example
 * generateCacheKey('grn_list', { customerId: '123', limit: 20, offset: 0 })
 * // Returns: 'grn_list_123_20_0'
 */
export function generateCacheKey(
  prefix: string,
  params: Record<string, unknown> = {}
): string {
  const keyParts = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b)) // Sort for consistency
    .map(([_, value]) => {
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);
      }
      return String(value);
    });

  return `${prefix}_${keyParts.join('_')}`;
}

/**
 * Get cached data if available and not expired
 *
 * @example
 * const cached = await getCachedData<GRNItem[]>('grn_list_123');
 * if (cached) {
 *   cacheManagerLogger.debug('Using cached data:', cached);
 * }
 */
export async function getCachedData<T>(
  cacheKey: string,
  options: CacheOptions = {}
): Promise<T | null> {
  const { expiryMs = DEFAULT_CACHE_EXPIRY_MS, version = '1.0', verbose = false } = options;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (!cached) {
      if (verbose) {
        cacheLogger.info(`Cache miss: ${cacheKey}`);
      }
      return null;
    }

    const parsedCache: CacheEntry<T> = JSON.parse(cached);

    // Check version mismatch
    if (parsedCache.version && parsedCache.version !== version) {
      if (verbose) {
        cacheLogger.info(`Cache version mismatch: ${cacheKey} (${parsedCache.version} !== ${version})`);
      }
      await AsyncStorage.removeItem(cacheKey).catch((err) => {
        cacheLogger.warn(`Failed to remove stale cache (version mismatch): ${cacheKey}`, err);
      });
      return null;
    }

    // Check expiry
    const isExpired = Date.now() - parsedCache.timestamp > expiryMs;
    if (isExpired) {
      if (verbose) {
        cacheLogger.info(`Cache expired: ${cacheKey}`);
      }
      await AsyncStorage.removeItem(cacheKey).catch((err) => {
        cacheLogger.warn(`Failed to remove expired cache: ${cacheKey}`, err);
      });
      return null;
    }

    if (verbose) {
      const age = Math.floor((Date.now() - parsedCache.timestamp) / 1000);
      cacheLogger.info(`Cache hit: ${cacheKey} (age: ${age}s)`);
    }

    return parsedCache.data;
  } catch (error) {
    cacheLogger.warn(`Error reading cache for ${cacheKey}:`, error);
    return null;
  }
}

/**
 * Cache data with automatic expiry tracking and retry logic.
 *
 * E9 Fix: Added retry with exponential backoff for transient failures.
 *
 * @example
 * await setCachedData('grn_list_123', grnItems, { expiryMs: 10 * 60 * 1000 });
 */
export async function setCachedData<T>(
  cacheKey: string,
  data: T,
  options: CacheOptions = {}
): Promise<boolean> {
  const { version = '1.0', verbose = false } = options;
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 100;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const cacheEntry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        cacheKey,
        version,
      };

      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheEntry));

      if (verbose) {
        const size = JSON.stringify(cacheEntry).length;
        cacheLogger.info(`Cached data: ${cacheKey} (${(size / 1024).toFixed(2)} KB)`);
      }

      return true; // Success
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        // Wait before retry with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        if (__DEV__) {
          cacheLogger.warn(`Cache write attempt ${attempt} failed for ${cacheKey}, retrying...`);
        }
      }
    }
  }

  // All retries exhausted - log at error level
  cacheLogger.error(`Failed to cache data for ${cacheKey} after ${MAX_RETRIES} attempts:`, lastError);
  cacheFailureCount++;

  // Don't throw - caching failure shouldn't break the app
  return false;
}

/**
 * Track cache write failures for monitoring
 */
let cacheFailureCount = 0;

/**
 * Get and reset cache failure count for monitoring
 */
export function getCacheFailureCount(): number {
  const count = cacheFailureCount;
  cacheFailureCount = 0;
  return count;
}

/**
 * Invalidate (remove) cached data for a specific key
 *
 * @example
 * await invalidateCache('grn_list_123');
 */
export async function invalidateCache(cacheKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey);
    cacheLogger.info(`Invalidated cache: ${cacheKey}`);
  } catch (error) {
    cacheLogger.warn(`Error invalidating cache for ${cacheKey}:`, error);
  }
}

/**
 * Invalidate all cache entries matching a prefix pattern
 *
 * @example
 * // Invalidate all GRN caches
 * await invalidateCacheByPrefix('grn_');
 */
export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const matchingKeys = allKeys.filter((key) => key.startsWith(prefix));

    if (matchingKeys.length > 0) {
      await AsyncStorage.multiRemove(matchingKeys);
      cacheLogger.info(`Invalidated ${matchingKeys.length} cache entries with prefix: ${prefix}`);
    }
  } catch (error) {
    cacheLogger.warn(`Error invalidating cache by prefix ${prefix}:`, error);
  }
}

/**
 * Get all cache keys
 */
export async function getAllCacheKeys(): Promise<readonly string[]> {
  try {
    return await AsyncStorage.getAllKeys();
  } catch (error) {
    cacheLogger.warn('Error getting cache keys:', error);
    return [];
  }
}

/**
 * Clear all expired cache entries using batch operations.
 * Uses multiGet/multiRemove for performance instead of sequential calls.
 * Should be called periodically (e.g., on app startup)
 */
export async function clearExpiredCache(expiryMs = DEFAULT_CACHE_EXPIRY_MS): Promise<number> {
  let clearedCount = 0;

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    if (allKeys.length === 0) return 0;

    const now = Date.now();
    const keysToRemove: string[] = [];

    // Batch read all cache entries at once (much faster than sequential reads)
    const keyValuePairs = await AsyncStorage.multiGet(allKeys);

    for (const [key, cached] of keyValuePairs) {
      if (!cached) continue;

      try {
        const parsedCache: CacheEntry<unknown> = JSON.parse(cached);
        const isExpired = now - parsedCache.timestamp > expiryMs;

        if (isExpired) {
          keysToRemove.push(key);
        }
      } catch {
        // Skip invalid cache entries (non-JSON data from other sources)
        continue;
      }
    }

    // Batch remove all expired entries at once
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
      clearedCount = keysToRemove.length;
      cacheLogger.info(`Cleared ${clearedCount} expired cache entries`);
    }
  } catch (error) {
    cacheLogger.warn('Error clearing expired cache:', error);
  }

  return clearedCount;
}

/**
 * Clear expired cache entries in the background after interactions complete.
 * This prevents blocking the UI during cache cleanup operations.
 */
export function clearExpiredCacheInBackground(expiryMs = DEFAULT_CACHE_EXPIRY_MS): void {
  InteractionManager.runAfterInteractions(() => {
    clearExpiredCache(expiryMs).catch((error) => {
      cacheLogger.warn('Background cache cleanup failed:', error);
    });
  });
}

/**
 * Get cache statistics using batch operations.
 * Uses multiGet for performance instead of sequential calls.
 */
export async function getCacheStats(): Promise<{
  totalKeys: number;
  totalSize: number;
  expiredKeys: number;
}> {
  let totalKeys = 0;
  let totalSize = 0;
  let expiredKeys = 0;

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    totalKeys = allKeys.length;

    if (allKeys.length === 0) {
      return { totalKeys, totalSize, expiredKeys };
    }

    const now = Date.now();

    // Batch read all entries at once
    const keyValuePairs = await AsyncStorage.multiGet(allKeys);

    for (const [, cached] of keyValuePairs) {
      if (!cached) continue;

      totalSize += cached.length;

      try {
        const parsedCache: CacheEntry<unknown> = JSON.parse(cached);
        const isExpired = now - parsedCache.timestamp > DEFAULT_CACHE_EXPIRY_MS;

        if (isExpired) {
          expiredKeys++;
        }
      } catch {
        // Non-cache entries (e.g., redux-persist data) - just count size
        continue;
      }
    }
  } catch (error) {
    cacheLogger.warn('Error getting cache stats:', error);
  }

  return {
    totalKeys,
    totalSize,
    expiredKeys,
  };
}
