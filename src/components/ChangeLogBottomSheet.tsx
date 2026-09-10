/**
 * ChangeLogBottomSheet - Change history timeline bottom sheet
 *
 * SAP Fiori Design System - Bottom Sheet Component
 * Spec: design/sap-fiori-specs/07-bottom-sheet.md
 *
 * Displays change history for customer orders in a timeline format.
 * Shows activity analytics, item changes, dispatches, and attribution.
 */

import React, { useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useListColors } from '@/hooks/useListColors';
import { ChangeLogEntry, CustomerSummary, ChangeLogAnalytics } from '@/types/order.types';

// ============================================================================
// SAP Fiori Design Constants
// Spec: design/sap-fiori-specs/07-bottom-sheet.md
// ============================================================================
const FIORI = {
  // Bottom Sheet dimensions
  bottomSheet: {
    cornerRadius: 16,
    handleWidth: 36,
    handleHeight: 5,
    handleTopMargin: 8,
    handleColor: '#C6C6C8',
    backdropOpacity: 0.4,
  },
  // Header
  header: {
    height: 56,
    paddingHorizontal: 16,
  },
  // Touch targets
  touch: {
    minHeight: 44,
  },
  // Typography
  typography: {
    title: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
    subtitle: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
    body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
    caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    badge: { fontSize: 11, fontWeight: '600' as const, lineHeight: 14 },
  },
  // Colors
  colors: {
    background: '#FFFFFF',
    divider: '#E5E5E5',
  },
} as const;

interface ChangeLogBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  customer: CustomerSummary | null;
  entries: ChangeLogEntry[];
  loading: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  error?: string;
  analytics?: ChangeLogAnalytics;
}

export interface ChangeLogBottomSheetRef {
  present: () => void;
  dismiss: () => void;
}

