/**
 * Stock Aging Report Screen (C5)
 *
 * Displays stock age distribution with aging buckets and dispatch velocity info.
 * Items are grouped by name; each age bucket carries a status colour, its icon
 * and its label (docs/STYLE_GUIDE.md §3.5): 0–120 days positive, 121–240
 * informative, 241–364 critical and over 364 negative.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  LayoutAnimation,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, KPIGrid, ReportEmptyState, ReportCustomerCard, ReportCustomerSearch, type KPIItem } from '@/components/reports';
import { Button } from '@/components/ui/Button';
import { getCustomerStockAging, getAllStockAging } from '@/services/reporting/stock-aging-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import type {
  StockAgingData,
  StockAgingItem,
  AgingBucketData,
  AllStockAgingData,
  CustomerAgingSummary,
} from '@/types/report.types';
import { formatNumber, parseLocalISODate } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';

const logger = createLogger('StockAging');

const LOAD_ERROR = "Couldn't load stock aging. Check your connection and try again.";
const NO_CUSTOMER = 'No customer is linked to your account. Ask your facility to link one.';

// ============================================================================
// Age buckets (status per guide §3.5)
// ============================================================================

type StatusKind = 'positive' | 'informative' | 'critical' | 'negative';

const BUCKET_ORDER = ['0-120', '121-240', '241-364', '364+'];

const AGING_BUCKETS: Record<string, { kind: StatusKind; icon: string; label: string }> = {
  '0-120': { kind: 'positive', icon: 'check-circle', label: '0–120 days' },
  '121-240': { kind: 'informative', icon: 'information', label: '121–240 days' },
  '241-364': { kind: 'critical', icon: 'alert', label: '241–364 days' },
  '364+': { kind: 'negative', icon: 'alert-circle', label: 'Over 364 days' },
};

const bucketInfo = (bucket: string) => AGING_BUCKETS[bucket] || AGING_BUCKETS['0-120'];

const bucketForAge = (days: number): string =>
  days <= 120 ? '0-120' : days <= 240 ? '121-240' : days <= 364 ? '241-364' : '364+';

/** "9 Oct 2026" (guide §12.3) */
function formatDay(value: string | null | undefined): string {
  if (!value) return '–';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalISODate(value) : new Date(value);
  if (isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function days(n: number): string {
  return `${formatNumber(n)} ${n === 1 ? 'day' : 'days'}`;
}

// ============================================================================
// Styles
// ============================================================================

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background.base },
    loadingContainer: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: space.xxxl },

    section: { marginTop: space.lg, paddingHorizontal: layout.marginCompact },
    sectionHeader: {
      paddingTop: space.sm,
      paddingBottom: space.xs,
      minHeight: 32,
      justifyContent: 'center',
    },
    sectionHeaderText: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: t.text.secondary,
    },

    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      ...t.shadow[2],
    },
    cardClip: { borderRadius: radius.card, overflow: 'hidden' },
    bucketsCard: { padding: space.lg, gap: space.md },

    // Bucket bar
    bucketRow: { gap: space.xs },
    bucketTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    bucketLabel: { ...typography.subhead, color: t.text.primary, flex: 1 },
    bucketValue: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums'] },
    bucketCount: {
      ...typography.footnote,
      color: t.text.secondary,
      fontVariant: ['tabular-nums'],
      minWidth: 56,
      textAlign: 'right',
    },
    bucketTrack: {
      height: space.sm,
      borderRadius: radius.pill,
      overflow: 'hidden',
      backgroundColor: t.brand.subtleStrong,
    },
    bucketFill: { height: '100%', borderRadius: radius.pill },

    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.marginCompact + layout.avatar.md + space.md,
      backgroundColor: t.border.divider,
    },

    // Item groups
    itemsList: { gap: space.sm },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    rowPressed: { backgroundColor: t.surface.cardPressed },
    groupIconContainer: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.button,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.brand.subtle,
    },
    cellContent: { flex: 1, gap: space.xxs },
    cellTitle: { ...typography.headline, color: t.text.primary },
    cellSubtitle: { ...typography.subhead, color: t.text.secondary },
    stockInfo: { alignItems: 'flex-end' },
    stockValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums'] },
    stockLabel: { ...typography.caption1, color: t.text.secondary },
    groupEntries: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.divider,
      backgroundColor: t.background.base,
    },

    // Entry rows
    entryDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.rowMinHeight + space.md,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    entryContent: { flex: 1, gap: space.xxs },
    entryTitle: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
    entrySubtitle: { ...typography.footnote, color: t.text.secondary },
    entryStockValue: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums'] },
    entryExpanded: {
      paddingHorizontal: space.lg,
      paddingBottom: space.md,
      gap: space.xxs,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: space.md,
      paddingVertical: space.s6,
    },
    detailLabel: { ...typography.subhead, color: t.text.secondary },
    detailValue: { ...typography.subhead, color: t.text.primary, textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] },
    detailDivider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm, backgroundColor: t.border.divider },
    viewGrnButton: { marginTop: space.md },

    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: space.xxs,
      paddingHorizontal: space.s6,
      paddingVertical: space.xxs,
      borderRadius: radius.field,
    },
    tagText: { ...typography.caption1, fontWeight: fontWeight.semibold },
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// Components
// ============================================================================

