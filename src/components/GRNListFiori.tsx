/**
 * GRNListFiori - GRN list report (style guide 14.1)
 *
 * - Object cell layout (13.6) on surface.card over background.base
 * - Status tags with icon and word (3.5, 13.5); colour is never the only signal
 * - Applied filters bar, sort chips, pull to refresh, infinite scroll
 * - Skeleton, empty, filtered-empty and error states
 * - Floating create button for roles that can create
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  FlattenedItem,
  flattenSections,
  getItemType,
  DEFAULT_LIST_CONFIG,
} from '@/components/lists/types';
import { Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  getAllGRNItems,
  getAssignedCustomerGRNItems,
  GRNItem,
  GRNListResponse,
} from '@/services/grn-service';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import PrintJobsBottomSheet, { PrintJobsBottomSheetRef } from '@/components/PrintJobsBottomSheet';
import { Button } from '@/components/ui/Button';
import { printGRNRange } from '@/services/print-service';
import { getGRNStockStatus, type GRNStockStatus } from '@/features/grn/utils/grnStockStatus';
import { StatusTag, Avatar } from '@/components/ui';
import { createLogger } from '@/utils/logger';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize } from '@/theme/tokens';

// Filters, search and sort (docs/STYLE_GUIDE.md §14.5)
import { FILTER_CONFIGS, GRN_FILTERS } from '@/features/filters/configs';
import { useListFilters } from '@/features/filters/useListFilters';
import { readSearch } from '@/features/filters/filterModel';
import { FilterBar } from '@/features/filters/components/FilterBar';
import { ListSearchField } from '@/features/filters/components/ListSearchField';
import { HighlightedText, matchesAnyWord, searchWords } from '@/features/filters/components/HighlightedText';

// Styles
import { makeGRNListStyles, type GRNListStyles } from './GRNListFiori.styles';

// Shared formatters
import { formatSectionDate, formatNumber, formatCount, formatDate, formatWeight } from '@/utils/formatters';

import { Fab } from '@/components/ui/Fab';
const logger = createLogger('GRNListFiori');

/** Row title. A receipt saved without a number says so instead of showing a bare "GRN". */
const grnTitle = (grNo: string) => (grNo.trim() ? `GRN ${grNo}` : 'GRN with no number');

/** Status when nothing was received (no quantity to judge stock against). */
const NO_QUANTITY_STATUS: GRNStockStatus = { status: 'neutral', label: 'No quantity', icon: 'circle-outline' };

/** Stock status of a GRN or item: fully dispatched is neutral, then the app low-stock rule. */
const stockStatusFor = (stock: number, qty: number): GRNStockStatus =>
  getGRNStockStatus(stock, qty) ?? NO_QUANTITY_STATUS;

// Type for grouped GRN data
interface GRNGroupData {
  grnId: string;
  grNo: string;
  date: string;
  registration?: string;
  customerName: string;
  items: GRNItem[];
}

// ============================================================================
// SKELETON CARD
// ============================================================================
const SkeletonCard = memo<{ styles: GRNListStyles }>(({ styles }) => {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0.4);

  React.useEffect(() => {
    if (reduceMotion) return undefined;
    const animate = () => {
      opacity.value = withSpring(1, { damping: 15 }, () => {
        opacity.value = withSpring(0.4, { damping: 15 });
      });
    };
    animate();
    const interval = setInterval(animate, 1600);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.skeletonCard, animatedStyle]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.skeletonObjectCell}>
        <View style={styles.skeletonStatusIcon} />
        <View style={styles.skeletonContent}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonSubtitle} />
          <View style={styles.skeletonFooter} />
        </View>
        <View style={styles.skeletonAttributes}>
          <View style={styles.skeletonBadge} />
          <View style={styles.skeletonStockValue} />
        </View>
      </View>
    </Animated.View>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

// ============================================================================
// GRN CARD (object cell)
// ============================================================================
interface GRNCardProps {
  group: GRNGroupData;
  onPress: (group: GRNGroupData) => void;
  onViewDetails: (group: GRNGroupData) => void;
  onEdit: (group: GRNGroupData) => void;
  onPrint: (group: GRNGroupData) => void;
  canPrint: boolean;
  defaultExpanded?: boolean;
  styles: GRNListStyles;
  /** Global expand state from parent */
  globalExpanded?: boolean;
  /** Key to trigger sync with global state (increments on toggle) */
  globalExpandedKey?: number;
  /** Lower-cased search words to show in bold. */
  words: string[];
}