const ChangeLogBottomSheet = forwardRef<ChangeLogBottomSheetRef, ChangeLogBottomSheetProps>(({
  isVisible,
  onClose,
  customer,
  entries,
  loading,
  onLoadMore,
  hasMore = false,
  error,
  analytics,
}, ref) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['25%', '50%', '90%'], []);

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: FIORI.header.height,
      paddingHorizontal: FIORI.header.paddingHorizontal,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    headerTitle: {
      fontSize: FIORI.typography.title.fontSize,
      fontWeight: FIORI.typography.title.fontWeight,
      lineHeight: FIORI.typography.title.lineHeight,
      color: colors.textPrimary,
    },
    headerCustomerName: {
      fontSize: FIORI.typography.subtitle.fontSize,
      fontWeight: '500' as const,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    headerSubtitle: {
      fontSize: FIORI.typography.caption.fontSize,
      color: colors.textTertiary,
      marginTop: 2,
    },
    closeButtonPressed: {
      backgroundColor: colors.gray100,
    },
    loadingText: {
      marginTop: 16,
      fontSize: FIORI.typography.body.fontSize,
      color: colors.textSecondary,
    },
    relativeTime: {
      fontSize: FIORI.typography.caption.fontSize,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    actionDescription: {
      fontSize: FIORI.typography.body.fontSize,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 6,
      lineHeight: 22,
    },
    grnDetails: {
      fontSize: FIORI.typography.caption.fontSize,
      color: colors.textSecondary,
      marginBottom: 8,
      lineHeight: 18,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    quantityChange: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
      lineHeight: 20,
    },
    changeAmount: {
      fontSize: FIORI.typography.badge.fontSize,
      fontWeight: '600',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: colors.gray100,
      overflow: 'hidden',
    },
    itemDetailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.gray50,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    itemDetail: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
      flexShrink: 1,
    },
    stockInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.blueLight || colors.gray50,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      marginBottom: 8,
    },
    stockInfo: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
      flexShrink: 1,
    },
    recentBadge: {
      fontSize: FIORI.typography.badge.fontSize,
      fontWeight: '600',
      color: colors.warning,
    },
    analyticsContainer: {
      backgroundColor: colors.gray50,
      marginHorizontal: FIORI.header.paddingHorizontal,
      marginVertical: 8,
      borderRadius: 12,
      padding: 16,
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
    analyticsTitle: {
      fontSize: FIORI.typography.caption.fontSize,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    analyticsNumber: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.primary,
    },
    analyticsLabel: {
      fontSize: FIORI.typography.badge.fontSize,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 4,
    },
    attribution: {
      fontSize: FIORI.typography.caption.fontSize,
      color: colors.textTertiary,
      lineHeight: 18,
      marginTop: 4,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.gray200,
      marginTop: 16,
      marginLeft: 20,
    },
    emptyText: {
      fontSize: FIORI.typography.title.fontSize,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: FIORI.typography.body.fontSize,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    errorText: {
      fontSize: FIORI.typography.title.fontSize,
      fontWeight: '600',
      color: colors.error,
      marginBottom: 8,
      textAlign: 'center',
    },
    loadMoreButton: {
      marginHorizontal: FIORI.header.paddingHorizontal,
      marginTop: 16,
      minHeight: FIORI.touch.minHeight,
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: colors.gray100,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadMoreButtonPressed: {
      backgroundColor: colors.gray200,
    },
    loadMoreText: {
      fontSize: FIORI.typography.body.fontSize,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  }), [colors]);

  useImperativeHandle(ref, () => ({
    present: () => bottomSheetModalRef.current?.present(),
    dismiss: () => bottomSheetModalRef.current?.dismiss(),
  }));

  React.useEffect(() => {
    if (isVisible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [isVisible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Helper function to get status color based on change type (Fiori semantic colors)
  const getStatusColor = useCallback((changeType: string): string => {
    switch (changeType.toLowerCase()) {
      case 'order_item_added':
      case 'item_added':
        return colors.success;
      case 'quantity_updated':
      case 'item_updated':
        return colors.primary;
      case 'order_item_removed':
      case 'item_removed':
        return colors.error;
      case 'order_created':
        return colors.teal; // Teal for creation
      case 'order':
      case 'order_updated':
        return colors.primary;
      case 'dispatch':
      case 'dispatch_created':
        return colors.success;
      case 'status_changed':
        return colors.warning;
      default:
        return colors.gray400;
    }
  }, [colors]);

  // Format action description based on change details
  const formatActionDescription = useCallback((entry: ChangeLogEntry): string => {
    const action = entry.change_details.action;
    const itemName = entry.item_name;

    switch (action) {
      case 'quantity_updated':
        return `Item quantity updated: ${itemName}`;
      case 'item_added':
        return `Item added: ${itemName}`;
      case 'item_removed':
        return `Item removed: ${itemName}`;
      case 'order_created':
        return 'Order created';
      case 'order_updated':
        return 'Order updated';
      case 'status_changed':
        return 'Order status changed';
      case 'dispatch_created':
        return itemName || `Dispatch created: ${entry.change_details.dispatch_no || 'Unknown'}`;
      default:
        return itemName || `${action.replace('_', ' ')}`;
    }
  }, []);

  // Format GRN details line with enhanced structure
  const formatGRNDetails = useCallback((entry: ChangeLogEntry): string | null => {
    // Enhanced structure - use item_details from change_details
    const itemDetails = entry.change_details?.item_details;
    
    if (itemDetails?.grn_no && itemDetails.item_name) {
      // Format: → GRN-NO/GRN_QTY ITEM_NAME
      // Look for GRN quantity in various places (grn_quantity is the new standard field)
      const grnQuantity =
        itemDetails.grn_quantity ??
        itemDetails.grn_qty ??
        itemDetails.original_quantity ??
        itemDetails.qty ??
        null;

      // Format with GRN quantity if available
      if (grnQuantity !== null) {
        return `→ ${itemDetails.grn_no}/${grnQuantity} ${itemDetails.item_name}`;
      } else {
        return `→ ${itemDetails.grn_no} ${itemDetails.item_name}`;
      }
    }
    
    // Fallback to top-level data
    if (entry.grn_no && entry.item_name) {
      return `→ ${entry.grn_no} ${entry.item_name}`;
    }
    
    return null;
  }, []);

  // Render individual timeline entry
  const renderTimelineEntry = useCallback(({ item: entry }: { item: ChangeLogEntry }) => {
    const statusColor = getStatusColor(entry.change_type);
    const actionDescription = formatActionDescription(entry);
    const grnDetails = formatGRNDetails(entry);
    const hasQuantityChange = entry.change_details?.quantity_change;
    const hasStockInfo = entry.change_details?.stock_info;
    const itemDetails = entry.change_details?.item_details || entry.change_details?.grn_details;

    return (
      <View style={styles.timelineEntry}>
        <View style={styles.timelineHeader}>
          <View style={styles.timestampSection}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={dynamicStyles.relativeTime}>{entry.relative_time}</Text>
          </View>
        </View>

        <View style={styles.timelineContent}>
          <Text style={dynamicStyles.actionDescription} numberOfLines={2}>
            {actionDescription}
          </Text>

          {grnDetails && (
            <Text style={dynamicStyles.grnDetails} numberOfLines={1}>
              {grnDetails}
            </Text>
          )}

          {/* Enhanced quantity change display */}
          {hasQuantityChange && (
            <View style={styles.quantityChangeContainer}>
              <Text style={dynamicStyles.quantityChange}>
                {hasQuantityChange.previous_quantity} → {hasQuantityChange.new_quantity}
                {itemDetails?.packaging && ` ${itemDetails.packaging}`}
              </Text>
              {hasQuantityChange.change_amount !== undefined && hasQuantityChange.change_amount !== 0 && (
                <Text style={[
                  dynamicStyles.changeAmount,
                  { color: hasQuantityChange.change_amount > 0 ? colors.success : colors.error }
                ]}>
                  {hasQuantityChange.change_amount > 0 ? '+' : ''}{hasQuantityChange.change_amount}
                </Text>
              )}
            </View>
          )}

          {/* Item details display - only show if we have rack, weight, or package_mark */}
          {itemDetails && (itemDetails.rack || itemDetails.grn_item_rack || itemDetails.weight || itemDetails.grn_item_weight || itemDetails.package_mark || itemDetails.grn_item_package_mark) && (
            <View style={styles.itemDetailsContainer}>
              {(itemDetails.rack || itemDetails.grn_item_rack) && (
                <View style={dynamicStyles.itemDetailRow}>
                  <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                  <Text style={dynamicStyles.itemDetail} numberOfLines={1}>
                    {itemDetails.rack || itemDetails.grn_item_rack}
                  </Text>
                </View>
              )}
              {(itemDetails.weight || itemDetails.grn_item_weight) && (
                <View style={dynamicStyles.itemDetailRow}>
                  <Ionicons name="scale-outline" size={12} color={colors.textSecondary} />
                  <Text style={dynamicStyles.itemDetail} numberOfLines={1}>
                    {itemDetails.weight || itemDetails.grn_item_weight}kg
                  </Text>
                </View>
              )}
              {(itemDetails.package_mark || itemDetails.grn_item_package_mark) && (
                <View style={dynamicStyles.itemDetailRow}>
                  <Ionicons name="cube-outline" size={12} color={colors.textSecondary} />
                  <Text style={dynamicStyles.itemDetail} numberOfLines={1}>
                    {itemDetails.package_mark || itemDetails.grn_item_package_mark}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Stock information */}
          {hasStockInfo && (
            <View style={dynamicStyles.stockInfoRow}>
              <Ionicons name="bar-chart-outline" size={12} color={colors.textSecondary} />
              <Text style={dynamicStyles.stockInfo} numberOfLines={1}>
                Available Stock: {hasStockInfo.available_stock}
                {hasStockInfo.stock_at_time !== hasStockInfo.available_stock &&
                  ` (was ${hasStockInfo.stock_at_time})`
                }
              </Text>
            </View>
          )}

          <Text style={dynamicStyles.attribution} numberOfLines={2}>
            by {entry.changed_by_display_name || entry.changed_by_name}
            {entry.change_details?.reason && ` • ${entry.change_details.reason}`}
            {entry.is_recent && <Text style={dynamicStyles.recentBadge}> • RECENT</Text>}
          </Text>
        </View>

        <View style={dynamicStyles.separator} />
      </View>
    );
  }, [getStatusColor, formatActionDescription, formatGRNDetails, dynamicStyles, colors]);

  const renderEmpty = useCallback(() => {
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={dynamicStyles.errorText}>Failed to load changes</Text>
          <Text style={dynamicStyles.emptySubtext}>
            {error}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={dynamicStyles.emptyText}>No changes recorded</Text>
        <Text style={dynamicStyles.emptySubtext}>
          Changes to this customer's orders will appear here
        </Text>
      </View>
    );
  }, [error, dynamicStyles]);

  const renderLoadMore = useCallback(() => {
    if (!hasMore && entries.length > 0) return null;

    return (
      <Pressable
        style={({ pressed }) => [
          dynamicStyles.loadMoreButton,
          loading && entries.length > 0 && styles.loadMoreButtonDisabled,
          pressed && dynamicStyles.loadMoreButtonPressed,
        ]}
        onPress={onLoadMore}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Load more changes"
      >
        {loading && entries.length > 0 ? (
          <View style={styles.loadMoreLoading}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={dynamicStyles.loadMoreText}>Loading...</Text>
          </View>
        ) : (
          <Text style={dynamicStyles.loadMoreText}>Load More Changes</Text>
        )}
      </Pressable>
    );
  }, [hasMore, onLoadMore, loading, entries.length, dynamicStyles, colors]);

  const renderAnalytics = useCallback(() => {
    if (!analytics) return null;

    return (
      <View style={dynamicStyles.analyticsContainer}>
        <Text style={dynamicStyles.analyticsTitle}>Activity Summary</Text>
        <View style={styles.analyticsGrid}>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.breakdown.item_changes}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Item Changes</Text>
          </View>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.breakdown.order_changes}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Order Changes</Text>
          </View>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.breakdown.dispatch_changes}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Dispatches</Text>
          </View>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.activity_summary.recent_changes_24h}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Last 24h</Text>
          </View>
        </View>
      </View>
    );
  }, [analytics, dynamicStyles]);

  const renderHeader = useCallback(() => (
    <View style={dynamicStyles.header}>
      <View style={styles.headerContent}>
        <Text style={dynamicStyles.headerCustomerName} numberOfLines={1}>
          {customer?.name}
        </Text>
        <Text style={dynamicStyles.headerTitle}>
          Change History
        </Text>
        <Text style={dynamicStyles.headerSubtitle}>
          {analytics?.total_changes || entries.length} {(analytics?.total_changes || entries.length) === 1 ? 'change' : 'changes'}
          {analytics?.activity_summary?.unique_editors && ` • ${analytics.activity_summary.unique_editors} editor${analytics.activity_summary.unique_editors > 1 ? 's' : ''}`}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.closeButton,
          pressed && dynamicStyles.closeButtonPressed,
        ]}
        onPress={onClose}
        accessibilityLabel="Close change history"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={24} color={colors.textTertiary} />
      </Pressable>
    </View>
  ), [customer, entries.length, analytics, onClose, dynamicStyles, colors]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={1}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.cellBackground }}
      handleIndicatorStyle={{ backgroundColor: colors.gray300, width: 36 }}
    >
      {renderHeader()}
      {renderAnalytics()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={dynamicStyles.loadingText}>Loading change history...</Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={entries}
          keyExtractor={(item: ChangeLogEntry, index: number) =>
            `${item.change_id || item.order_id}-${item.change_timestamp}-${item.change_type}-${item.grn_no || ''}-${index}`
          }
          renderItem={renderTimelineEntry}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderLoadMore}
          showsVerticalScrollIndicator={false}
        />
      )}
    </BottomSheetModal>
  );
});

// ============================================================================
// Styles - Layout only (colors in dynamicStyles)
// ============================================================================
const styles = StyleSheet.create({
  headerContent: {
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    width: FIORI.touch.minHeight,
    height: FIORI.touch.minHeight,
    borderRadius: FIORI.touch.minHeight / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  listContent: {
    paddingBottom: 32,
    paddingTop: 8,
  },
  timelineEntry: {
    paddingHorizontal: FIORI.header.paddingHorizontal,
    paddingVertical: 14,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timestampSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  timelineContent: {
    marginLeft: 22,
    paddingRight: 8,
  },
  quantityChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
    flexWrap: 'wrap',
  },
  itemDetailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  analyticsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  analyticsStat: {
    alignItems: 'center',
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  loadMoreButtonDisabled: {
    opacity: 0.6,
  },
  loadMoreLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default ChangeLogBottomSheet;