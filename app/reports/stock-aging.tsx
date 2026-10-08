/**
 * Stock Aging Report Screen (C5)
 *
 * Displays stock age distribution with aging buckets and dispatch velocity info.
 * Items sorted by age (oldest first) with color-coded age indicators.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  RefreshControl,
  LayoutAnimation,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, KPIGrid, ReportEmptyState, ReportCustomerCard, ReportCustomerSearch, type KPIItem } from '@/components/reports';
import { getCustomerStockAging, getAllStockAging } from '@/services/reporting/stock-aging-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import type {
  StockAgingData,
  StockAgingItem,
  AgingBucketData,
  AllStockAgingData,
  CustomerAgingSummary,
} from '@/types/report.types';
import { formatNumber, formatWeight, formatDate } from '@/utils/formatters';

// ============================================================================
// SAP Fiori Design Tokens - Static values (dimensions, typography)
// Colors are now dynamic via useFioriColors hook
// ============================================================================
const FIORI_STATIC = {
  dimensions: {
    objectCellMinHeight: 72,
    objectCellImageSize: 44,
    objectCellImageRadius: 10,
    cardCornerRadius: 12,
    cardPadding: 16,
    sectionHeaderHeight: 32,
    touchTarget: 44,
  },
  typography: {
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    title: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
    subtitle: { fontSize: 14, lineHeight: 18 },
    footnote: { fontSize: 13, lineHeight: 16 },
    caption: { fontSize: 12, lineHeight: 16 },
  },
};

// Aging bucket color keys for dynamic color lookup
const AGING_BUCKET_KEYS = {
  '0-120': { colorKey: 'success', icon: 'check-circle' },
  '121-240': { colorKey: 'info', icon: 'clock-outline' }, // Teal
  '241-364': { colorKey: 'warning', icon: 'clock-alert-outline' }, // Amber/Yellow
  '364+': { colorKey: 'destructive', icon: 'alert-circle' },
} as const;

// Helper to get aging colors dynamically
const getAgingColors = (bucket: string, colors: ReturnType<typeof useFioriColors>['colors']) => {
  const key = AGING_BUCKET_KEYS[bucket as keyof typeof AGING_BUCKET_KEYS] || AGING_BUCKET_KEYS['0-120'];
  const colorKey = key.colorKey;

  // Map to dynamic colors
  const colorMap: Record<string, { bg: string; text: string }> = {
    success: { bg: colors.successLight, text: colors.success },
    info: { bg: colors.infoLight, text: colors.info },
    warning: { bg: colors.warningLight, text: colors.warning },
    destructive: { bg: colors.destructiveLight, text: colors.destructive },
  };

  return {
    ...colorMap[colorKey],
    icon: key.icon,
  };
};

// ============================================================================
// Components
// ============================================================================

const FioriSectionHeader: React.FC<{ title: string }> = ({ title }) => {
  const { colors } = useFioriColors();
  return (
    <View style={styles.fioriSectionHeader}>
      <Text style={[styles.fioriSectionHeaderText, { color: colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
};

// Aging Bucket Bar Component
interface AgingBucketBarProps {
  label: string;
  data: AgingBucketData | { item_count: number; total_quantity: number; percentage: number };
  maxPercentage: number;
}

const AgingBucketBar: React.FC<AgingBucketBarProps> = ({ label, data, maxPercentage }) => {
  const fiori = useFioriColors();
  const agingColors = getAgingColors(label, fiori.colors);
  const barWidth = maxPercentage > 0 ? (data.percentage / maxPercentage) * 100 : 0;

  return (
    <View style={styles.bucketRow}>
      <View style={styles.bucketLabelContainer}>
        <View style={[styles.bucketDot, { backgroundColor: agingColors.text }]} />
        <Text style={[styles.bucketLabel, { color: fiori.colors.textSecondary }]}>{label} days</Text>
      </View>
      <View style={[styles.bucketBarContainer, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <View style={[styles.bucketBar, { width: `${barWidth}%`, backgroundColor: agingColors.bg }]}>
          <View style={[styles.bucketBarFill, { backgroundColor: agingColors.text }]} />
        </View>
      </View>
      <Text style={[styles.bucketValue, { color: fiori.colors.textPrimary }]}>{data.percentage.toFixed(1)}%</Text>
      <Text style={[styles.bucketCount, { color: fiori.colors.textSecondary }]}>{formatNumber(data.total_quantity)}</Text>
    </View>
  );
};

// Aging Item Card Component
interface AgingItemCardProps {
  item: StockAgingItem;
  isExpanded: boolean;
  onToggle: () => void;
}

const AgingItemCard: React.FC<AgingItemCardProps> = ({ item, isExpanded, onToggle }) => {
  const fiori = useFioriColors();
  const agingColors = getAgingColors(item.aging_bucket, fiori.colors);

  return (
    <View style={[styles.fioriCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
      <Pressable
        style={({ pressed }) => [
          styles.fioriObjectCell,
          pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
        ]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.item_name}, ${item.aging_days} days old`}
      >
        {/* Age Indicator */}
        <View style={[styles.agingIndicator, { backgroundColor: agingColors.bg }]}>
          <Icon name={agingColors.icon} size={18} color={agingColors.text} />
        </View>

        {/* Content */}
        <View style={styles.fioriObjectCellContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.fioriObjectCellTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
              {item.item_name}
            </Text>
            <View style={[styles.agingBadge, { backgroundColor: agingColors.bg }]}>
              <Text style={[styles.agingBadgeText, { color: agingColors.text }]}>
                {item.aging_days}d
              </Text>
            </View>
          </View>
          <Text style={[styles.fioriObjectCellSubtitle, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
            {item.gr_no} {item.rack ? `• ${item.rack}` : ''}
          </Text>
        </View>

        {/* Stock Quantity */}
        <View style={styles.stockInfo}>
          <Text style={[styles.stockValue, { color: fiori.colors.textPrimary }]}>{formatNumber(item.current_stock)}</Text>
          <Text style={[styles.stockLabel, { color: fiori.colors.textSecondary }]}>units</Text>
        </View>

        {/* Expand Icon */}
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={fiori.colors.textSecondary}
        />
      </Pressable>

      {/* Expanded Details */}
      {isExpanded && (
        <View style={[styles.expandedContent, { backgroundColor: fiori.colors.backgroundGrouped, borderTopColor: fiori.colors.divider }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>GRN Date</Text>
            <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>{formatDate(item.grn_date, 'short')}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Original Qty</Text>
            <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>{formatNumber(item.original_qty)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Package Mark</Text>
            <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>{item.package_mark || '-'}</Text>
          </View>
          {item.dispatch_info && (
            <>
              <View style={[styles.detailDivider, { backgroundColor: fiori.colors.divider }]} />
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Dispatched</Text>
                <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>
                  {formatNumber(item.dispatch_info.total_dispatched)} ({item.dispatch_info.dispatch_count} times)
                </Text>
              </View>
              {item.dispatch_info.last_dispatch_date && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Last Dispatch</Text>
                  <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>
                    {item.dispatch_info.days_since_last_dispatch} days ago
                  </Text>
                </View>
              )}
              {item.dispatch_info.avg_days_between_dispatches && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Avg Dispatch Interval</Text>
                  <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>
                    {item.dispatch_info.avg_days_between_dispatches.toFixed(0)} days
                  </Text>
                </View>
              )}
            </>
          )}
          <TouchableOpacity
            style={[styles.viewGrnButton, { backgroundColor: fiori.colors.tintLight }]}
            onPress={() => router.push(`/grn-details/${item.grn_id}`)}
          >
            <Text style={[styles.viewGrnButtonText, { color: fiori.colors.tint }]}>View GRN Details</Text>
            <Icon name="chevron-right" size={16} color={fiori.colors.tint} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// CustomerCard moved to @/components/reports/ReportCustomerCard (J14 fix)
// Helper to get aging avatar colors for customer cards
const getAgingAvatarColors = (averageAgeDays: number, colors: ReturnType<typeof useFioriColors>['colors']) => {
  const bucket =
    averageAgeDays <= 120 ? '0-120' :
    averageAgeDays <= 240 ? '121-240' :
    averageAgeDays <= 364 ? '241-364' : '364+';
  const agingColors = getAgingColors(bucket, colors);
  return { bg: agingColors.bg, icon: agingColors.text };
};

// ============================================================================
// Item Grouping
// ============================================================================

interface GroupedItem {
  item_name: string;
  total_stock: number;
  oldest_days: number;
  aging_bucket: string;
  entries: StockAgingItem[];
}

function groupItemsByName(items: StockAgingItem[]): GroupedItem[] {
  const groups = new Map<string, StockAgingItem[]>();

  items.forEach((item) => {
    const existing = groups.get(item.item_name) || [];
    existing.push(item);
    groups.set(item.item_name, existing);
  });

  return Array.from(groups.entries())
    .map(([item_name, entries]) => {
      const total_stock = entries.reduce((sum, e) => sum + e.current_stock, 0);
      const oldest_days = Math.max(...entries.map((e) => e.aging_days));
      const oldestEntry = entries.find((e) => e.aging_days === oldest_days);
      return {
        item_name,
        total_stock,
        oldest_days,
        aging_bucket: oldestEntry?.aging_bucket || '0-120',
        entries: entries.sort((a, b) => b.aging_days - a.aging_days), // oldest first within group
      };
    })
    .sort((a, b) => b.total_stock - a.total_stock); // highest stock first
}

// Item Group Card Component (accordion for grouped items)
interface ItemGroupCardProps {
  group: GroupedItem;
  expandedEntries: Set<string>;
  isGroupExpanded: boolean;
  onToggleGroup: () => void;
  onToggleEntry: (grnId: string) => void;
}

const ItemGroupCard: React.FC<ItemGroupCardProps> = ({
  group,
  expandedEntries,
  isGroupExpanded,
  onToggleGroup,
  onToggleEntry,
}) => {
  const fiori = useFioriColors();

  return (
    <View style={[styles.fioriCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
      {/* Group Header */}
      <Pressable
        style={({ pressed }) => [
          styles.groupHeader,
          { backgroundColor: fiori.colors.cardBackground },
          pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
        ]}
        onPress={onToggleGroup}
        accessibilityRole="button"
        accessibilityLabel={`${group.item_name}, ${group.entries.length} entries, ${group.total_stock} units`}
      >
        <View style={[styles.groupIconContainer, { backgroundColor: fiori.colors.backgroundGrouped }]}>
          <Icon name="package-variant" size={18} color={fiori.colors.textSecondary} />
        </View>
        <View style={styles.fioriObjectCellContent}>
          <Text style={[styles.fioriObjectCellTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
            {group.item_name}
          </Text>
          <Text style={[styles.fioriObjectCellSubtitle, { color: fiori.colors.textSecondary }]}>
            {group.entries.length} entr{group.entries.length === 1 ? 'y' : 'ies'}
          </Text>
        </View>
        <View style={styles.stockInfo}>
          <Text style={[styles.stockValue, { color: fiori.colors.textPrimary }]}>{formatNumber(group.total_stock)}</Text>
          <Text style={[styles.stockLabel, { color: fiori.colors.textSecondary }]}>units</Text>
        </View>
        <Icon
          name={isGroupExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={fiori.colors.textSecondary}
        />
      </Pressable>

      {/* Expanded Entries */}
      {isGroupExpanded && (
        <View style={[styles.groupEntries, { backgroundColor: fiori.colors.backgroundGrouped, borderTopColor: fiori.colors.divider }]}>
          {group.entries.map((item, index) => (
            <StockEntryRow
              key={`${item.grn_id}-${index}`}
              item={item}
              isExpanded={expandedEntries.has(item.grn_id)}
              onToggle={() => onToggleEntry(item.grn_id)}
              isLast={index === group.entries.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// Stock Entry Row (nested within group)
interface StockEntryRowProps {
  item: StockAgingItem;
  isExpanded: boolean;
  onToggle: () => void;
  isLast?: boolean;
}

const StockEntryRow: React.FC<StockEntryRowProps> = ({ item, isExpanded, onToggle, isLast = false }) => {
  const fiori = useFioriColors();
  const agingColors = getAgingColors(item.aging_bucket, fiori.colors);

  return (
    <View style={[
      styles.entryContainer,
      { backgroundColor: fiori.colors.backgroundGrouped },
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: fiori.colors.divider },
    ]}>
      <Pressable
        style={({ pressed }) => [
          styles.entryRow,
          pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
        ]}
        onPress={onToggle}
      >
        <View style={[styles.entryAgeDot, { backgroundColor: agingColors.text }]} />
        <View style={styles.entryContent}>
          <Text style={[styles.entryTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
            {item.gr_no} {item.rack ? `• ${item.rack}` : ''}
          </Text>
          <Text style={[styles.entrySubtitle, { color: fiori.colors.textSecondary }]}>
            {formatDate(item.grn_date, 'short')} • {item.aging_days}d in storage
          </Text>
        </View>
        <View style={styles.entryStock}>
          <Text style={[styles.entryStockValue, { color: fiori.colors.textPrimary }]}>{formatNumber(item.current_stock)}</Text>
        </View>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={fiori.colors.textSecondary}
        />
      </Pressable>

      {/* Expanded Details */}
      {isExpanded && (
        <View style={[styles.entryExpandedContent, { backgroundColor: fiori.colors.cardBackground, borderLeftColor: fiori.colors.divider }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Original Qty</Text>
            <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>{formatNumber(item.original_qty)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Package Mark</Text>
            <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>{item.package_mark || '-'}</Text>
          </View>
          {item.dispatch_info && (
            <>
              <View style={[styles.detailDivider, { backgroundColor: fiori.colors.divider }]} />
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Dispatched</Text>
                <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>
                  {formatNumber(item.dispatch_info.total_dispatched)} ({item.dispatch_info.dispatch_count} times)
                </Text>
              </View>
              {item.dispatch_info.last_dispatch_date && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: fiori.colors.textSecondary }]}>Last Dispatch</Text>
                  <Text style={[styles.detailValue, { color: fiori.colors.textPrimary }]}>
                    {item.dispatch_info.days_since_last_dispatch} days ago
                  </Text>
                </View>
              )}
            </>
          )}
          <TouchableOpacity
            style={[styles.viewGrnButton, { backgroundColor: fiori.colors.tintLight }]}
            onPress={() => router.push(`/grn-details/${item.grn_id}`)}
          >
            <Text style={[styles.viewGrnButtonText, { color: fiori.colors.tint }]}>View GRN Details</Text>
            <Icon name="chevron-right" size={16} color={fiori.colors.tint} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// Main Screen
// ============================================================================

export default function StockAgingScreen() {
  const fiori = useFioriColors();

  // Role-based access (J12 fix)
  const {
    isStaff,
    singleAssignedCustomerId,
    shouldShowListView,
  } = useRoleBasedAccess();

  // Route params for direct navigation from customer activity
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();
  const routeCustomerId = params.customerId;
  const routeCustomerName = params.customerName;

  // Track if we came from route params (for back button behavior)
  const cameFromRouteParams = React.useRef(!!routeCustomerId);

  const [data, setData] = useState<StockAgingData | null>(null);
  const [allCustomersData, setAllCustomersData] = useState<AllStockAgingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAgingSummary | null>(null);

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Fetch all customers data
  const fetchAllCustomersData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await getAllStockAging();
      if (response.success && response.data) {
        // Backend now filters by user permissions via auth.uid()
        setAllCustomersData(response.data);
      } else {
        setError(response.error || 'Failed to load stock aging data');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch single customer data
  const fetchSingleCustomerData = useCallback(async (customerId: string, showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await getCustomerStockAging({ customerId });
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to load stock aging data');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    // If we have route params, go directly to that customer (from Quick Access)
    if (routeCustomerId) {
      setViewMode('single');
      setSelectedCustomer({
        customer_id: routeCustomerId,
        customer_name: routeCustomerName || '',
        total_stock: 0,
        average_age_days: 0,
        oldest_stock_days: 0,
        items_over_365_days: 0,
        aging_distribution: {},
      });
      fetchSingleCustomerData(routeCustomerId);
    } else if (shouldShowListView) {
      fetchAllCustomersData();
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId);
    } else {
      setError('No customer assigned to your account');
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (shouldShowListView && viewMode === 'all') {
      fetchAllCustomersData(true);
    } else if (selectedCustomer) {
      fetchSingleCustomerData(selectedCustomer.customer_id, true);
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId, true);
    }
  }, [shouldShowListView, viewMode, selectedCustomer, singleAssignedCustomerId, fetchAllCustomersData, fetchSingleCustomerData]);

  // Filtered customers based on search query
  const filteredCustomers = useMemo(() => {
    if (!allCustomersData?.by_customer) return [];
    if (!customerSearchQuery.trim()) return allCustomersData.by_customer;
    const q = customerSearchQuery.toLowerCase();
    return allCustomersData.by_customer.filter((c) =>
      c.customer_name.toLowerCase().includes(q),
    );
  }, [allCustomersData?.by_customer, customerSearchQuery]);

  // Handle search autocomplete selection
  const handleSearchSelect = useCallback(
    (customer: { id: string; name: string }) => {
      setSelectedCustomer({
        customer_id: customer.id,
        customer_name: customer.name,
        total_stock: 0,
        average_age_days: 0,
        oldest_stock_days: 0,
        items_over_365_days: 0,
        aging_distribution: {},
      } as CustomerAgingSummary);
      setViewMode('single');
      setData(null);
      setExpandedItems(new Set());
      setCustomerSearchQuery('');
      fetchSingleCustomerData(customer.id);
    },
    [fetchSingleCustomerData],
  );

  const handleCustomerSelect = useCallback((customer: CustomerAgingSummary) => {
    setSelectedCustomer(customer);
    setViewMode('single');
    setData(null);
    setExpandedItems(new Set());
    fetchSingleCustomerData(customer.customer_id);
  }, [fetchSingleCustomerData]);

  const handleBackToAll = useCallback(() => {
    // If we came from route params (Quick Access), go back to previous screen
    if (cameFromRouteParams.current) {
      router.back();
      return;
    }
    // Otherwise, go back to all-customers list view
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode('all');
    setSelectedCustomer(null);
    setData(null);
    setExpandedItems(new Set());
    setExpandedGroups(new Set());
  }, []);

  const toggleItem = useCallback((itemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupName: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  // Group items by item name for single customer view
  const groupedItems = useMemo(() => {
    if (!data?.items) return [];
    return groupItemsByName(data.items);
  }, [data?.items]);

  // KPIs for all customers
  const allCustomersKpis: KPIItem[] = useMemo(() => {
    if (!allCustomersData?.summary) return [];
    const s = allCustomersData.summary;
    return [
      { icon: 'cube-outline', value: s.total_items, label: 'Items', variant: 'primary' },
      { icon: 'calendar-clock', value: s.average_age_days, label: 'Avg Age', unit: 'days', variant: 'secondary' },
      { icon: 'alert-circle-outline', value: s.items_over_365_days, label: 'Over 1yr', variant: 'warning' },
    ];
  }, [allCustomersData?.summary]);

  // KPIs for single customer
  const singleCustomerKpis: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { icon: 'cube-outline', value: s.total_items, label: 'Items', variant: 'primary' },
      { icon: 'calendar-clock', value: s.average_age_days, label: 'Avg Age', unit: 'days', variant: 'secondary' },
      { icon: 'alert-circle-outline', value: s.items_over_365_days, label: 'Over 1yr', variant: 'warning' },
    ];
  }, [data?.summary]);

  // Get max percentage for bar scaling
  const maxBucketPercentage = useMemo(() => {
    const buckets = shouldShowListView && viewMode === 'all' ? allCustomersData?.by_bucket : data?.by_bucket;
    if (!buckets) return 100;
    return Math.max(...Object.values(buckets).map((b) => b.percentage), 1);
  }, [shouldShowListView, viewMode, allCustomersData?.by_bucket, data?.by_bucket]);

  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Stock Aging" />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'cube-outline', value: '-', label: 'Items', variant: 'primary' },
              { icon: 'calendar-clock', value: '-', label: 'Avg Age', variant: 'secondary' },
            ]}
            isLoading={true}
            compact
          />
        </View>
      </View>
    );
  }

  // Error
  if (error && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Stock Aging" />
        <ReportEmptyState icon="alert-circle-outline" message="Failed to load data" description={error} />
      </View>
    );
  }

  // All Customers View
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.by_customer.length > 0;
    const bucketOrder = ['0-120', '121-240', '241-364', '364+'];

    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Stock Aging" subtitle={isStaff ? 'All Customers' : 'My Customers'} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[fiori.colors.tint]} />
          }
        >
          <KPIGrid items={allCustomersKpis} isLoading={isLoading} compact />

          {/* Aging Distribution */}
          {Object.keys(allCustomersData.by_bucket).length > 0 && (
            <View style={styles.section}>
              <FioriSectionHeader title="Aging Distribution" />
              <View style={[styles.bucketsCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
                {bucketOrder.map((key) => {
                  const bucket = allCustomersData.by_bucket[key];
                  if (!bucket) return null;
                  return (
                    <AgingBucketBar key={key} label={key} data={bucket} maxPercentage={maxBucketPercentage} />
                  );
                })}
              </View>
            </View>
          )}

          {/* Customer Search */}
          <View style={styles.section}>
            <ReportCustomerSearch
              searchQuery={customerSearchQuery}
              onSearchChange={setCustomerSearchQuery}
              onCustomerSelect={handleSearchSelect}
              visibleCustomerIds={allCustomersData.by_customer.map((c) => c.customer_id)}
            />
          </View>

          {/* Customers List */}
          {filteredCustomers.length > 0 ? (
            <View style={styles.section}>
              <FioriSectionHeader title="Customers by Aging" />
              <View style={[styles.customersCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <ReportCustomerCard
                      title={customer.customer_name}
                      subtitle={`Avg: ${customer.average_age_days} days • ${customer.items_over_365_days} items over 1yr`}
                      value={customer.total_stock}
                      valueLabel="units"
                      onPress={() => handleCustomerSelect(customer)}
                      avatarColor={getAgingAvatarColors(customer.average_age_days, fiori.colors)}
                      accessibilityHint="Tap to view customer stock aging"
                    />
                    {index < filteredCustomers.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: fiori.colors.divider }]} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : (
            <ReportEmptyState icon="package-variant-closed" message="No Stock Found" description="No inventory in storage." />
          )}
        </ScrollView>
      </View>
    );
  }

  // Single Customer View
  if (!data?.items || data.items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader
          title="Stock Aging"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
        />
        <ReportEmptyState icon="package-variant-closed" message="No Stock Found" description="No inventory for this customer." />
      </View>
    );
  }

  const bucketOrder = ['0-120', '121-240', '241-364', '364+'];

  return (
    <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
      <ReportHeader
        title="Stock Aging"
        subtitle={selectedCustomer?.customer_name}
        onBack={shouldShowListView ? handleBackToAll : undefined}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[fiori.colors.tint]} />
        }
      >
        {/* Aging Distribution */}
        {Object.keys(data.by_bucket).length > 0 && (
          <View style={styles.section}>
            <FioriSectionHeader title="Aging Distribution" />
            <View style={[styles.bucketsCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
              {bucketOrder.map((key) => {
                const bucket = data.by_bucket[key];
                if (!bucket) return null;
                return <AgingBucketBar key={key} label={key} data={bucket} maxPercentage={maxBucketPercentage} />;
              })}
            </View>
          </View>
        )}

        {/* Items List - Grouped by Item Name (sorted by highest stock) */}
        <View style={styles.section}>
          <FioriSectionHeader title="Items by Stock (Highest First)" />
          <View style={styles.itemsList}>
            {groupedItems.map((group) => (
              <ItemGroupCard
                key={group.item_name}
                group={group}
                expandedEntries={expandedItems}
                isGroupExpanded={expandedGroups.has(group.item_name)}
                onToggleGroup={() => toggleGroup(group.item_name)}
                onToggleEntry={toggleItem}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles - Colors are applied dynamically via useFioriColors hook
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  section: { marginTop: 16, paddingHorizontal: FIORI_STATIC.dimensions.cardPadding },

  fioriSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: FIORI_STATIC.dimensions.sectionHeaderHeight,
  },
  fioriSectionHeaderText: {
    fontSize: FIORI_STATIC.typography.sectionHeader.fontSize,
    fontWeight: FIORI_STATIC.typography.sectionHeader.fontWeight,
    letterSpacing: FIORI_STATIC.typography.sectionHeader.letterSpacing,
    textTransform: FIORI_STATIC.typography.sectionHeader.textTransform,
  },

  // Buckets Card
  bucketsCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    padding: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
    ...theme.shadows.sm,
  },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bucketLabelContainer: { flexDirection: 'row', alignItems: 'center', width: 80, gap: 6 },
  bucketDot: { width: 8, height: 8, borderRadius: 4 },
  bucketLabel: { fontSize: 12 },
  bucketBarContainer: { flex: 1, height: 20, borderRadius: 4, overflow: 'hidden' },
  bucketBar: { height: '100%', borderRadius: 4, justifyContent: 'center' },
  bucketBarFill: { width: 3, height: '60%', borderRadius: 2, marginLeft: 4 },
  bucketValue: { width: 45, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  bucketCount: { width: 50, textAlign: 'right', fontSize: 11 },

  // Customers Card
  customersCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  customerAvatar: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerContent: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '600' },
  customerSubtitle: { fontSize: 13, marginTop: 2 },
  customerStock: { alignItems: 'flex-end' },
  customerStockValue: { fontSize: 15, fontWeight: '600' },
  customerStockLabel: { fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },

  // Items List
  itemsList: { gap: 10 },
  fioriCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fioriObjectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  agingIndicator: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriObjectCellContent: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fioriObjectCellTitle: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  agingBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  agingBadgeText: { fontSize: 11, fontWeight: '600' },
  fioriObjectCellSubtitle: { fontSize: 13, marginTop: 2 },
  stockInfo: { alignItems: 'flex-end' },
  stockValue: { fontSize: 15, fontWeight: '600' },
  stockLabel: { fontSize: 11 },

  // Expanded Content
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: FIORI_STATIC.dimensions.cardPadding,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: '500' },
  detailDivider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  viewGrnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  viewGrnButtonText: { fontSize: 14, fontWeight: '600' },

  // Group Header (same as fioriObjectCell but with different background intent)
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  groupIconContainer: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Group Entries Container
  groupEntries: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Stock Entry Row (nested within group)
  entryContainer: {},
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 10,
  },
  entryAgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  entryContent: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  entrySubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  entryStock: {
    alignItems: 'flex-end',
  },
  entryStockValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  entryExpandedContent: {
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 12,
    marginLeft: 18, // Align with content after dot
    borderLeftWidth: 2,
  },
});
