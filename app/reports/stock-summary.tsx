/**
 * Stock Summary Report Screen (C1)
 *
 * Displays current inventory at a glance with item-level breakdowns.
 * 100% SAP Fiori compliant following design specs.
 *
 * @see design/sap-fiori-specs/01-object-cell.md - Object Cell pattern
 * @see design/sap-fiori-specs/13-card.md - Card structure
 * @see design/sap-fiori-specs/14-section-header.md - Section Header pattern
 * @see design/sap-fiori-specs/18-tags-badges.md - Tags/Badges
 * @see design/sap-fiori-specs/12-empty-state.md - Empty State pattern
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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, KPIGrid, ReportEmptyState, ReportCustomerCard, ReportCustomerSearch, type KPIItem } from '@/components/reports';
import { getCustomerStockSummary, getAllStockSummary } from '@/services/reporting';
import { generateCustomerStockPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import type {
  StockSummaryData,
  StockItemSummary,
  StockGRNDetail,
  AllStockSummaryData,
  CustomerStockRow,
} from '@/types/report.types';
import { formatNumber, formatWeight, formatDate } from '@/utils/formatters';

// ============================================================================
// SAP Fiori Design Tokens - Static dimensions and typography
// Colors are now provided via useFioriColors() hook for dark mode support
// @see src/theme/fioriColors.ts
// ============================================================================
const FIORI_STATIC = {
  // Dimensions from Fiori spec
  dimensions: {
    objectCellMinHeight: 72,
    objectCellImageSize: 44,
    objectCellImageRadius: 10,
    cardCornerRadius: 12,
    cardPadding: 16,
    cardBodyPadding: 16,
    sectionHeaderHeight: 32,
    touchTarget: 44,
    iconButtonSize: 24,
  },
  // Typography from Fiori spec
  typography: {
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    title: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 18,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 16,
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
    },
  },
};

// ============================================================================
// Fiori Section Header Component
// @see design/sap-fiori-specs/14-section-header.md
// ============================================================================
interface FioriSectionHeaderProps {
  title: string;
  action?: {
    label?: string;
    icon?: string;
    onPress: () => void;
  };
}

const FioriSectionHeader: React.FC<FioriSectionHeaderProps> = ({ title, action }) => {
  const fiori = useFioriColors();

  return (
    <View style={styles.fioriSectionHeader}>
      <Text style={[styles.fioriSectionHeaderText, { color: fiori.colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      {action && (
        action.icon ? (
          <TouchableOpacity
            onPress={action.onPress}
            style={styles.fioriSectionHeaderButton}
            accessibilityRole="button"
            accessibilityLabel={action.label || title}
          >
            <Icon name={action.icon} size={20} color={fiori.colors.tint} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={action.onPress}
            style={styles.fioriSectionHeaderButton}
            accessibilityRole="button"
          >
            <Text style={[styles.fioriSectionHeaderAction, { color: fiori.colors.tint }]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
};

// ============================================================================
// Fiori Object Cell - Item Card (Expandable)
// @see design/sap-fiori-specs/01-object-cell.md
// ============================================================================
interface ItemCardProps {
  item: StockItemSummary;
  isExpanded: boolean;
  onToggle: () => void;
  isOutOfStock?: boolean;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, isExpanded, onToggle, isOutOfStock = false }) => {
  const fiori = useFioriColors();

  return (
    <View style={[
      styles.fioriCard,
      {
        backgroundColor: fiori.colors.cardBackground,
        borderColor: fiori.colors.divider,
      },
      isOutOfStock && styles.fioriCardOutOfStock,
    ]}>
      {/* Object Cell Header - Main touchable area */}
      <Pressable
        style={({ pressed }) => [
          styles.fioriObjectCell,
          { backgroundColor: fiori.colors.cardBackground },
          pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
        ]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.item_name}, ${isOutOfStock ? 'out of stock' : `${item.total_stock} units`} in ${item.grn_count} GRNs`}
        accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to expand GRN details'}
      >
        {/* A. Detail Image (44pt per Fiori spec) */}
        <View style={[
          styles.fioriObjectCellImagePrimary,
          { backgroundColor: isOutOfStock ? fiori.colors.backgroundSecondary : fiori.colors.tintLight },
        ]}>
          <Icon
            name={isOutOfStock ? 'cube-off-outline' : 'cube-outline'}
            size={22}
            color={isOutOfStock ? fiori.colors.textSecondary : fiori.colors.tint}
          />
        </View>

        {/* C. Main Content */}
        <View style={styles.fioriObjectCellContent}>
          {/* Title (mandatory) */}
          <Text style={[styles.fioriObjectCellTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
            {item.item_name}
          </Text>
          {/* Subtitle */}
          <Text style={[styles.fioriObjectCellSubtitle, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
            {item.grn_count} GRN{item.grn_count !== 1 ? 's' : ''}{isOutOfStock ? ' dispatched' : ` • ${formatNumber(item.total_stock)} units`}
          </Text>
        </View>

        {/* F. Accessory View - Expand/Collapse */}
        <View style={styles.fioriObjectCellAccessory}>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={fiori.colors.textSecondary}
          />
        </View>
      </Pressable>

      {/* Expandable GRN List */}
      {isExpanded && item.grns.length > 0 && (
        <View style={[
          styles.fioriCardBody,
          {
            backgroundColor: fiori.colors.backgroundSecondary,
            borderTopColor: fiori.colors.divider,
          },
        ]}>
          {item.grns.map((grn, index) => (
            <GRNRow
              key={`${grn.gr_no}-${index}`}
              grn={grn}
              isLast={index === item.grns.length - 1}
              onPress={grn.grn_id ? () => router.push(`/grn-details/${grn.grn_id}`) : undefined}
              isOutOfStock={isOutOfStock}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// Fiori Object Cell - GRN Row (nested within Item Card)
// @see design/sap-fiori-specs/01-object-cell.md
// ============================================================================
interface GRNRowProps {
  grn: StockGRNDetail;
  isLast?: boolean;
  onPress?: () => void;
  isOutOfStock?: boolean;
}

const GRNRow: React.FC<GRNRowProps> = ({ grn, isLast = false, onPress, isOutOfStock = false }) => {
  const fiori = useFioriColors();

  const handlePress = () => {
    if (grn.grn_id && onPress) {
      onPress();
    }
  };

  const isNavigable = !!grn.grn_id;

  const content = (
    <>
      {/* Main Content */}
      <View style={styles.fioriGrnRowContent}>
        {/* Title with Tag */}
        <View style={styles.fioriGrnRowTitleRow}>
          <Text style={[styles.fioriGrnRowTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
            {grn.gr_no}
          </Text>
          {/* Fiori Tag/Badge for package mark */}
          {grn.package_mark && (
            <View style={[styles.fioriTag, { backgroundColor: fiori.colors.infoLight }]}>
              <Text style={[styles.fioriTagText, { color: fiori.colors.info }]}>{grn.package_mark}</Text>
            </View>
          )}
        </View>
        {/* Footnote - with green arrow for In date, red arrow for Out date */}
        {isOutOfStock && grn.emptied_date ? (
          <View style={styles.fioriGrnRowFootnoteRow}>
            <Icon name="arrow-down" size={14} color={fiori.colors.success} />
            <Text style={[styles.fioriGrnRowFootnote, { color: fiori.colors.textSecondary }]}>
              {formatDate(grn.date, 'compact')}
            </Text>
            <Text style={[styles.fioriGrnRowFootnoteSeparator, { color: fiori.colors.textSecondary }]}> • </Text>
            <Icon name="arrow-up" size={14} color={fiori.colors.destructive} />
            <Text style={[styles.fioriGrnRowFootnote, { color: fiori.colors.textSecondary }]}>
              {formatDate(grn.emptied_date, 'compact')}
            </Text>
          </View>
        ) : (
          <View style={styles.fioriGrnRowFootnoteRow}>
            <Icon name="arrow-down" size={14} color={fiori.colors.success} />
            <Text style={[styles.fioriGrnRowFootnote, { color: fiori.colors.textSecondary }]}>
              {formatDate(grn.date, 'compact')}
              {grn.packaging ? ` • ${grn.packaging}` : ''}
              {grn.rack ? ` • ${grn.rack}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Attributes */}
      <View style={styles.fioriGrnRowAttributes}>
        <View style={styles.fioriGrnRowQtyRow}>
          <Text style={[
            styles.fioriGrnRowStock,
            { color: isOutOfStock ? fiori.colors.textSecondary : fiori.colors.textPrimary },
          ]}>
            {formatNumber(grn.stock)}
          </Text>
          {grn.orig_qty > 0 && (
            <Text style={[styles.fioriGrnRowOrigQty, { color: fiori.colors.textSecondary }]}>
              / {formatNumber(grn.orig_qty)}
            </Text>
          )}
        </View>
        <Text style={[styles.fioriGrnRowWeight, { color: fiori.colors.textSecondary }]}>
          {formatWeight(grn.item_weight)}
        </Text>
      </View>

      {/* Accessory - Navigation Chevron */}
      {isNavigable && (
        <Icon name="chevron-right" size={16} color={fiori.colors.textSecondary} />
      )}
    </>
  );

  if (isNavigable) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.fioriGrnRow,
          { backgroundColor: fiori.colors.backgroundSecondary },
          !isLast && [styles.fioriGrnRowBorder, { borderBottomColor: fiori.colors.divider }],
          pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`GRN ${grn.gr_no}, ${grn.stock} units`}
        accessibilityHint="Tap to view GRN details"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[
      styles.fioriGrnRow,
      { backgroundColor: fiori.colors.backgroundSecondary },
      !isLast && [styles.fioriGrnRowBorder, { borderBottomColor: fiori.colors.divider }],
    ]}>
      {content}
    </View>
  );
};

