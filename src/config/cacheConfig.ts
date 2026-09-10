/**
 * Centralized Cache Configuration
 *
 * This file contains all cache duration constants used across the app.
 * Centralizing these values makes it easier to tune performance and
 * ensures consistency across different caching implementations.
 *
 * @see PO10 - Cache Duration Inconsistency fix
 */

// =============================================================================
// CACHE DURATIONS (in milliseconds)
// =============================================================================

/**
 * Default cache expiry for general data (e.g., list caches)
 * Used by: cacheManager.ts, dispatch-service.ts
 */
export const CACHE_DURATION_DEFAULT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Short-lived cache for frequently changing data (e.g., autocomplete)
 * Used by: autocomplete-service.ts
 */
export const CACHE_DURATION_SHORT_MS = 30 * 1000; // 30 seconds

/**
 * Medium cache duration for user-specific data
 * Used by: recent-items-service.ts
 */
export const CACHE_DURATION_MEDIUM_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Long-lived cache for semi-static data (e.g., user profile)
 * Used by: supabaseConfig.ts
 */
export const CACHE_DURATION_LONG_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// CACHE KEYS AND PREFIXES
// =============================================================================

/**
 * Cache key prefixes for different data types
 */
export const CACHE_PREFIXES = {
  DISPATCH_LIST: 'dispatch_list_cache',
  AUTOCOMPLETE: 'autocomplete_cache',
  RECENT_ITEMS: 'recent_items_cache',
  USER_PROFILE: 'cached_user_profile',
  GRN_LIST: 'grn_list_cache',
  ORDER_LIST: 'order_list_cache',
  INVOICE_LIST: 'invoice_list_cache',
  STOCK_LIST: 'stock_list_cache',
} as const;

// =============================================================================
// PAGINATION DEFAULTS
// =============================================================================

/**
 * Default pagination settings used across services
 * @see M2 - Pagination Defaults Scattered fix
 */
export const PAGINATION = {
  /** Default number of items per page */
  DEFAULT_LIMIT: 20,
  /** Maximum items per page (safety limit) */
  MAX_LIMIT: 1000,
  /** Default offset for first page */
  DEFAULT_OFFSET: 0,
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CachePrefix = typeof CACHE_PREFIXES[keyof typeof CACHE_PREFIXES];
