import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  Platform,
  UIManager,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useListColors } from '@/hooks/useListColors';
import { getItemStoragePrices, deleteItemStoragePrice } from '@/services/item-pricing-service';
import type { ItemStoragePrice, ItemPricingFilters, ItemPricingListParams } from '@/types/item-pricing.types';
import { useFilterState } from '@/hooks/useFilterState';
import type { FilterConfig, AutocompleteSelection } from '@/types/filter.types';
import { getAutocompleteSelections, getStringValue, getNumberValue, isDateFilterValue } from '@/types/filter.types';
import { useAppSelector } from '@/store/hooks';
import { GenericFilterModal } from '@/components/filters';
import ItemPricingCard from '@/components/ItemPricingCard';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { createLogger } from '@/utils/logger';

const itemPricingScreenLogger = createLogger('ItemPricingScreen');

const FIORI = {
  header: { height: 56, paddingHorizontal: 20 },
  button: { height: 44, borderRadius: 8 },
  avatar: { size: 40 },
  badge: { minSize: 18 },
  chip: { height: 32, borderRadius: 16 },
  modal: { width: 320, borderRadius: 16, padding: 24 },
} as const;

// Section type for grouped pricing data
interface PricingSection {
  title: string;
  itemId: string;
  data: ItemStoragePrice[];
  totalCount: number; // Total count even when collapsed
}

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Filter configuration for Item Pricing List
const itemPricingFilterConfig: FilterConfig = {
  persistKey: 'item-pricing-list',
  debounceMs: 500,
  title: 'Filter Item Prices',
  fields: [
    {
      type: 'autocomplete',
      key: 'itemIds',
      label: 'Item',
      autocompleteType: 'item',
      placeholder: 'Search items...',
      icon: 'package-variant',
      multiSelect: true,
      renderAsChips: true,
    },
    {
      type: 'autocomplete',
      key: 'customerIds',
      label: 'Customer',
      autocompleteType: 'customer',
      placeholder: 'Search customers...',
      icon: 'account',
      multiSelect: true,
      renderAsChips: true,
    },
    {
      type: 'radio',
      key: 'priceType',
      label: 'Price Type',
      icon: 'tag-outline',
      options: [
        { label: 'All', value: '' },
        { label: 'One-time', value: 'one_time' },
        { label: 'Monthly', value: 'monthly' },
      ],
      defaultValue: '',
    },
    {
      type: 'number-range',
      key: ['weightMin', 'weightMax'],
      label: 'Weight Range (kg)',
      icon: 'weight-kilogram',
      placeholder: ['Min weight', 'Max weight'],
      minValue: 0,
    },
    {
      type: 'date-range',
      key: ['effectiveFrom', 'effectiveTo'],
      label: 'Effective Date Range',
      icon: 'calendar-range',
      placeholder: ['From date', 'To date'],
    },
    {
      type: 'radio',
      key: 'includeExpired',
      label: 'Show Expired Prices',
      icon: 'clock-alert-outline',
      options: [
        { label: 'Active Only', value: 'false' },
        { label: 'Include Expired', value: 'true' },
      ],
      defaultValue: 'false',
    },
  ],
};

