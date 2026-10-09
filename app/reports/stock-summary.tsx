/**
 * Stock Summary Report Screen (C1)
 *
 * Displays current inventory at a glance with item-level breakdowns.
 * Styling follows docs/STYLE_GUIDE.md: report pattern (§14.10) with the PDF
 * share action in the header, object cells (§13.6) and status tags (§3.5,
 * out of stock is negative).
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
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, KPIGrid, ReportEmptyState, ReportCustomerCard, ReportCustomerSearch, type KPIItem } from '@/components/reports';
import { getCustomerStockSummary, getAllStockSummary } from '@/services/reporting';
import { generateCustomerStockPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
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
import type {
  StockSummaryData,
  StockItemSummary,
  StockGRNDetail,
  AllStockSummaryData,
  CustomerStockRow,
} from '@/types/report.types';
import { formatCount, formatDate, formatNumber, formatWeight } from '@/utils/formatters';
import { StatusTag } from '@/components/ui/StatusTag';
import { createLogger } from '@/utils/logger';

import { showAlert } from '@/utils/alert';
const logger = createLogger('StockSummary');

const LOAD_ERROR = "Couldn't load the stock summary. Check your connection and try again.";
const NO_CUSTOMER = 'No customer is linked to your account. Ask your facility to link one.';

// ============================================================================
// Styles
// ============================================================================

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background.base },
    loadingContainer: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: space.xxxl },

    searchContainer: { marginTop: space.sm, paddingHorizontal: layout.marginCompact },

    section: { marginTop: space.lg, paddingHorizontal: layout.marginCompact },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: space.sm,
      paddingBottom: space.xs,
      minHeight: 32,
    },
    sectionHeaderText: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: t.text.secondary,
    },
    itemsList: { gap: space.sm },
    oosList: { marginTop: space.sm },

    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      ...t.shadow[2],
    },
    cardClip: { borderRadius: radius.card, overflow: 'hidden' },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.marginCompact + layout.avatar.md + space.md,
      backgroundColor: t.border.divider,
    },

    // Object cell
    objectCell: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    rowPressed: { backgroundColor: t.surface.cardPressed },
    cellImage: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.button,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.brand.subtle,
    },
    cellImageMuted: { backgroundColor: t.status.neutral.background },
    cellContent: { flex: 1, justifyContent: 'center', gap: space.xxs },
    cellTitle: { ...typography.headline, color: t.text.primary },
    cellSubtitle: { ...typography.subhead, color: t.text.secondary },
    cellValue: { alignItems: 'flex-end' },
    cellValueText: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums'] },
    cellValueLabel: { ...typography.caption1, color: t.text.secondary },

    // Expanded GRN rows
    cardBody: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.divider,
      backgroundColor: t.background.base,
    },
    grnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      minHeight: layout.rowMinHeight + space.md,
      gap: space.md,
    },
    grnRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
    grnRowContent: { flex: 1, gap: space.xxs },
    grnRowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
    grnRowTitle: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, flexShrink: 1 },
    grnRowLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
    grnRowFootnote: { ...typography.footnote, color: t.text.secondary },
    grnRowAttributes: { alignItems: 'flex-end' },
    grnRowStock: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums'] },
    grnRowStockMuted: { color: t.text.secondary },
    grnRowSecondary: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums'] },


    // Collapsible out-of-stock header
    collapsibleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: touchTarget,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      gap: space.sm,
    },
    collapsibleHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
    collapsibleHeaderTitle: { ...typography.headline, color: t.text.primary },
    collapsibleHeaderHint: { ...typography.footnote, color: t.text.secondary },
    countBadge: {
      minWidth: 18,
      paddingHorizontal: space.s6,
      paddingVertical: space.xxs,
      borderRadius: radius.pill,
      alignItems: 'center',
      backgroundColor: t.brand.fill,
    },
    countBadgeText: {
      ...typography.caption2,
      fontWeight: fontWeight.semibold,
      color: t.brand.onFill,
      fontVariant: ['tabular-nums'],
    },
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// Section Header
// ============================================================================
const SectionHeader: React.FC<{ title: string; styles: Styles }> = ({ title, styles }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText} accessibilityRole="header">
      {title}
    </Text>
  </View>
);

// ============================================================================
// Object Cell - Item Card (Expandable)
// ============================================================================
interface ItemCardProps {
  item: StockItemSummary;
  isExpanded: boolean;
  onToggle: () => void;
  isOutOfStock?: boolean;
  styles: Styles;
  t: ThemeTokens;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, isExpanded, onToggle, isOutOfStock = false, styles, t }) => {
  const grns = formatCount(item.grn_count, 'GRN');
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        {/* Object Cell Header - Main touchable area */}
        <Pressable
          style={({ pressed }) => [styles.objectCell, pressed && styles.rowPressed]}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={`${item.item_name}, ${isOutOfStock ? 'out of stock' : `${formatNumber(item.total_stock)} units`}, ${grns}`}
          accessibilityState={{ expanded: isExpanded }}
          accessibilityHint={isExpanded ? 'Hides the GRNs' : 'Shows the GRNs for this item'}
        >
          <View style={[styles.cellImage, isOutOfStock && styles.cellImageMuted]}>
            <Icon
              name={isOutOfStock ? 'cube-off-outline' : 'cube-outline'}
              size={iconSize.lg}
              color={isOutOfStock ? t.status.neutral.text : t.brand.tint}
            />
          </View>

          <View style={styles.cellContent}>
            <Text style={styles.cellTitle} numberOfLines={2}>
              {item.item_name}
            </Text>
            <Text style={styles.cellSubtitle} numberOfLines={1}>
              {isOutOfStock ? `${grns} dispatched` : grns}
            </Text>
            {isOutOfStock && (
              <StatusTag status="negative" label="Out of stock" />
            )}
          </View>

          {!isOutOfStock && (
            <View style={styles.cellValue}>
              <Text style={styles.cellValueText}>{formatNumber(item.total_stock)}</Text>
              <Text style={styles.cellValueLabel}>units</Text>
            </View>
          )}

          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>

        {/* Expandable GRN List */}
        {isExpanded && item.grns.length > 0 && (
          <View style={styles.cardBody}>
            {item.grns.map((grn, index) => (
              <GRNRow
                key={`${grn.gr_no}-${index}`}
                grn={grn}
                isLast={index === item.grns.length - 1}
                onPress={grn.grn_id ? () => router.push(`/grn-details/${grn.grn_id}`) : undefined}
                isOutOfStock={isOutOfStock}
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

// ============================================================================
// GRN Row (nested within Item Card)
// ============================================================================
interface GRNRowProps {
  grn: StockGRNDetail;
  isLast?: boolean;
  onPress?: () => void;
  isOutOfStock?: boolean;
  styles: Styles;
  t: ThemeTokens;
}

const GRNRow: React.FC<GRNRowProps> = ({ grn, isLast = false, onPress, isOutOfStock = false, styles, t }) => {
  const handlePress = () => {
    if (grn.grn_id && onPress) {
      onPress();
    }
  };

  const isNavigable = !!grn.grn_id;
  const received = `Received ${formatDate(grn.date, 'short')}`;
  const emptied = isOutOfStock && grn.emptied_date ? `Emptied ${formatDate(grn.emptied_date, 'short')}` : null;
  const extra = !emptied ? [grn.packaging, grn.rack ? `Rack ${grn.rack}` : null].filter(Boolean).join(' · ') : '';
  const stockText = grn.orig_qty > 0
    ? `${formatNumber(grn.stock)} of ${formatNumber(grn.orig_qty)}`
    : formatNumber(grn.stock);
  const weight = `${formatWeight(grn.item_weight || 0)} each`;

  const a11yLabel = [
    `GRN ${grn.gr_no}`,
    grn.package_mark ? `mark ${grn.package_mark}` : null,
    received,
    emptied,
    extra || null,
    `${stockText} units`,
    weight,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View style={styles.grnRowContent}>
        <View style={styles.grnRowTitleRow}>
          <Text style={styles.grnRowTitle} numberOfLines={1}>
            {`GRN ${grn.gr_no}`}
          </Text>
          {grn.package_mark && (
            <StatusTag status="neutral" label={grn.package_mark} icon={null} />
          )}
        </View>
        <View style={styles.grnRowLine}>
          <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.grnRowFootnote}>{received}</Text>
        </View>
        {emptied && (
          <View style={styles.grnRowLine}>
            <Icon name="truck-delivery-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.grnRowFootnote}>{emptied}</Text>
          </View>
        )}
        {extra ? <Text style={styles.grnRowFootnote}>{extra}</Text> : null}
      </View>

      <View style={styles.grnRowAttributes}>
        <Text style={[styles.grnRowStock, isOutOfStock && styles.grnRowStockMuted]}>{stockText}</Text>
        <Text style={styles.grnRowSecondary}>{weight}</Text>
      </View>

      {isNavigable && <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />}
    </>
  );

  if (isNavigable) {
    return (
      <Pressable
        style={({ pressed }) => [styles.grnRow, !isLast && styles.grnRowBorder, pressed && styles.rowPressed]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens the GRN"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.grnRow, !isLast && styles.grnRowBorder]} accessible accessibilityLabel={a11yLabel}>
      {content}
    </View>
  );
};

export default function StockSummaryScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Role-based access (J12 fix)
  const {
    isStaff,
    singleAssignedCustomerId,
    shouldShowListView,
  } = useRoleBasedAccess();

  // Single customer data (used for regular users OR staff drill-down)
  const [data, setData] = useState<StockSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Out-of-stock section state
  const [outOfStockExpanded, setOutOfStockExpanded] = useState(false);
  const [expandedOutOfStockItems, setExpandedOutOfStockItems] = useState<Set<string>>(new Set());

  // For staff users - hierarchical view state
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [allCustomersData, setAllCustomersData] = useState<AllStockSummaryData | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerStockRow | null>(null);

  // PDF sharing state
  const [sharingCustomerId, setSharingCustomerId] = useState<string | null>(null);

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Fetch all customers stock summary (staff sees all, regular users see filtered)
  const fetchAllCustomersData = useCallback(async (showRefreshIndicator = false) => {

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await getAllStockSummary();

      if (response.success && response.data) {
        // Backend now filters by user permissions via auth.uid()
        setAllCustomersData(response.data);
      } else {
        logger.warn('All-customer load failed', { error: response.error });
        setError(LOAD_ERROR);
      }
    } catch (err) {
      logger.error('Error fetching all customers data', err);
      setError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch single customer stock summary (for drill-down or regular users)
  const fetchSingleCustomerData = useCallback(async (customerId: string, showRefreshIndicator = false) => {
    logger.debug('fetchSingleCustomerData called', { customerId });

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await getCustomerStockSummary(customerId);

      if (response.success && response.data) {
        setData(response.data);
      } else {
        logger.warn('Customer load failed', { error: response.error });
        setError(LOAD_ERROR);
      }
    } catch (err) {
      logger.error('Error fetching single customer data', err);
      setError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (shouldShowListView) {
      // Staff users or regular users with multiple assigned customers start with list view
      fetchAllCustomersData();
    } else if (singleAssignedCustomerId) {
      // Regular users with only one assigned customer go directly to that customer
      fetchSingleCustomerData(singleAssignedCustomerId);
    } else {
      setError(NO_CUSTOMER);
      setIsLoading(false);
    }
  }, [shouldShowListView, singleAssignedCustomerId, fetchAllCustomersData, fetchSingleCustomerData]);

  // Handle refresh based on current view
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
    if (!allCustomersData?.customers) return [];
    if (!customerSearchQuery.trim()) return allCustomersData.customers;
    const q = customerSearchQuery.toLowerCase();
    return allCustomersData.customers.filter((c) =>
      c.customer_name.toLowerCase().includes(q),
    );
  }, [allCustomersData?.customers, customerSearchQuery]);

  // Handle search autocomplete selection
  const handleSearchSelect = useCallback(
    (customer: { id: string; name: string }) => {
      setSelectedCustomer({
        customer_id: customer.id,
        customer_name: customer.name,
      } as CustomerStockRow);
      setViewMode('single');
      setData(null);
      setCustomerSearchQuery('');
      fetchSingleCustomerData(customer.id);
    },
    [fetchSingleCustomerData],
  );

  // Handle customer selection (staff drill-down)
  const handleCustomerSelect = useCallback((customer: CustomerStockRow) => {
    setSelectedCustomer(customer);
    setViewMode('single');
    setData(null); // Clear previous single-customer data
    fetchSingleCustomerData(customer.customer_id);
  }, [fetchSingleCustomerData]);

  // Handle back to all-customers view
  const handleBackToAll = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode('all');
    setSelectedCustomer(null);
    setData(null);
    setExpandedItems(new Set());
    setOutOfStockExpanded(false);
    setExpandedOutOfStockItems(new Set());
  }, []);

  // Handle PDF share for customer stock
  const handleShareCustomerStock = useCallback(async (customerId: string, customerName: string) => {
    logger.debug('handleShareCustomerStock called', { customerId });
    setSharingCustomerId(customerId);

    try {
      const result = await generateCustomerStockPDF(customerId);

      if (result.success && result.pdfUrl) {
        // Sanitize filename (remove special characters)
        const sanitizedName = customerName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const filename = `Stock_${sanitizedName}.pdf`;

        const shareResult = await downloadAndSharePDF(result.pdfUrl, filename);
        if (!shareResult.success) {
          logger.debug('Share was cancelled or failed', { error: shareResult.error });
        }
      } else {
        logger.warn('PDF generation failed', { error: result.error });
        showAlert("Couldn't create the stock PDF", 'Check your connection and try again.');
      }
    } catch (error) {
      logger.error('Error sharing customer stock PDF', error);
      showAlert("Couldn't create the stock PDF", 'Check your connection and try again.');
    } finally {
      setSharingCustomerId(null);
    }
  }, []);

  const toggleItem = useCallback((itemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const toggleOutOfStockSection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOutOfStockExpanded((prev) => !prev);
  }, []);

  const toggleOutOfStockItem = useCallback((itemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedOutOfStockItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  // Build KPI items for all-customers view
  const allCustomersKpiItems: KPIItem[] = useMemo(() => {
    if (!allCustomersData?.summary) return [];

    const summary = allCustomersData.summary;
    return [
      {
        icon: 'cube-outline',
        value: summary.total_items,
        label: 'Items',
        variant: 'primary',
      },
      {
        icon: 'warehouse',
        value: summary.total_quantity,
        label: 'Units in stock',
        variant: 'primary',
      },
    ];
  }, [allCustomersData?.summary]);

  // Build KPI items for single-customer view
  const singleCustomerKpiItems: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];

    const summary = data.summary;
    return [
      {
        icon: 'warehouse',
        value: summary.total_quantity,
        label: 'Units in stock',
        variant: 'primary',
      },
      {
        icon: 'package-down',
        value: summary.grn_count,
        label: 'GRNs with stock',
        variant: 'primary',
      },
    ];
  }, [data?.summary]);

  const getSubtitle = (): string => {
    if (!data?.summary) return '';
    const oldestDate = data.summary.oldest_stock_date;
    if (oldestDate) {
      return `Oldest stock ${formatDate(oldestDate)}`;
    }
    return '';
  };

  // Determine which KPIs to show based on view mode
  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Subtitle for list view
  const listViewSubtitle = isStaff ? 'All customers' : 'My customers';

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[t.brand.tint]}
      tintColor={t.brand.tint}
    />
  );

  const retry = () => {
    if (shouldShowListView && viewMode === 'all') fetchAllCustomersData();
    else if (selectedCustomer) fetchSingleCustomerData(selectedCustomer.customer_id);
    else if (singleAssignedCustomerId) fetchSingleCustomerData(singleAssignedCustomerId);
  };

  // Loading skeleton
  if (isLoading && !hasData) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Stock summary" />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'warehouse', value: '-', label: 'Units in stock', variant: 'primary' },
              { icon: 'package-down', value: '-', label: 'GRNs with stock', variant: 'primary' },
            ]}
            isLoading={true}
            compact
          />
        </View>
      </View>
    );
  }

  // Error state
  if (error && !hasData) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Stock summary" />
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

  // List View (Staff sees all customers, regular users see their assigned customers)
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.customers.length > 0;

    return (
      <View style={styles.container}>
        <ReportHeader title="Stock summary" subtitle={listViewSubtitle} />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {/* KPI Summary */}
          <KPIGrid items={allCustomersKpiItems} isLoading={isLoading} compact />

          {/* Customer Search */}
          <View style={styles.searchContainer}>
            <ReportCustomerSearch
              searchQuery={customerSearchQuery}
              onSearchChange={setCustomerSearchQuery}
              onCustomerSelect={handleSearchSelect}
              visibleCustomerIds={allCustomersData.customers.map((c) => c.customer_id)}
            />
          </View>

          {/* Customers List */}
          {filteredCustomers.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Customers with stock" styles={styles} />
              <View style={styles.card}>
                <View style={styles.cardClip}>
                  {filteredCustomers.map((customer, index) => (
                    <React.Fragment key={customer.customer_id}>
                      <ReportCustomerCard
                        title={customer.customer_name}
                        customerId={customer.customer_id}
                        subtitle={`${formatCount(customer.item_count, 'item')} · ${formatCount(customer.grn_count, 'GRN')}`}
                        value={customer.total_stock}
                        valueLabel="units"
                        onPress={() => handleCustomerSelect(customer)}
                        onShare={() => handleShareCustomerStock(customer.customer_id, customer.customer_name)}
                        isSharing={sharingCustomerId === customer.customer_id}
                        accessibilityHint="Opens this customer's stock"
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

  // Get current customer info for single customer view
  const currentCustomerId = selectedCustomer?.customer_id || singleAssignedCustomerId;
  const currentCustomerName = selectedCustomer?.customer_name || 'Customer';
  const pdfActions = currentCustomerId
    ? [
        {
          icon: 'file-pdf-box',
          label: 'Share stock PDF',
          busy: !!sharingCustomerId,
          onPress: () => handleShareCustomerStock(currentCustomerId, currentCustomerName),
        },
      ]
    : [];

  // Single Customer View (for single-assigned users or drill-down from list view)
  // Empty state
  if (!data?.items || data.items.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader
          title="Stock summary"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView ? handleBackToAll : undefined}
          actions={pdfActions}
        />
        <ReportEmptyState
          icon="package-variant-closed"
          message="No stock for this customer"
          description="Stock appears here once goods are received for this customer."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReportHeader
        title="Stock summary"
        subtitle={selectedCustomer?.customer_name || getSubtitle()}
        onBack={shouldShowListView ? handleBackToAll : undefined}
        actions={pdfActions}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* KPI Summary */}
        <KPIGrid items={singleCustomerKpiItems} isLoading={isLoading} compact />

        {/* Items List */}
        <View style={styles.section}>
          <SectionHeader title="Items in storage" styles={styles} />
          <View style={styles.itemsList}>
            {data.items.map((item) => (
              <ItemCard
                key={item.item_id}
                item={item}
                isExpanded={expandedItems.has(item.item_id)}
                onToggle={() => toggleItem(item.item_id)}
                styles={styles}
                t={t}
              />
            ))}
          </View>
        </View>

        {/* Out of Stock Section - Collapsible */}
        {data.out_of_stock_items && data.out_of_stock_items.length > 0 && (
          <View style={styles.section}>
            {/* Collapsible Section Header */}
            <View style={styles.card}>
              <View style={styles.cardClip}>
                <Pressable
                  style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.rowPressed]}
                  onPress={toggleOutOfStockSection}
                  accessibilityRole="button"
                  accessibilityLabel={`Out of stock, ${formatCount(data.out_of_stock_items.length, 'item')}, last 360 days`}
                  accessibilityState={{ expanded: outOfStockExpanded }}
                >
                  <View style={styles.collapsibleHeaderLeft}>
                    <Icon
                      name={outOfStockExpanded ? 'chevron-up' : 'chevron-down'}
                      size={iconSize.md}
                      color={t.icon.secondary}
                    />
                    <Text style={styles.collapsibleHeaderTitle} accessibilityRole="header">
                      Out of stock
                    </Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText} maxFontSizeMultiplier={1.6}>
                        {data.out_of_stock_items.length}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.collapsibleHeaderHint}>Last 360 days</Text>
                </Pressable>
              </View>
            </View>

            {/* Expanded Content */}
            {outOfStockExpanded && (
              <View style={[styles.itemsList, styles.oosList]}>
                {data.out_of_stock_items.map((item) => (
                  <ItemCard
                    key={`oos-${item.item_id}`}
                    item={item}
                    isExpanded={expandedOutOfStockItems.has(item.item_id)}
                    onToggle={() => toggleOutOfStockItem(item.item_id)}
                    isOutOfStock
                    styles={styles}
                    t={t}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