const SectionHeader: React.FC<{ title: string; styles: Styles }> = ({ title, styles }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText} accessibilityRole="header">
      {title}
    </Text>
  </View>
);

/** Status tag showing the age of a stock entry in its bucket's colour, icon and words. */
const AgeTag: React.FC<{ bucket: string; ageDays: number; styles: Styles; t: ThemeTokens }> = ({
  bucket,
  ageDays,
  styles,
  t,
}) => {
  const info = bucketInfo(bucket);
  const tone = t.status[info.kind];
  return (
    <View style={[styles.tag, { backgroundColor: tone.background }]}>
      <Icon name={info.icon} size={iconSize.sm} color={tone.text} />
      <Text style={[styles.tagText, { color: tone.text }]} maxFontSizeMultiplier={1.6}>
        {`${days(ageDays)} old`}
      </Text>
    </View>
  );
};

// Aging Bucket Bar Component
interface AgingBucketBarProps {
  bucket: string;
  data: AgingBucketData | { item_count: number; total_quantity: number; percentage: number };
  maxPercentage: number;
  styles: Styles;
  t: ThemeTokens;
}

const AgingBucketBar: React.FC<AgingBucketBarProps> = ({ bucket, data, maxPercentage, styles, t }) => {
  const info = bucketInfo(bucket);
  const tone = t.status[info.kind];
  const barWidth = maxPercentage > 0 ? (data.percentage / maxPercentage) * 100 : 0;

  return (
    <View
      style={styles.bucketRow}
      accessible
      accessibilityLabel={`${info.label}: ${data.percentage.toFixed(1)}%, ${formatNumber(data.total_quantity)} units`}
    >
      <View style={styles.bucketTop}>
        <Icon name={info.icon} size={iconSize.sm} color={tone.text} />
        <Text style={styles.bucketLabel}>{info.label}</Text>
        <Text style={styles.bucketValue}>{`${data.percentage.toFixed(1)}%`}</Text>
        <Text style={styles.bucketCount}>{formatNumber(data.total_quantity)}</Text>
      </View>
      <View style={styles.bucketTrack}>
        <View style={[styles.bucketFill, { width: `${barWidth}%`, backgroundColor: tone.element }]} />
      </View>
    </View>
  );
};

/** Avatar colours for a customer row: the status of the customer's average stock age. */
const getAgingAvatarColors = (averageAgeDays: number, t: ThemeTokens) => {
  const tone = t.status[bucketInfo(bucketForAge(averageAgeDays)).kind];
  return { bg: tone.background, icon: tone.text };
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
  styles: Styles;
  t: ThemeTokens;
}

