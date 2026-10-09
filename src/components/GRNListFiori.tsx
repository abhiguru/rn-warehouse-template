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
  Vibration,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  FlattenedItem,
  flattenSections,
  getItemType,
  DEFAULT_LIST_CONFIG,
} from '@/components/lists/types';
import { Portal, Snackbar } from 'react-native-paper';
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
  GRNFilters,
  GRNListResponse,
  GRNListParams,
} from '@/services/grn-service';
import { useFilterState } from '@/hooks/useFilterState';
import type { AutocompleteSelection, FilterValues, FilterValueType } from '@/types/filter.types';
import { getAutocompleteSelections, getStringValue, getNumberValue } from '@/types/filter.types';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { GenericFilterModal } from '@/components/filters';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import PrintJobsBottomSheet, { PrintJobsBottomSheetRef } from '@/components/PrintJobsBottomSheet';
import { Button } from '@/components/ui/Button';
import { printGRNRange } from '@/services/print-service';
import { getGRNStockStatus, type GRNStockStatus } from '@/features/grn/utils/grnStockStatus';
import { StatusTag, Avatar } from '@/components/ui';
import { createLogger } from '@/utils/logger';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize } from '@/theme/tokens';

// Filter configuration
import { GRN_FILTER_CONFIG } from '@/config/filterConfigs';

// Styles
import { makeGRNListStyles, type GRNListStyles } from './GRNListFiori.styles';

// Shared formatters
import { formatSectionDate, formatNumber, formatCount, formatDate, formatWeight } from '@/utils/formatters';

const logger = createLogger('GRNListFiori');

// Sort configuration
type SortField = 'grNo' | 'date';
type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: Array<{ field: SortField; label: string; a11y: string; icon: string }> = [
  { field: 'grNo', label: 'GRN no.', a11y: 'GRN number', icon: 'numeric' },
  { field: 'date', label: 'Date', a11y: 'date', icon: 'calendar-outline' },
];

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
}) => {
  const t = useTokens();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

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
  const status = t.status[stockStatus.status];
  const displayDate = formatDate(group.date, 'short');
  const itemCountLabel = formatCount(group.items.length, 'item');
  const weightLabel = formatWeight(Math.round(totalWeight));

  const handleSwipeAction = (action: 'view' | 'edit' | 'print') => {
    Vibration.vibrate(10);
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
          accessibilityLabel={`Print GRN ${group.grNo}`}
        >
          <Icon name="printer-outline" size={iconSize.lg} color={t.icon.primary} />
          <Text style={styles.swipeText} maxFontSizeMultiplier={1.6}>Print</Text>
        </Pressable>
      )}
      <Pressable
        style={({ pressed }) => [styles.swipeButton, styles.swipeSecondary, pressed && styles.swipeSecondaryPressed]}
        onPress={() => handleSwipeAction('view')}
        accessibilityRole="button"
        accessibilityLabel={`View GRN ${group.grNo}`}
      >
        <Icon name="eye-outline" size={iconSize.lg} color={t.icon.primary} />
        <Text style={styles.swipeText} maxFontSizeMultiplier={1.6}>View</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.swipeButton, styles.swipePrimary, pressed && styles.swipePrimaryPressed]}
        onPress={() => handleSwipeAction('edit')}
        accessibilityRole="button"
        accessibilityLabel={`Edit GRN ${group.grNo}`}
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
              `GRN ${group.grNo}`,
              group.customerName,
              displayDate,
              group.registration,
              itemCountLabel,
              `${formatNumber(totalStock)} in stock`,
              weightLabel,
              stockStatus.label,
            ].filter(Boolean).join(', ')}
            accessibilityHint="Opens the GRN. Swipe left for more actions."
          >
            {/* Status icon */}
            <View style={[styles.statusIconContainer, { backgroundColor: status.background }]}>
              <Icon name={stockStatus.icon} size={iconSize.md} color={status.text} />
            </View>

            {/* Main content */}
            <View style={styles.mainContent}>
              <Text style={styles.titleText} numberOfLines={2}>GRN {group.grNo}</Text>
              <Text style={styles.subtitleText} numberOfLines={2}>
                {group.customerName}
              </Text>

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
                      <Text style={styles.footerText}>{group.registration}</Text>
                    </View>
                  </>
                )}
                <View style={styles.footerDot} />
                <Text style={styles.footerText}>{itemCountLabel}</Text>
              </View>
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
                Vibration.vibrate(5);
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
interface FilterChipsProps {
  filters: FilterValues;
  activeFilterCount: number;
  updateFilter: (key: string, value: FilterValueType) => void;
  clearAllFilters: () => void;
  styles: GRNListStyles;
}

