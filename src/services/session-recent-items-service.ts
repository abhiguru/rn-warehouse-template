import AsyncStorage from '@react-native-async-storage/async-storage';
import { GRNItem } from '@/types/order.types';

export interface SessionRecentItem {
  item: GRNItem;
  addedAt: string; // ISO timestamp when item was added
  customerId: string; // Track which customer this was added for
}

interface SessionRecentItemsCache {
  items: SessionRecentItem[];
  lastUpdated: string;
}

const CACHE_KEY_PREFIX = 'session_recent_items_';
const RETENTION_HOURS = 10 * 24; // Keep items for 10 days (240 hours)
const MAX_ITEMS = 20; // Maximum number of items to keep per customer

export const SessionRecentItemsService = {
  /**
   * Get the cache key for a specific customer
   */
  getCacheKey(customerId: string): string {
    return `${CACHE_KEY_PREFIX}${customerId}`;
  },

  /**
   * Load persisted recently added items for a customer
   */
  async loadRecentlyAddedItems(customerId: string): Promise<GRNItem[]> {
    try {
      console.log('[SessionRecentItemsService] Loading persisted items for customer:', customerId);

      const cacheKey = this.getCacheKey(customerId);
      const cached = await AsyncStorage.getItem(cacheKey);

      if (!cached) {
        console.log('[SessionRecentItemsService] No cached items found');
        return [];
      }

      const cache: SessionRecentItemsCache = JSON.parse(cached);

      // Filter out expired items
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - RETENTION_HOURS);

      const validItems = cache.items.filter(item => {
        const addedTime = new Date(item.addedAt);
        return addedTime > cutoffTime;
      });

      // Deduplicate by item name (same item can have different IDs across GRN records)
      const seenNames = new Set<string>();
      const uniqueItems = validItems.filter(item => {
        const nameLower = item.item.name.toLowerCase();
        if (seenNames.has(nameLower)) {
          return false;
        }
        seenNames.add(nameLower);
        return true;
      });

      console.log('[SessionRecentItemsService] Loaded items:', {
        total: cache.items.length,
        valid: validItems.length,
        unique: uniqueItems.length,
        expired: cache.items.length - validItems.length,
        duplicatesRemoved: validItems.length - uniqueItems.length
      });

      // If we filtered out any items (expired or duplicates), update the cache
      if (uniqueItems.length !== cache.items.length) {
        await this.saveRecentlyAddedItems(customerId, uniqueItems.map(item => item.item));
      }

      // Return just the GRNItem objects (not the wrapper with timestamps)
      return uniqueItems.map(item => item.item);
    } catch (error) {
      console.error('[SessionRecentItemsService] Error loading items:', error);
      return [];
    }
  },

  /**
   * Save recently added items for a customer
   */
  async saveRecentlyAddedItems(customerId: string, items: GRNItem[]): Promise<void> {
    try {
      console.log('[SessionRecentItemsService] Saving items for customer:', customerId, 'Count:', items.length);

      const cacheKey = this.getCacheKey(customerId);

      // Load existing cache to preserve timestamps for items that already exist
      let existingCache: SessionRecentItemsCache | null = null;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          existingCache = JSON.parse(cached);
        }
      } catch (error) {
        console.log('[SessionRecentItemsService] No existing cache or error reading it');
      }

      // Create a map of existing items by NAME (not ID) for quick lookup
      // Same item can have different IDs across GRN records
      const existingItemsMap = new Map<string, SessionRecentItem>();
      if (existingCache) {
        existingCache.items.forEach(item => {
          const nameLower = item.item.name.toLowerCase();
          // Only keep the first occurrence (most recent) for each name
          if (!existingItemsMap.has(nameLower)) {
            existingItemsMap.set(nameLower, item);
          }
        });
      }

      // Deduplicate input items by name (keep first occurrence)
      const seenNames = new Set<string>();
      const uniqueItems = items.filter(item => {
        const nameLower = item.name.toLowerCase();
        if (seenNames.has(nameLower)) {
          return false;
        }
        seenNames.add(nameLower);
        return true;
      });

      // Build the new items list, preserving timestamps for existing items
      const now = new Date().toISOString();
      const sessionItems: SessionRecentItem[] = uniqueItems.slice(0, MAX_ITEMS).map(item => {
        // Check if this item already exists in the cache (by name)
        const nameLower = item.name.toLowerCase();
        const existing = existingItemsMap.get(nameLower);
        if (existing) {
          // Preserve the original timestamp
          return {
            item,
            addedAt: existing.addedAt,
            customerId
          };
        } else {
          // New item, use current timestamp
          return {
            item,
            addedAt: now,
            customerId
          };
        }
      });

      const cache: SessionRecentItemsCache = {
        items: sessionItems,
        lastUpdated: now
      };

      await AsyncStorage.setItem(cacheKey, JSON.stringify(cache));
      console.log('[SessionRecentItemsService] Successfully saved', sessionItems.length, 'items');
    } catch (error) {
      console.error('[SessionRecentItemsService] Error saving items:', error);
    }
  },

  /**
   * Add a single item to the recently added list
   */
  async addRecentlyAddedItem(customerId: string, item: GRNItem): Promise<GRNItem[]> {
    try {
      console.log('[SessionRecentItemsService] Adding item:', item.name, 'for customer:', customerId);

      // Load existing items
      const existingItems = await this.loadRecentlyAddedItems(customerId);

      // Remove the item if it already exists BY NAME (to move it to front)
      // Same item can have different IDs across GRN records
      const filtered = existingItems.filter(i => i.name.toLowerCase() !== item.name.toLowerCase());

      // Add the new item at the front
      const updated = [item, ...filtered];

      // Save the updated list
      await this.saveRecentlyAddedItems(customerId, updated);

      return updated;
    } catch (error) {
      console.error('[SessionRecentItemsService] Error adding item:', error);
      return [item]; // Return at least the new item
    }
  },

  /**
   * Remove an item from the recently added list
   */
  async removeRecentlyAddedItem(customerId: string, itemId: string): Promise<GRNItem[]> {
    try {
      console.log('[SessionRecentItemsService] Removing item:', itemId, 'for customer:', customerId);

      // Load existing items
      const existingItems = await this.loadRecentlyAddedItems(customerId);

      // Filter out the item
      const updated = existingItems.filter(i => i.id !== itemId);

      // Save the updated list
      await this.saveRecentlyAddedItems(customerId, updated);

      return updated;
    } catch (error) {
      console.error('[SessionRecentItemsService] Error removing item:', error);
      return [];
    }
  },

  /**
   * Clear all recently added items for a customer
   */
  async clearRecentlyAddedItems(customerId: string): Promise<void> {
    try {
      console.log('[SessionRecentItemsService] Clearing items for customer:', customerId);
      const cacheKey = this.getCacheKey(customerId);
      await AsyncStorage.removeItem(cacheKey);
      console.log('[SessionRecentItemsService] Successfully cleared items');
    } catch (error) {
      console.error('[SessionRecentItemsService] Error clearing items:', error);
    }
  },

  /**
   * Clear ALL session recent items for ALL customers
   * Call this on logout to prevent data leakage between users
   */
  async clearAllSessionRecentItems(): Promise<void> {
    try {
      console.log('[SessionRecentItemsService] Clearing all session recent items on logout');

      const allKeys = await AsyncStorage.getAllKeys();
      const recentItemsKeys = allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));

      if (recentItemsKeys.length > 0) {
        await AsyncStorage.multiRemove(recentItemsKeys);
        console.log('[SessionRecentItemsService] Cleared', recentItemsKeys.length, 'session recent item caches');
      } else {
        console.log('[SessionRecentItemsService] No session recent item caches to clear');
      }
    } catch (error) {
      console.error('[SessionRecentItemsService] Error clearing all session recent items:', error);
    }
  },

  /**
   * Clean up expired items across all customers
   * This can be called periodically to clean up old data
   */
  async cleanupExpiredItems(): Promise<void> {
    try {
      console.log('[SessionRecentItemsService] Starting cleanup of expired items');

      const allKeys = await AsyncStorage.getAllKeys();
      const recentItemsKeys = allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));

      console.log('[SessionRecentItemsService] Found', recentItemsKeys.length, 'customer caches to check');

      for (const key of recentItemsKeys) {
        try {
          const cached = await AsyncStorage.getItem(key);
          if (!cached) continue;

          const cache: SessionRecentItemsCache = JSON.parse(cached);

          // Check if the entire cache is too old (no updates in RETENTION_HOURS)
          const lastUpdated = new Date(cache.lastUpdated);
          const cutoffTime = new Date();
          cutoffTime.setHours(cutoffTime.getHours() - RETENTION_HOURS);

          if (lastUpdated < cutoffTime) {
            // Remove the entire cache
            await AsyncStorage.removeItem(key);
            console.log('[SessionRecentItemsService] Removed expired cache:', key);
          } else {
            // Filter individual items
            const validItems = cache.items.filter(item => {
              const addedTime = new Date(item.addedAt);
              return addedTime > cutoffTime;
            });

            if (validItems.length < cache.items.length) {
              // Some items expired, update the cache
              cache.items = validItems;
              cache.lastUpdated = new Date().toISOString();
              await AsyncStorage.setItem(key, JSON.stringify(cache));
              console.log('[SessionRecentItemsService] Updated cache', key, '- removed', cache.items.length - validItems.length, 'expired items');
            }
          }
        } catch (error) {
          console.error('[SessionRecentItemsService] Error processing cache', key, ':', error);
        }
      }

      console.log('[SessionRecentItemsService] Cleanup completed');
    } catch (error) {
      console.error('[SessionRecentItemsService] Error during cleanup:', error);
    }
  }
};