const ItemGroupCard: React.FC<ItemGroupCardProps> = ({
  group,
  expandedEntries,
  isGroupExpanded,
  onToggleGroup,
  onToggleEntry,
  styles,
  t,
}) => {
  const entryCount = `${group.entries.length} ${group.entries.length === 1 ? 'GRN' : 'GRNs'}`;
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        {/* Group Header */}
        <Pressable
          style={({ pressed }) => [styles.groupHeader, pressed && styles.rowPressed]}
          onPress={onToggleGroup}
          accessibilityRole="button"
          accessibilityLabel={`${group.item_name}, ${entryCount}, ${formatNumber(group.total_stock)} units, oldest ${days(group.oldest_days)}`}
          accessibilityState={{ expanded: isGroupExpanded }}
        >
          <View style={styles.groupIconContainer}>
            <Icon name="cube-outline" size={iconSize.lg} color={t.brand.tint} />
          </View>
          <View style={styles.cellContent}>
            <Text style={styles.cellTitle} numberOfLines={2}>
              {group.item_name}
            </Text>
            <Text style={styles.cellSubtitle}>{entryCount}</Text>
            <AgeTag bucket={group.aging_bucket} ageDays={group.oldest_days} styles={styles} t={t} />
          </View>
          <View style={styles.stockInfo}>
            <Text style={styles.stockValue}>{formatNumber(group.total_stock)}</Text>
            <Text style={styles.stockLabel}>units</Text>
          </View>
          <Icon name={isGroupExpanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>

        {/* Expanded Entries */}
        {isGroupExpanded && (
          <View style={styles.groupEntries}>
            {group.entries.map((item, index) => (
              <StockEntryRow
                key={`${item.grn_id}-${index}`}
                item={item}
                isExpanded={expandedEntries.has(item.grn_id)}
                onToggle={() => onToggleEntry(item.grn_id)}
                isLast={index === group.entries.length - 1}
                styles={styles}
                t={t}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

// Stock Entry Row (nested within group)
interface StockEntryRowProps {
  item: StockAgingItem;
  isExpanded: boolean;
  onToggle: () => void;
  isLast?: boolean;
  styles: Styles;
  t: ThemeTokens;
}

const DetailRow: React.FC<{ label: string; value: string; styles: Styles }> = ({ label, value, styles }) => (
  <View style={styles.detailRow} accessible accessibilityLabel={`${label}: ${value}`}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const StockEntryRow: React.FC<StockEntryRowProps> = ({ item, isExpanded, onToggle, isLast = false, styles, t }) => {
  const title = [`GRN ${item.gr_no}`, item.rack ? `Rack ${item.rack}` : null].filter(Boolean).join(' · ');
  const dispatch = item.dispatch_info;

  return (
    <View style={!isLast && styles.entryDivider}>
      <Pressable
        style={({ pressed }) => [styles.entryRow, pressed && styles.rowPressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${title}, received ${formatDay(item.grn_date)}, ${days(item.aging_days)} in storage, ${formatNumber(item.current_stock)} units`}
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={styles.entryContent}>
          <Text style={styles.entryTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.entrySubtitle}>{`Received ${formatDay(item.grn_date)}`}</Text>
          <AgeTag bucket={item.aging_bucket} ageDays={item.aging_days} styles={styles} t={t} />
        </View>
        <Text style={styles.entryStockValue}>{formatNumber(item.current_stock)}</Text>
        <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
      </Pressable>

      {/* Expanded Details */}
      {isExpanded && (
        <View style={styles.entryExpanded}>
          <DetailRow label="Received quantity" value={formatNumber(item.original_qty)} styles={styles} />
          <DetailRow label="Package mark" value={item.package_mark || '–'} styles={styles} />
          {dispatch && (
            <>
              <View style={styles.detailDivider} />
              <DetailRow
                label="Dispatched"
                value={`${formatNumber(dispatch.total_dispatched)} in ${dispatch.dispatch_count} ${dispatch.dispatch_count === 1 ? 'dispatch' : 'dispatches'}`}
                styles={styles}
              />
              {dispatch.last_dispatch_date && (
                <DetailRow label="Last dispatch" value={formatDay(dispatch.last_dispatch_date)} styles={styles} />
              )}
              {dispatch.avg_days_between_dispatches ? (
                <DetailRow
                  label="Average time between dispatches"
                  value={days(Math.round(dispatch.avg_days_between_dispatches))}
                  styles={styles}
                />
              ) : null}
            </>
          )}
          <View style={styles.viewGrnButton}>
            <Button type="secondary" size="fullWidth" onPress={() => router.push(`/grn-details/${item.grn_id}`)}>
              {`View GRN ${item.gr_no}`}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// Main Screen
// ============================================================================

export default function StockAgingScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

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
        logger.warn('All-customer load failed', { error: response.error });
        setError(LOAD_ERROR);
      }
    } catch (err) {
      logger.error('All-customer load exception', err);
      setError(LOAD_ERROR);
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
        logger.warn('Customer load failed', { error: response.error });
        setError(LOAD_ERROR);
      }
    } catch (err) {
      logger.error('Customer load exception', err);
      setError(LOAD_ERROR);
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
      setError(NO_CUSTOMER);
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
      { icon: 'calendar-clock', value: s.average_age_days, label: 'Average age', unit: 'days', variant: 'neutral' },
      { icon: 'alert', value: s.items_over_365_days, label: 'Over 1 year', variant: 'warning' },
    ];
  }, [allCustomersData?.summary]);

  // KPIs for single customer
  const singleCustomerKpis: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { icon: 'cube-outline', value: s.total_items, label: 'Items', variant: 'primary' },
      { icon: 'calendar-clock', value: s.average_age_days, label: 'Average age', unit: 'days', variant: 'neutral' },
      { icon: 'alert', value: s.items_over_365_days, label: 'Over 1 year', variant: 'warning' },
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

  const retry = () => {
    if (routeCustomerId) fetchSingleCustomerData(routeCustomerId);
    else if (shouldShowListView && viewMode === 'all') fetchAllCustomersData();
    else if (selectedCustomer) fetchSingleCustomerData(selectedCustomer.customer_id);
    else if (singleAssignedCustomerId) fetchSingleCustomerData(singleAssignedCustomerId);
  };

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[t.brand.tint]}
      tintColor={t.brand.tint}
    />
  );

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Stock aging" />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'cube-outline', value: '-', label: 'Items', variant: 'primary' },
              { icon: 'calendar-clock', value: '-', label: 'Average age', variant: 'neutral' },
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
      <View style={styles.container}>
        <ReportHeader title="Stock aging" />
        {error === NO_CUSTOMER ? (
          <ReportEmptyState icon="account-off-outline" message="No customer linked" description={error} />
        ) : (
          <ReportEmptyState
            icon="alert-circle-outline"
            tone="error"
            message="Something went wrong"
            description={error}
            actionLabel="Try again"
            onAction={retry}
          />
        )}
      </View>
    );
  }

  // All Customers View
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.by_customer.length > 0;
    const bucketOrder = BUCKET_ORDER;

    return (
      <View style={styles.container}>
        <ReportHeader title="Stock aging" subtitle={isStaff ? 'All customers' : 'My customers'} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <KPIGrid items={allCustomersKpis} isLoading={isLoading} compact />

          {/* Aging Distribution */}
          {Object.keys(allCustomersData.by_bucket).length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Stock age" styles={styles} />
              <View style={[styles.card, styles.bucketsCard]}>
                {bucketOrder.map((key) => {
                  const bucket = allCustomersData.by_bucket[key];
                  if (!bucket) return null;
                  return (
                    <AgingBucketBar key={key} bucket={key} data={bucket} maxPercentage={maxBucketPercentage} styles={styles} t={t} />
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
              <SectionHeader title="Customers by stock age" styles={styles} />
              <View style={styles.card}>
                <View style={styles.cardClip}>
                  {filteredCustomers.map((customer, index) => (
                    <React.Fragment key={customer.customer_id}>
                      <ReportCustomerCard
                        title={customer.customer_name}
                        subtitle={`Average age ${days(customer.average_age_days)} · ${customer.items_over_365_days} over 1 year`}
                        value={customer.total_stock}
                        valueLabel="units"
                        onPress={() => handleCustomerSelect(customer)}
                        avatarColor={getAgingAvatarColors(customer.average_age_days, t)}
                        accessibilityHint="Opens this customer's stock aging"
                      />
                      {index < filteredCustomers.length - 1 && <View style={styles.divider} />}
                    </React.Fragment>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            customerSearchQuery.trim() ? (
              <ReportEmptyState
                icon="magnify-close"
                message="No matching customers"
                description={`No customers match "${customerSearchQuery.trim()}". Try fewer letters.`}
                actionLabel="Clear search"
                onAction={() => setCustomerSearchQuery('')}
              />
            ) : (
              <ReportEmptyState
                icon="package-variant-closed"
                message="No stock yet"
                description="Stock appears here once goods are received."
              />
            )
          )}
        </ScrollView>
      </View>
    );
  }

  // Single Customer View
  if (!data?.items || data.items.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader
          title="Stock aging"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
        />
        <ReportEmptyState
          icon="package-variant-closed"
          message="No stock for this customer"
          description="Stock appears here once goods are received for this customer."
        />
      </View>
    );
  }

  const bucketOrder = BUCKET_ORDER;

  return (
    <View style={styles.container}>
      <ReportHeader
        title="Stock aging"
        subtitle={selectedCustomer?.customer_name}
        onBack={shouldShowListView ? handleBackToAll : undefined}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <KPIGrid items={singleCustomerKpis} isLoading={isLoading} compact />

        {/* Aging Distribution */}
        {Object.keys(data.by_bucket).length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Stock age" styles={styles} />
            <View style={[styles.card, styles.bucketsCard]}>
              {bucketOrder.map((key) => {
                const bucket = data.by_bucket[key];
                if (!bucket) return null;
                return <AgingBucketBar key={key} bucket={key} data={bucket} maxPercentage={maxBucketPercentage} styles={styles} t={t} />;
              })}
            </View>
          </View>
        )}

        {/* Items List - Grouped by Item Name (sorted by highest stock) */}
        <View style={styles.section}>
          <SectionHeader title="Items, highest stock first" styles={styles} />
          <View style={styles.itemsList}>
            {groupedItems.map((group) => (
              <ItemGroupCard
                key={group.item_name}
                group={group}
                expandedEntries={expandedItems}
                isGroupExpanded={expandedGroups.has(group.item_name)}
                onToggleGroup={() => toggleGroup(group.item_name)}
                onToggleEntry={toggleItem}
                styles={styles}
                t={t}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