// Main Component
const ItemPricingScreen: React.FC = () => {
  const { userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const colors = useListColors();

  // State
  const [data, setData] = useState<ItemStoragePrice[]>([]);
  const [pagination, setPagination] = useState({ total_count: 0, limit: 50, offset: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set()); // Track expanded item sections
  const [hasUserInteracted, setHasUserInteracted] = useState(false); // Track if user has interacted with accordion

  // Delete confirmation dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState<ItemStoragePrice | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Ref removed - scrollToLocation not needed for now
  const fetchInProgressRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const lastFetchOffsetRef = useRef<number>(-1);

  // Filter state management with Redux persistence
  const {
    debouncedValues: filters,
    activeFilterCount,
    updateFilter,
    clearAllFilters,
  } = useFilterState({
    persistKey: 'item-pricing-list',
    debounceMs: 500,
  });

  // Check if user can manage prices (Supervisor/Admin only)
  const canManagePrices = useCallback(() => {
    const role = userProfile?.role?.toLowerCase();
    return role === 'supervisor' || role === 'admin';
  }, [userProfile]);

  // Toggle section expansion (item group) - accordion style, only one open at a time
  const toggleSectionExpansion = useCallback((itemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHasUserInteracted(true); // Mark that user has interacted
    setExpandedSections((prev) => {
      // If clicking on already expanded section, collapse it
      if (prev.has(itemId)) {
        return new Set();
      }
      // Otherwise, expand only this section (close all others)
      return new Set([itemId]);
    });
  }, []);

  // Fetch item prices
  const fetchItemPrices = useCallback(
    async (offset = 0, append = false) => {
      const startTime = Date.now();
      const fetchId = `${offset}-${Math.random().toString(36).substr(2, 9)}`;

      try {
        if (fetchInProgressRef.current && offset === 0 && !append) {
          itemPricingScreenLogger.debug('Fetch already in progress, skipping');
          return;
        }

        if (offset === 0 && !append) {
          fetchInProgressRef.current = true;
          setLoading(true);
          itemPricingScreenLogger.debug(`[${fetchId}] Starting initial fetch`, { timestamp: new Date().toISOString() });
        }
        if (offset > 0) {
          setLoadingMore(true);
          itemPricingScreenLogger.debug(`[${fetchId}] Starting pagination fetch at offset ${offset}`, { timestamp: new Date().toISOString() });
        }

        // Build API filters
        const apiFilters: ItemPricingFilters = {};

        const itemIds = getAutocompleteSelections(filters.itemIds);
        if (itemIds.length > 0) {
          apiFilters.item_ids = itemIds.map((item) => item.id);
        }

        const customerIds = getAutocompleteSelections(filters.customerIds);
        if (customerIds.length > 0) {
          apiFilters.customer_ids = customerIds.map((item) => item.id);
        }

        const priceType = getStringValue(filters.priceType);
        if (priceType && priceType !== '') {
          apiFilters.price_type = priceType as ItemPricingFilters['price_type'];
        }

        const weightMin = getNumberValue(filters.weightMin);
        if (weightMin !== undefined) {
          apiFilters.weight_min = weightMin;
        }

        const weightMax = getNumberValue(filters.weightMax);
        if (weightMax !== undefined) {
          apiFilters.weight_max = weightMax;
        }

        const effectiveFrom = getStringValue(filters.effectiveFrom);
        if (effectiveFrom) {
          apiFilters.effective_from = effectiveFrom;
        }

        const effectiveTo = getStringValue(filters.effectiveTo);
        if (effectiveTo) {
          apiFilters.effective_to = effectiveTo;
        }

        const includeExpired = getStringValue(filters.includeExpired);
        if (includeExpired === 'true') {
          apiFilters.include_expired = true;
        }

        const requestParams: ItemPricingListParams = {
          p_filters: Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          p_sort_by: 'item_name',
          p_sort_order: 'asc',
          p_limit: 50,
          p_offset: offset,
        };

        const rpcStartTime = Date.now();
        itemPricingScreenLogger.debug(`[${fetchId}] Calling RPC getItemStoragePrices`, { params: requestParams });

        const result = await getItemStoragePrices(requestParams);

        const rpcDuration = Date.now() - rpcStartTime;
        itemPricingScreenLogger.debug(`[${fetchId}] RPC response received after ${rpcDuration}ms`, {
          success: result.success,
          itemCount: result.data?.length || 0,
          hasMore: result.pagination?.has_more,
        });

        if (result.success && result.data) {
          const stateUpdateStartTime = Date.now();

          if (append) {
            setData((prevData) => {
              const existingIds = new Set(prevData.map((d) => d.id));
              const newPrices = result.data.filter((d) => !existingIds.has(d.id));
              return [...prevData, ...newPrices];
            });
          } else {
            setData(result.data);
          }
          setPagination(result.pagination);

          const stateUpdateDuration = Date.now() - stateUpdateStartTime;
          const totalDuration = Date.now() - startTime;

          itemPricingScreenLogger.debug(`[${fetchId}] Fetch complete`, {
            rpcDuration: `${rpcDuration}ms`,
            stateUpdateDuration: `${stateUpdateDuration}ms`,
            totalDuration: `${totalDuration}ms`,
            itemsLoaded: result.data.length,
            offset: offset,
          });
        } else {
          const errorMsg = result.message || result.error || 'Failed to load item prices';
          const totalDuration = Date.now() - startTime;
          itemPricingScreenLogger.warn(`[${fetchId}] Fetch failed after ${totalDuration}ms`, {
            success: result.success,
            message: errorMsg
          });
          Alert.alert('Error', errorMsg);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const totalDuration = Date.now() - startTime;
        itemPricingScreenLogger.error(`[${fetchId}] Exception in fetchItemPrices after ${totalDuration}ms`, {
          error: errorMessage,
          type: typeof err
        });
        Alert.alert('Error', 'Failed to load item prices. Please try again.');
      } finally {
        const totalDuration = Date.now() - startTime;
        itemPricingScreenLogger.info(`[${fetchId}] === TOTAL LOAD TIME: ${totalDuration}ms ===`);

        fetchInProgressRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  // Handle delete
  const handleDeletePress = useCallback((price: ItemStoragePrice) => {
    setPriceToDelete(price);
    setDeleteDialogVisible(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!priceToDelete) return;

    setDeleting(true);
    try {
      const result = await deleteItemStoragePrice(priceToDelete.id);
      if (result.success) {
        // Remove from local state
        setData((prev) => prev.filter((p) => p.id !== priceToDelete.id));
        setDeleteDialogVisible(false);
        setPriceToDelete(null);
      } else {
        Alert.alert('Error', result.message || 'Failed to delete item price');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      itemPricingScreenLogger.error('Delete error:', { error: errorMessage, type: typeof err });
      Alert.alert('Error', 'Failed to delete item price. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [priceToDelete]);

  // Event handlers
  const handlePricePress = useCallback((price: ItemStoragePrice) => {
    router.push(`/item-pricing-form?id=${price.id}&mode=view`);
  }, []);

  const handleViewPrice = useCallback((price: ItemStoragePrice) => {
    router.push(`/item-pricing-form?id=${price.id}&mode=view`);
  }, []);

  const handleEditPrice = useCallback((price: ItemStoragePrice) => {
    router.push(`/item-pricing-form?id=${price.id}&mode=edit`);
  }, []);

  const handleCreatePrice = useCallback(() => {
    router.push('/item-pricing-form');
  }, []);

  // Effects - initial fetch based on filters
  useEffect(() => {
    lastFetchOffsetRef.current = -1; // Reset duplicate detection on filter change
    fetchItemPrices();
    hasFetchedRef.current = true;
  }, [fetchItemPrices]);

  // Store latest fetchItemPrices ref
  const fetchItemPricesRef = useRef(fetchItemPrices);
  fetchItemPricesRef.current = fetchItemPrices;

  // Focus effect - Refresh data when screen comes into focus (after returning from edit form)
  useFocusEffect(
    useCallback(() => {
      if (hasFetchedRef.current) {
        itemPricingScreenLogger.debug('Screen focused - refreshing data after potential edits');
        fetchItemPricesRef.current();
      }
    }, [])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchItemPrices();
  }, [fetchItemPrices]);

  const onEndReached = useCallback(() => {
    const nextOffset = pagination.offset + pagination.limit;

    // Prevent duplicate calls for the same offset
    if (lastFetchOffsetRef.current === nextOffset) {
      itemPricingScreenLogger.debug('onEndReached: Skipping duplicate call for offset', nextOffset);
      return;
    }

    if (pagination.has_more && !loadingMore && !loading) {
      itemPricingScreenLogger.debug('onEndReached triggered', { offset: pagination.offset, limit: pagination.limit, nextOffset });
      lastFetchOffsetRef.current = nextOffset;
      fetchItemPrices(nextOffset, true);
    }
  }, [pagination, loadingMore, loading, fetchItemPrices]);

  // Helper function to render applied filters
  const renderAppliedFilters = useCallback(() => {
    if (activeFilterCount === 0) return null;

    return (
      <View style={[styles.appliedFiltersContainer, { backgroundColor: colors.cellBackground, borderBottomColor: colors.gray100 }]}>
        <View style={styles.appliedFiltersHeader}>
          <Text style={[styles.appliedFiltersTitle, { color: colors.textSecondary }]}>Active Filters ({activeFilterCount})</Text>
          <Pressable onPress={clearAllFilters}>
            <Text style={[styles.clearAllText, { color: colors.primary }]}>Clear All</Text>
          </Pressable>
        </View>
        <View style={styles.appliedFiltersList}>
          {/* Item Chips */}
          {getAutocompleteSelections(filters.itemIds).map((item) => (
            <View key={`item-${item.id}`} style={[styles.filterChip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <Text style={[styles.filterChipText, { color: colors.primary }]}>Item: {item.label}</Text>
              <Pressable
                onPress={() => {
                  const newSelections = getAutocompleteSelections(filters.itemIds).filter(
                    (i) => i.id !== item.id
                  );
                  updateFilter('itemIds', newSelections.length > 0 ? newSelections : []);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            </View>
          ))}

          {/* Customer Chips */}
          {getAutocompleteSelections(filters.customerIds).map((item) => (
            <View key={`customer-${item.id}`} style={[styles.filterChip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <Text style={[styles.filterChipText, { color: colors.primary }]}>Customer: {item.label}</Text>
              <Pressable
                onPress={() => {
                  const newSelections = getAutocompleteSelections(filters.customerIds).filter(
                    (i) => i.id !== item.id
                  );
                  updateFilter('customerIds', newSelections.length > 0 ? newSelections : []);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            </View>
          ))}

          {/* Price Type Chip */}
          {getStringValue(filters.priceType) && getStringValue(filters.priceType) !== '' && (
            <View style={[styles.filterChip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <Text style={[styles.filterChipText, { color: colors.primary }]}>
                {getStringValue(filters.priceType) === 'one_time' ? 'One-time' : 'Monthly'}
              </Text>
              <Pressable
                onPress={() => updateFilter('priceType', '')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            </View>
          )}

          {/* Weight Range Chip */}
          {(getNumberValue(filters.weightMin) !== undefined || getNumberValue(filters.weightMax) !== undefined) && (
            <View style={[styles.filterChip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <Text style={[styles.filterChipText, { color: colors.primary }]}>
                Weight: {getNumberValue(filters.weightMin) ?? '0'} - {getNumberValue(filters.weightMax) ?? '∞'} kg
              </Text>
              <Pressable
                onPress={() => {
                  updateFilter('weightMin', undefined);
                  updateFilter('weightMax', undefined);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            </View>
          )}

          {/* Include Expired Chip */}
          {getStringValue(filters.includeExpired) === 'true' && (
            <View style={[styles.filterChip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <Text style={[styles.filterChipText, { color: colors.primary }]}>Including Expired</Text>
              <Pressable
                onPress={() => updateFilter('includeExpired', 'false')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            </View>
          )}

          {/* Date Range Chip */}
          {(getStringValue(filters.effectiveFrom) || getStringValue(filters.effectiveTo)) && (
            <View style={[styles.filterChip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <Text style={[styles.filterChipText, { color: colors.primary }]}>
                {getStringValue(filters.effectiveFrom)
                  ? new Date(getStringValue(filters.effectiveFrom)!).toLocaleDateString()
                  : '...'}{' '}
                -{' '}
                {getStringValue(filters.effectiveTo) ? new Date(getStringValue(filters.effectiveTo)!).toLocaleDateString() : '...'}
              </Text>
              <Pressable
                onPress={() => {
                  updateFilter('effectiveFrom', undefined);
                  updateFilter('effectiveTo', undefined);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }, [filters, activeFilterCount, updateFilter, clearAllFilters, colors]);

  // Group data by item for SectionList, sorted by customer within each item
  const groupedData = useMemo((): PricingSection[] => {
    const groups: { [key: string]: { title: string; itemId: string; prices: ItemStoragePrice[] } } = {};

    data.forEach((price) => {
      const key = price.item_id;
      if (!groups[key]) {
        groups[key] = {
          title: price.item_name,
          itemId: price.item_id,
          prices: [],
        };
      }
      groups[key].prices.push(price);
    });

    // Sort sections alphabetically by title
    const sortedSections = Object.values(groups).sort((a, b) => a.title.localeCompare(b.title));

    // Sort prices within each section - CUSTOMER FIRST for easy scanning:
    // 1. Default (no customer) prices first, then customer-specific alphabetically
    // 2. Within each customer group, sort by weight_min (ascending)
    // 3. Then by price_type: one_time before monthly
    sortedSections.forEach((section) => {
      section.prices.sort((a, b) => {
        // First sort by customer: default (null) first, then alphabetical
        const aIsDefault = a.customer_id === null ? 0 : 1;
        const bIsDefault = b.customer_id === null ? 0 : 1;
        if (aIsDefault !== bIsDefault) {
          return aIsDefault - bIsDefault;
        }

        // For customer-specific prices, sort alphabetically by customer name
        if (a.customer_id !== null && b.customer_id !== null) {
          const customerCompare = (a.customer_name || '').localeCompare(b.customer_name || '');
          if (customerCompare !== 0) return customerCompare;
        }

        // Within same customer, sort by weight_min (ascending)
        if (a.weight_min !== b.weight_min) {
          return a.weight_min - b.weight_min;
        }

        // Then by weight_max (ascending) for same weight_min
        if (a.weight_max !== b.weight_max) {
          return a.weight_max - b.weight_max;
        }

        // Then sort by price type: one_time before monthly
        const aTypeOrder = a.price_type === 'one_time' ? 0 : 1;
        const bTypeOrder = b.price_type === 'one_time' ? 0 : 1;
        return aTypeOrder - bTypeOrder;
      });
    });

    // Build sections with expanded/collapsed state
    return sortedSections.map((section) => {
      // Expand all sections by default to prevent onEndReached from firing prematurely
      // User can collapse sections manually if needed
      const isExpanded = expandedSections.has(section.itemId) ||
        (!hasUserInteracted && expandedSections.size === 0);
      return {
        title: section.title,
        itemId: section.itemId,
        data: isExpanded ? section.prices : [],
        totalCount: section.prices.length,
      };
    });
  }, [data, expandedSections, hasUserInteracted]);

  const renderPriceCard = useCallback(
    ({ item, index, section }: { item: ItemStoragePrice; index: number; section: PricingSection }) => {
      // Check if this is the first item for a customer group
      const prevItem = index > 0 ? section.data[index - 1] : null;
      const isFirstForCustomer = !prevItem || prevItem.customer_id !== item.customer_id;

      return (
        <ItemPricingCard
          price={item}
          onPress={handlePricePress}
          onView={handleViewPrice}
          onEdit={handleEditPrice}
          onDelete={handleDeletePress}
          index={index}
          canManage={canManagePrices()}
          isLastInSection={index === section.data.length - 1}
          isFirstForCustomer={isFirstForCustomer}
          colors={colors}
        />
      );
    },
    [
      handlePricePress,
      handleViewPrice,
      handleEditPrice,
      handleDeletePress,
      canManagePrices,
      colors,
    ]
  );

  const renderSectionHeader = useCallback(
    (info: { section: PricingSection }) => {
      const isExpanded = info.section.data.length > 0;
      return (
        <Pressable
          onPress={() => toggleSectionExpansion(info.section.itemId)}
          style={({ pressed }) => [
            styles.sectionHeader,
            {
              backgroundColor: isExpanded ? colors.primaryLight : colors.gray50,
              borderColor: isExpanded ? colors.primaryLight : colors.gray200,
            },
            isExpanded && styles.sectionHeaderExpanded,
            pressed && { backgroundColor: colors.gray100 },
          ]}
        >
          <View style={[
            styles.sectionHeaderIcon,
            { backgroundColor: isExpanded ? colors.primary : colors.gray400 },
          ]}>
            <Ionicons name="cube-outline" size={16} color={colors.white} />
          </View>
          <Text style={[
            styles.sectionHeaderText,
            { color: isExpanded ? colors.textPrimary : colors.textSecondary },
          ]} numberOfLines={1}>
            {info.section.title}
          </Text>
          <View style={[
            styles.sectionHeaderBadge,
            { backgroundColor: isExpanded ? colors.primaryLight : colors.gray200 },
          ]}>
            <Text style={[
              styles.sectionHeaderBadgeText,
              { color: isExpanded ? colors.primary : colors.textSecondary },
            ]}>{info.section.totalCount}</Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={isExpanded ? colors.primary : colors.textTertiary}
          />
        </Pressable>
      );
    },
    [toggleSectionExpansion, colors]
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerLoaderText, { color: colors.textSecondary }]}>Loading more...</Text>
      </View>
    );
  };

  // Loading state
  if (loading && !refreshing) {
    return (
      <>
        <View style={{ height: insets.top, backgroundColor: colors.cellBackground, zIndex: 999 }} />
        <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
          <View style={[styles.header, { paddingTop: 16, backgroundColor: colors.cellBackground, borderBottomColor: colors.gray100 }]}>
            <View style={styles.headerContent}>
              <View style={styles.titleRow}>
                <Pressable style={styles.backButton} onPress={() => router.back()}>
                  <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </Pressable>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Item Pricing</Text>
              </View>
              {userProfile && (
                <Pressable onPress={() => router.push('/settings')}>
                  <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.profileAvatarText, { color: colors.white }]}>
                      {(userProfile.name || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
          <FlatList
            data={[1, 2, 3, 4, 5, 6]}
            renderItem={() => <ListSkeletonCard metricsCount={3} showFooter={true} />}
            keyExtractor={(item: number) => item.toString()}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <View style={{ height: insets.top, backgroundColor: colors.cellBackground, zIndex: 999 }} />
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: 16, backgroundColor: colors.cellBackground, borderBottomColor: colors.gray100 }]}>
          <View style={styles.headerContent}>
            <View style={styles.titleRow}>
              <Pressable style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Item Pricing</Text>
            </View>
            <View style={styles.headerActions}>
              {canManagePrices() && (
                <Pressable style={styles.addButton} onPress={handleCreatePrice}>
                  <Ionicons name="add" size={24} color={colors.primary} />
                </Pressable>
              )}
              <View style={styles.filterButtonContainer}>
                <Pressable style={styles.filterButton} onPress={() => setShowFilterModal(true)}>
                  <Ionicons name="filter-outline" size={24} color={colors.textPrimary} />
                </Pressable>
                {activeFilterCount > 0 && (
                  <View style={[styles.filterBadge, { backgroundColor: colors.statusNegative }]}>
                    <Text style={[styles.filterBadgeText, { color: colors.white }]}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              {userProfile && (
                <Pressable onPress={() => router.push('/settings')}>
                  <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.profileAvatarText, { color: colors.white }]}>
                      {(userProfile.name || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Applied Filters Section */}
        {renderAppliedFilters()}

        {/* Main Content */}
        {data.length > 0 ? (
          <SectionList
            sections={groupedData as any}
            renderItem={renderPriceCard}
            renderSectionHeader={renderSectionHeader as any}
            keyExtractor={(item: ItemStoragePrice) => item.id}
            ListFooterComponent={renderFooter}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.1}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
          />
        ) : (
          <ListEmptyState
            activeFilterCount={activeFilterCount}
            emptyIcon="cash-outline"
            filteredIcon="filter-outline"
            emptyTitle="No Item Prices Found"
            filteredTitle="No Matching Prices"
            emptySubtitle={canManagePrices() ? 'Create your first item price to get started' : 'No pricing information available'}
            filteredSubtitle="Try adjusting your filters to see more results"
            showCreateButton={canManagePrices() && activeFilterCount === 0}
            createButtonLabel="Create New Price"
            createButtonIcon="add"
            onCreatePress={handleCreatePrice}
          />
        )}

        {/* Generic Filter Modal */}
        <GenericFilterModal
          visible={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          config={itemPricingFilterConfig}
        />

        {/* Delete Confirmation Dialog */}
        <Modal
          visible={deleteDialogVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDeleteDialogVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setDeleteDialogVisible(false)}>
            <Pressable style={[styles.modalDialog, { backgroundColor: colors.cellBackground }]} onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Ionicons name="alert-circle-outline" size={24} color={colors.statusNegative} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Delete Item Price</Text>
              </View>

              {/* Content */}
              <View style={styles.modalContent}>
                <Text style={[styles.modalText, { color: colors.textPrimary }]}>
                  Are you sure you want to delete the pricing for "{priceToDelete?.item_name}"
                  {priceToDelete?.customer_name ? ` (${priceToDelete.customer_name})` : ' (Default)'}?
                </Text>
                <Text style={[styles.modalSubtext, { color: colors.textSecondary }]}>This action cannot be undone.</Text>
              </View>

              {/* Actions */}
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, { backgroundColor: colors.gray100 }]}
                  onPress={() => setDeleteDialogVisible(false)}
                  disabled={deleting}
                >
                  <Text style={[styles.modalButtonTextSecondary, { color: colors.textPrimary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, { backgroundColor: colors.statusNegative }]}
                  onPress={handleDeleteConfirm}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={[styles.modalButtonTextDestructive, { color: colors.white }]}>Delete</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  // Container (colors applied inline)
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 2,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  addButton: {
    padding: 8,
  },
  filterButtonContainer: {
    position: 'relative',
  },
  filterButton: {
    padding: 8,
  },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 17,
    fontWeight: '600',
  },

  // List
  listContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },

  // Footer (colors applied inline)
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 14,
  },

  // Section Header Styles (colors applied inline)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
  },
  sectionHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  sectionHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeaderBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 32,
    alignItems: 'center',
  },
  sectionHeaderBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Applied Filters Styles (colors applied inline)
  appliedFiltersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  appliedFiltersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appliedFiltersTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  appliedFiltersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 6,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Modal Styles (colors applied inline)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDialog: {
    width: FIORI.modal.width,
    borderRadius: FIORI.modal.borderRadius,
    padding: FIORI.modal.padding,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  modalContent: {
    marginBottom: 24,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  modalSubtext: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: FIORI.button.height,
    borderRadius: FIORI.button.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonTextDestructive: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ItemPricingScreen;