/** Where a search matched inside a collapsed card: item, package or rack names. */
function hiddenMatches(group: GRNGroupData, words: string[]): string[] {
  if (words.length === 0) return [];
  const found = new Set<string>();
  for (const item of group.items) {
    for (const text of [item.item_name, item.package_mark, item.rack]) {
      if (text && matchesAnyWord(text, words)) found.add(text);
    }
  }
  return [...found].slice(0, 3);
}

const GRNCardFiori = memo<GRNCardProps>(({
  group,
  onPress,
  onViewDetails,
  onEdit,
  onPrint,
  canPrint,
  defaultExpanded = false,
  styles,
  globalExpanded,
  globalExpandedKey,
  words,
}) => {
  const t = useTokens();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const matched = hiddenMatches(group, words);

  // Sync with global expand/collapse state
  useEffect(() => {
    if (globalExpandedKey !== undefined && globalExpandedKey > 0) {
      setIsExpanded(globalExpanded ?? false);
    }
  }, [globalExpandedKey, globalExpanded]);
  const swipeableRef = useRef<Swipeable>(null);

  // Calculate totals
  const totalQty = group.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalWeight = group.items.reduce((sum, item) => sum + ((item.qty || 0) * (item.weight || 0)), 0);
  const totalStock = group.items.reduce((sum, item) => sum + (item.stock || 0), 0);

  // Fiori semantic status for the whole GRN
  const stockStatus = stockStatusFor(totalStock, totalQty);
  const displayDate = formatDate(group.date, 'short');
  const itemCountLabel = formatCount(group.items.length, 'item');
  const weightLabel = formatWeight(Math.round(totalWeight));

  const handleSwipeAction = (action: 'view' | 'edit' | 'print') => {
    swipeableRef.current?.close();
    if (action === 'view') onViewDetails(group);
    else if (action === 'edit') onEdit(group);
    else if (action === 'print') onPrint(group);
  };

  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      {canPrint && (
        <Pressable
          style={({ pressed }) => [styles.swipeButton, styles.swipeSecondary, pressed && styles.swipeSecondaryPressed]}
          onPress={() => handleSwipeAction('print')}
          accessibilityRole="button"
          accessibilityLabel={`Print ${grnTitle(group.grNo)}`}
        >
          <Icon name="printer-outline" size={iconSize.lg} color={t.icon.primary} />
          <Text style={styles.swipeText} maxFontSizeMultiplier={1.6}>Print</Text>
        </Pressable>
      )}
      <Pressable
        style={({ pressed }) => [styles.swipeButton, styles.swipeSecondary, pressed && styles.swipeSecondaryPressed]}
        onPress={() => handleSwipeAction('view')}
        accessibilityRole="button"
        accessibilityLabel={`View ${grnTitle(group.grNo)}`}
      >
        <Icon name="eye-outline" size={iconSize.lg} color={t.icon.primary} />
        <Text style={styles.swipeText} maxFontSizeMultiplier={1.6}>View</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.swipeButton, styles.swipePrimary, pressed && styles.swipePrimaryPressed]}
        onPress={() => handleSwipeAction('edit')}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${grnTitle(group.grNo)}`}
      >
        <Icon name="pencil-outline" size={iconSize.lg} color={t.brand.onFill} />
        <Text style={[styles.swipeText, styles.swipeTextOnFill]} maxFontSizeMultiplier={1.6}>Edit</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <View style={styles.card}>
        <View style={styles.cardContentWrapper}>
          {/* Object cell row */}
          <Pressable
            onPress={() => onPress(group)}
            style={({ pressed }) => [styles.objectCellRow, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={[
              grnTitle(group.grNo),
              group.customerName,
              displayDate,
              group.registration,
              itemCountLabel,
              `${formatNumber(totalStock)} in stock`,
              weightLabel,
              stockStatus.label,
              matched.length > 0 ? `Matched ${matched.join(', ')}` : null,
            ].filter(Boolean).join(', ')}
            accessibilityHint="Opens the GRN. Swipe left for more actions."
          >
            {/* Object icon (§13.6): the GRN glyph; stock status is the tag on the right */}
            <View style={styles.statusIconContainer}>
              <Icon name="package-down" size={iconSize.md} color={t.brand.tint} />
            </View>

            {/* Main content */}
            <View style={styles.mainContent}>
              <HighlightedText style={styles.titleText} numberOfLines={2} text={grnTitle(group.grNo)} words={words} />
              <HighlightedText style={styles.subtitleText} numberOfLines={2} text={group.customerName ?? ''} words={words} />

              <View style={styles.footerRow}>
                <View style={styles.footerItem}>
                  <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.footerText}>{displayDate}</Text>
                </View>
                {group.registration && (
                  <>
                    <View style={styles.footerDot} />
                    <View style={styles.footerItem}>
                      <Icon name="truck-outline" size={iconSize.sm} color={t.icon.secondary} />
                      <HighlightedText style={styles.footerText} text={group.registration} words={words} />
                    </View>
                  </>
                )}
                <View style={styles.footerDot} />
                <Text style={styles.footerText}>{itemCountLabel}</Text>
              </View>
              {/* Why this GRN matched, when the match is inside the collapsed items */}
              {matched.length > 0 && !isExpanded ? (
                <HighlightedText
                  style={styles.footerText}
                  numberOfLines={1}
                  text={matched.join(' · ')}
                  words={words}
                />
              ) : null}
            </View>

            {/* Attribute stack */}
            <View style={styles.attributeStack}>
              <Text style={styles.stockValueText}>{formatNumber(totalStock)}</Text>
              <Text style={styles.stockLabel}>in stock</Text>
              <StatusTag status={stockStatus.status} label={stockStatus.label} icon={stockStatus.icon} />
              <Text style={styles.weightText}>{weightLabel}</Text>
            </View>
          </Pressable>

          {/* Expanded items table */}
          {isExpanded && group.items.length > 0 && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.expandedSection}>
              <View style={styles.tableHeader} accessibilityRole="header">
                <Text style={[styles.tableHeaderCell, styles.colItem]}>Item</Text>
                <Text style={[styles.tableHeaderCell, styles.colQty]}>Bags</Text>
                <Text style={[styles.tableHeaderCell, styles.colWeight]}>Kg</Text>
                <Text style={[styles.tableHeaderCell, styles.colStock]}>Stock</Text>
              </View>

              {group.items.map((item, idx) => {
                const itemStatus = stockStatusFor(item.stock, item.qty);
                return (
                  <View
                    key={`${item.id}-${idx}`}
                    style={[styles.tableRow, idx > 0 && styles.tableRowDivider]}
                    accessible
                    accessibilityLabel={[
                      item.item_name,
                      item.package_mark,
                      formatCount(item.qty || 0, 'bag'),
                      formatWeight(Math.round(item.weight || 0)),
                      `${formatNumber(item.stock || 0)} in stock, ${itemStatus.label}`,
                    ].filter(Boolean).join(', ')}
                  >
                    <View style={[styles.tableCell, styles.colItem]}>
                      <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
                      {item.package_mark && (
                        <Text style={styles.itemMark} numberOfLines={1}>{item.package_mark}</Text>
                      )}
                    </View>
                    <Text style={[styles.tableCell, styles.colQty, styles.cellValue]}>{formatNumber(item.qty)}</Text>
                    <Text style={[styles.tableCell, styles.colWeight, styles.cellValue]}>
                      {formatNumber(Math.round(item.weight || 0))}
                    </Text>
                    <View style={[styles.tableCell, styles.colStock]}>
                      <StatusTag status={itemStatus.status} label={formatNumber(item.stock)} icon={itemStatus.icon} />
                    </View>
                  </View>
                );
              })}
            </Animated.View>
          )}

          {/* Expand / collapse */}
          {group.items.length > 0 && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setIsExpanded(prev => !prev);
              }}
              style={({ pressed }) => [styles.expandButton, pressed && styles.expandButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? 'Hide items' : `Show ${itemCountLabel}`}
              accessibilityState={{ expanded: isExpanded }}
            >
              <Text style={styles.expandButtonText}>
                {isExpanded ? 'Hide items' : `Show ${itemCountLabel}`}
              </Text>
              <Icon
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={iconSize.md}
                color={t.brand.tint}
              />
            </Pressable>
          )}
        </View>
      </View>
    </Swipeable>
  );
});

GRNCardFiori.displayName = 'GRNCardFiori';

// ============================================================================
// APPLIED FILTERS BAR
// ============================================================================
interface EmptyStateProps {
  /** A filter or a search is narrowing the list. */
  filtered: boolean;
  /** The search text in effect, if any. */
  search: string;
  onCreateGRN: () => void;
  onClearFilters: () => void;
  canCreate: boolean;
  styles: GRNListStyles;
}

const EmptyState: React.FC<EmptyStateProps> = memo(({ filtered, search, onCreateGRN, onClearFilters, canCreate, styles }) => {
  const t = useTokens();
  return (
    <View style={styles.emptyContainer}>
      <Icon
        name={filtered ? 'filter-remove-outline' : 'package-down'}
        size={iconSize.hero}
        color={t.icon.secondary}
      />
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {filtered ? (search ? `No GRNs match "${search}"` : 'No GRNs match your filters') : 'No GRNs yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {filtered
          ? search
            ? 'Check the spelling, try fewer words, or remove a filter.'
            : 'Try removing a filter or clearing them all.'
          : canCreate
            ? 'GRNs you create appear here.'
            : 'GRNs for your goods appear here once they are received.'}
      </Text>
      {filtered ? (
        <Button type="secondary" variant="tint" onPress={onClearFilters}>
          {search ? 'Clear search and filters' : 'Clear filters'}
        </Button>
      ) : canCreate ? (
        <Button type="primary" variant="tint" leftIcon="plus" onPress={onCreateGRN}>
          Create GRN
        </Button>
      ) : null}
    </View>
  );
});

EmptyState.displayName = 'EmptyState';

const ErrorState: React.FC<{ onRetry: () => void; styles: GRNListStyles }> = memo(({ onRetry, styles }) => {
  const t = useTokens();
  return (
    <View style={styles.emptyContainer}>
      <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
      <Text style={styles.emptyTitle} accessibilityRole="header">Couldn't load GRNs</Text>
      <Text style={styles.emptySubtitle}>Check your connection and try again.</Text>
      <Button type="secondary" variant="tint" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
});

ErrorState.displayName = 'ErrorState';

// ============================================================================
// MAIN COMPONENT
// ============================================================================
interface GRNListFioriProps {
  onItemPress?: (item: GRNItem) => void;
  /** Open the list showing this range of GRN numbers (print-range links). Replaces any filters. */
  initialNumberRange?: { from?: string; to?: string };
}

const GRNListFiori: React.FC<GRNListFioriProps> = ({
  onItemPress,
  initialNumberRange,
}) => {
  const { userProfile } = useAppSelector((state) => state.auth);
  const styles = useThemedStyles(makeGRNListStyles);
  const t = useTokens();
  const isCustomerAccount = userProfile?.role === 'customer';
  const assignedCustomerIds = useMemo(
    () =>
      userProfile?.assignedCustomerIds ||
      userProfile?.assignedCustomers?.map(customer => customer.id) ||
      [],
    [userProfile]
  );

  // State
  const [data, setData] = useState<GRNListResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [loadError, setLoadError] = useState(false);

  // Filters, search and sort
  const filters = useListFilters(GRN_FILTERS);
  const { request, sort, search } = filters;
  const sortedByNumber = sort?.field === 'gr_no';
  const words = useMemo(() => searchWords(readSearch(GRN_FILTERS, filters.values).text), [filters.values]);
  const listRef = useRef<FlashListRef<FlattenedItem<GRNGroupData>>>(null);

  // Expand all state
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandKey, setExpandKey] = useState(0);

  // Print state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedGRNForPrint, setSelectedGRNForPrint] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Refs
  const printJobsBottomSheetRef = useRef<PrintJobsBottomSheetRef>(null);
  const hasDataRef = useRef(false);
  hasDataRef.current = (data?.items?.length ?? 0) > 0;

  // Permissions - use centralized permission system
  const { canCreate, canUpdate } = usePermissions();
  const canCreateGRN = canCreate;
  const canPrint = canCreate || canUpdate; // Staff can print (they have update permission)

  // A print-range link opens the list on exactly that range.
  const initialFrom = initialNumberRange?.from;
  const initialTo = initialNumberRange?.to;
  useEffect(() => {
    if (initialFrom || initialTo) filters.apply({ numberRange: { from: initialFrom, to: initialTo } });
    // Only when the link's range changes.
     
  }, [initialFrom, initialTo]);

  // A failed first page shows the error state; a failed later page or
  // refresh with data on screen shows a snackbar and keeps the list.
  const showLoadFailure = useCallback((append: boolean) => {
    if (append) {
      setSnackbarMessage("Couldn't load more GRNs. Scroll down to try again.");
      setSnackbarVisible(true);
    } else if (hasDataRef.current) {
      setSnackbarMessage("Couldn't refresh GRNs. Check your connection and try again.");
      setSnackbarVisible(true);
    } else {
      setLoadError(true);
    }
  }, []);

  // Fetch GRN items. A newer request (the user kept typing, or changed a filter)
  // replaces an older one: late answers to old questions are dropped.
  const latestRequest = useRef(0);
  const fetchGRNItems = useCallback(async (offset = 0, append = false) => {
    const requestId = append ? latestRequest.current : ++latestRequest.current;
    try {
      if (offset === 0 && !append) setLoading(true);
      if (offset > 0) setLoadingMore(true);

      const params = { ...request, p_limit: offset === 0 ? 20 : 80, p_offset: offset };
      const result = isCustomerAccount
        ? await getAssignedCustomerGRNItems(assignedCustomerIds, params)
        : await getAllGRNItems(params);
      if (requestId !== latestRequest.current) return;

      if (result.success && result.data) {
        setLoadError(false);
        if (append) {
          setData(prev => prev ? { ...result.data, items: [...prev.items, ...result.data.items] } : result.data);
          setCurrentOffset(prev => prev + result.data.items.length);
        } else {
          setData(result.data);
          setCurrentOffset(result.data.items.length);
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      } else {
        // Keep the server message for support; show plain words to the user
        logger.warn('Load failed:', result.error || result.message);
        showLoadFailure(append);
      }
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      logger.error('Exception:', error);
      showLoadFailure(append);
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [assignedCustomerIds, request, isCustomerAccount, showLoadFailure]);

  // Any change of filter, search or sort is a new first page.
  useEffect(() => {
    setCurrentOffset(0);
    fetchGRNItems();
  }, [fetchGRNItems]);

  // Event handlers
  const handleGRNPress = useCallback((group: GRNGroupData) => {
    if (!group?.grnId) {
      logger.error('Cannot navigate: grnId is undefined', group);
      return;
    }
    router.push(`/grn-details/${group.grnId}`);
  }, []);

  const handleViewDetails = useCallback((group: GRNGroupData) => {
    if (!group?.grnId) return;
    router.push(`/grn-details/${group.grnId}`);
  }, []);

  const handleEdit = useCallback((group: GRNGroupData) => {
    if (!group?.grnId) return;
    router.push(`/grn-edit/${group.grnId}/step1`);
  }, []);

  const handleCreateGRN = useCallback(() => {
    router.push('/grn-form/step1');
  }, []);

  const handlePrint = useCallback((group: GRNGroupData) => {
    setSelectedGRNForPrint(group.grNo);
    setShowPrintDialog(true);
  }, []);

  const handlePrintConfirm = useCallback(async (start: string, end: string) => {
    try {
      const result = await printGRNRange(start, end);
      if (result.success) {
        setSnackbarMessage(
          result.print_job?.cups_job_id
            ? `Print job ${result.print_job.cups_job_id} sent.`
            : 'Print job sent.'
        );
      } else {
        logger.warn('Print failed:', result.error);
        setSnackbarMessage("Couldn't send the print job. Check the printer and try again.");
      }
      setSnackbarVisible(true);
    } catch (error) {
      logger.error('Print exception:', error);
      setSnackbarMessage("Couldn't send the print job. Check your connection and try again.");
      setSnackbarVisible(true);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGRNItems();
  }, [fetchGRNItems]);

  const onEndReached = useCallback(() => {
    if (data?.pagination.has_more && !loadingMore) {
      fetchGRNItems(currentOffset, true);
    }
  }, [data, loadingMore, fetchGRNItems, currentOffset]);

  // Toggle expand/collapse all cards
  const handleToggleAllExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAllExpanded(prev => !prev);
    setExpandKey(prev => prev + 1);
  }, []);

  // Group items - by date when sorting by date, or flat list when sorting by GRN No
  const flattenedData = useMemo((): FlattenedItem<GRNGroupData>[] => {
    if (!data?.items) return [];

    // Consolidate items into GRN groups
    // BACKEND ISSUE: get_all_grn_items RPC is returning camelCase (grNo, grnId, customerName)
    // instead of snake_case (gr_no, grn_id, customer_name). Backend team needs to fix this.
    const groups = data.items.reduce((acc, item) => {
      // A missing field means a malformed row. An empty number is a real receipt
      // (older data can hold one) and must stay visible so it can be opened and fixed.
      if (item.gr_no == null) {
        if (__DEV__) {
          logger.warn('Item missing gr_no (backend returning camelCase?):', item);
        }
        return acc;
      }
      const key = `${item.grn_id || item.id}_${item.gr_no}`;
      if (!acc[key]) {
        acc[key] = {
          grnId: item.grn_id || item.id,
          grNo: item.gr_no,
          date: item.date,
          registration: item.registration ?? undefined,
          customerName: item.customer_name,
          items: [],
        };
      }
      acc[key].items.push(item);
      return acc;
    }, {} as Record<string, GRNGroupData>);

    const allGroups = Object.values(groups);

    // When sorting by GRN No, return a flat list in the order the rows arrived.
    // The server (or the customer merge in grn-service) already sorted them by
    // receipt number; groups are built in first-seen order, so nothing is re-sorted here.
    if (sortedByNumber) {
      return allGroups.map(group => ({
        type: 'card' as const,
        data: group,
        key: `${group.grnId}_${group.grNo}`,
      }));
    }

    // When sorting by date, group into date sections in the order the rows arrived.
    // The rows are already in date order (oldest or newest first), so each day's
    // receipts are together and nothing is re-sorted. "Today" and "Yesterday" are
    // only section titles: they take their place by date like any other day.
    const sections: { title: string; data: GRNGroupData[] }[] = [];
    const sectionByTitle = new Map<string, { title: string; data: GRNGroupData[] }>();
    allGroups.forEach(group => {
      const title = formatSectionDate(group.date);
      let section = sectionByTitle.get(title);
      if (!section) {
        section = { title, data: [] };
        sectionByTitle.set(title, section);
        sections.push(section);
      }
      section.data.push(group);
    });

    return flattenSections(sections, (group) => `${group.grnId}_${group.grNo}`);
  }, [data?.items, sortedByNumber]);


  const handleRetry = useCallback(() => {
    setLoadError(false);
    fetchGRNItems();
  }, [fetchGRNItems]);


  // Render functions
  const renderItem = useCallback(({ item }: { item: FlattenedItem<GRNGroupData> }) => {
    if (item.type === 'header') {
      return (
        <View
          style={styles.sectionHeader}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${item.title}, ${formatCount(item.count, 'GRN')}`}
        >
          <Text style={styles.sectionTitle}>{item.title}</Text>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionCount} maxFontSizeMultiplier={1.6}>{item.count}</Text>
          </View>
        </View>
      );
    }

    return (
      <GRNCardFiori
        group={item.data}
        onPress={handleGRNPress}
        onViewDetails={handleViewDetails}
        onEdit={handleEdit}
        onPrint={handlePrint}
        canPrint={canPrint ?? false}
        styles={styles}
        globalExpanded={allExpanded}
        globalExpandedKey={expandKey}
        words={words}
      />
    );
  }, [handleGRNPress, handleViewDetails, handleEdit, handlePrint, canPrint, styles, allExpanded, expandKey, words]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>Loading more GRNs…</Text>
      </View>
    );
  }, [loadingMore, styles, t]);

  const userName = userProfile?.name || 'User';

  const renderHeader = (interactive: boolean) => (
    <View style={styles.header}>
      <Text style={styles.headerTitle} accessibilityRole="header">GRNs</Text>
      <View style={styles.headerActions}>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          onPress={handleToggleAllExpanded}
          disabled={!interactive}
          accessibilityRole="button"
          accessibilityLabel={allExpanded ? 'Collapse all GRNs' : 'Expand all GRNs'}
          accessibilityState={{ disabled: !interactive, expanded: allExpanded }}
        >
          <Icon
            name={allExpanded ? 'unfold-less-horizontal' : 'unfold-more-horizontal'}
            size={iconSize.lg}
            color={t.icon.primary}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Avatar name={userName} id={userProfile?.id} size="sm" />
        </Pressable>
      </View>
    </View>
  );

  // Search field and filter bar: shown in every state, so a search or filter
  // can always be changed or cleared, also while loading or when nothing matches.
  const openAllFilters = () => router.push({ pathname: '/list-filters', params: { listKey: GRN_FILTERS.listKey } });
  const renderSearchAndFilters = () => (
    <>
      <ListSearchField
        listKey={GRN_FILTERS.listKey}
        value={search}
        onSearch={filters.setSearch}
        placeholder={GRN_FILTERS.search?.placeholder ?? 'Search'}
        loading={loading}
      />
      <FilterBar config={FILTER_CONFIGS[GRN_FILTERS.listKey]} filters={filters} onOpenAll={openAllFilters} />
    </>
  );

  // First load: skeleton. Later loads keep the rows on screen while the new ones arrive.
  if (loading && !refreshing && !data) {
    return (
      <View style={styles.container}>
        {renderHeader(false)}
        {renderSearchAndFilters()}
        <View accessible accessibilityLabel="Loading GRNs" accessibilityState={{ busy: true }} style={{ flex: 1 }}>
          <FlatList
            data={[1, 2, 3, 4, 5]}
            renderItem={() => <SkeletonCard styles={styles} />}
            keyExtractor={(item) => item.toString()}
            contentContainerStyle={styles.listContent}
            scrollEnabled={false}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      {renderHeader(true)}

      {renderSearchAndFilters()}

      {/* Main content */}
      {flattenedData.length > 0 ? (
        <FlashList
          ref={listRef}
          data={flattenedData}
          // Re-sorted lists must not stay anchored on the row that was on top before.
          maintainVisibleContentPosition={{ disabled: true }}
          renderItem={renderItem}
          keyExtractor={(item: FlattenedItem<GRNGroupData>) => item.key}
          getItemType={getItemType}
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
          onEndReachedThreshold={DEFAULT_LIST_CONFIG.onEndReachedThreshold}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : loadError ? (
        <ErrorState onRetry={handleRetry} styles={styles} />
      ) : (
        <EmptyState
          filtered={filters.hasAny}
          search={search}
          onCreateGRN={handleCreateGRN}
          onClearFilters={filters.clear}
          canCreate={canCreateGRN}
          styles={styles}
        />
      )}

      {/* Create GRN (floating action button, guide 14.1) */}
      {canCreateGRN && (
        <Fab label="Create GRN" onPress={handleCreateGRN} />
      )}

      {/* Print dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => setShowPrintDialog(false)}
        onConfirm={handlePrintConfirm}
        title="Print GRN range"
        defaultNumber={selectedGRNForPrint}
        label="GRN number"
        placeholder="For example, Z0797"
        onViewJobs={() => {
          setShowPrintDialog(false);
          printJobsBottomSheetRef.current?.open();
        }}
      />

      {/* Print jobs sheet */}
      <PrintJobsBottomSheet ref={printJobsBottomSheetRef} />

      {/* Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        style={styles.snackbar}
      >
        <Text style={styles.snackbarText}>{snackbarMessage}</Text>
      </Snackbar>
    </View>
  );
};

export default GRNListFiori;
