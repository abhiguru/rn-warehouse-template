import AsyncStorage from '@react-native-async-storage/async-storage';
import { OrderService } from './order-service';
import { GRNItem } from '@/types/order.types';
import { CACHE_DURATION_MEDIUM_MS, CACHE_PREFIXES } from '@/config/cacheConfig';

export interface RecentItem extends GRNItem {
  lastOrderedDate: string;
  orderCount: number;
  totalQuantityDispatched: number;
  typicalQuantity: number; // Average quantity per order
}

interface RecentItemsCache {
  customerId: string;
  items: RecentItem[];
  timestamp: number;
}

const CACHE_KEY = CACHE_PREFIXES.RECENT_ITEMS;
const CACHE_DURATION_MS = CACHE_DURATION_MEDIUM_MS;

export const RecentItemsService = {
  /**
   * Get recent/frequently ordered items for a customer
   * Fetches dispatch history and aggregates by item
   */
  async getRecentItemsForCustomer(customerId: string): Promise<RecentItem[]> {
    try {
      console.log('[RecentItemsService] Fetching recent items for customer:', customerId);

      // Clear old cache and always refetch to ensure correct IDs
      await this.clearCache();

      // Check cache first
      const cached = await this.getCachedRecentItems(customerId);
      if (cached) {
        console.log('[RecentItemsService] Returning cached recent items, count:', cached.length);
        return cached;
      }

      // Fetch dispatch history for last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      console.log('[RecentItemsService] Fetching dispatch history from:', sixMonthsAgo.toISOString());

      const result = await OrderService.getCustomerDispatches(customerId, {
        dateFrom: sixMonthsAgo.toISOString(),
        sortBy: 'dispDate',
        sortOrder: 'desc',
        limit: 100,
        offset: 0
      });

      if (!result.success || !result.data) {
        console.log('[RecentItemsService] Failed to fetch dispatch history:', result.message);
        return [];
      }

      console.log('[RecentItemsService] Fetched dispatch records:', result.data.items?.length || 0);

      // Aggregate by item
      const itemMap = new Map<string, {
        item: GRNItem;
        lastOrderedDate: string;
        orderCount: number;
        totalQuantity: number;
        quantityList: number[];
      }>();

      // Type for dispatch record from RPC
      interface RpcDispatchRecord {
        id?: string;
        item_name?: string;
        grnItems_itemName?: string;
        grnItems_id?: string;
        packaging?: string;
        grnItems_packaging?: string;
        package_mark?: string;
        grnItems_packageMark?: string;
        stock?: number;
        grnItems_currentStock?: number;
        qty?: number;
        grnItems_originalQuantity?: number;
        catalog_id?: string;
        grnItems_catalogId?: string;
        rack?: string;
        grnItems_rack?: string;
        weight?: number;
        grnItems_weight?: number;
        grn_id?: string;
        grnItems_grId?: string;
        grn_details?: { gr_no?: string; date?: string };
        grnItems_grnNumber?: string;
        grnItems_grnDate?: string;
        image_url?: string;
        grnItems_imageUrl?: string;
        pricing_mode?: string;
        grnItems_pricingMode?: string;
        created_at?: string;
        grnItems_createdAt?: string;
        updated_at?: string;
        grnItems_updatedAt?: string;
        disp_date?: string;
        disp_qty?: number;
        dispDate?: string;
        dispatch_date?: string;
        dispQuantity?: number;
      }

      result.data.items?.forEach((dispatch: RpcDispatchRecord) => {
        // Aggregate by item NAME (not ID), since same item can be in multiple GRNs
        const itemName = dispatch.item_name || dispatch.grnItems_itemName || 'Unknown';
        // Use the GRN item record ID for the first occurrence
        const grnItemId = dispatch.id || dispatch.grnItems_id;

        // Build GRNItem object from dispatch data
        const grnItem: GRNItem = {
          id: grnItemId || '',
          name: itemName,
          packaging: dispatch.packaging || dispatch.grnItems_packaging || '',
          package_mark: dispatch.package_mark || dispatch.grnItems_packageMark || '',
          current_stock: dispatch.stock || dispatch.grnItems_currentStock || 0,
          original_quantity: dispatch.qty || dispatch.grnItems_originalQuantity || 0,
          catalog_id: dispatch.catalog_id || dispatch.grnItems_catalogId,
          catalog: undefined,
          rack: dispatch.rack || dispatch.grnItems_rack || '',
          weight: dispatch.weight || dispatch.grnItems_weight || 0,
          gr_id: dispatch.grn_id || dispatch.grnItems_grId || '',
          grn_number: dispatch.grn_details?.gr_no || dispatch.grnItems_grnNumber || '',
          grn_date: dispatch.grn_details?.date || dispatch.grnItems_grnDate || '',
          image_url: dispatch.image_url || dispatch.grnItems_imageUrl || '',
          pricing_mode: dispatch.pricing_mode || dispatch.grnItems_pricingMode || '',
          created_at: dispatch.created_at || dispatch.grnItems_createdAt || new Date().toISOString(),
          updated_at: dispatch.updated_at || dispatch.grnItems_updatedAt || new Date().toISOString()
        };

        // Use item name as key for aggregation
        const existing = itemMap.get(itemName);

        if (existing) {
          existing.orderCount++;
          existing.totalQuantity += dispatch.dispQuantity || 0;
          existing.quantityList.push(dispatch.dispQuantity || 0);
          // Update last ordered if this is more recent
          const dispDate = dispatch.dispDate || dispatch.dispatch_date || new Date().toISOString();
          if (new Date(dispDate) > new Date(existing.lastOrderedDate)) {
            existing.lastOrderedDate = dispDate;
          }
        } else {
          itemMap.set(itemName, {
            item: grnItem,
            lastOrderedDate: dispatch.dispDate || dispatch.dispatch_date || new Date().toISOString(),
            orderCount: 1,
            totalQuantity: dispatch.dispQuantity || 0,
            quantityList: [dispatch.dispQuantity || 0]
          });
        }
      });

      // Convert to RecentItem array
      const recentItems: RecentItem[] = Array.from(itemMap.values())
        .map(entry => ({
          ...entry.item,
          lastOrderedDate: entry.lastOrderedDate,
          orderCount: entry.orderCount,
          totalQuantityDispatched: entry.totalQuantity,
          typicalQuantity: Math.round(entry.totalQuantity / entry.orderCount)
        }))
        .sort((a, b) => {
          // Sort by most recent first, then by frequency
          const dateCompare = new Date(b.lastOrderedDate).getTime() -
                              new Date(a.lastOrderedDate).getTime();
          if (dateCompare !== 0) return dateCompare;
          return b.orderCount - a.orderCount;
        })
        .slice(0, 20); // Top 20 items

      console.log('[RecentItemsService] Aggregated recent items:', {
        totalItems: recentItems.length,
        topItem: recentItems[0]?.name,
        topItemFrequency: recentItems[0]?.orderCount
      });

      // Cache the results
      await this.cacheRecentItems(customerId, recentItems);

      return recentItems;
    } catch (error) {
      console.error('[RecentItemsService] Error fetching recent items:', error);
      return [];
    }
  },

  /**
   * Get cached recent items if available and not expired
   */
  async getCachedRecentItems(customerId: string): Promise<RecentItem[] | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const cache: RecentItemsCache = JSON.parse(cached);

      // Check if cache is for the right customer and not expired
      if (cache.customerId === customerId &&
          Date.now() - cache.timestamp < CACHE_DURATION_MS) {
        console.log('[RecentItemsService] Using cached data');
        return cache.items;
      }

      // Cache expired or different customer
      return null;
    } catch (error) {
      console.error('[RecentItemsService] Error reading cache:', error);
      return null;
    }
  },

  /**
   * Save recent items to cache
   */
  async cacheRecentItems(customerId: string, items: RecentItem[]): Promise<void> {
    try {
      const cache: RecentItemsCache = {
        customerId,
        items,
        timestamp: Date.now()
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log('[RecentItemsService] Cached recent items for customer');
    } catch (error) {
      console.error('[RecentItemsService] Error caching recent items:', error);
    }
  },

  /**
   * Clear cache for a customer
   */
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
      console.log('[RecentItemsService] Cache cleared');
    } catch (error) {
      console.error('[RecentItemsService] Error clearing cache:', error);
    }
  }
};
