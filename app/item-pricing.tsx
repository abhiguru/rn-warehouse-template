import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
  singleLineText,
} from '@/theme/tokens';
import { getItemStoragePrices, deleteItemStoragePrice } from '@/services/item-pricing-service';
import type { ItemStoragePrice, ItemPricingListParams } from '@/types/item-pricing.types';
import { FILTER_CONFIGS, ITEM_PRICING_FILTERS } from '@/features/filters/configs';
import { useListFilters } from '@/features/filters/useListFilters';
import { FilterBar } from '@/features/filters/components/FilterBar';
import { useAppSelector } from '@/store/hooks';
import ItemPricingCard from '@/components/ItemPricingCard';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { createLogger } from '@/utils/logger';

import { showAlert } from '@/utils/alert';
import { Avatar } from '@/components/ui';
import { formatCount, formatDate, formatNumber } from '@/utils/formatters';
import { t as tr } from '@/i18n';
const itemPricingScreenLogger = createLogger('ItemPricingScreen');

// Section type for grouped pricing data
interface PricingSection {
  title: string;
  itemId: string;
  data: ItemStoragePrice[];
  totalCount: number; // Total count even when collapsed
}

// Main Component
const ItemPricingScreen: React.FC = () => {
  const { userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // State
  const [data, setData] = useState<ItemStoragePrice[]>([]);
  const [pagination, setPagination] = useState({ total_count: 0, limit: 50, offset: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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

  // Filters: session-only, shown as a chip row under the header
  const filters = useListFilters(ITEM_PRICING_FILTERS);
  const { request } = filters;
  const activeFilterCount = filters.activeCount;

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

        const requestParams: ItemPricingListParams = {
          ...request,
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
          const errorMsg = result.message || result.error || tr('common.checkConnection');
          const totalDuration = Date.now() - startTime;
          itemPricingScreenLogger.warn(`[${fetchId}] Fetch failed after ${totalDuration}ms`, {
            success: result.success,
            message: errorMsg
          });
          showAlert(tr('pricing.list.loadErrorTitle'), errorMsg);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const totalDuration = Date.now() - startTime;
        itemPricingScreenLogger.error(`[${fetchId}] Exception in fetchItemPrices after ${totalDuration}ms`, {
          error: errorMessage,
          type: typeof err
        });
        showAlert(tr('pricing.list.loadErrorTitle'), tr('common.checkConnection'));
      } finally {
        const totalDuration = Date.now() - startTime;
        itemPricingScreenLogger.info(`[${fetchId}] === TOTAL LOAD TIME: ${totalDuration}ms ===`);

        fetchInProgressRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [request]
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
        showAlert(tr('pricing.list.couldNotDeleteTitle'), result.message || tr('pricing.list.tryAgainInAMoment'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      itemPricingScreenLogger.error('Delete error:', { error: errorMessage, type: typeof err });
      showAlert(tr('pricing.list.couldNotDeleteTitle'), tr('common.checkConnection'));
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
        />
      );
    },
    [
      handlePricePress,
      handleViewPrice,
      handleEditPrice,
      handleDeletePress,
      canManagePrices,
    ]
  );

  const renderSectionHeader = useCallback(
    (info: { section: PricingSection }) => {
      const isExpanded = info.section.data.length > 0;
      const count = info.section.totalCount;
      return (
        <Pressable
          onPress={() => toggleSectionExpansion(info.section.itemId)}
          style={({ pressed }) => [
            styles.sectionHeader,
            isExpanded && styles.sectionHeaderExpanded,
            pressed && styles.sectionHeaderPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={tr('pricing.list.sectionLabel', { title: info.section.title, count: formatCount(count, 'price') })}
          accessibilityState={{ expanded: isExpanded }}
        >
          <View style={styles.sectionHeaderIcon}>
            <Icon name="cube-outline" size={iconSize.md} color={t.brand.tint} />
          </View>
          <Text style={styles.sectionHeaderText} numberOfLines={2}>
            {info.section.title}
          </Text>
          <View style={styles.sectionHeaderBadge}>
            <Text style={styles.sectionHeaderBadgeText} maxFontSizeMultiplier={1.6}>
              {formatNumber(count)}
            </Text>
          </View>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={t.icon.secondary}
          />
        </Pressable>
      );
    },
    [toggleSectionExpansion, styles, t]
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityRole="progressbar" accessibilityLabel={tr('pricing.list.loadingMoreLabel')}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>{tr('common.loadingMore')}</Text>
      </View>
    );
  };

  const renderHeader = (showActions: boolean) => (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.headerContent}>
        <View style={styles.titleRow}>
          <HeaderBackButton />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {tr('pricing.list.title')}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {showActions && canManagePrices() && (
            <Pressable
              style={styles.iconButton}
              onPress={handleCreatePrice}
              accessibilityRole="button"
              accessibilityLabel={tr('pricing.list.addPrice')}
            >
              <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
          )}
          {userProfile && (
            <Pressable
              style={styles.iconButton}
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel={tr('pricing.list.settings')}
            >
              <Avatar name={userProfile.name} id={userProfile.id} size="sm" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );

  // Loading state
  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        {renderHeader(false)}
        <FlatList
          data={[1, 2, 3, 4, 5, 6]}
          renderItem={() => <ListSkeletonCard metricsCount={3} showFooter={true} />}
          keyExtractor={(item: number) => item.toString()}
          contentContainerStyle={styles.listContent}
          accessibilityLabel={tr('pricing.card.loadingLabel')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader(true)}

      {/* Filter bar: Filters, active filters, fast filters, Clear all */}
      <FilterBar
        config={FILTER_CONFIGS[ITEM_PRICING_FILTERS.listKey]}
        filters={filters}
        onOpenAll={() => router.push({ pathname: '/list-filters', params: { listKey: ITEM_PRICING_FILTERS.listKey } })}
      />

      {/* Main Content */}
      {data.length > 0 ? (
        <SectionList
          sections={groupedData as any}
          renderItem={renderPriceCard}
          renderSectionHeader={renderSectionHeader as any}
          keyExtractor={(item: ItemStoragePrice) => item.id}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[t.brand.tint]}
              tintColor={t.brand.tint}
              progressBackgroundColor={t.surface.card}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.1}
          contentContainerStyle={[styles.listContent, { paddingBottom: space.huge + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      ) : (
        <ListEmptyState
          activeFilterCount={activeFilterCount}
          emptyIcon="cash"
          filteredIcon="filter-variant"
          emptyTitle={tr('pricing.list.emptyTitle')}
          filteredTitle={tr('pricing.list.filteredTitle')}
          emptySubtitle={canManagePrices() ? tr('pricing.list.emptySubtitleManage') : tr('pricing.list.emptySubtitleView')}
          filteredSubtitle={tr('pricing.list.filteredSubtitle')}
          onClearFilters={filters.clear}
          showCreateButton={canManagePrices() && activeFilterCount === 0}
          createButtonLabel={tr('pricing.list.addPrice')}
          createButtonIcon="plus"
          onCreatePress={handleCreatePrice}
        />
      )}

      {/* Delete Confirmation Dialog (style guide §13.9) */}
      <Modal
        visible={deleteDialogVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !deleting && setDeleteDialogVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !deleting && setDeleteDialogVisible(false)}
          accessibilityRole="button"
          accessibilityLabel={tr('common.cancel')}
        >
          <Pressable
            style={styles.modalDialog}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
            accessible={false}
          >
            <View style={styles.modalHeader}>
              <Icon name="alert-circle-outline" size={iconSize.lg} color={t.status.negative.text} />
              <Text style={styles.modalTitle} accessibilityRole="header">
                {tr('pricing.list.deleteTitle')}
              </Text>
            </View>

            <Text style={styles.modalText}>
              {priceToDelete?.customer_name
                ? tr('pricing.list.deleteMessageCustomer', { item: priceToDelete?.item_name, customer: priceToDelete.customer_name })
                : tr('pricing.list.deleteMessageDefault', { item: priceToDelete?.item_name })}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalButton, styles.modalButtonSecondary, pressed && styles.modalButtonSecondaryPressed]}
                onPress={() => setDeleteDialogVisible(false)}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityState={{ disabled: deleting }}
              >
                <Text style={styles.modalButtonTextSecondary} {...singleLineText()}>{tr('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalButton, styles.modalButtonDestructive, pressed && styles.modalButtonDestructivePressed]}
                onPress={handleDeleteConfirm}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel={tr('pricing.list.deletePrice')}
                accessibilityState={{ busy: deleting }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={t.destructive.onFill} />
                ) : (
                  <Text style={styles.modalButtonTextDestructive} {...singleLineText()}>{tr('pricing.list.deletePrice')}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  header: {
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerContent: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    flexShrink: 1,
  },
  title: {
    ...typography.title2,
    color: t.text.primary,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  iconButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // List
  listContent: {
    flexGrow: 1,
    paddingTop: space.xs,
    paddingBottom: 100,
  },

  // Footer
  footerLoader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.xl,
    gap: space.sm,
  },
  footerLoaderText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Section header (item group)
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.xs,
    minHeight: touchTarget + space.sm,
    borderRadius: radius.card,
    gap: space.md,
    backgroundColor: t.surface.card,
    ...t.shadow[1],
  },
  sectionHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  sectionHeaderPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  sectionHeaderIcon: {
    width: layout.avatar.sm,
    height: layout.avatar.sm,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  sectionHeaderText: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  sectionHeaderBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    minWidth: 28,
    alignItems: 'center' as const,
    backgroundColor: t.status.neutral.background,
  },
  sectionHeaderBadgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
    fontVariant: ['tabular-nums' as const],
  },

  // Dialog
  modalOverlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
  },
  modalDialog: {
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    borderRadius: radius.card,
    padding: space.xxl,
    backgroundColor: t.surface.sheet,
    ...t.shadow[4],
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    marginBottom: space.md,
  },
  modalTitle: {
    ...typography.title3,
    flex: 1,
    color: t.text.primary,
  },
  modalText: {
    ...typography.body,
    color: t.text.secondary,
    marginBottom: space.xxl,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  modalButton: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: t.border.button,
  },
  modalButtonSecondaryPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  modalButtonDestructive: {
    backgroundColor: t.destructive.fill,
  },
  modalButtonDestructivePressed: {
    backgroundColor: t.destructive.fillPressed,
  },
  modalButtonTextSecondary: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  modalButtonTextDestructive: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.destructive.onFill,
  },
});

export default ItemPricingScreen;
