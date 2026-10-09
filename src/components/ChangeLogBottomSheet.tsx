/**
 * ChangeLogBottomSheet - Change history timeline bottom sheet
 *
 * SAP Fiori Design System - Bottom Sheet Component
 *
 * Displays change history for customer orders in a timeline format.
 * Shows activity analytics, item changes, dispatches, and attribution.
 */

import React, { useCallback, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Platform,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { ChangeLogEntry, CustomerSummary, ChangeLogAnalytics } from '@/types/order.types';

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

  const t = useTokens();
  const dynamicStyles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

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

  // Android back closes the sheet before leaving the screen (style guide 15)
  useEffect(() => {
    if (!isVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [isVisible, onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        pressBehavior="close"
        style={[props.style, dynamicStyles.backdrop]}
      />
    ),
    [dynamicStyles.backdrop]
  );

  // Dot colour for the kind of change. The action text beside it carries the meaning.
  const getStatusColor = useCallback((changeType: string): string => {
    switch (changeType.toLowerCase()) {
      case 'order_item_added':
      case 'item_added':
      case 'dispatch':
      case 'dispatch_created':
        return t.status.positive.element;
      case 'order_item_removed':
      case 'item_removed':
        return t.status.negative.element;
      case 'status_changed':
        return t.status.critical.element;
      case 'quantity_updated':
      case 'item_updated':
      case 'order_created':
      case 'order':
      case 'order_updated':
        return t.status.informative.element;
      default:
        return t.status.neutral.element;
    }
  }, [t]);

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
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} importantForAccessibility="no" />
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
                  { color: hasQuantityChange.change_amount > 0 ? t.status.positive.text : t.status.negative.text }
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
                  <MaterialCommunityIcons name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={dynamicStyles.itemDetail} numberOfLines={1}>
                    {itemDetails.rack || itemDetails.grn_item_rack}
                  </Text>
                </View>
              )}
              {(itemDetails.weight || itemDetails.grn_item_weight) && (
                <View style={dynamicStyles.itemDetailRow}>
                  <MaterialCommunityIcons name="scale" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={dynamicStyles.itemDetail} numberOfLines={1}>
                    {itemDetails.weight || itemDetails.grn_item_weight} kg
                  </Text>
                </View>
              )}
              {(itemDetails.package_mark || itemDetails.grn_item_package_mark) && (
                <View style={dynamicStyles.itemDetailRow}>
                  <MaterialCommunityIcons name="cube-outline" size={iconSize.sm} color={t.icon.secondary} />
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
              <MaterialCommunityIcons name="warehouse" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={dynamicStyles.stockInfo} numberOfLines={1}>
                Available stock: {hasStockInfo.available_stock}
                {hasStockInfo.stock_at_time !== hasStockInfo.available_stock &&
                  ` (was ${hasStockInfo.stock_at_time})`
                }
              </Text>
            </View>
          )}

          <Text style={dynamicStyles.attribution} numberOfLines={2}>
            by {entry.changed_by_display_name || entry.changed_by_name}
            {entry.change_details?.reason && ` • ${entry.change_details.reason}`}
            {entry.is_recent && <Text style={dynamicStyles.recentBadge}> • Recent</Text>}
          </Text>
        </View>

        <View style={dynamicStyles.separator} />
      </View>
    );
  }, [getStatusColor, formatActionDescription, formatGRNDetails, dynamicStyles, t]);

  const renderEmpty = useCallback(() => {
    if (error) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={dynamicStyles.errorText}>Couldn&apos;t load the change history</Text>
          <Text style={dynamicStyles.emptySubtext}>
            Check your connection and try again.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="history" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={dynamicStyles.emptyText}>No changes yet</Text>
        <Text style={dynamicStyles.emptySubtext}>
          Changes to this customer&apos;s orders appear here.
        </Text>
      </View>
    );
  }, [error, dynamicStyles, t]);

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
        accessibilityState={{ busy: loading && entries.length > 0, disabled: loading }}
      >
        {loading && entries.length > 0 ? (
          <View style={styles.loadMoreLoading}>
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={dynamicStyles.loadMoreText}>Loading…</Text>
          </View>
        ) : (
          <Text style={dynamicStyles.loadMoreText}>Load more changes</Text>
        )}
      </Pressable>
    );
  }, [hasMore, onLoadMore, loading, entries.length, dynamicStyles, t]);

  const renderAnalytics = useCallback(() => {
    if (!analytics) return null;

    return (
      <View style={dynamicStyles.analyticsContainer}>
        <Text style={dynamicStyles.analyticsTitle} accessibilityRole="header">Activity summary</Text>
        <View style={styles.analyticsGrid}>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.breakdown.item_changes}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Item changes</Text>
          </View>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.breakdown.order_changes}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Order changes</Text>
          </View>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.breakdown.dispatch_changes}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Dispatches</Text>
          </View>
          <View style={styles.analyticsStat}>
            <Text style={dynamicStyles.analyticsNumber}>{analytics.activity_summary.recent_changes_24h}</Text>
            <Text style={dynamicStyles.analyticsLabel}>Last 24 h</Text>
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
        <Text style={dynamicStyles.headerTitle} accessibilityRole="header">
          Change history
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
        <MaterialCommunityIcons name="close" size={iconSize.lg} color={t.icon.primary} />
      </Pressable>
    </View>
  ), [customer, entries.length, analytics, onClose, dynamicStyles, t]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={1}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={dynamicStyles.sheetBackground}
      handleIndicatorStyle={dynamicStyles.handleIndicator}
    >
      {renderHeader()}
      {renderAnalytics()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={dynamicStyles.loadingText}>Loading change history…</Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={entries}
          keyExtractor={(item: ChangeLogEntry, index: number) =>
            `${item.change_id || item.order_id}-${item.change_timestamp}-${item.change_type}-${item.grn_no || ''}-${index}`
          }
          renderItem={renderTimelineEntry}
          contentContainerStyle={[styles.listContent, { paddingBottom: space.xxxl + insets.bottom }]}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderLoadMore}
          showsVerticalScrollIndicator={false}
        />
      )}
    </BottomSheetModal>
  );
});

