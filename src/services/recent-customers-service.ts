import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_CUSTOMERS_KEY_PREFIX = 'recent_customers_';
const LEGACY_RECENT_CUSTOMERS_KEY = 'recent_customers'; // For migration/cleanup
const MAX_RECENT = 20;

export interface RecentCustomer {
  id: string;
  name: string;
  detail?: string; // Address or city for display
  timestamp: number;
}

/**
 * Get storage key scoped by user ID
 */
function getStorageKey(userId: string | undefined): string | null {
  if (!userId) {
    console.warn('[RecentCustomersService] No userId provided - recent customers disabled');
    return null;
  }
  return `${RECENT_CUSTOMERS_KEY_PREFIX}${userId}`;
}

export const RecentCustomersService = {
  /**
   * Add customer to recent list (user-scoped)
   * @param id Customer ID
   * @param name Customer name
   * @param detail Optional detail (address/city)
   * @param userId Current user ID for scoping storage
   */
  async addRecentCustomer(id: string, name: string, detail?: string, userId?: string): Promise<void> {
    const storageKey = getStorageKey(userId);
    if (!storageKey) return;

    try {
      const recent = await this.getRecentCustomers(userId);

      // Remove if already exists and re-add to top
      const filtered = recent.filter(c => c.id !== id);

      // Add new customer to top
      const updated = [
        { id, name, detail, timestamp: Date.now() },
        ...filtered
      ].slice(0, MAX_RECENT);

      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (error) {
      console.error('[RecentCustomersService] Error adding recent customer:', error);
    }
  },

  /**
   * Get recent customers (user-scoped)
   * @param userId Current user ID for scoping storage
   */
  async getRecentCustomers(userId?: string): Promise<RecentCustomer[]> {
    const storageKey = getStorageKey(userId);
    if (!storageKey) return [];

    try {
      const data = await AsyncStorage.getItem(storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[RecentCustomersService] Error getting recent customers:', error);
      return [];
    }
  },

  /**
   * Clear recent customers for a specific user
   * @param userId User ID to clear recent customers for
   */
  async clearRecentCustomersForUser(userId: string): Promise<void> {
    const storageKey = getStorageKey(userId);
    if (!storageKey) return;

    try {
      await AsyncStorage.removeItem(storageKey);
      console.log('[RecentCustomersService] Recent customers cleared for user');
    } catch (error) {
      console.error('[RecentCustomersService] Error clearing recent customers:', error);
    }
  },

  /**
   * Clear ALL recent customers (all users) - called on logout
   * Also clears legacy non-scoped key for migration
   */
  async clearRecentCustomers(): Promise<void> {
    try {
      // Clear legacy key
      await AsyncStorage.removeItem(LEGACY_RECENT_CUSTOMERS_KEY);

      // Clear all user-scoped keys
      const allKeys = await AsyncStorage.getAllKeys();
      const recentCustomerKeys = allKeys.filter(key => key.startsWith(RECENT_CUSTOMERS_KEY_PREFIX));

      if (recentCustomerKeys.length > 0) {
        await AsyncStorage.multiRemove(recentCustomerKeys);
        console.log('[RecentCustomersService] Cleared', recentCustomerKeys.length, 'recent customer caches');
      }

      console.log('[RecentCustomersService] All recent customers cleared');
    } catch (error) {
      console.error('[RecentCustomersService] Error clearing recent customers:', error);
    }
  }
};
