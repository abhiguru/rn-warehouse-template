/**
 * GRNListFiori - SAP Fiori Design System Implementation
 *
 * Key design changes from Material Design 3:
 * - SAP Fiori Object Cell layout pattern
 * - Semantic status colors (positive/critical/negative/neutral)
 * - Cleaner visual hierarchy with attribute stacking
 * - Warehouse operator optimized UI
 * - Enhanced selection states
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Alert,
  Platform,
  Pressable,
  Vibration,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  FlattenedItem,
  flattenSections,
  getItemType,
  DEFAULT_LIST_CONFIG,
} from '@/components/lists/types';
import {
  Card,
  ActivityIndicator,
  Button,
  Chip,
  IconButton,
  Portal,
  Surface,
  Badge,
  Snackbar,
} from 'react-native-paper';
import { router } from 'expo-router';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getAllGRNItems, GRNItem, GRNFilters, GRNListResponse, GRNListParams } from '@/services/grn-service';
import { useFilterState } from '@/hooks/useFilterState';
import type { AutocompleteSelection, FilterValues, FilterValueType } from '@/types/filter.types';
import { getAutocompleteSelections, getStringValue, getNumberValue } from '@/types/filter.types';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { GenericFilterModal } from '@/components/filters';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import PrintJobsBottomSheet, { PrintJobsBottomSheetRef } from '@/components/PrintJobsBottomSheet';
import { printGRNRange } from '@/services/print-service';
import { getStockStatus, getStatusColors, StockStatus } from '@/utils/stockStatus';
import { createLogger } from '@/utils/logger';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Dynamic theme colors hook
import { useListColors, ListColors } from '@/hooks/useListColors';

// Filter configuration
import { GRN_FILTER_CONFIG } from '@/config/filterConfigs';

// Styles
import { styles } from './GRNListFiori.styles';

// Shared formatters
import { formatSectionDate, formatNumber } from '@/utils/formatters';

// Sort configuration
type SortField = 'grNo' | 'date';
type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: Array<{ field: SortField; label: string; icon: string }> = [
  { field: 'grNo', label: 'GRN No', icon: 'numeric' },
  { field: 'date', label: 'Date', icon: 'calendar' },
];

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
// SKELETON CARD COMPONENT (SAP Fiori Style)
// ============================================================================
interface SkeletonCardProps {
  colors: ListColors;
}

const SkeletonCard = memo<SkeletonCardProps>(({ colors }) => {
  const opacity = useSharedValue(0.4);

  React.useEffect(() => {
    const animate = () => {
      opacity.value = withSpring(1, { damping: 15 }, () => {
        opacity.value = withSpring(0.4, { damping: 15 });
      });
    };
    animate();
    const interval = setInterval(animate, 1600);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.skeletonCard, { backgroundColor: colors.cellBackground, borderWidth: 1, borderColor: colors.cellDivider }, animatedStyle]}>
      <View style={styles.skeletonObjectCell}>
        <View style={[styles.skeletonStatusIcon, { backgroundColor: colors.gray200 }]} />
        <View style={styles.skeletonContent}>
          <View style={[styles.skeletonTitle, { backgroundColor: colors.gray200 }]} />
          <View style={[styles.skeletonSubtitle, { backgroundColor: colors.gray200 }]} />
          <View style={[styles.skeletonFooter, { backgroundColor: colors.gray200 }]} />
        </View>
        <View style={styles.skeletonAttributes}>
          <View style={[styles.skeletonBadge, { backgroundColor: colors.gray200 }]} />
          <View style={[styles.skeletonStockValue, { backgroundColor: colors.gray200 }]} />
        </View>
      </View>
    </Animated.View>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

// ============================================================================
// SAP FIORI GRN CARD COMPONENT (Object Cell Layout)
// ============================================================================
interface GRNCardProps {
  group: GRNGroupData;
  onPress: (group: GRNGroupData) => void;
  onViewDetails: (group: GRNGroupData) => void;
  onEdit: (group: GRNGroupData) => void;
  onPrint: (group: GRNGroupData) => void;
  canPrint: boolean;
  defaultExpanded?: boolean;
  colors: ListColors;
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
  colors,
  globalExpanded,
  globalExpandedKey,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Sync with global expand/collapse state
  useEffect(() => {
    if (globalExpandedKey !== undefined && globalExpandedKey > 0) {
      setIsExpanded(globalExpanded ?? false);
    }
  }, [globalExpandedKey, globalExpanded]);
  const swipeableRef = useRef<Swipeable>(null);
  const scale = useSharedValue(1);

  // Calculate totals
  const totalQty = group.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalWeight = group.items.reduce((sum, item) => sum + ((item.qty || 0) * (item.weight || 0)), 0);
  const totalStock = group.items.reduce((sum, item) => sum + (item.stock || 0), 0);

  // Get SAP Fiori semantic status
  const stockStatus = getStockStatus(totalStock, totalQty);
  const statusColors = getStatusColors(stockStatus.status);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handleSwipeAction = (action: 'view' | 'edit' | 'print') => {
    Vibration.vibrate(10);
    swipeableRef.current?.close();
    if (action === 'view') onViewDetails(group);
    else if (action === 'edit') onEdit(group);
    else if (action === 'print') onPrint(group);
  };

  // Get status icon container style
  const getStatusIconStyle = (status: StockStatus) => {
    switch (status) {
      case 'positive':
        return { backgroundColor: colors.statusPositiveLight, borderColor: colors.statusPositiveBorder };
      case 'critical':
        return { backgroundColor: colors.statusCriticalLight, borderColor: colors.statusCriticalBorder };
      case 'negative':
        return { backgroundColor: colors.statusNegativeLight, borderColor: colors.statusNegativeBorder };
      default:
        return { backgroundColor: colors.statusNoneLight, borderColor: colors.gray300 };
    }
  };

  // Get status badge style
  const getStatusBadgeStyle = (status: StockStatus) => {
    switch (status) {
      case 'positive':
        return { backgroundColor: colors.statusPositive };
      case 'critical':
        return { backgroundColor: colors.statusCritical };
      case 'negative':
        return { backgroundColor: colors.statusNegative };
      default:
        return { backgroundColor: colors.statusNone };
    }
  };

  // Get stock value color style
  const getStockValueStyle = (status: StockStatus) => {
    switch (status) {
      case 'positive':
        return { color: colors.statusPositive };
      case 'critical':
        return { color: colors.statusCritical };
      case 'negative':
        return { color: colors.statusNegative };
      default:
        return { color: colors.statusNone };
    }
  };

  // Get table stock badge style
  const getTableStockBadgeStyle = (stock: number, qty: number) => {
    const itemStatus = getStockStatus(stock, qty);
    switch (itemStatus.status) {
      case 'positive':
        return { backgroundColor: colors.statusPositive };
      case 'critical':
        return { backgroundColor: colors.statusCritical };
      case 'negative':
        return { backgroundColor: colors.statusNegative };
      default:
        return { backgroundColor: colors.statusNone };
    }
  };

  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      {canPrint && (
        <Pressable
          style={[styles.swipeButton, styles.swipePrint, { backgroundColor: colors.purple }]}
          onPress={() => handleSwipeAction('print')}
          accessibilityRole="button"
          accessibilityLabel="Print GRN"
        >
          <Icon name="printer" size={22} color={colors.textInverse} />
          <Text style={[styles.swipeText, { color: colors.textInverse }]}>Print</Text>
        </Pressable>
      )}
      <Pressable
        style={[styles.swipeButton, styles.swipeView, { backgroundColor: colors.statusNeutral }]}
        onPress={() => handleSwipeAction('view')}
        accessibilityRole="button"
        accessibilityLabel="View GRN details"
      >
        <Icon name="eye-outline" size={22} color={colors.textInverse} />
        <Text style={[styles.swipeText, { color: colors.textInverse }]}>View</Text>
      </Pressable>
      <Pressable
        style={[styles.swipeButton, styles.swipeEdit, { backgroundColor: colors.primary }]}
        onPress={() => handleSwipeAction('edit')}
        accessibilityRole="button"
        accessibilityLabel="Edit GRN"
      >
        <Icon name="pencil-outline" size={22} color={colors.textInverse} />
        <Text style={[styles.swipeText, { color: colors.textInverse }]}>Edit</Text>
      </Pressable>
    </View>
  );

  return (
    <Animated.View style={animatedStyle}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
      >
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={() => onPress(group)}
          accessibilityRole="button"
          accessibilityLabel={`GRN ${group.grNo} for ${group.customerName}, ${stockStatus.label} stock`}
        >
          <View style={[styles.card, { backgroundColor: colors.cellBackground, borderWidth: 1, borderColor: colors.cellDivider }]}>
            <View style={styles.cardContentWrapper}>
              {/* SAP Fiori Object Cell Row */}
              <View style={styles.objectCellRow}>
                {/* Status Icon (Left, 40dp) */}
                <View style={[styles.statusIconContainer, getStatusIconStyle(stockStatus.status)]}>
                  <Icon
                    name={stockStatus.icon}
                    size={20}
                    color={statusColors.main}
                  />
                </View>

                {/* Main Content (Center, Flex) */}
                <View style={styles.mainContent}>
                  {/* Title Row - GRN Number */}
                  <View style={styles.titleRow}>
                    <Text style={[styles.titleText, { color: colors.textPrimary }]}>GRN-{group.grNo}</Text>
                  </View>

                  {/* Subtitle Row - Customer Name */}
                  <View style={styles.subtitleRow}>
                    <Text style={[styles.subtitleText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {group.customerName}
                    </Text>
                  </View>

                  {/* Footer Row - Date, Truck, Item Count */}
                  <View style={styles.footerRow}>
                    <View style={styles.footerItem}>
                      <Icon name="calendar" size={14} color={colors.textTertiary} />
                      <Text style={[styles.footerText, { color: colors.textTertiary }]}>
                        {new Date(group.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                    {group.registration && (
                      <>
                        <View style={[styles.footerDot, { backgroundColor: colors.gray400 }]} />
                        <View style={styles.footerItem}>
                          <Icon name="truck" size={14} color={colors.textTertiary} />
                          <Text style={[styles.footerText, { color: colors.textTertiary }]}>{group.registration}</Text>
                        </View>
                      </>
                    )}
                    <View style={[styles.itemCountBadge, { backgroundColor: colors.gray100 }]}>
                      <Text style={[styles.itemCountText, { color: colors.textSecondary }]}>{group.items.length} items</Text>
                    </View>
                  </View>
                </View>

                {/* Attribute Stack (Right) */}
                <View style={styles.attributeStack}>
                  {/* Status Badge */}
                  <View style={[styles.statusBadge, getStatusBadgeStyle(stockStatus.status)]}>
                    <Text style={[styles.statusBadgeText, { color: colors.textInverse }]}>{stockStatus.label}</Text>
                  </View>

                  {/* Stock Value */}
                  <View style={styles.stockValueContainer}>
                    <Text style={[styles.stockValueText, getStockValueStyle(stockStatus.status)]}>
                      {formatNumber(totalStock)}
                    </Text>
                    <Text style={[styles.stockLabel, { color: colors.textTertiary }]}>STOCK</Text>
                  </View>

                  {/* Weight Display */}
                  <View style={styles.weightDisplay}>
                    <Text style={[styles.weightText, { color: colors.textTertiary }]}>{formatNumber(Math.round(totalWeight))} kg</Text>
                  </View>
                </View>
              </View>

              {/* Expanded Items Table */}
              {isExpanded && group.items.length > 0 && (
                <Animated.View entering={FadeIn.duration(200)} style={[styles.expandedSection, { borderTopColor: colors.cellDivider }]}>
                  {/* Table Header */}
                  <View style={[styles.tableHeader, { backgroundColor: colors.gray50, borderBottomColor: colors.cellDivider }]}>
                    <Text style={[styles.tableHeaderCell, styles.colItem, { color: colors.textPrimary }]}>Item</Text>
                    <Text style={[styles.tableHeaderCell, styles.colQty, { color: colors.textPrimary }]}>Qty</Text>
                    <Text style={[styles.tableHeaderCell, styles.colWeight, { color: colors.textPrimary }]}>Kg</Text>
                    <Text style={[styles.tableHeaderCell, styles.colStock, { color: colors.textPrimary }]}>Stock</Text>
                  </View>

                  {/* Table Rows */}
                  {group.items.map((item, idx) => (
                    <View
                      key={`${item.id}-${idx}`}
                      style={[
                        styles.tableRow,
                        { backgroundColor: colors.cellBackground },
                        idx % 2 === 1 && { backgroundColor: colors.gray100 },
                      ]}
                    >
                      <View style={[styles.tableCell, styles.colItem]}>
                        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>{item.item_name}</Text>
                        {item.package_mark && (
                          <Text style={[styles.itemMark, { color: colors.textTertiary }]} numberOfLines={1}>{item.package_mark}</Text>
                        )}
                      </View>
                      <Text style={[styles.tableCell, styles.colQty, styles.cellValue, { color: colors.textSecondary }]}>{item.qty}</Text>
                      <Text style={[styles.tableCell, styles.colWeight, styles.cellValue, { color: colors.textSecondary }]}>
                        {Math.round(item.weight || 0)}
                      </Text>
                      <View style={[styles.tableCell, styles.colStock]}>
                        <View style={[styles.tableStockBadge, getTableStockBadgeStyle(item.stock, item.qty)]}>
                          <Text style={[styles.tableStockBadgeText, { color: colors.textInverse }]}>{item.stock}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </Animated.View>
              )}

              {/* Expand/Collapse Button */}
              {group.items.length > 0 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    Vibration.vibrate(5);
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setIsExpanded(prev => !prev);
                  }}
                  style={({ pressed }) => [
                    styles.expandButton,
                    { borderTopColor: colors.cellDivider },
                    pressed && { backgroundColor: colors.cellBackgroundPressed },
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={isExpanded ? 'Hide items' : `Show ${group.items.length} items`}
                >
                  <Text style={[styles.expandButtonText, { color: colors.primary }]}>
                    {isExpanded ? 'Hide items' : `Show ${group.items.length} items`}
                  </Text>
                  <Icon
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
              )}
            </View>
          </View>
        </Pressable>
      </Swipeable>
    </Animated.View>
  );
});

GRNCardFiori.displayName = 'GRNCardFiori';

// ============================================================================
// FILTER CHIPS COMPONENT
// ============================================================================
interface FilterChipsProps {
  filters: FilterValues;
  activeFilterCount: number;
  updateFilter: (key: string, value: FilterValueType) => void;
  clearAllFilters: () => void;
  colors: ListColors;
}

const FilterChips: React.FC<FilterChipsProps> = memo(({
  filters,
  activeFilterCount,
  updateFilter,
  clearAllFilters,
  colors,
}) => {
  if (activeFilterCount === 0) return null;

  const chips: { key: string; label: string; icon: string; onRemove: () => void }[] = [];

  // Item chips
  if (filters.itemName?.length > 0) {
    filters.itemName.forEach((item: AutocompleteSelection) => {
      chips.push({
        key: `item-${item.id}`,
        label: item.label,
        icon: 'package-variant',
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
        icon: 'account',
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
      label: `From: ${filters.grNoFrom[0].label}`,
      icon: 'file-document',
      onRemove: () => updateFilter('grNoFrom', []),
    });
  }
  if (filters.grNoTo?.length > 0) {
    chips.push({
      key: 'grn-to',
      label: `To: ${filters.grNoTo[0].label}`,
      icon: 'file-document',
      onRemove: () => updateFilter('grNoTo', []),
    });
  }

  // Stock status chip
  if (filters.stockStatus && filters.stockStatus !== 'all') {
    chips.push({
      key: 'stock-status',
      label: filters.stockStatus === 'in_stock' ? 'In Stock' : 'Out of Stock',
      icon: 'chart-bar',
      onRemove: () => updateFilter('stockStatus', 'all'),
    });
  }

  // Weight range chip
  if (filters.weightMin || filters.weightMax) {
    chips.push({
      key: 'weight-range',
      label: `${filters.weightMin || 0} - ${filters.weightMax || '∞'} kg`,
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
      icon: 'tag',
      onRemove: () => updateFilter('packageMark', ''),
    });
  }

  // Date range chip
  if (filters.dateFrom || filters.dateTo) {
    const fromDate = filters.dateFrom ? new Date(filters.dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '...';
    const toDate = filters.dateTo ? new Date(filters.dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '...';
    chips.push({
      key: 'date-range',
      label: `${fromDate} - ${toDate}`,
      icon: 'calendar-range',
      onRemove: () => {
        updateFilter('dateFrom', undefined);
        updateFilter('dateTo', undefined);
      },
    });
  }

  return (
    <Animated.View entering={FadeIn} style={[styles.filterChipsContainer, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
      <View style={styles.filterChipsHeader}>
        <View style={styles.filterCountBadge}>
          <Icon name="filter-variant" size={14} color={colors.primary} />
          <Text style={[styles.filterCountText, { color: colors.primary }]}>{activeFilterCount} active</Text>
        </View>
        <Pressable onPress={clearAllFilters} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.clearAllText, { color: colors.statusNegative }]}>Clear all</Text>
        </Pressable>
      </View>
      <View style={styles.filterChipsList}>
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            icon={chip.icon}
            onClose={chip.onRemove}
            style={[styles.filterChip, { backgroundColor: colors.primaryLight }]}
            textStyle={[styles.filterChipText, { color: colors.textSecondary }]}
            closeIcon="close-circle"
            compact
          >
            {chip.label}
          </Chip>
        ))}
      </View>
    </Animated.View>
  );
});

FilterChips.displayName = 'FilterChips';

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================
interface EmptyStateProps {
  activeFilterCount: number;
  onCreateGRN: () => void;
  canCreate: boolean;
  colors: ListColors;
}

const EmptyState: React.FC<EmptyStateProps> = memo(({ activeFilterCount, onCreateGRN, canCreate, colors }) => (
  <View style={styles.emptyContainer}>
    <Surface style={[styles.emptyIconSurface, { backgroundColor: colors.gray100 }]} elevation={2}>
      <Icon
        name={activeFilterCount > 0 ? 'filter-remove-outline' : 'package-variant-closed'}
        size={56}
        color={colors.primary}
      />
    </Surface>
    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
      {activeFilterCount > 0 ? 'No matching GRNs' : 'No GRNs yet'}
    </Text>
    <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
      {activeFilterCount > 0
        ? 'Try adjusting your filters to see more results'
        : 'Create your first GRN to get started with inventory tracking'}
    </Text>
    {canCreate && activeFilterCount === 0 && (
      <Button
        mode="contained"
        onPress={onCreateGRN}
        style={styles.emptyButton}
        buttonColor={colors.primary}
        icon="plus"
        contentStyle={styles.emptyButtonContent}
      >
        Create GRN
      </Button>
    )}
  </View>
));

EmptyState.displayName = 'EmptyState';

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
  const colors = useListColors();

  // State
  const [data, setData] = useState<GRNListResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [showFilterModal, setShowFilterModal] = useState(false);

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

      const result = await getAllGRNItems({
        p_filters: Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
        p_date_from: filters.dateFrom,
        p_date_to: filters.dateTo,
        p_sort_by: apiSortBy as GRNListParams['p_sort_by'],
        p_sort_order: sortOrder,
        p_limit: offset === 0 ? 20 : 80,
        p_offset: offset,
      });

      if (result.success && result.data) {
        if (append) {
          setData(prev => prev ? { ...result.data, items: [...prev.items, ...result.data.items] } : result.data);
          setCurrentOffset(prev => prev + result.data.items.length);
        } else {
          setData(result.data);
          setCurrentOffset(result.data.items.length);
        }
      } else {
        Alert.alert('Error', result.error || result.message || 'Failed to load GRN items');
      }
    } catch (error) {
      console.error('[GRNListFiori] Exception:', error);
      Alert.alert('Error', 'Failed to load GRN items');
    } finally {
      fetchInProgressRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filters, sortBy, sortOrder]);

  useEffect(() => {
    setCurrentOffset(0);
    fetchGRNItems();
  }, [filters, sortBy, sortOrder]);

  // Event handlers
  const handleGRNPress = useCallback((group: GRNGroupData) => {
    if (!group?.grnId) {
      console.error('[GRNListFiori] Cannot navigate: grnId is undefined', group);
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
        setSnackbarMessage(`Print job submitted${result.print_job?.cups_job_id ? ` (Job #${result.print_job.cups_job_id})` : ''}`);
      } else {
        setSnackbarMessage(result.error || 'Failed to submit print job');
      }
      setSnackbarVisible(true);
    } catch (error) {
      setSnackbarMessage('An unexpected error occurred');
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
          console.warn('[GRNListFiori] Item missing gr_no (backend returning camelCase?):', item);
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

  // Render functions
  const renderItem = useCallback(({ item }: { item: FlattenedItem<GRNGroupData> }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{item.title}</Text>
          <View style={[styles.sectionBadge, { backgroundColor: colors.gray200 }]}>
            <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{item.count}</Text>
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
        colors={colors}
        globalExpanded={allExpanded}
        globalExpandedKey={expandKey}
      />
    );
  }, [handleGRNPress, handleViewDetails, handleEdit, handlePrint, canPrint, colors, allExpanded, expandKey]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerLoaderText, { color: colors.textSecondary }]}>Loading more...</Text>
      </View>
    );
  }, [loadingMore, colors]);

  // Loading state
  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>GRN</Text>
          <View style={styles.headerActions}>
            <IconButton icon="filter-variant" size={24} iconColor={colors.textSecondary} />
          </View>
        </View>
        <FlatList
          data={[1, 2, 3, 4, 5]}
          renderItem={() => <SkeletonCard colors={colors} />}
          keyExtractor={(item) => item.toString()}
          contentContainerStyle={styles.listContent}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>GRN</Text>
        <View style={styles.headerActions}>
          {canCreateGRN && (
            <IconButton
              icon="plus"
              size={22}
              iconColor={colors.textInverse}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreateGRN}
            />
          )}
          <View style={styles.filterBtnContainer}>
            <IconButton
              icon="filter-variant"
              size={22}
              iconColor={colors.textSecondary}
              onPress={() => {
                const logger = createLogger('GRNListFiori');
                logger.info(`[FILTER_BUTTON_CLICKED] Opening filter modal`);
                setShowFilterModal(true);
              }}
            />
            {activeFilterCount > 0 && (
              <Badge size={16} style={[styles.filterBadge, { backgroundColor: colors.statusNegative }]}>{activeFilterCount}</Badge>
            )}
          </View>
          <Pressable onPress={() => router.push('/settings')}>
            <Surface style={[styles.avatarSurface, { backgroundColor: colors.primary }]} elevation={1}>
              <Text style={[styles.avatarText, { color: colors.white }]}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </Surface>
          </Pressable>
        </View>
      </View>

      {/* Filter Chips */}
      <FilterChips
        filters={filters}
        activeFilterCount={activeFilterCount}
        updateFilter={updateFilter}
        clearAllFilters={clearAllFilters}
        colors={colors}
      />

      {/* Sort Selector Row */}
      <View style={[styles.sortRow, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
        <View style={styles.sortLabel}>
          <Icon name="sort" size={16} color={colors.textTertiary} />
          <Text style={[styles.sortLabelText, { color: colors.textTertiary }]}>Sort:</Text>
        </View>
        <View style={styles.sortOptions}>
          {SORT_OPTIONS.map((option) => (
            <Pressable
              key={option.field}
              style={[
                styles.sortOption,
                { backgroundColor: colors.gray100 },
                sortBy === option.field && { backgroundColor: colors.primaryLight },
              ]}
              onPress={() => {
                Vibration.vibrate(5);
                if (sortBy === option.field) {
                  setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy(option.field);
                  setSortOrder('desc');
                }
              }}
            >
              <Icon
                name={option.icon}
                size={14}
                color={sortBy === option.field ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.sortOptionText,
                  { color: colors.textSecondary },
                  sortBy === option.field && { color: colors.primary },
                ]}
              >
                {option.label}
              </Text>
              {sortBy === option.field && (
                <Icon
                  name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                  size={14}
                  color={colors.primary}
                />
              )}
            </Pressable>
          ))}
        </View>
        {/* Expand All / Collapse All Toggle */}
        <Pressable
          style={[styles.expandAllBtn, { backgroundColor: colors.gray100 }]}
          onPress={handleToggleAllExpanded}
        >
          <Icon
            name={allExpanded ? 'unfold-less-horizontal' : 'unfold-more-horizontal'}
            size={18}
            color={colors.textSecondary}
          />
          <Text style={[styles.expandAllText, { color: colors.textSecondary }]}>
            {allExpanded ? 'Collapse' : 'Expand'}
          </Text>
        </Pressable>
      </View>

      {/* Main Content */}
      {flattenedData.length > 0 ? (
        <FlashList
          data={flattenedData}
          renderItem={renderItem}
          keyExtractor={(item: FlattenedItem<GRNGroupData>) => item.key}
          getItemType={getItemType}
          ListFooterComponent={renderFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={DEFAULT_LIST_CONFIG.onEndReachedThreshold}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <EmptyState
          activeFilterCount={activeFilterCount}
          onCreateGRN={handleCreateGRN}
          canCreate={canCreateGRN}
          colors={colors}
        />
      )}

      {/* Filter Modal - Only render Portal when visible to prevent Android gesture handler issues */}
      {showFilterModal && (
        <Portal>
          <GenericFilterModal
            visible={showFilterModal}
            onClose={() => setShowFilterModal(false)}
            config={GRN_FILTER_CONFIG}
          />
        </Portal>
      )}

      {/* Print Dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => setShowPrintDialog(false)}
        onConfirm={handlePrintConfirm}
        title="Print GRN Range"
        defaultNumber={selectedGRNForPrint}
        label="GRN Number"
        placeholder="e.g., Z0797"
        onViewJobs={() => {
          setShowPrintDialog(false);
          printJobsBottomSheetRef.current?.open();
        }}
      />

      {/* Print Jobs Sheet */}
      <PrintJobsBottomSheet ref={printJobsBottomSheetRef} />

      {/* Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

export default GRNListFiori;
