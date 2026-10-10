import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Platform,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, formatWeight } from '@/utils/formatters';
import { StatusTag } from '@/components/ui';
import { OrderService } from '@/services/order-service';
import { StockService } from '@/services/stock-service';
import { SessionRecentItemsService } from '@/services/session-recent-items-service';
import { GRNItem, Catalog, EnhancedSearchFilters, SearchMetadata } from '@/types/order.types';
import RecentItemsQuickAdd, { QuickAddItem } from './RecentItemsQuickAdd';

import { showAlert } from '@/utils/alert';
import { localizeDigits, normalizeDigits, t as tr, formatIdentifier } from '@/i18n';
type StockStatus = 'positive' | 'critical' | 'negative';

// Status words and icons per guide §3.5 (stock level: low stock is critical).
const stockLabel = (status: StockStatus): string =>
  status === 'negative' ? tr('common.outOfStock') : status === 'critical' ? tr('common.lowStock') : tr('common.inStock');
const formatBags = (n: number) => formatCount(n, 'bag');

interface ItemCatalogBrowserProps {
  isVisible: boolean;
  onClose: () => void;
  onAddItems: (items: Array<{ grnItemId: string; quantity: number }>) => void;
  currentOrderId: string;
  customerId: string;
  currentOrderItems?: Array<{ grnItemId: string; quantity: number; item: GRNItem }>;
}

interface SelectedItem {
  grnItemId: string;
  quantity: number;
  item: GRNItem;
}

// Rows requested per page in browse and search mode.
const CATALOG_PAGE_SIZE = 50;