const FilterChips: React.FC<FilterChipsProps> = memo(({
  filters,
  activeFilterCount,
  updateFilter,
  clearAllFilters,
  styles,
}) => {
  const t = useTokens();
  if (activeFilterCount === 0) return null;

  const chips: { key: string; label: string; icon: string; onRemove: () => void }[] = [];

  // Item chips
  if (filters.itemName?.length > 0) {
    filters.itemName.forEach((item: AutocompleteSelection) => {
      chips.push({
        key: `item-${item.id}`,
        label: item.label,
        icon: 'cube-outline',
        onRemove: () => {
          const remaining = (filters.itemName ?? []).filter((i: AutocompleteSelection) => i.id !== item.id);
          updateFilter('itemName', remaining.length > 0 ? remaining : []);
        },
      });
    });
  }

  // Customer chips
  if (filters.customerName?.length > 0) {
    filters.customerName.forEach((item: AutocompleteSelection) => {
      chips.push({
        key: `customer-${item.id}`,
        label: item.label,
        icon: 'account-outline',
        onRemove: () => {
          const remaining = (filters.customerName ?? []).filter((i: AutocompleteSelection) => i.id !== item.id);
          updateFilter('customerName', remaining.length > 0 ? remaining : []);
        },
      });
    });
  }

  // GRN range chips
  if (filters.grNoFrom?.length > 0) {
    chips.push({
      key: 'grn-from',
      label: `From GRN ${filters.grNoFrom[0].label}`,
      icon: 'package-down',
      onRemove: () => updateFilter('grNoFrom', []),
    });
  }
  if (filters.grNoTo?.length > 0) {
    chips.push({
      key: 'grn-to',
      label: `To GRN ${filters.grNoTo[0].label}`,
      icon: 'package-down',
      onRemove: () => updateFilter('grNoTo', []),
    });
  }

  // Stock status chip
  if (filters.stockStatus && filters.stockStatus !== 'all') {
    chips.push({
      key: 'stock-status',
      label: filters.stockStatus === 'in_stock' ? 'In stock' : 'Out of stock',
      icon: 'warehouse',
      onRemove: () => updateFilter('stockStatus', 'all'),
    });
  }

  // Weight range chip
  if (filters.weightMin || filters.weightMax) {
    chips.push({
      key: 'weight-range',
      label: filters.weightMax
        ? `${formatNumber(Number(filters.weightMin) || 0)} to ${formatNumber(Number(filters.weightMax))} kg`
        : `${formatNumber(Number(filters.weightMin) || 0)} kg or more`,
      icon: 'weight-kilogram',
      onRemove: () => {
        updateFilter('weightMin', undefined);
        updateFilter('weightMax', undefined);
      },
    });
  }

  // Package mark chip
  if (filters.packageMark) {
    chips.push({
      key: 'package-mark',
      label: filters.packageMark,
      icon: 'tag-outline',
      onRemove: () => updateFilter('packageMark', ''),
    });
  }

  // Date range chip
  if (filters.dateFrom || filters.dateTo) {
    const fromDate = filters.dateFrom ? formatDate(filters.dateFrom) : null;
    const toDate = filters.dateTo ? formatDate(filters.dateTo) : null;
    chips.push({
      key: 'date-range',
      label: fromDate && toDate ? `${fromDate} to ${toDate}` : fromDate ? `From ${fromDate}` : `Until ${toDate}`,
      icon: 'calendar-range',
      onRemove: () => {
        updateFilter('dateFrom', undefined);
        updateFilter('dateTo', undefined);
      },
    });
  }

  return (
    <Animated.View entering={FadeIn} style={styles.filterChipsContainer}>
      <View style={styles.filterChipsHeader}>
        <View style={styles.filterCountBadge}>
          <Icon name="filter-variant" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.filterCountText}>
            {`${formatCount(activeFilterCount, 'filter')} applied`}
          </Text>
        </View>
        <Pressable
          onPress={clearAllFilters}
          style={({ pressed }) => [styles.clearAllButton, pressed && styles.clearAllButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
        >
          <Text style={styles.clearAllText}>Clear all</Text>
        </Pressable>
      </View>
      <View style={styles.filterChipsList}>
        {chips.map((chip) => (
          <View key={chip.key} style={styles.filterChip}>
            <Icon name={chip.icon} size={iconSize.sm} color={t.brand.tint} />
            <Text style={styles.filterChipText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {chip.label}
            </Text>
            <Pressable
              onPress={chip.onRemove}
              style={styles.filterChipRemove}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
            >
              <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
            </Pressable>
          </View>
        ))}
      </View>
    </Animated.View>
  );
});

FilterChips.displayName = 'FilterChips';

// ============================================================================
// EMPTY AND ERROR STATES
// ============================================================================
interface EmptyStateProps {
  activeFilterCount: number;
  onCreateGRN: () => void;
  onClearFilters: () => void;
  canCreate: boolean;
  styles: GRNListStyles;
}

const EmptyState: React.FC<EmptyStateProps> = memo(({ activeFilterCount, onCreateGRN, onClearFilters, canCreate, styles }) => {
  const t = useTokens();
  const filtered = activeFilterCount > 0;
  return (
    <View style={styles.emptyContainer}>
      <Icon
        name={filtered ? 'filter-remove-outline' : 'package-down'}
        size={iconSize.hero}
        color={t.icon.secondary}
      />
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {filtered ? 'No GRNs match your filters' : 'No GRNs yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {filtered
          ? 'Try removing a filter or clearing them all.'
          : canCreate
            ? 'GRNs you create appear here.'
            : 'GRNs for your goods appear here once they are received.'}
      </Text>
      {filtered ? (
        <Button type="secondary" variant="tint" onPress={onClearFilters}>
          Clear filters
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
  initialFilters?: FilterValues;
  clearFiltersOnMount?: boolean;
}

const GRNListFiori: React.FC<GRNListFioriProps> = ({
  onItemPress,
  initialFilters,
  clearFiltersOnMount,
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
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState<SortField>('grNo');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Expand all state
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandKey, setExpandKey] = useState(0);

  // Print state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedGRNForPrint, setSelectedGRNForPrint] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Refs
  const fetchInProgressRef = useRef(false);
  const printJobsBottomSheetRef = useRef<PrintJobsBottomSheetRef>(null);
  const hasDataRef = useRef(false);
  hasDataRef.current = (data?.items?.length ?? 0) > 0;

  // Filter state - MUST use same persistKey as GRN_FILTER_CONFIG
  const {
    debouncedValues: filters,
    activeFilterCount,
    updateFilter,
    updateFilters,
    clearAllFilters,
  } = useFilterState({
    persistKey: GRN_FILTER_CONFIG.persistKey,
    debounceMs: GRN_FILTER_CONFIG.debounceMs,
  });

  // Permissions - use centralized permission system
  const { canCreate, canUpdate } = usePermissions();
  const canCreateGRN = canCreate;
  const canPrint = canCreate || canUpdate; // Staff can print (they have update permission)

  // Apply initial filters
  useEffect(() => {
    if (clearFiltersOnMount && initialFilters) {
      clearAllFilters();
      setTimeout(() => updateFilters(initialFilters), 100);
    }
  }, []);

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

  // Fetch GRN items
  const fetchGRNItems = useCallback(async (offset = 0, append = false) => {
    if (fetchInProgressRef.current && offset === 0 && !append) return;

    try {
      if (offset === 0 && !append) {
        fetchInProgressRef.current = true;
        setLoading(true);
      }
      if (offset > 0) setLoadingMore(true);

      // Build API filters (using snake_case to match backend)
      const apiFilters: GRNFilters = {};
      const itemNames = getAutocompleteSelections(filters.itemName);
      if (itemNames.length > 0) {
        apiFilters.item_ids = itemNames.map((item) => item.id);
      }
      const customerNames = getAutocompleteSelections(filters.customerName);
      if (customerNames.length > 0) {
        apiFilters.customer_ids = customerNames.map((item) => item.id);
      }
      const grNoFrom = getAutocompleteSelections(filters.grNoFrom);
      if (grNoFrom.length > 0) {
        apiFilters.gr_no_from = grNoFrom[0].label;
      }
      const grNoTo = getAutocompleteSelections(filters.grNoTo);
      if (grNoTo.length > 0) {
        apiFilters.gr_no_to = grNoTo[0].label;
      }
      const stockStatus = getStringValue(filters.stockStatus);
      if (stockStatus && stockStatus !== 'all') {
        apiFilters.stock_status = stockStatus as GRNFilters['stock_status'];
      }
      const packageMark = getStringValue(filters.packageMark);
      if (packageMark?.trim()) {
        apiFilters.package_mark = packageMark.trim();
      }
      const weightMin = getNumberValue(filters.weightMin);
      const weightMax = getNumberValue(filters.weightMax);
      if (weightMin != null) apiFilters.weight_min = weightMin;
      if (weightMax != null) apiFilters.weight_max = weightMax;

      // Convert sortBy to snake_case for API (SortField is 'grNo' | 'date')
      const apiSortBy = sortBy === 'grNo' ? 'gr_no' : sortBy;

      const request: GRNListParams = {
        p_filters: Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
        p_date_from: filters.dateFrom,
        p_date_to: filters.dateTo,
        p_sort_by: apiSortBy as GRNListParams['p_sort_by'],
        p_sort_order: sortOrder,
        p_limit: offset === 0 ? 20 : 80,
        p_offset: offset,
      };
      const result = isCustomerAccount
        ? await getAssignedCustomerGRNItems(assignedCustomerIds, request)
        : await getAllGRNItems(request);

      if (result.success && result.data) {
        setLoadError(false);
        if (append) {
          setData(prev => prev ? { ...result.data, items: [...prev.items, ...result.data.items] } : result.data);
          setCurrentOffset(prev => prev + result.data.items.length);
        } else {
          setData(result.data);
          setCurrentOffset(result.data.items.length);
        }
      } else {
        // Keep the server message for support; show plain words to the user
        logger.warn('Load failed:', result.error || result.message);
        showLoadFailure(append);
      }
    } catch (error) {
      logger.error('Exception:', error);
      showLoadFailure(append);
    } finally {
      fetchInProgressRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [assignedCustomerIds, filters, isCustomerAccount, sortBy, sortOrder, showLoadFailure]);

  useEffect(() => {
    setCurrentOffset(0);
    fetchGRNItems();
  }, [filters, sortBy, sortOrder]);

  // Event handlers
  const handleGRNPress = useCallback((group: GRNGroupData) => {
    if (!group?.grnId) {
      logger.error('Cannot navigate: grnId is undefined', group);
      return;
    }
    Vibration.vibrate(10);
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
    Vibration.vibrate(10);
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
    Vibration.vibrate(5);
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
      if (!item.gr_no) {
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

    // When sorting by GRN No, return flat list
    if (sortBy === 'grNo') {
      allGroups.sort((a, b) => {
        const numA = parseInt(a.grNo.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.grNo.replace(/\D/g, ''), 10) || 0;
        const comparison = numB - numA;
        return sortOrder === 'asc' ? -comparison : comparison;
      });

      return allGroups.map(group => ({
        type: 'card' as const,
        data: group,
        key: `${group.grnId}_${group.grNo}`,
      }));
    }

    // When sorting by date, group by date sections
    const groupedByDate: Record<string, { title: string; data: GRNGroupData[] }> = allGroups.reduce((acc, group) => {
      const dateKey = formatSectionDate(group.date);
      if (!acc[dateKey]) acc[dateKey] = { title: dateKey, data: [] };
      acc[dateKey].data.push(group);
      return acc;
    }, {} as Record<string, { title: string; data: GRNGroupData[] }>);

    // Sort items within each date section
    Object.values(groupedByDate).forEach(section => {
      section.data.sort((a, b) => {
        const comparison = new Date(b.date).getTime() - new Date(a.date).getTime();
        return sortOrder === 'asc' ? -comparison : comparison;
      });
    });

    // Sort sections by date
    const sortedSections = Object.values(groupedByDate);
    sortedSections.sort((a, b) => {
      const order = ['Today', 'Yesterday'];
      const aIdx = order.indexOf(a.title);
      const bIdx = order.indexOf(b.title);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      const aData = a.data[0];
      const bData = b.data[0];
      const comparison = new Date(bData?.date || 0).getTime() - new Date(aData?.date || 0).getTime();
      return sortOrder === 'asc' ? -comparison : comparison;
    });

    return flattenSections(sortedSections, (group) => `${group.grnId}_${group.grNo}`);
  }, [data?.items, sortBy, sortOrder]);


  const handleRetry = useCallback(() => {
    setLoadError(false);
    fetchGRNItems();
  }, [fetchGRNItems]);

  const openFilters = useCallback(() => {
    logger.info(`[FILTER_BUTTON_CLICKED] Opening filter modal`);
    setShowFilterModal(true);
  }, []);

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
      />
    );
  }, [handleGRNPress, handleViewDetails, handleEdit, handlePrint, canPrint, styles, allExpanded, expandKey]);

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
        <View>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            onPress={openFilters}
            disabled={!interactive}
            accessibilityRole="button"
            accessibilityLabel={activeFilterCount > 0 ? `Filter GRNs, ${activeFilterCount} applied` : 'Filter GRNs'}
            accessibilityState={{ disabled: !interactive }}
          >
            <Icon name="filter-variant" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge} pointerEvents="none">
              <Text style={styles.filterBadgeText} maxFontSizeMultiplier={1.6}>{activeFilterCount}</Text>
            </View>
          )}
        </View>
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

  // Loading state
  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        {renderHeader(false)}
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

      {/* Applied filters */}
      <FilterChips
        filters={filters}
        activeFilterCount={activeFilterCount}
        updateFilter={updateFilter}
        clearAllFilters={clearAllFilters}
        styles={styles}
      />

      {/* Sort row */}
      <View style={styles.sortRow}>
        <View style={styles.sortLabel}>
          <Icon name="sort" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.sortLabelText}>Sort by</Text>
        </View>
        <View style={styles.sortOptions}>
          {SORT_OPTIONS.map((option) => {
            const selected = sortBy === option.field;
            return (
              <Pressable
                key={option.field}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPressed,
                  selected && styles.chipSelected,
                ]}
                hitSlop={{ top: 8, bottom: 8 }}
                onPress={() => {
                  Vibration.vibrate(5);
                  if (sortBy === option.field) {
                    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                  } else {
                    setSortBy(option.field);
                    setSortOrder('desc');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  selected
                    ? `Sort by ${option.a11y}, ${sortOrder === 'desc' ? 'newest first' : 'oldest first'}`
                    : `Sort by ${option.a11y}`
                }
                accessibilityHint={selected ? 'Reverses the order' : undefined}
                accessibilityState={{ selected }}
              >
                <Icon
                  name={option.icon}
                  size={iconSize.sm}
                  color={selected ? t.brand.tint : t.icon.secondary}
                />
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} maxFontSizeMultiplier={1.6}>
                  {option.label}
                </Text>
                {selected && (
                  <Icon
                    name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                    size={iconSize.sm}
                    color={t.brand.tint}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
        {/* Expand all / collapse all: icon button so the sort chips keep one row on phones */}
        <Pressable
          style={({ pressed }) => [styles.expandAllBtn, pressed && styles.chipPressed]}
          onPress={handleToggleAllExpanded}
          accessibilityRole="button"
          accessibilityLabel={allExpanded ? 'Collapse all GRNs' : 'Expand all GRNs'}
          accessibilityState={{ expanded: allExpanded }}
        >
          <Icon
            name={allExpanded ? 'unfold-less-horizontal' : 'unfold-more-horizontal'}
            size={iconSize.lg}
            color={t.brand.tint}
          />
        </Pressable>
      </View>

      {/* Main content */}
      {flattenedData.length > 0 ? (
        <FlashList
          data={flattenedData}
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
          activeFilterCount={activeFilterCount}
          onCreateGRN={handleCreateGRN}
          onClearFilters={clearAllFilters}
          canCreate={canCreateGRN}
          styles={styles}
        />
      )}

      {/* Create GRN (floating action button, guide 14.1) */}
      {canCreateGRN && (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={handleCreateGRN}
          accessibilityRole="button"
          accessibilityLabel="Create GRN"
        >
          <Icon name="plus" size={iconSize.lg} color={t.brand.onFill} />
        </Pressable>
      )}

      {/* Filter modal - only render the Portal when visible to avoid Android gesture handler issues */}
      {showFilterModal && (
        <Portal>
          <GenericFilterModal
            visible={showFilterModal}
            onClose={() => setShowFilterModal(false)}
            config={GRN_FILTER_CONFIG}
          />
        </Portal>
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
