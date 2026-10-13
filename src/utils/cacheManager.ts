/**
 * Cache Manager Utility
 *
 * Provides standardized caching patterns for service data with automatic expiry,
 * versioning, and cleanup capabilities.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';
import { createLogger } from './logger';
import { CACHE_DURATION_DEFAULT_MS, CACHE_PREFIXES } from '@/config/cacheConfig';
import { getSessionIdentity } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';

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
 * Scope for caches that hold one session's data: the selected server instance
 * and the signed-in subject. Null means "no session": read and write nothing.
 */
export async function getSessionCacheScope(): Promise<string | null> {
  try {
    const identity = await getSessionIdentity();
    if (!identity) return null;
    return JSON.stringify([identity.origin, identity.instanceId, identity.subject]);
  } catch {
    return null;
  }
}

/**
 * Generate a session-scoped cache key. The key still starts with the prefix so
 * prefix invalidation keeps working.
 *
 * @example
 * generateScopedCacheKey('grn_list', scope, { customerId: '123' })
 * // Returns: 'grn_list_<scope>_123'
 */
export function generateScopedCacheKey(
  prefix: string,
  scope: string,
  params: Record<string, unknown> = {}
): string {
  return generateCacheKey(`${prefix}_${scope}`, params);
}

/**
 * Remove every list cache the app writes, across all sessions and scopes.
 * Runs on logout, forced logout and server switch.
 */
export async function clearAllCaches(): Promise<void> {
  try {
    // Writes of the bounded caches already queued land first, so none of them puts an entry back.
    await Promise.all([...boundedCacheQueues].map(idle => idle()));
    const allKeys = await AsyncStorage.getAllKeys();
    const prefixes = Object.values(CACHE_PREFIXES);
    const matchingKeys = allKeys.filter(key =>
      prefixes.some(prefix => key.startsWith(prefix))
    );
    if (matchingKeys.length > 0) {
      await AsyncStorage.multiRemove(matchingKeys);
      cacheLogger.info(`Cleared ${matchingKeys.length} cache entries`);
    }
  } catch (error) {
    cacheLogger.warn('Error clearing caches:', error);
  }
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

/** Limits of a bounded cache (createBoundedCache). Sizes are UTF-16 units of the stored JSON. */
export interface BoundedCacheLimits {
  /** Most entries kept under the prefix. */
  maxEntries: number;
  /** Most characters kept under the prefix, all entries together. */
  maxTotalChars: number;
  /** Longest entry kept; a longer answer is not stored. */
  maxEntryChars: number;
  /** Age after which an entry is neither served nor kept. */
  expiryMs: number;
}

export interface BoundedCache {
  /** The index key: `<prefix>_index`, under the prefix, so prefix removal and clearAllCaches remove it. */
  readonly indexKey: string;
  /**
   * Keep `data` under `key` (which must start with `<prefix>_`). `generation` is
   * the session generation when the request was sent: an answer to an earlier
   * session is not kept. Resolves to whether the entry was stored; never rejects.
   */
  set<T>(key: string, data: T, generation?: number): Promise<boolean>;
  /** The entry under `key` if younger than `expiryMs` and the session has not changed since `generation`. */
  get<T>(key: string, generation?: number): Promise<T | null>;
  /** Remove every entry and the index, after the writes already queued. */
  clear(): Promise<void>;
}

type BoundedIndexRow = [key: string, storedAt: number, length: number];

/** For each bounded cache: a promise that settles once its queued writes have landed. Never rejects. */
const boundedCacheQueues = new Set<() => Promise<unknown>>();

/** The index rows, or null when there is no index or it cannot be read. */
function readBoundedIndex(raw: string | null): BoundedIndexRow[] | null {
  if (!raw) return null;
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return null;
    return rows.filter(
      (row): row is BoundedIndexRow =>
        Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number' && typeof row[2] === 'number'
    );
  } catch {
    return null;
  }
}