// ============================================================================
// Fiori Object Cell - Customer Card
// CustomerCard moved to @/components/reports/ReportCustomerCard (J14 fix)

export default function StockSummaryScreen() {
  const fiori = useFioriColors();

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
        setError(response.error || 'Failed to load stock summary');
      }
    } catch (err) {
      console.error('[StockSummary] Error fetching all customers data:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch single customer stock summary (for drill-down or regular users)
  const fetchSingleCustomerData = useCallback(async (customerId: string, showRefreshIndicator = false) => {
    console.log('[StockSummary] fetchSingleCustomerData called, customerId:', customerId);

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
        setError(response.error || 'Failed to load stock summary');
      }
    } catch (err) {
      console.error('[StockSummary] Error fetching single customer data:', err);
      setError('An unexpected error occurred');
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
      setError('No customer assigned to your account');
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
    console.log('[StockSummary] handleShareCustomerStock called:', { customerId, customerName });
    setSharingCustomerId(customerId);

    try {
      const result = await generateCustomerStockPDF(customerId);

      if (result.success && result.pdfUrl) {
        // Sanitize filename (remove special characters)
        const sanitizedName = customerName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const filename = `Stock_${sanitizedName}.pdf`;

        const shareResult = await downloadAndSharePDF(result.pdfUrl, filename);
        if (!shareResult.success) {
          console.log('[StockSummary] Share was cancelled or failed:', shareResult.error);
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      console.error('[StockSummary] Error sharing customer stock PDF:', error);
      Alert.alert('Error', 'Failed to generate stock PDF. Please try again.');
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
        icon: 'package-variant',
        value: summary.total_quantity,
        label: 'Total Units',
        variant: 'secondary',
      },
    ];
  }, [allCustomersData?.summary]);

  // Build KPI items for single-customer view
  const singleCustomerKpiItems: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];

    const summary = data.summary;
    return [
      {
        icon: 'package-variant',
        value: summary.total_quantity,
        label: 'Total Units',
        variant: 'primary',
      },
      {
        icon: 'file-document-outline',
        value: summary.grn_count,
        label: 'Active GRNs',
        variant: 'accent',
      },
    ];
  }, [data?.summary]);

  const getSubtitle = (): string => {
    if (!data?.summary) return '';
    const oldestDate = data.summary.oldest_stock_date;
    if (oldestDate) {
      return `Oldest stock: ${formatDate(oldestDate, 'short')}`;
    }
    return '';
  };

  // Determine which KPIs to show based on view mode
  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Subtitle for list view
  const listViewSubtitle = isStaff ? 'All Customers' : 'My Customers';

  // Loading skeleton
  if (isLoading && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Stock Summary" />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'package-variant', value: '-', label: 'Total Units', variant: 'primary' },
              { icon: 'file-document-outline', value: '-', label: 'Active GRNs', variant: 'secondary' },
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
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Stock Summary" />
        <ReportEmptyState
          icon="alert-circle-outline"
          message="Failed to load data"
          description={error}
        />
      </View>
    );
  }

  // List View (Staff sees all customers, regular users see their assigned customers)
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.customers.length > 0;

    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Stock Summary" subtitle={listViewSubtitle} />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[fiori.colors.tint]}
              tintColor={fiori.colors.tint}
            />
          }
        >
          {/* KPI Summary */}
          <KPIGrid items={allCustomersKpiItems} isLoading={isLoading} compact />

          {/* Customer Search */}
          <View style={{ marginTop: 8, paddingHorizontal: FIORI_STATIC.dimensions.cardPadding }}>
            <ReportCustomerSearch
              searchQuery={customerSearchQuery}
              onSearchChange={setCustomerSearchQuery}
              onCustomerSelect={handleSearchSelect}
              visibleCustomerIds={allCustomersData.customers.map((c) => c.customer_id)}
            />
          </View>

          {/* Customers List - Fiori List Card Pattern */}
          {filteredCustomers.length > 0 ? (
            <View style={styles.fioriSection}>
              <FioriSectionHeader title="Customers with Stock" />
              <View style={[
                styles.fioriListCard,
                {
                  backgroundColor: fiori.colors.cardBackground,
                  borderColor: fiori.colors.divider,
                },
              ]}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <ReportCustomerCard
                      title={customer.customer_name}
                      subtitle={`${customer.item_count} item${customer.item_count !== 1 ? 's' : ''} • ${customer.grn_count} GRN${customer.grn_count !== 1 ? 's' : ''}`}
                      value={customer.total_stock}
                      valueLabel="units"
                      onPress={() => handleCustomerSelect(customer)}
                      onShare={() => handleShareCustomerStock(customer.customer_id, customer.customer_name)}
                      isSharing={sharingCustomerId === customer.customer_id}
                      accessibilityHint="Tap to view customer stock details"
                    />
                    {index < filteredCustomers.length - 1 && (
                      <View style={[styles.fioriDivider, { backgroundColor: fiori.colors.divider }]} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : (
            <ReportEmptyState
              icon="package-variant-closed"
              message="No Stock Found"
              description="There is no inventory currently in storage."
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // Get current customer info for single customer view
  const currentCustomerId = selectedCustomer?.customer_id || singleAssignedCustomerId;
  const currentCustomerName = selectedCustomer?.customer_name || 'Customer';

  // Single Customer View (for single-assigned users or drill-down from list view)
  // Empty state
  if (!data?.items || data.items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader
          title="Stock Summary"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView ? handleBackToAll : undefined}
          actionIcon={currentCustomerId && !sharingCustomerId ? 'file-pdf-box' : undefined}
          onAction={currentCustomerId && !sharingCustomerId ? () => handleShareCustomerStock(currentCustomerId, currentCustomerName) : undefined}
          actionLabel="Download PDF"
        />
        <ReportEmptyState
          icon="package-variant-closed"
          message="No Stock Found"
          description="There is no inventory currently in storage for this customer."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
      <ReportHeader
        title="Stock Summary"
        subtitle={selectedCustomer?.customer_name || getSubtitle()}
        onBack={shouldShowListView ? handleBackToAll : undefined}
        actionIcon={currentCustomerId && !sharingCustomerId ? 'file-pdf-box' : undefined}
        onAction={currentCustomerId && !sharingCustomerId ? () => handleShareCustomerStock(currentCustomerId, currentCustomerName) : undefined}
        actionLabel="Download PDF"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[fiori.colors.tint]}
            tintColor={fiori.colors.tint}
          />
        }
      >
        {/* KPI Summary */}
        <KPIGrid items={singleCustomerKpiItems} isLoading={isLoading} compact />

        {/* Items List - Fiori Pattern */}
        <View style={styles.fioriSection}>
          <FioriSectionHeader title="Items in Storage" />
          <View style={styles.fioriItemsList}>
            {data.items.map((item) => (
              <ItemCard
                key={item.item_id}
                item={item}
                isExpanded={expandedItems.has(item.item_id)}
                onToggle={() => toggleItem(item.item_id)}
              />
            ))}
          </View>
        </View>

        {/* Out of Stock Section - Collapsible */}
        {data.out_of_stock_items && data.out_of_stock_items.length > 0 && (
          <View style={styles.fioriSection}>
            {/* Collapsible Section Header */}
            <Pressable
              style={[
                styles.fioriCollapsibleHeader,
                {
                  backgroundColor: fiori.colors.cardBackground,
                  borderColor: fiori.colors.divider,
                },
              ]}
              onPress={toggleOutOfStockSection}
              accessibilityRole="button"
              accessibilityLabel={`Out of stock, ${data.out_of_stock_items.length} items`}
              accessibilityHint={outOfStockExpanded ? 'Tap to collapse' : 'Tap to expand'}
            >
              <View style={styles.fioriCollapsibleHeaderLeft}>
                <Icon
                  name={outOfStockExpanded ? 'chevron-down' : 'chevron-right'}
                  size={20}
                  color={fiori.colors.textSecondary}
                />
                <Text style={[styles.fioriSectionHeaderText, { color: fiori.colors.textSecondary }]}>
                  OUT OF STOCK
                </Text>
                <View style={[styles.fioriCountBadge, { backgroundColor: fiori.colors.textSecondary }]}>
                  <Text style={styles.fioriCountBadgeText}>
                    {data.out_of_stock_items.length}
                  </Text>
                </View>
              </View>
              <Text style={[styles.fioriCollapsibleHeaderHint, { color: fiori.colors.textTertiary }]}>
                Last 360 days
              </Text>
            </Pressable>

            {/* Expanded Content */}
            {outOfStockExpanded && (
              <View style={styles.fioriItemsList}>
                {data.out_of_stock_items.map((item) => (
                  <ItemCard
                    key={`oos-${item.item_id}`}
                    item={item}
                    isExpanded={expandedOutOfStockItems.has(item.item_id)}
                    onToggle={() => toggleOutOfStockItem(item.item_id)}
                    isOutOfStock
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

// ============================================================================
// SAP Fiori Compliant Styles
// ============================================================================
// @see design/sap-fiori-specs/01-object-cell.md
// @see design/sap-fiori-specs/13-card.md
// @see design/sap-fiori-specs/14-section-header.md
// @see design/sap-fiori-specs/18-tags-badges.md
// ============================================================================
const styles = StyleSheet.create({
  // =========================================================================
  // Layout
  // =========================================================================
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // =========================================================================
  // Fiori Section Header (14-section-header.md)
  // =========================================================================
  fioriSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: FIORI_STATIC.dimensions.sectionHeaderHeight,
    backgroundColor: 'transparent',
  },
  fioriSectionHeaderText: {
    fontSize: FIORI_STATIC.typography.sectionHeader.fontSize,
    fontWeight: FIORI_STATIC.typography.sectionHeader.fontWeight,
    letterSpacing: FIORI_STATIC.typography.sectionHeader.letterSpacing,
    textTransform: FIORI_STATIC.typography.sectionHeader.textTransform,
  },
  fioriSectionHeaderButton: {
    minWidth: FIORI_STATIC.dimensions.touchTarget,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriSectionHeaderAction: {
    fontSize: 14,
    fontWeight: '500',
  },

  // =========================================================================
  // Fiori Section Container
  // =========================================================================
  fioriSection: {
    marginTop: 16,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
  },
  fioriItemsList: {
    gap: 10,
  },

  // =========================================================================
  // Fiori Card Container (13-card.md)
  // =========================================================================
  fioriCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fioriCardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fioriListCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fioriDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72, // Align with content after image
  },

  // =========================================================================
  // Fiori Object Cell (01-object-cell.md)
  // =========================================================================
  fioriObjectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  fioriObjectCellCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },

  // B. Detail Image (44pt per Fiori spec)
  fioriObjectCellImagePrimary: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // C. Main Content
  fioriObjectCellContent: {
    flex: 1,
    justifyContent: 'center',
  },
  fioriObjectCellTitle: {
    fontSize: FIORI_STATIC.typography.title.fontSize,
    fontWeight: FIORI_STATIC.typography.title.fontWeight,
    lineHeight: FIORI_STATIC.typography.title.lineHeight,
  },
  fioriObjectCellSubtitle: {
    fontSize: FIORI_STATIC.typography.subtitle.fontSize,
    lineHeight: FIORI_STATIC.typography.subtitle.lineHeight,
    marginTop: 2,
  },

  // E. Attributes
  fioriObjectCellAttributes: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  fioriObjectCellAttributeValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  fioriObjectCellAttributeLabel: {
    fontSize: FIORI_STATIC.typography.caption.fontSize,
    lineHeight: FIORI_STATIC.typography.caption.lineHeight,
  },
  fioriObjectCellAttributeSecondary: {
    fontSize: FIORI_STATIC.typography.footnote.fontSize,
    marginTop: 2,
  },

  // F. Accessory View
  fioriObjectCellAccessory: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Share Button (positioned left of attributes, away from nav arrow)
  fioriShareButtonLeft: {
    width: FIORI_STATIC.dimensions.touchTarget,
    height: FIORI_STATIC.dimensions.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },

  // =========================================================================
  // Fiori GRN Row (nested Object Cell)
  // =========================================================================
  fioriGrnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  fioriGrnRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fioriGrnRowContent: {
    flex: 1,
  },
  fioriGrnRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fioriGrnRowTitle: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  fioriGrnRowFootnote: {
    fontSize: FIORI_STATIC.typography.footnote.fontSize,
    lineHeight: FIORI_STATIC.typography.footnote.lineHeight,
    marginTop: 3,
  },
  fioriGrnRowFootnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  fioriGrnRowFootnoteSeparator: {
    fontSize: FIORI_STATIC.typography.footnote.fontSize,
  },
  fioriGrnRowAttributes: {
    alignItems: 'flex-end',
  },
  fioriGrnRowQtyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  fioriGrnRowStock: {
    fontSize: 15,
    fontWeight: '600',
  },
  fioriGrnRowOrigQty: {
    fontSize: 12,
  },
  fioriGrnRowWeight: {
    fontSize: FIORI_STATIC.typography.caption.fontSize,
    marginTop: 2,
  },

  // =========================================================================
  // Fiori Tags/Badges (18-tags-badges.md)
  // =========================================================================
  fioriTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10, // Pill shape per Fiori spec
    alignSelf: 'flex-start',
  },
  fioriTagText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // =========================================================================
  // Out of Stock Styles
  // =========================================================================
  fioriCardOutOfStock: {
    opacity: 0.85,
  },

  // =========================================================================
  // Collapsible Section Header
  // =========================================================================
  fioriCollapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 12,
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    ...theme.shadows.sm,
  },
  fioriCollapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fioriCollapsibleHeaderHint: {
    fontSize: FIORI_STATIC.typography.caption.fontSize,
  },
  fioriCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  fioriCountBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF', // Always white text on badge
  },
});
