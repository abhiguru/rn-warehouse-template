import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { BottomSheetModal, BottomSheetView, BottomSheetFlatList, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Slider from '@react-native-community/slider';
import theme from '@/theme';
import { OrderService } from '@/services/order-service';
import { StockService } from '@/services/stock-service';
import { SessionRecentItemsService } from '@/services/session-recent-items-service';
import { GRNItem, Catalog, EnhancedSearchFilters, SearchMetadata } from '@/types/order.types';
import StockIndicator from './StockIndicator';
import RecentItemsQuickAdd, { QuickAddItem } from './RecentItemsQuickAdd';

// SAP Fiori semantic colors for stock status
import { useListColors } from '@/hooks/useListColors';
import { listColors } from '@/theme/listColors'; // Static colors for StyleSheet defaults

// Helper components moved inside main component to access colors from hook

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

const ItemCatalogBrowser: React.FC<ItemCatalogBrowserProps> = ({
  isVisible,
  onClose,
  onAddItems,
  currentOrderId,
  customerId,
  currentOrderItems = [],
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

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
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sliderUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
    try {
      setLoading(true);
      if (__DEV__) console.log('[ItemCatalogBrowser] Fetching items for customer:', customerId);
      
      const result = await OrderService.getAvailableItems({
        customer_id: customerId,
        in_stock_only: inStockOnly,
        catalog_id: selectedCatalog || undefined,
      });

      if (__DEV__) console.log('[ItemCatalogBrowser] Items fetch result:', {
        success: result.success,
        dataLength: result.data?.length,
        message: result.message,
        error: result.error
      });

      if (result.success && result.data) {
        setAllItems(result.data);
        
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
        Alert.alert('Error', result.message || 'Failed to load items');
      }
    } catch (error) {
      console.error('[ItemCatalogBrowser] Error fetching items:', error);
      Alert.alert('Error', 'Failed to load items');
    } finally {
      setLoading(false);
    }
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
        1000, // large limit to get all items
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

  // Debounced search effect with simplified dependencies
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const handleSearch = async () => {
      if (useEnhancedSearch && searchQuery.trim()) {
        setIsSearching(true);
        try {
          // Check if search query is a weight range (e.g., "10-20")
          const weightRangeMatch = searchQuery.match(/^(\d+)-(\d+)$/);
          
          const searchFilters: EnhancedSearchFilters = {
            customer_id: customerId,
            search_query: searchQuery,
            search_type: 'auto',
            stock_filter_min: inStockOnly ? 1 : 0,
            catalog_id: selectedCatalog || undefined
          };

          // If it's a weight range, add weight_min and weight_max
          if (weightRangeMatch) {
            searchFilters.weight_min = parseInt(weightRangeMatch[1]);
            searchFilters.weight_max = parseInt(weightRangeMatch[2]);
            searchFilters.search_type = 'weight';
            
            if (__DEV__) console.log('[ItemCatalogBrowser] 🎯 WEIGHT RANGE DETECTED:', {
              originalQuery: searchQuery,
              parsedMin: searchFilters.weight_min,
              parsedMax: searchFilters.weight_max,
              regexMatch: weightRangeMatch
            });
          }

          if (__DEV__) console.log('[ItemCatalogBrowser] 🔎 SEARCH REQUEST:', {
            searchQuery: searchQuery,
            searchType: searchFilters.search_type,
            weightRange: weightRangeMatch ? `${searchFilters.weight_min}kg - ${searchFilters.weight_max}kg` : 'N/A',
            customerId: searchFilters.customer_id,
            stockFilter: searchFilters.stock_filter_min,
            allFilters: searchFilters
          });

          const result = await OrderService.searchCustomerItemsForOrder(searchFilters);

          if (__DEV__) console.log('[ItemCatalogBrowser] 📦 SEARCH RESULT:', {
            success: result.success,
            message: result.message,
            error: result.error,
            dataExists: result.data !== null && result.data !== undefined,
            dataLength: result.data?.length,
            metadata: result.metadata,
            allItemNames: result.data?.map(item => item.name) || [],
            allItems: result.data?.map(item => ({
              id: item.id,
              name: item.name,
              weight: item.weight,
              stock: item.current_stock,
              grn_number: item.grn_number
            })) || []
          });

          if (result.success && result.data) {
            const mappedItems = result.data.map(item => ({
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
              updated_at: item.updated_at
            }));

            if (__DEV__) console.log('[ItemCatalogBrowser] 🎯 MAPPED ITEMS TO DISPLAY:', {
              count: mappedItems.length,
              itemNames: mappedItems.map(item => item.name),
              searchQuery: searchQuery
            });

            setFilteredItems(mappedItems);
            setSearchMetadata(result.metadata || null);
          } else {
            setFilteredItems([]);
            setSearchMetadata(null);
          }
        } catch (error) {
          console.error('[ItemCatalogBrowser] Enhanced search error:', error);
          setFilteredItems([]);
          setSearchMetadata(null);
        } finally {
          setIsSearching(false);
        }
      } else if (!searchQuery.trim()) {
        // Clear search when query is empty - restore original items
        setFilteredItems(allItems);
        setSearchMetadata(null);
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
      }
    };

    if (searchQuery.trim()) {
      // Always execute search immediately for better UX
      handleSearch();
    } else {
      handleSearch(); // Immediate execution for empty query
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, useEnhancedSearch, customerId, inStockOnly, selectedCatalog, allItems]);

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
      Alert.alert('No Items Selected', 'Please select at least one item');
      return;
    }

    onAddItems(itemsToAdd);
    onClose();
  }, [selectedItems, onAddItems, onClose]);

  // Helper functions for search UI
  const getSearchPlaceholder = useCallback(() => {
    if (!searchQuery.trim()) {
      return 'Search items... (try "500" for weight or "rice" for name)';
    }
    return 'Search items...';
  }, [searchQuery]);

  const getSearchTypeIndicator = useCallback(() => {
    if (!searchMetadata) {
      // Client-side detection for immediate feedback
      if (/^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(searchQuery.trim())) {
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
    const searchTypeText = search_type === 'weight' || search_type === 'weight_range' ? 'by weight' : 'by name/package';
    
    return `${current_count} of ${total_count} items ${searchTypeText}`;
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

    return (
      <View style={[
        styles.itemCard,
        { backgroundColor: colors.cellBackground },
        isInExistingOrder && { backgroundColor: colors.primaryLight, borderLeftWidth: 4, borderLeftColor: colors.primary }
      ]}>
        {/* SAP Fiori Object Cell Row */}
        <View style={styles.objectCellRow}>
          {/* Left: Status Icon (40dp) */}
          <View style={[
            styles.statusIconContainer,
            stockStatus === 'positive' && { backgroundColor: colors.successLight, borderColor: colors.success },
            stockStatus === 'critical' && { backgroundColor: colors.warningLight, borderColor: colors.warning },
            stockStatus === 'negative' && { backgroundColor: colors.errorLight, borderColor: colors.error },
          ]}>
            <Icon
              name={stockStatus === 'negative' ? 'package-variant-remove' : 'package-variant'}
              size={20}
              color={
                stockStatus === 'positive' ? colors.success :
                stockStatus === 'critical' ? colors.warning :
                colors.error
              }
            />
          </View>

          {/* Center: Main Content */}
          <View style={styles.mainContent}>
            {/* Title Row */}
            <View style={styles.titleRow}>
              <Text style={[styles.titleText, { color: colors.gray900 }]} numberOfLines={1}>{item.name}</Text>
              {item.grn_date && (
                <Text style={[styles.grnDateText, { color: colors.gray500 }]}>
                  {new Date(item.grn_date).toLocaleDateString()}
                </Text>
              )}
              {isInExistingOrder && (
                <View style={[styles.alreadyInOrderBadge, { borderColor: colors.primary }]}>
                  <Text style={[styles.alreadyInOrderBadgeText, { color: colors.primary }]}>In order</Text>
                </View>
              )}
            </View>

            {/* Subtitle Row - Package Mark */}
            <View style={styles.subtitleRow}>
              <Text style={[styles.subtitleText, { color: colors.gray600 }]} numberOfLines={1}>
                {item.package_mark || 'No mark'}
              </Text>
            </View>

            {/* Footer Row - GRN Number & Weight */}
            <View style={styles.footerRow}>
              {item.grn_number && (
                <View style={styles.footerItem}>
                  <Icon name="file-document-outline" size={12} color={colors.gray500} />
                  <Text style={[styles.footerText, { color: colors.gray500 }]}>{item.grn_number}</Text>
                </View>
              )}
              {item.grn_number && item.weight && <View style={[styles.footerDot, { backgroundColor: colors.gray400 }]} />}
              {item.weight && (
                <View style={styles.footerItem}>
                  <Icon name="scale" size={12} color={colors.gray500} />
                  <Text style={[styles.footerText, { color: colors.gray500 }]}>{item.weight}kg</Text>
                </View>
              )}
            </View>
          </View>

          {/* Right: Attribute Stack */}
          <View style={styles.attributeStack}>
            {/* Stock Badge */}
            <View style={[
              styles.statusBadge,
              stockStatus === 'positive' && { backgroundColor: colors.success },
              stockStatus === 'critical' && { backgroundColor: colors.warning },
              stockStatus === 'negative' && { backgroundColor: colors.error },
            ]}>
              <Text style={[styles.statusBadgeText, { color: colors.cellBackground }]}>
                {stockStatus === 'negative' ? 'OUT' : stockStatus === 'critical' ? 'LOW' : 'OK'}
              </Text>
            </View>

            {/* Stock Value */}
            <View style={styles.stockValueContainer}>
              <Animated.Text style={[
                styles.stockValueText,
                stockStatus === 'positive' && { color: colors.success },
                stockStatus === 'critical' && { color: colors.warning },
                stockStatus === 'negative' && { color: colors.error },
                flashingItems.has(item.id) && { color: colors.error },
              ]}>
                {item.current_stock}
              </Animated.Text>
              <Text style={[styles.stockLabel, { color: colors.gray500 }]}>/ {item.original_quantity}</Text>
            </View>
          </View>
        </View>

        {/* Quantity Section with Presets + Stepper */}
        <View style={[styles.quantitySection, { borderTopColor: colors.cellDivider }]}>
          {/* Preset Buttons Row */}
          {quantity === 0 && (
            <View style={styles.presetButtonsRow}>
              <TouchableOpacity
                style={[styles.presetButton, { borderColor: colors.primary }, item.current_stock < 10 && { borderColor: colors.gray300, opacity: 0.4 }]}
                onPress={() => handleQuantityChange(item, 10)}
                disabled={item.current_stock < 10}
              >
                <Text style={[styles.presetButtonText, { color: colors.primary }, item.current_stock < 10 && { color: colors.gray500 }]}>10</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.presetButton, { borderColor: colors.primary }, item.current_stock < 50 && { borderColor: colors.gray300, opacity: 0.4 }]}
                onPress={() => handleQuantityChange(item, 50)}
                disabled={item.current_stock < 50}
              >
                <Text style={[styles.presetButtonText, { color: colors.primary }, item.current_stock < 50 && { color: colors.gray500 }]}>50</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.presetButton, { borderColor: colors.primary }, item.current_stock < 100 && { borderColor: colors.gray300, opacity: 0.4 }]}
                onPress={() => handleQuantityChange(item, 100)}
                disabled={item.current_stock < 100}
              >
                <Text style={[styles.presetButtonText, { color: colors.primary }, item.current_stock < 100 && { color: colors.gray500 }]}>100</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.presetButton, { borderColor: colors.primary }]}
                onPress={() => handleQuantityChange(item, 1)}
              >
                <Text style={[styles.presetButtonText, { color: colors.primary }]}>+</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Stepper Controls (show when quantity > 0 OR if stock is 0) */}
          {quantity > 0 && (
            <View style={styles.quantityControlsContainer}>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  style={[styles.quantityButton, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }, quantity < 10 && { backgroundColor: colors.gray50, opacity: 0.5 }]}
                  onPress={() => handleQuantityChange(item, Math.max(0, quantity - 10))}
                  disabled={quantity < 10}
                >
                  <Text style={[
                    styles.quantityButtonText,
                    styles.smallButtonText,
                    { color: colors.gray600 },
                    quantity < 10 && { color: colors.gray400 }
                  ]}>-10</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quantityButton, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }, quantity === 0 && { backgroundColor: colors.gray50, opacity: 0.5 }]}
                  onPress={() => handleQuantityChange(item, quantity - 1)}
                  disabled={quantity === 0}
                >
                  <Text style={[
                    styles.quantityButtonText,
                    { color: colors.gray600 },
                    quantity === 0 && { color: colors.gray400 }
                  ]}>−</Text>
                </TouchableOpacity>

                <Text style={[styles.quantity, { color: colors.gray900 }]}>{quantity}</Text>

                <TouchableOpacity
                  style={[styles.quantityButton, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }, item.current_stock === 0 && { backgroundColor: colors.gray50, opacity: 0.5 }]}
                  onPress={() => handleQuantityChange(item, quantity + 1)}
                  disabled={item.current_stock === 0}
                >
                  <Text style={[
                    styles.quantityButtonText,
                    { color: colors.gray600 },
                    item.current_stock === 0 && { color: colors.gray400 }
                  ]}>+</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quantityButton, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }, (quantity + 10 > item.current_stock || item.current_stock === 0) && { backgroundColor: colors.gray50, opacity: 0.5 }]}
                  onPress={() => handleQuantityChange(item, Math.min(item.current_stock, quantity + 10))}
                  disabled={quantity + 10 > item.current_stock || item.current_stock === 0}
                >
                  <Text style={[
                    styles.quantityButtonText,
                    styles.smallButtonText,
                    { color: colors.gray600 },
                    (quantity + 10 > item.current_stock || item.current_stock === 0) && { color: colors.gray400 }
                  ]}>+10</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }, [selectedItems, currentOrderItems, colors, getStockStatus, handleQuantityChange]);

  const handleDismiss = useCallback(() => {
    // Reset state when dismissed
    setSearchQuery('');
    setSelectedCatalog(null);
    setShowWeightSlider(false);
    setShowSelectedItems(false);
    onClose();
  }, [onClose]);

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
      <View style={[styles.bottomSheetHeader, { backgroundColor: colors.cellBackground }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Text style={[styles.headerButtonTextCancel, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.gray900 }]}>Add Items</Text>
        <TouchableOpacity
          onPress={handleAddItems}
          style={[styles.headerButton, selectionSummary.count === 0 && styles.headerButtonDisabled]}
          disabled={selectionSummary.count === 0}
        >
          <Text style={[
            styles.headerButtonTextAction,
            { color: colors.primary },
            selectionSummary.count === 0 && { color: colors.gray500 }
          ]}>
            Add ({selectionSummary.count})
          </Text>
        </TouchableOpacity>
      </View>
      {/* Fiori Divider */}
      <View style={[styles.headerDivider, { backgroundColor: colors.cellDivider }]} />

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
  ), [colors, onClose, handleAddItems, selectionSummary.count, customerId, handleRecentItemSelected, loading, customerAllItems, searchQuery, recentItemsRefreshTrigger, recentlyAddedItems]);

  // Memoized ListEmptyComponent
  const listEmptyComponent = useMemo(() => (
    <View style={styles.emptyContainer}>
      {searchQuery.trim() && filteredItems.length === 0 ? (
        <>
          <Text style={[styles.emptyText, { color: colors.gray900 }]}>
            No stock available for "{searchQuery}"
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.gray500 }]}>
            This item is currently out of stock
          </Text>
        </>
      ) : (
        <Text style={[styles.emptyText, { color: colors.gray900 }]}>
          No items available
        </Text>
      )}
    </View>
  ), [searchQuery, filteredItems.length, colors]);

  // Memoized ListFooterComponent
  const listFooterComponent = useMemo(() => (
    <>
      {/* Catalog Filter */}
      {catalogs.length > 0 && (
        <View style={styles.bottomCatalogFilter}>
          <TouchableOpacity
            style={[styles.catalogChip, { backgroundColor: colors.gray100 }, !selectedCatalog && { backgroundColor: colors.primary }]}
            onPress={() => setSelectedCatalog(null)}
          >
            <Text style={[
              styles.catalogChipText,
              { color: colors.gray900 },
              !selectedCatalog && { color: colors.cellBackground }
            ]}>
              All
            </Text>
          </TouchableOpacity>
          {catalogs.map(catalog => (
            <TouchableOpacity
              key={catalog.id}
              style={[
                styles.catalogChip,
                { backgroundColor: colors.gray100 },
                selectedCatalog === catalog.id && { backgroundColor: colors.primary }
              ]}
              onPress={() => setSelectedCatalog(catalog.id)}
            >
              <Text style={[
                styles.catalogChipText,
                { color: colors.gray900 },
                selectedCatalog === catalog.id && { color: colors.cellBackground }
              ]}>
                {catalog.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Extra padding at bottom */}
      <View style={{ height: 100 }} />
    </>
  ), [catalogs, selectedCatalog, colors]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onDismiss={handleDismiss}
      enablePanDownToClose
      keyboardBehavior="extend"
      // SAP Fiori Bottom Sheet styling
      backgroundStyle={[styles.bottomSheetBackground, { backgroundColor: colors.cellBackground }]}
      handleIndicatorStyle={[styles.bottomSheetHandle, { backgroundColor: colors.gray400 }]}
      handleStyle={styles.bottomSheetHandleContainer}
    >
      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: colors.cellBackground }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading items...</Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={displayItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20, backgroundColor: colors.gray50 }}
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
        />
      )}
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.orange[50], // #fff7ed - light orange tint to distinguish from order screen
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.orange[100],
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: theme.colors.gray[600],
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.gray[900],
  },
  doneButton: {
    padding: 8,
  },
  doneButtonDisabled: {
    opacity: 0.5,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  doneButtonTextDisabled: {
    color: theme.colors.gray[400],
  },
  // SAP Fiori Chip - 32pt height, 16pt corner radius (pill shape)
  catalogChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F2F2F7', // Fiori unselected chip bg
    justifyContent: 'center',
    alignItems: 'center',
  },
  catalogChipActive: {
    backgroundColor: listColors.primary,
  },
  catalogChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: listColors.textPrimary,
  },
  catalogChipTextActive: {
    color: listColors.white,
  },
  summaryBar: {
    backgroundColor: theme.colors.primary + '10',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primary + '20',
  },
  summaryText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
    textAlign: 'center',
  },
  topSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  topSearchInput: {
    backgroundColor: theme.colors.gray[100],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 40, // Make room for indicator
    fontSize: 14,
    color: theme.colors.gray[900],
  },
  bottomControlsSection: {
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[200],
    paddingBottom: 20,
  },
  bottomSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterCountBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCountText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  quickFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: theme.colors.gray[100],
    borderWidth: 1,
    borderColor: theme.colors.gray[200],
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterButtonIcon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
  },
  filterButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.gray[700],
  },
  filterButtonLabelActive: {
    color: theme.colors.white,
  },
  searchInputContainer: {
    flex: 1,
    position: 'relative',
  },
  bottomSearchInput: {
    backgroundColor: theme.colors.gray[100],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 40, // Make room for indicator
    fontSize: 14,
    color: theme.colors.gray[900],
  },
  searchIndicatorContainer: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -10 }],
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchTypeIndicator: {
    fontSize: 16,
    fontWeight: '500',
  },
  searchResultsSummary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.blue[50],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.blue[100],
  },
  searchResultsText: {
    fontSize: 12,
    color: theme.colors.blue[700],
    fontWeight: '500',
    textAlign: 'center',
  },
  weightSliderContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: theme.colors.green[50],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.green[100],
  },
  weightSliderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.green[700],
    textAlign: 'center',
    marginBottom: 16,
  },
  sliderContainer: {
    marginBottom: 12,
  },
  sliderLabel: {
    fontSize: 12,
    color: theme.colors.gray[600],
    marginBottom: 8,
    fontWeight: '500',
  },
  dualSlider: {
    paddingHorizontal: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  weightSliderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: theme.colors.gray[100],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.gray[300],
  },
  resetButtonText: {
    fontSize: 14,
    color: theme.colors.gray[700],
    fontWeight: '500',
    textAlign: 'center',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: theme.colors.green[600],
    borderRadius: 8,
  },
  applyButtonText: {
    fontSize: 14,
    color: theme.colors.white,
    fontWeight: '600',
    textAlign: 'center',
  },
  weightRangeButton: {
    width: 44,
    height: 44,
    backgroundColor: theme.colors.gray[100],
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  weightButtonIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  bottomStockFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bottomFilterLabel: {
    fontSize: 12,
    color: theme.colors.gray[700],
    fontWeight: '500',
  },
  bottomSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  bottomCatalogFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetBackdrop: {
    flex: 1,
  },
  // =========================================================================
  // SAP Fiori Bottom Sheet Styling
  // =========================================================================
  bottomSheetBackground: {
    backgroundColor: listColors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  bottomSheetHandleContainer: {
    paddingTop: 8,
    paddingBottom: 0,
  },
  bottomSheetHandle: {
    width: 36,
    height: 5,
    backgroundColor: '#C6C6C8', // Fiori drag handle color
    borderRadius: 2.5,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: listColors.white,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: listColors.textPrimary,
    textAlign: 'center',
    flex: 1,
  },
  headerButton: {
    minWidth: 60,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerButtonDisabled: {
    opacity: 0.4,
  },
  headerButtonTextCancel: {
    fontSize: 17,
    fontWeight: '400',
    color: listColors.primary,
  },
  headerButtonTextAction: {
    fontSize: 17,
    fontWeight: '600',
    color: listColors.primary,
  },
  headerButtonTextDisabled: {
    color: listColors.textTertiary,
  },
  headerDivider: {
    height: 1,
    backgroundColor: listColors.cellDivider,
  },
  // Legacy bottom sheet styles (for other bottom sheets)
  bottomSheet: {
    backgroundColor: listColors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  bottomSheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: listColors.textPrimary,
  },
  bottomSheetClose: {
    fontSize: 24,
    color: listColors.gray400,
    fontWeight: '300',
  },
  bottomSheetScrollContainer: {
    position: 'relative',
  },
  bottomSheetScrollIndicator: {
    backgroundColor: theme.colors.gray[50],
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[200],
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  scrollIndicatorText: {
    fontSize: 12,
    color: theme.colors.gray[600],
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomSheetItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[100],
  },
  bottomSheetItemNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bottomSheetItemNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },
  bottomSheetItemInfo: {
    flex: 1,
    marginRight: 16,
    padding: 4,
  },
  bottomSheetItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bottomSheetItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.gray[900],
    marginBottom: 4,
  },
  bottomSheetGrnDate: {
    fontSize: 12,
    color: theme.colors.gray[500],
    fontWeight: '500',
  },
  bottomSheetItemDetails: {
    fontSize: 13,
    color: theme.colors.gray[600],
    marginBottom: 4,
  },
  bottomSheetWeightStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bottomSheetWeightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomSheetWeightIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    resizeMode: 'contain',
  },
  bottomSheetWeightText: {
    fontSize: 12,
    color: theme.colors.gray[500],
    marginTop: 5,
  },
  bottomSheetStockText: {
    fontSize: 12,
    color: theme.colors.gray[500],
  },
  bottomSheetItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 4,
  },
  bottomSheetQuantityBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bottomSheetQuantityText: {
    fontSize: 14,
    color: theme.colors.white,
    fontWeight: '600',
  },
  bottomSheetItemQuantity: {
    fontSize: 14,
    color: theme.colors.gray[700],
    marginBottom: 6,
  },
  bottomSheetRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSheetRemoveText: {
    fontSize: 18,
    color: theme.colors.red[600],
    fontWeight: '400',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.gray[600],
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
  },
  // SAP Fiori Object Cell card styling
  itemCard: {
    backgroundColor: listColors.cellBackground,
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  itemCardExisting: {
    backgroundColor: listColors.primaryLight, // Light orange tint for existing order items
    borderLeftWidth: 4,
    borderLeftColor: listColors.primary,
  },
  itemCardSelected: {
    borderWidth: 2,
    borderColor: listColors.primary,
    backgroundColor: listColors.cellBackgroundSelected,
  },

  // =========================================================================
  // SAP Fiori Object Cell Layout
  // =========================================================================
  objectCellRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },

  // Left: Status Icon (40dp)
  statusIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  statusIconPositive: {
    backgroundColor: listColors.statusPositiveLight,
    borderColor: listColors.statusPositiveBorder,
  },
  statusIconCritical: {
    backgroundColor: listColors.statusCriticalLight,
    borderColor: listColors.statusCriticalBorder,
  },
  statusIconNegative: {
    backgroundColor: listColors.statusNegativeLight,
    borderColor: listColors.statusNegativeBorder,
  },

  // Center: Main Content
  mainContent: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: listColors.textPrimary,
    flex: 1,
  },
  grnDateText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  subtitleRow: {
    marginTop: 2,
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: listColors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: listColors.textTertiary,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: listColors.gray400,
    marginHorizontal: 4,
  },

  // Right: Attribute Stack
  attributeStack: {
    alignItems: 'flex-end',
    gap: 8,
    minWidth: 60,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  statusBadgePositive: {
    backgroundColor: listColors.statusPositive,
  },
  statusBadgeCritical: {
    backgroundColor: listColors.statusCritical,
  },
  statusBadgeNegative: {
    backgroundColor: listColors.statusNegative,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: listColors.white,
  },
  stockValueContainer: {
    alignItems: 'flex-end',
  },
  stockValueText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  stockValuePositive: {
    color: listColors.statusPositive,
  },
  stockValueCritical: {
    color: listColors.statusCritical,
  },
  stockValueNegative: {
    color: listColors.statusNegative,
  },
  stockValueFlashing: {
    color: listColors.statusNegative,
  },
  stockLabel: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 14,
    color: listColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // =========================================================================
  // Legacy styles (kept for backward compatibility)
  // =========================================================================
  itemContent: {
    flexDirection: 'row',
    padding: 16,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
    padding: 8,
    paddingTop: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  // SAP Fiori typography - Title
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: listColors.textPrimary,
    marginRight: 8,
  },
  // SAP Fiori Tag - Primary Outlined style
  alreadyInOrderBadge: {
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: listColors.primary,
  },
  alreadyInOrderBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: listColors.primary,
  },
  // SAP Fiori typography - Footer
  grnDate: {
    fontSize: 12,
    color: listColors.textTertiary,
    fontWeight: '500',
  },
  itemMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  packageWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    padding: 6,
  },
  packageMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 4,
  },
  stockStatusContainer: {
    flex: 1,
  },
  stockNumbersContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  // SAP Fiori semantic stock badge styles - Positive (In Stock)
  stockBadgePositive: {
    backgroundColor: listColors.statusPositiveLight,
    borderWidth: 1,
    borderColor: listColors.statusPositiveBorder,
  },
  stockBadgeTextPositive: {
    color: listColors.statusPositiveDark,
  },
  // SAP Fiori semantic stock badge styles - Critical (Low Stock)
  stockBadgeCritical: {
    backgroundColor: listColors.statusCriticalLight,
    borderWidth: 1,
    borderColor: listColors.statusCriticalBorder,
  },
  stockBadgeTextCritical: {
    color: listColors.statusCriticalDark,
  },
  // SAP Fiori semantic stock badge styles - Negative (Out of Stock)
  stockBadgeNegative: {
    backgroundColor: listColors.statusNegativeLight,
    borderWidth: 1,
    borderColor: listColors.statusNegativeBorder,
  },
  stockBadgeTextNegative: {
    color: listColors.statusNegativeDark,
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stockNumbersText: {
    fontSize: 12,
    color: listColors.textSecondary,
  },
  // SAP Fiori typography - Subtitle
  itemDetails: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: listColors.textSecondary,
    marginRight: 4,
  },
  weightText: {
    fontSize: 14,
    fontWeight: '400',
    color: listColors.textSecondary,
    marginRight: 4,
  },
  rackText: {
    fontSize: 14,
    fontWeight: '400',
    color: listColors.textSecondary,
  },
  itemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 12,
  },
  // SAP Fiori typography - Footer
  itemMeta: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: listColors.textTertiary,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: listColors.cellDivider,
  },
  footerLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weightIcon: {
    width: 18,
    height: 18,
    marginRight: 6,
    resizeMode: 'contain',
  },
  // =========================================================================
  // SAP Fiori Quantity Controls
  // =========================================================================
  quantitySection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: listColors.cellDivider,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  // SAP Fiori Secondary Tint Button (auto-width, 38pt height)
  presetButton: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: listColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44, // Minimum touch target
  },
  presetButtonDisabled: {
    borderColor: listColors.gray300,
    opacity: 0.4,
  },
  presetButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: listColors.primary,
    textAlign: 'center',
    letterSpacing: -0.41,
  },
  presetButtonTextDisabled: {
    color: listColors.textTertiary,
  },
  selectedBadge: {
    backgroundColor: listColors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  selectedBadgeText: {
    color: listColors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: listColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: listColors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  quantityControlsContainer: {
    alignItems: 'center',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // SAP Fiori Button - 44pt minimum touch target
  quantityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: listColors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: listColors.gray200,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  minusButton: {
    backgroundColor: listColors.gray50,
  },
  plusButton: {
    backgroundColor: listColors.primary,
    borderColor: listColors.primary,
  },
  clearButton: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  clearButtonText: {
    fontSize: 11,
    color: listColors.textSecondary,
    fontWeight: '500',
  },
  quantityButtonDisabled: {
    backgroundColor: listColors.gray50,
    opacity: 0.5,
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: listColors.textSecondary,
  },
  plusButtonText: {
    color: listColors.white,
  },
  quantityButtonTextDisabled: {
    color: listColors.gray400,
  },
  smallButtonText: {
    fontSize: 12,
  },
  quantity: {
    fontSize: 16,
    fontWeight: '600',
    color: listColors.textPrimary,
    marginHorizontal: 8,
    minWidth: 30,
    textAlign: 'center',
  },
  // SAP Fiori Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: listColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    lineHeight: 20,
    color: listColors.textTertiary,
    textAlign: 'center',
  },
});

export default ItemCatalogBrowser;