// Search results are EnhancedGRNItem; the list renders plain GRNItem.
const toGRNItem = (item: GRNItem): GRNItem => ({
  id: item.id,
  name: item.name,
  packaging: item.packaging,
  package_mark: item.package_mark,
  current_stock: item.current_stock,
  original_quantity: item.original_quantity,
  catalog_id: item.catalog_id,
  catalog: item.catalog,
  rack: item.rack,
  weight: item.weight,
  gr_id: item.gr_id,
  grn_number: item.grn_number,
  grn_date: item.grn_date,
  image_url: item.image_url,
  pricing_mode: item.pricing_mode,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const appendUnique = (current: GRNItem[], page: GRNItem[]): GRNItem[] => {
  const seen = new Set(current.map(item => item.id));
  const fresh = page.filter(item => !seen.has(item.id));
  return fresh.length > 0 ? [...current, ...fresh] : current;
};

const ItemCatalogBrowser: React.FC<ItemCatalogBrowserProps> = ({
  isVisible,
  onClose,
  onAddItems,
  currentOrderId,
  customerId,
  currentOrderItems = [],
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['95%'], []);

  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<GRNItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<GRNItem[]>([]);
  const [customerAllItems, setCustomerAllItems] = useState<GRNItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [showSelectedItems, setShowSelectedItems] = useState(false);
  const [flashingItems, setFlashingItems] = useState<Set<string>>(new Set());
  const [searchMetadata, setSearchMetadata] = useState<SearchMetadata | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [useEnhancedSearch, setUseEnhancedSearch] = useState(true);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Every browse reload takes a new id; an older page is discarded.
  const browseRequestRef = useRef(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every search edit takes a new id; a response whose id is no longer current
  // is discarded so an earlier, slower search cannot overwrite a later one.
  const searchRequestRef = useRef(0);
  const sliderUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWeightSlider, setShowWeightSlider] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, 50]);
  const [tempRange, setTempRange] = useState<[number, number]>([0, 50]);
  const isUpdatingSlider = useRef(false);
  const isSlidingMin = useRef(false);
  const isSlidingMax = useRef(false);
  const [recentItemsRefreshTrigger, setRecentItemsRefreshTrigger] = useState(0);
  const [recentlyAddedItems, setRecentlyAddedItems] = useState<GRNItem[]>([]);

  // Track component mount state to prevent setState on unmounted component
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load persisted recently added items when modal opens
  useEffect(() => {
    const loadPersistedRecentItems = async () => {
      if (isVisible && customerId) {
        if (__DEV__) console.log('[ItemCatalogBrowser] Loading persisted recent items for customer:', customerId);
        const persistedItems = await SessionRecentItemsService.loadRecentlyAddedItems(customerId);

        // Guard against setState on unmounted component
        if (!isMountedRef.current) return;

        if (persistedItems.length > 0) {
          if (__DEV__) console.log('[ItemCatalogBrowser] Loaded', persistedItems.length, 'persisted recent items');
          setRecentlyAddedItems(persistedItems);
        }

        // Also run cleanup of expired items occasionally (when modal opens)
        // This happens in the background and doesn't block the UI
        // Note: cleanup doesn't update component state, so no need to check isMounted
        SessionRecentItemsService.cleanupExpiredItems()
          .then(() => {
            if (__DEV__) console.log('[ItemCatalogBrowser] Completed cleanup of expired items');
          })
          .catch(error => {
            console.error('[ItemCatalogBrowser] Error during cleanup:', error);
          });
      }
    };

    loadPersistedRecentItems();
  }, [isVisible, customerId]);

  // Handle bottom sheet visibility
  useEffect(() => {
    if (isVisible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [isVisible]);
  
  // Sync tempRange with range when weight slider is opened
  useEffect(() => {
    if (showWeightSlider) {
      setTempRange(range);
    }
  }, [showWeightSlider, range]);

  // Fetch items
  const fetchItems = useCallback(async () => {
    const requestId = ++browseRequestRef.current;
    const isCurrent = () => isMountedRef.current && requestId === browseRequestRef.current;
    try {
      setLoading(true);
      if (__DEV__) console.log('[ItemCatalogBrowser] Fetching items for customer:', customerId);
      
      const result = await OrderService.getAvailableItems({
        customer_id: customerId,
        in_stock_only: inStockOnly,
        catalog_id: selectedCatalog || undefined,
        offset: 0,
        page_size: CATALOG_PAGE_SIZE,
      });
      if (!isCurrent()) return;

      if (__DEV__) console.log('[ItemCatalogBrowser] Items fetch result:', {
        success: result.success,
        dataLength: result.data?.length,
        message: result.message,
        error: result.error
      });

      if (result.success && result.data) {
        setAllItems(result.data);
        setBrowseHasMore(result.metadata?.has_more ?? false);
        
        // Extract unique catalogs
        const uniqueCatalogs = new Map<string, Catalog>();
        result.data.forEach(item => {
          if (item.catalog) {
            uniqueCatalogs.set(item.catalog.id, item.catalog);
          }
        });
        setCatalogs(Array.from(uniqueCatalogs.values()));
        
        if (__DEV__) console.log('[ItemCatalogBrowser] Items loaded successfully:', {
          itemCount: result.data.length,
          catalogCount: uniqueCatalogs.size,
          firstItem: result.data[0] ? {
            id: result.data[0].id,
            name: result.data[0].name,
            stock: result.data[0].current_stock
          } : null
        });
      } else {
        console.error('[ItemCatalogBrowser] Failed to load items:', result.message);
        showAlert(tr('orders.catalog.couldNotLoadTitle'), tr('common.checkConnection'));
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[ItemCatalogBrowser] Error fetching items:', error);
      showAlert(tr('orders.catalog.couldNotLoadTitle'), tr('common.checkConnection'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [customerId, inStockOnly, selectedCatalog]);

  // Search filters for one page of a remote search.
  const buildSearchFilters = useCallback((query: string, offset: number): EnhancedSearchFilters => {
    const filters: EnhancedSearchFilters = {
      customer_id: customerId,
      // A query of numbers only (a weight or a weight range) is sent in 0-9 whatever digits were typed.
      search_query: /^[\d.\s-]+$/.test(normalizeDigits(query)) ? normalizeDigits(query) : query,
      search_type: 'auto',
      stock_filter_min: inStockOnly ? 1 : 0,
      catalog_id: selectedCatalog || undefined,
      page_size: CATALOG_PAGE_SIZE,
      offset,
    };
    // A whole-number range such as "10-20" searches by weight.
    const weightRangeMatch = normalizeDigits(query).match(/^(\d+)-(\d+)$/);
    if (weightRangeMatch) {
      filters.weight_min = parseInt(weightRangeMatch[1], 10);
      filters.weight_max = parseInt(weightRangeMatch[2], 10);
      filters.search_type = 'weight';
    }
    return filters;
  }, [customerId, inStockOnly, selectedCatalog]);

  // Fetch all customer-specific GRN items (for pills)
  const loadCustomerAllItems = useCallback(async () => {
    try {
      if (__DEV__) console.log('[ItemCatalogBrowser] Fetching all customer GRN items for pills:', customerId);

      const result = await StockService.getCustomerGRNItems(
        customerId,
        undefined, // no date filter - get all time
        undefined,
        undefined, // no filters
        'date',
        'desc',
        100, // server contract maximum; enough to populate the quick-filter pills
        0
      );

      if (result.success && result.data) {
        // Deduplicate by itemId and transform to GRNItem format
        const uniqueItemsMap = new Map<string, GRNItem>();

        result.data.items.forEach(item => {
          if (!uniqueItemsMap.has(item.item_id)) {
            // Transform CustomerGRNItem to GRNItem
            uniqueItemsMap.set(item.item_id, {
              id: item.id,
              name: item.item_name,
              packaging: item.packaging || '',
              package_mark: item.package_mark,
              current_stock: item.stock,
              original_quantity: item.qty,
              catalog_id: null,
              rack: item.rack,
              weight: item.weight,
              gr_id: item.grn_id,
              grn_number: item.gr_no,
              grn_date: item.date,
            });
          }
        });

        const uniqueItems = Array.from(uniqueItemsMap.values());
        setCustomerAllItems(uniqueItems);

        if (__DEV__) console.log('[ItemCatalogBrowser] Customer GRN items loaded for pills:', {
          totalItems: result.data.items.length,
          uniqueItems: uniqueItems.length,
        });
      } else {
        console.error('[ItemCatalogBrowser] Failed to load customer GRN items:', result.message);
      }
    } catch (error) {
      console.error('[ItemCatalogBrowser] Error fetching customer GRN items:', error);
    }
  }, [customerId]);

  // Load customer items on mount
  useEffect(() => {
    loadCustomerAllItems();
  }, [loadCustomerAllItems]);

  // Debounced search effect: remote searches wait 250 ms after the last edit
  // and only the newest request may update the list.
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    const requestId = ++searchRequestRef.current;
    const isCurrent = () => isMountedRef.current && requestId === searchRequestRef.current;

    const handleSearch = async () => {
      if (useEnhancedSearch && searchQuery.trim()) {
        setIsSearching(true);
        try {
          const searchFilters = buildSearchFilters(searchQuery, 0);

          if (__DEV__) console.log('[ItemCatalogBrowser] 🔎 SEARCH REQUEST:', {
            searchType: searchFilters.search_type,
            stockFilter: searchFilters.stock_filter_min,
          });

          const result = await OrderService.searchCustomerItemsForOrder(searchFilters);

          // A newer edit, selection or unmount superseded this request.
          if (!isCurrent()) return;

          if (__DEV__) console.log('[ItemCatalogBrowser] 📦 SEARCH RESULT:', {
            success: result.success,
            dataLength: result.data?.length,
          });

          if (result.success && result.data) {
            const mappedItems = result.data.map(toGRNItem);

            if (__DEV__) console.log('[ItemCatalogBrowser] 🎯 MAPPED ITEMS TO DISPLAY:', {
              count: mappedItems.length,
            });

            setFilteredItems(mappedItems);
            setSearchMetadata(result.metadata || null);
          } else {
            setFilteredItems([]);
            setSearchMetadata(null);
          }
        } catch (error) {
          if (!isCurrent()) return;
          console.error('[ItemCatalogBrowser] Enhanced search error:', error);
          setFilteredItems([]);
          setSearchMetadata(null);
        } finally {
          if (isCurrent()) setIsSearching(false);
        }
      } else if (!searchQuery.trim()) {
        // Clear search when query is empty - restore original items
        setFilteredItems(allItems);
        setSearchMetadata(null);
        setIsSearching(false);
      } else {
        // Fall back to basic filtering if enhanced search is disabled
        const query = searchQuery.toLowerCase();
        const filtered = allItems.filter(item =>
          item.name.toLowerCase().includes(query) ||
          item.packaging.toLowerCase().includes(query) ||
          item.package_mark?.toLowerCase().includes(query)
        );
        setFilteredItems(filtered);
        setSearchMetadata(null);
        setIsSearching(false);
      }
    };

    if (useEnhancedSearch && searchQuery.trim()) {
      // Remote search: wait for the operator to pause typing.
      searchTimeoutRef.current = setTimeout(() => {
        searchTimeoutRef.current = null;
        void handleSearch();
      }, 250);
    } else {
      // Local filtering and clearing need no network round trip.
      void handleSearch();
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      // Any response still in flight for this edit is now stale.
      searchRequestRef.current += 1;
    };
  }, [searchQuery, useEnhancedSearch, buildSearchFilters, allItems]);

  // Next page of the current search or of the browse list.
  const handleLoadMore = useCallback(async () => {
    if (loading || isLoadingMore || isSearching || showSelectedItems) return;
    const query = searchQuery.trim();
    if (query && useEnhancedSearch) {
      if (!searchMetadata?.has_more) return;
      const requestId = searchRequestRef.current;
      setIsLoadingMore(true);
      try {
        const result = await OrderService.searchCustomerItemsForOrder(
          buildSearchFilters(searchQuery, filteredItems.length)
        );
        if (!isMountedRef.current || requestId !== searchRequestRef.current) return;
        if (result.success && result.data) {
          setFilteredItems(prev => appendUnique(prev, result.data!.map(toGRNItem)));
          setSearchMetadata(result.metadata || null);
        } else {
          setSearchMetadata(prev => (prev ? { ...prev, has_more: false } : prev));
        }
      } catch (error) {
        console.error('[ItemCatalogBrowser] Load more search error:', error);
      } finally {
        if (isMountedRef.current) setIsLoadingMore(false);
      }
    } else if (!query) {
      if (!browseHasMore) return;
      const requestId = browseRequestRef.current;
      setIsLoadingMore(true);
      try {
        const result = await OrderService.getAvailableItems({
          customer_id: customerId,
          in_stock_only: inStockOnly,
          catalog_id: selectedCatalog || undefined,
          offset: allItems.length,
          page_size: CATALOG_PAGE_SIZE,
        });
        if (!isMountedRef.current || requestId !== browseRequestRef.current) return;
        if (result.success && result.data) {
          setAllItems(prev => appendUnique(prev, result.data!));
          setBrowseHasMore(result.metadata?.has_more ?? false);
        } else {
          setBrowseHasMore(false);
        }
      } catch (error) {
        console.error('[ItemCatalogBrowser] Load more items error:', error);
      } finally {
        if (isMountedRef.current) setIsLoadingMore(false);
      }
    }
  }, [loading, isLoadingMore, isSearching, showSelectedItems, searchQuery, useEnhancedSearch,
      searchMetadata, buildSearchFilters, filteredItems.length, browseHasMore, customerId,
      inStockOnly, selectedCatalog, allItems.length]);

  // Fetch items on mount and when filters change
  useEffect(() => {
    if (isVisible) {
      fetchItems();
    }
  }, [isVisible, fetchItems]);

  // Initialize selected items with current order items when modal opens
  useEffect(() => {
    if (isVisible && currentOrderItems.length > 0) {
      const initialSelectedItems = new Map<string, SelectedItem>();
      currentOrderItems.forEach(orderItem => {
        initialSelectedItems.set(orderItem.grnItemId, {
          grnItemId: orderItem.grnItemId,
          quantity: orderItem.quantity,
          item: orderItem.item
        });
      });
      setSelectedItems(initialSelectedItems);
    } else if (isVisible) {
      // Clear selected items if no current order items
      setSelectedItems(new Map());
    }
  }, [isVisible, currentOrderItems]);

  // Handle quantity change
  const handleQuantityChange = useCallback((item: GRNItem, quantity: number) => {
    if (quantity === 0) {
      setSelectedItems(prev => {
        const newMap = new Map(prev);
        newMap.delete(item.id);
        return newMap;
      });

      // Also remove from recently added items if it was there (by name for consistency)
      setRecentlyAddedItems(prevRecent => {
        const filtered = prevRecent.filter(i => i.name.toLowerCase() !== item.name.toLowerCase());
        if (filtered.length < prevRecent.length) {
          // Item was in the list, persist the removal
          SessionRecentItemsService.saveRecentlyAddedItems(customerId, filtered)
            .then(() => {
              if (__DEV__) console.log('[ItemCatalogBrowser] ✅ Removed item from persisted recent items');
            })
            .catch(error => {
              console.error('[ItemCatalogBrowser] ❌ Failed to update persisted recent items:', error);
            });
        }
        return filtered;
      });
    } else if (quantity > item.current_stock) {
      // Flash red background instead of showing alert
      setFlashingItems(prev => new Set([...prev, item.id]));
      // Remove from flashing set after animation completes
      setTimeout(() => {
        setFlashingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.id);
          return newSet;
        });
      }, 2050); // 2000ms red background + 50ms buffer
    } else {
      setSelectedItems(prev => {
        const newMap = new Map(prev);
        const wasNew = !newMap.has(item.id);
        newMap.set(item.id, { grnItemId: item.id, quantity, item });

        // Check if this item is new in THIS SESSION (not in currentOrderItems initially)
        const wasInInitialOrder = currentOrderItems.some(orderItem => orderItem.grnItemId === item.id);
        const isNewInSession = wasNew && !wasInInitialOrder;

        if (isNewInSession) {
          if (__DEV__) console.log('[ItemCatalogBrowser] 🆕 NEW ITEM ADDED IN SESSION:', item.name, 'ID:', item.id);

          // Update local state
          setRecentlyAddedItems(prevRecent => {
            // Remove if already exists BY NAME (not ID) - same item can have different IDs across GRN records
            const filtered = prevRecent.filter(i => i.name.toLowerCase() !== item.name.toLowerCase());
            const updated = [item, ...filtered];
            if (__DEV__) console.log('[ItemCatalogBrowser] 📋 Updated recentlyAddedItems:', updated.map(i => i.name));

            // Persist to AsyncStorage
            SessionRecentItemsService.saveRecentlyAddedItems(customerId, updated)
              .then(() => {
                if (__DEV__) console.log('[ItemCatalogBrowser] ✅ Persisted recently added items');
              })
              .catch(error => {
                console.error('[ItemCatalogBrowser] ❌ Failed to persist recently added items:', error);
              });

            return updated;
          });
        } else {
          if (__DEV__) console.log('[ItemCatalogBrowser] 🔢 Quantity changed for existing item:', item.name, 'wasNew:', wasNew, 'wasInInitialOrder:', wasInInitialOrder);
        }

        return newMap;
      });
      // Trigger refresh of recent items when quantity is added/changed
      setRecentItemsRefreshTrigger(prev => prev + 1);
    }
  }, [currentOrderItems, customerId]);

  // Handle recent item selection - just search for the item
  const handleRecentItemSelected = useCallback((item: QuickAddItem) => {
    // Set search query to filter items, showing the recent item
    if (__DEV__) console.log('[ItemCatalogBrowser] 🔍 Quick search for recent item:', {
      itemName: item.name,
      itemId: item.id,
    });
    setSearchQuery(item.name);
  }, []);

  // Handle add items
  const handleAddItems = useCallback(() => {
    const itemsToAdd = Array.from(selectedItems.values()).map(({ grnItemId, quantity }) => ({
      grnItemId,
      quantity,
    }));

    if (itemsToAdd.length === 0) {
      showAlert(tr('orders.catalog.noneSelectedTitle'), tr('orders.catalog.noneSelectedMessage'));
      return;
    }

    onAddItems(itemsToAdd);
    onClose();
  }, [selectedItems, onAddItems, onClose]);

  // Helper functions for search UI
  const getSearchPlaceholder = useCallback(() => {
    if (!searchQuery.trim()) {
      return tr('orders.catalog.searchPlaceholderHint');
    }
    return tr('orders.catalog.searchItems');
  }, [searchQuery]);

  const getSearchTypeIndicator = useCallback(() => {
    if (!searchMetadata) {
      // Client-side detection for immediate feedback
      if (/^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(normalizeDigits(searchQuery).trim())) {
        return '🔢'; // Weight search
      }
      return '📝'; // Text search
    }
    
    switch (searchMetadata.search_type) {
      case 'weight':
      case 'weight_range':
        return '🔢';
      case 'text':
      default:
        return '📝';
    }
  }, [searchQuery, searchMetadata]);

  const getSearchResultsSummary = useCallback(() => {
    if (!searchMetadata) return '';
    
    const { current_count, total_count, search_type } = searchMetadata;
    
    return tr(search_type === 'weight' || search_type === 'weight_range' ? 'orders.catalog.resultsByWeight' : 'orders.catalog.resultsByName', {
      shown: formatNumber(current_count),
      total: formatCount(total_count, 'item'),
    });
  }, [searchMetadata]);

  // Weight range slider handlers - only update temp values during sliding
  const handleMinSliderChange = useCallback((value: number) => {
    if (!isSlidingMin.current) return; // Ignore changes when not actively sliding
    
    // Update temp range during sliding
    setTempRange(prev => [Math.min(value, prev[1]), prev[1]]);
  }, []);

  const handleMaxSliderChange = useCallback((value: number) => {
    if (!isSlidingMax.current) return; // Ignore changes when not actively sliding
    
    // Update temp range during sliding
    setTempRange(prev => [prev[0], Math.max(value, prev[0])]);
  }, []);

  // Handlers for sliding start
  const handleMinSliderStart = useCallback((value: number) => {
    isSlidingMin.current = true;
  }, []);

  const handleMaxSliderStart = useCallback((value: number) => {
    isSlidingMax.current = true;
  }, []);

  // Handlers for when sliding completes
  const handleMinSliderComplete = useCallback((value: number) => {
    isSlidingMin.current = false;
    const finalValue = Math.min(value, range[1]);
    setRange([finalValue, range[1]]);
    setTempRange([finalValue, range[1]]);
  }, [range]);

  const handleMaxSliderComplete = useCallback((value: number) => {
    isSlidingMax.current = false;
    const finalValue = Math.max(value, range[0]);
    setRange([range[0], finalValue]);
    setTempRange([range[0], finalValue]);
  }, [range]);

  const applyWeightRange = useCallback(() => {
    const [min, max] = range;
    const searchTerm = `${min}-${max}`;
    setSearchQuery(searchTerm);
    setShowWeightSlider(false);
  }, [range]);

  const resetWeightRange = useCallback(() => {
    setRange([0, 50]);
    setTempRange([0, 50]);
    setSearchQuery('');
    setShowWeightSlider(false);
  }, []);

  // Calculate selection summary
  const selectionSummary = useMemo(() => {
    const items = Array.from(selectedItems.values());
    return {
      count: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [selectedItems]);

  // Compute display items: merge filtered items with selected items
  // This ensures items with quantity > 0 always show, even if they don't match current filters
  const displayItems = useMemo(() => {
    if (showSelectedItems) {
      // Show only selected items when user taps summary bar
      return Array.from(selectedItems.values()).map(selected => selected.item);
    }

    // If actively searching (searchQuery exists), show ONLY search results
    if (searchQuery.trim()) {
      if (__DEV__) console.log('[ItemCatalogBrowser] 🔍 Active search, showing only filtered results:', {
        searchQuery,
        filteredCount: filteredItems.length
      });
      return filteredItems;
    }

    // When not searching, merge filtered items with selected items
    const itemMap = new Map<string, GRNItem>();

    // First, add all filtered items
    filteredItems.forEach(item => {
      itemMap.set(item.id, item);
    });

    // Then, ensure all selected items are included (even if not in filtered results)
    selectedItems.forEach((selected, itemId) => {
      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, selected.item);
      }
    });

    return Array.from(itemMap.values());
  }, [filteredItems, selectedItems, showSelectedItems, searchQuery]);

  // Get stock status for Fiori semantic styling - memoized to prevent recreation
  // @see PO1 - FlashList renderItem Inline Function Anti-Pattern
  const getStockStatus = useCallback((currentStock: number, originalStock: number) => {
    const stockPercentage = originalStock > 0 ? (currentStock / originalStock) * 100 : 0;
    if (currentStock === 0) return 'negative';
    if (stockPercentage < 20) return 'critical';
    return 'positive';
  }, []);

  // Render item card - SAP Fiori Object Cell layout - memoized for FlashList performance
  // @see PO1 - FlashList renderItem Inline Function Anti-Pattern
  const renderItem = useCallback(({ item }: { item: GRNItem }) => {
    const selected = selectedItems.get(item.id);
    const quantity = selected?.quantity || 0;

    // Check if this item is already in the existing order
    const isInExistingOrder = currentOrderItems.some(
      orderItem => orderItem.grnItemId === item.id
    );

    const stockStatus = getStockStatus(item.current_stock, item.original_quantity);
    const status = t.status[stockStatus];
    const stockWord = stockLabel(stockStatus);
    const grnDate = item.grn_date ? formatDate(item.grn_date, 'short') : null;
    const weightText = item.weight ? formatWeight(item.weight) : null;
    const rowLabel = [
      item.name,
      item.package_mark ? tr('orders.catalog.rowMark', { mark: item.package_mark }) : null,
      item.grn_number ? tr('orders.catalog.grn', { number: formatIdentifier(item.grn_number) }) : null,
      weightText,
      tr('orders.catalog.rowStock', { status: stockWord, current: formatBags(item.current_stock), total: formatBags(item.original_quantity) }),
      isInExistingOrder ? tr('orders.catalog.rowAlreadyInOrder') : null,
      quantity > 0 ? tr('orders.catalog.rowSelected', { bags: formatBags(quantity) }) : null,
    ].filter(Boolean).join(', ');

    const addBags = (count: number) => tr('orders.catalog.addBags', { count, name: item.name });
    const removeBags = (count: number) => tr('orders.catalog.removeBags', { count, name: item.name });

    const preset = (amount: number, label: string, a11y: string, disabled = false) => (
      <Pressable
        key={label}
        style={({ pressed }) => [styles.presetButton, pressed && styles.secondaryPressed, disabled && styles.disabled]}
        onPress={() => handleQuantityChange(item, amount)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ disabled }}
      >
        <Text style={styles.presetButtonText}>{localizeDigits(label)}</Text>
      </Pressable>
    );

    const stepper = (next: number, label: string, a11y: string, disabled: boolean) => (
      <Pressable
        key={label}
        style={({ pressed }) => [styles.quantityButton, pressed && styles.secondaryPressed, disabled && styles.disabled]}
        onPress={() => handleQuantityChange(item, next)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ disabled }}
      >
        <Text style={label.length > 1 ? styles.smallButtonText : styles.quantityButtonText}>{localizeDigits(label)}</Text>
      </Pressable>
    );

    return (
      <View style={[styles.itemCard, isInExistingOrder && styles.itemCardInOrder]}>
        {/* SAP Fiori Object Cell Row */}
        <View style={styles.objectCellRow} accessible accessibilityLabel={rowLabel}>
          {/* Left: Status Icon */}
          <View style={[styles.statusIconContainer, { backgroundColor: status.background, borderColor: status.border }]}>
            <Icon
              name={stockStatus === 'negative' ? 'package-variant-remove' : 'package-variant'}
              size={iconSize.md}
              color={status.text}
            />
          </View>

          {/* Center: Main Content */}
          <View style={styles.mainContent}>
            {/* Title Row */}
            <View style={styles.titleRow}>
              <Text style={styles.titleText} numberOfLines={2}>{item.name}</Text>
              {isInExistingOrder && (
                <View style={styles.alreadyInOrderBadge}>
                  <Icon name="check" size={iconSize.sm} color={t.brand.tint} />
                  <Text style={styles.alreadyInOrderBadgeText} maxFontSizeMultiplier={1.6}>{tr('orders.catalog.inOrder')}</Text>
                </View>
              )}
            </View>

            {/* Subtitle Row - Package Mark */}
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitleText} numberOfLines={1}>
                {item.package_mark || tr('orders.item.noMark')}
              </Text>
            </View>

            {/* Footer Row - GRN Number, Date & Weight */}
            <View style={styles.footerRow}>
              {item.grn_number ? (
                <View style={styles.footerItem}>
                  <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.footerText}>{tr('orders.catalog.grn', { number: formatIdentifier(item.grn_number) })}</Text>
                </View>
              ) : null}
              {grnDate ? <Text style={styles.footerText}>{grnDate}</Text> : null}
              {weightText ? (
                <View style={styles.footerItem}>
                  <Icon name="scale" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.footerText}>{weightText}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Right: main value with its status tag under it */}
          <View style={styles.attributeStack}>
            <View style={styles.stockValueContainer}>
              <Animated.Text style={[
                styles.stockValueText,
                flashingItems.has(item.id) && styles.stockValueFlash,
              ]}>
                {formatNumber(item.current_stock)}
              </Animated.Text>
              <Text style={styles.stockLabel}>{tr('orders.catalog.ofTotal', { total: formatBags(item.original_quantity) })}</Text>
            </View>
            <StatusTag status={stockStatus} label={stockWord} style={styles.statusBadge} />
          </View>
        </View>

        {/* Quantity Section with Presets + Stepper */}
        <View style={styles.quantitySection}>
          {/* Preset Buttons Row */}
          {quantity === 0 && (
            <View style={styles.presetButtonsRow}>
              {preset(10, '+10', addBags(10), item.current_stock < 10)}
              {preset(50, '+50', addBags(50), item.current_stock < 50)}
              {preset(100, '+100', addBags(100), item.current_stock < 100)}
              {preset(1, '+1', addBags(1))}
            </View>
          )}

          {/* Stepper Controls (show when quantity > 0) */}
          {quantity > 0 && (
            <View style={styles.quantityControlsContainer}>
              <View style={styles.quantityControls}>
                {stepper(Math.max(0, quantity - 10), '−10', removeBags(10), quantity < 10)}
                {stepper(quantity - 1, '−', removeBags(1), quantity === 0)}
                <Text
                  style={styles.quantity}
                  accessibilityLabel={tr('orders.catalog.selectedOf', { bags: formatBags(quantity), name: item.name })}
                  accessibilityLiveRegion="polite"
                >
                  {formatNumber(quantity)}
                </Text>
                {stepper(quantity + 1, '+', addBags(1), item.current_stock === 0)}
                {stepper(
                  Math.min(item.current_stock, quantity + 10),
                  '+10',
                  addBags(10),
                  quantity + 10 > item.current_stock || item.current_stock === 0
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }, [selectedItems, currentOrderItems, getStockStatus, handleQuantityChange, styles, t, flashingItems]);

  const handleDismiss = useCallback(() => {
    // Reset state when dismissed
    setSearchQuery('');
    setSelectedCatalog(null);
    setShowWeightSlider(false);
    setShowSelectedItems(false);
    onClose();
  }, [onClose]);

  // Android back closes the sheet before anything else (guide §13.9, §15).
  useEffect(() => {
    if (!isVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      bottomSheetModalRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [isVisible]);

  // Scrim behind the sheet; tapping it closes the sheet.
  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      pressBehavior="close"
      style={[props.style, styles.backdrop]}
    />
  ), [styles]);

  // Memoized keyExtractor for FlatList performance
  const keyExtractor = useCallback((item: GRNItem) => item.id, []);

  // Memoized getItemLayout for FlatList performance (fixed item height estimation)
  const getItemLayout = useCallback((_data: ArrayLike<GRNItem> | null | undefined, index: number) => ({
    length: 180, // Approximate item height
    offset: 180 * index,
    index,
  }), []);

  // Memoized ListHeaderComponent to prevent re-renders
  const listHeaderComponent = useMemo(() => (
    <>
      {/* SAP Fiori Bottom Sheet Header */}
      <View style={styles.bottomSheetHeader}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('orders.catalog.cancelAdding')}
        >
          <Text style={styles.headerButtonTextCancel}>{tr('common.cancel')}</Text>
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">{tr('orders.catalog.addItems')}</Text>
        <Pressable
          onPress={handleAddItems}
          style={({ pressed }) => [styles.headerButton, styles.headerButtonEnd, pressed && styles.headerButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={
            selectionSummary.count === 0
              ? tr('orders.screen.addItemsToOrder')
              : tr('orders.catalog.addCountToOrder', { items: formatCount(selectionSummary.count, 'item') })
          }
        >
          <Text style={styles.headerButtonTextAction}>
            {selectionSummary.count > 0 ? tr('orders.catalog.addCount', { count: selectionSummary.count }) : tr('common.add')}
          </Text>
        </Pressable>
      </View>
      {/* Fiori Divider */}
      <View style={styles.headerDivider} />

      {/* Keep stock search available even when the current result is empty. */}
      <View style={styles.topSearchContainer}>
        <View style={styles.searchField}>
          <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
          <TextInput
            accessibilityLabel={tr('orders.catalog.searchLabel')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={getSearchPlaceholder()}
            placeholderTextColor={t.text.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.topSearchInput}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={space.md}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel={tr('common.clearSearch')}
            >
              <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Recent Items Quick Add */}
      <RecentItemsQuickAdd
        customerId={customerId}
        onItemSelected={handleRecentItemSelected}
        isLoading={loading}
        allItems={customerAllItems.map(item => ({ id: item.id, name: item.name }))}
        selectedItemName={searchQuery}
        refreshTrigger={recentItemsRefreshTrigger}
        recentlyAddedItems={recentlyAddedItems.map(item => ({ id: item.id, name: item.name }))}
      />
    </>
  ), [styles, t, onClose, handleAddItems, selectionSummary.count, customerId, handleRecentItemSelected, loading, customerAllItems, searchQuery, getSearchPlaceholder, recentItemsRefreshTrigger, recentlyAddedItems]);

  // Memoized ListEmptyComponent
  const listEmptyComponent = useMemo(() => {
    const searching = Boolean(searchQuery.trim()) && filteredItems.length === 0;
    return (
      <View style={styles.emptyContainer}>
        <Icon
          name={searching ? 'magnify' : 'cube-outline'}
          size={iconSize.hero}
          color={t.icon.secondary}
        />
        {searching ? (
          <>
            <Text style={styles.emptyText} accessibilityRole="header">
              {tr('orders.catalog.noStockForTitle', { search: searchQuery })}
            </Text>
            <Text style={styles.emptySubtext}>
              {tr('orders.catalog.noStockForMessage')}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.emptyText} accessibilityRole="header">
              {tr('orders.catalog.emptyTitle')}
            </Text>
            <Text style={styles.emptySubtext}>
              {tr('orders.catalog.emptyMessage')}
            </Text>
          </>
        )}
      </View>
    );
  }, [searchQuery, filteredItems.length, styles, t]);

  // Memoized ListFooterComponent
  const listFooterComponent = useMemo(() => (
    <>
      {isLoadingMore && (
        <View style={styles.loadMoreRow} accessibilityLabel={tr('items.list.loadingMoreLabel')}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.loadMoreText}>{tr('orders.catalog.loadingMore')}</Text>
        </View>
      )}
      {/* Catalog Filter */}
      {catalogs.length > 0 && (
        <View style={styles.bottomCatalogFilter}>
          {[{ id: null as string | null, name: tr('common.all') }, ...catalogs].map(catalog => {
            const on = selectedCatalog === catalog.id;
            return (
              <Pressable
                key={catalog.id ?? 'all'}
                style={({ pressed }) => [
                  styles.catalogChip,
                  on && styles.catalogChipSelected,
                  pressed && styles.catalogChipPressed,
                ]}
                onPress={() => setSelectedCatalog(catalog.id)}
                hitSlop={{ top: space.s6, bottom: space.s6 }}
                accessibilityRole="button"
                accessibilityLabel={catalog.id ? tr('orders.catalog.catalogName', { name: catalog.name }) : tr('orders.catalog.allCatalogs')}
                accessibilityState={{ selected: on }}
              >
                {on && <Icon name="check" size={iconSize.sm} color={t.brand.tint} />}
                <Text style={[styles.catalogChipText, on && styles.catalogChipTextSelected]} maxFontSizeMultiplier={1.6}>
                  {catalog.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Extra padding at bottom */}
      <View style={styles.footerSpacer} />
    </>
  ), [catalogs, selectedCatalog, styles, t, isLoadingMore]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onDismiss={handleDismiss}
      enablePanDownToClose
      keyboardBehavior="extend"
      // SAP Fiori Bottom Sheet styling
      backdropComponent={renderBackdrop}
      style={styles.sheetShadow}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.bottomSheetHandle}
      handleStyle={styles.bottomSheetHandleContainer}
    >
      {loading ? (
        <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel={tr('items.list.loadingLabel')}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('items.list.loading')}</Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={displayItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          getItemLayout={getItemLayout}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={listEmptyComponent}
          ListFooterComponent={listFooterComponent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
        />
      )}
    </BottomSheetModal>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  backdrop: { backgroundColor: t.overlay.scrim },
  sheetShadow: { ...t.shadow[4] },
  listContent: { flexGrow: 1, paddingBottom: space.xl, backgroundColor: t.background.base },
  footerSpacer: { height: 100 },
  loadMoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  loadMoreText: { ...typography.subhead, color: t.text.secondary },
  catalogChip: {
    minHeight: 32,
    flexDirection: 'row' as const,
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  catalogChipSelected: { backgroundColor: t.brand.subtle, borderColor: t.brand.subtle },
  catalogChipPressed: { backgroundColor: t.brand.subtleStrong },
  catalogChipText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.primary },
  catalogChipTextSelected: { color: t.brand.tint },
  topSearchContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    backgroundColor: t.surface.sheet,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  searchField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
  },
  topSearchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: space.sm,
    color: t.text.primary,
  },
  clearButton: { alignItems: 'center' as const, justifyContent: 'center' as const },
  bottomCatalogFilter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    flexWrap: 'wrap' as const,
  },
  bottomSheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  bottomSheetHandleContainer: { paddingTop: space.sm, paddingBottom: 0 },
  bottomSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: t.border.separator,
    borderRadius: radius.pill,
  },
  bottomSheetHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 56,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.sheet,
  },
  headerTitle: { ...typography.headline, color: t.text.primary, textAlign: 'center' as const, flex: 1 },
  headerButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
  },
  headerButtonEnd: { alignItems: 'flex-end' as const },
  headerButtonPressed: { backgroundColor: t.brand.subtle },
  headerButtonTextCancel: { ...typography.body, color: t.brand.tint },
  headerButtonTextAction: { ...typography.headline, color: t.brand.tint },
  headerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border.divider },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.sheet,
  },
  loadingText: { ...typography.subhead, marginTop: space.md, color: t.text.secondary },
  itemCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginTop: space.sm,
    marginHorizontal: layout.marginCompact,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  itemCardInOrder: {
    backgroundColor: t.brand.subtle,
    borderLeftWidth: 4,
    borderLeftColor: t.brand.tint,
  },
  objectCellRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    padding: space.lg,
    gap: space.md,
    minHeight: layout.objectCellMinHeight,
  },
  statusIconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  mainContent: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.sm },
  titleText: { ...typography.headline, color: t.text.primary, flex: 1 },
  subtitleRow: { marginTop: space.xxs },
  subtitleText: { ...typography.subhead, color: t.text.secondary },
  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.xs,
    flexWrap: 'wrap' as const,
    columnGap: space.md,
    rowGap: space.xs,
  },
  footerItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  footerText: { ...typography.footnote, color: t.text.secondary },
  attributeStack: { alignItems: 'flex-end' as const, gap: space.sm, minWidth: 60 },
  statusBadge: { alignSelf: 'flex-end' as const },
  stockValueContainer: { alignItems: 'flex-end' as const },
  stockValueText: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  stockValueFlash: { color: t.status.negative.text },
  stockLabel: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
  alreadyInOrderBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.brand.tint,
  },
  alreadyInOrderBadgeText: { ...typography.caption1, fontWeight: fontWeight.semibold, color: t.brand.tint },
  quantitySection: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  presetButtonsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  presetButton: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  secondaryPressed: { backgroundColor: t.brand.subtle },
  disabled: { opacity: t.interaction.disabledOpacity },
  presetButtonText: {
    ...typography.callout,
    color: t.brand.tint,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  quantityControlsContainer: { alignItems: 'center' as const },
  quantityControls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  quantityButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  quantityButtonText: { ...typography.headline, color: t.brand.tint },
  smallButtonText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.brand.tint },
  quantity: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    marginHorizontal: space.sm,
    minWidth: 30,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.max,
    paddingHorizontal: space.xxl,
  },
  emptyText: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  emptySubtext: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
});

export default ItemCatalogBrowser;