/**
 * A cache under one key prefix whose entries are listed in one index key,
 * `[key, storedAt, length][]`, so that it stays bounded without reading every
 * entry (as src/features/reports/reportCache.ts does for reports).
 *
 * Every write drops the entries of this prefix older than `expiryMs`, then
 * keeps the newest entries up to `maxEntries` and `maxTotalChars`; an entry
 * longer than `maxEntryChars` is not stored. Only keys of this prefix are ever
 * removed. Writes run one at a time, so two answers arriving together do not
 * lose each other from the index. A write or read that crosses a change of
 * session (sessionLifecycle's generation) does nothing.
 *
 * Entries are stored as setCachedData stores them, so getCachedData reads them.
 * When the index is missing (first write after an update, or after a removal),
 * entries of the prefix that it does not list are removed.
 */
export function createBoundedCache(prefix: string, limits: BoundedCacheLimits): BoundedCache {
  const indexKey = `${prefix}_index`;
  const ownKey = (key: string) => key.startsWith(`${prefix}_`) && key !== indexKey;
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <R>(task: () => Promise<R>): Promise<R> => {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  };
  boundedCacheQueues.add(() => queue);

  async function write(key: string, value: string, storedAt: number, generation: number): Promise<boolean> {
    try {
      if (generation !== getSessionGeneration()) return false;
      const rows = readBoundedIndex(await AsyncStorage.getItem(indexKey));
      if (generation !== getSessionGeneration()) return false;
      const dropped: string[] = [];
      if (rows === null) {
        const allKeys = await AsyncStorage.getAllKeys();
        if (generation !== getSessionGeneration()) return false;
        dropped.push(...allKeys.filter(other => ownKey(other) && other !== key));
      }
      const fits = value.length <= limits.maxEntryChars;
      // An answer too long to keep replaces the older one for the same request all the same.
      if (!fits && rows?.some(([other]) => other === key)) dropped.push(key);
      const kept: BoundedIndexRow[] = fits ? [[key, storedAt, value.length]] : [];
      let total = fits ? value.length : 0;
      // Newest first; once one does not fit, it and every older one go.
      const others = (rows ?? []).filter(([other]) => other !== key).sort((a, b) => b[1] - a[1]);
      let full = false;
      for (const row of others) {
        full ||= storedAt - row[1] > limits.expiryMs || kept.length >= limits.maxEntries || total + row[2] > limits.maxTotalChars;
        if (full) {
          dropped.push(row[0]);
        } else {
          kept.push(row);
          total += row[2];
        }
      }
      if (!fits && dropped.length === 0) return false;
      // Both requests sent without waiting in between: a teardown that starts
      // later lists the keys after this write has landed.
      const index: [string, string] = [indexKey, JSON.stringify(kept)];
      await Promise.all([
        AsyncStorage.multiSet(fits ? [[key, value], index] : [index]),
        dropped.length > 0 ? AsyncStorage.multiRemove(dropped) : undefined,
      ]);
      return fits;
    } catch (error) {
      cacheLogger.warn(`Error writing bounded cache under ${prefix}:`, error);
      return false;
    }
  }

  return {
    indexKey,
    set<T>(key: string, data: T, generation: number = getSessionGeneration()): Promise<boolean> {
      if (!ownKey(key)) return Promise.resolve(false);
      let value: string;
      const storedAt = Date.now();
      try {
        const entry: CacheEntry<T> = { data, timestamp: storedAt, cacheKey: key, version: '1.0' };
        value = JSON.stringify(entry);
      } catch {
        return Promise.resolve(false);
      }
      return enqueue(() => write(key, value, storedAt, generation));
    },
    async get<T>(key: string, generation: number = getSessionGeneration()): Promise<T | null> {
      if (!ownKey(key) || generation !== getSessionGeneration()) return null;
      const data = await getCachedData<T>(key, { expiryMs: limits.expiryMs });
      return generation === getSessionGeneration() ? data : null;
    },
    clear(): Promise<void> {
      return enqueue(() => invalidateCacheByPrefix(prefix));
    },
  };
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