// ============================================================================
// Styles
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  backdrop: {
    backgroundColor: t.overlay.scrim,
  },
  sheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...t.shadow[4],
  },
  handleIndicator: {
    backgroundColor: t.border.separator,
    width: 36,
    height: 4,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  headerCustomerName: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.secondary,
    marginBottom: space.xxs,
  },
  headerSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  loadingText: {
    ...typography.subhead,
    marginTop: space.lg,
    color: t.text.secondary,
  },
  relativeTime: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  actionDescription: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    marginBottom: space.s6,
  },
  grnDetails: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.sm,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  quantityChange: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  changeAmount: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    backgroundColor: t.status.neutral.background,
    overflow: 'hidden' as const,
    fontVariant: ['tabular-nums' as const],
  },
  itemDetailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
    backgroundColor: t.background.base,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.button,
  },
  itemDetail: {
    ...typography.caption1,
    color: t.text.secondary,
    flexShrink: 1,
  },
  stockInfoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
    backgroundColor: t.background.base,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.button,
    marginBottom: space.sm,
  },
  stockInfo: {
    ...typography.caption1,
    color: t.text.secondary,
    flexShrink: 1,
  },
  recentBadge: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.informative.text,
  },
  analyticsContainer: {
    backgroundColor: t.background.base,
    marginHorizontal: space.lg,
    marginVertical: space.sm,
    borderRadius: radius.card,
    padding: space.lg,
  },
  analyticsTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginBottom: space.md,
  },
  analyticsNumber: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  analyticsLabel: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginTop: space.xs,
  },
  attribution: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
    marginTop: space.lg,
    marginLeft: space.xl,
  },
  emptyText: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  emptySubtext: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  errorText: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  loadMoreButton: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    minHeight: touchTarget,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
    borderWidth: 1,
    borderColor: t.border.button,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  loadMoreButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  loadMoreText: {
    ...typography.callout,
    color: t.brand.tint,
  },
});

const styles = StyleSheet.create({
  headerContent: {
    flex: 1,
    marginRight: space.md,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: space.huge,
  },
  listContent: {
    paddingBottom: space.xxxl,
    paddingTop: space.sm,
  },
  timelineEntry: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  timestampSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    marginRight: space.md,
  },
  timelineContent: {
    marginLeft: 22,
    paddingRight: space.sm,
  },
  quantityChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
    gap: space.sm,
    flexWrap: 'wrap',
  },
  itemDetailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.sm,
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
    paddingVertical: space.max,
    paddingHorizontal: space.xxxl,
  },
  loadMoreButtonDisabled: {
    opacity: 0.4,
  },
  loadMoreLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});

export default ChangeLogBottomSheet;
