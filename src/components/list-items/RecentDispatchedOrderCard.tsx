/**
 * RecentDispatchedOrderCard - Card for Recently Dispatched Orders
 *
 * Displays a dispatch that was created from an order, showing:
 * - Dispatch number and date
 * - Customer name
 * - Order number reference
 * - Item count and total quantity
 * - Vehicle registration (if present)
 * - Created by name
 * - Expandable items list
 *
 * @module list-items/RecentDispatchedOrderCard
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  Vibration,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatNumber, formatDate } from '@/utils/formatters';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';
import type { ListColors } from '@/hooks/useListColors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// TYPES
// ============================================================================

export interface RecentDispatchedOrderCardProps {
  /** Dispatch data to render */
  dispatch: RecentDispatchedOrder;
  /** Callback when card is pressed (navigates to dispatch details) */
  onPress: (dispatch: RecentDispatchedOrder) => void;
  /** Theme-aware list colors for dark mode support */
  colors: ListColors;
}

// ============================================================================
// COMPONENT
// ============================================================================

const RecentDispatchedOrderCardContent: React.FC<RecentDispatchedOrderCardProps> = ({
  dispatch,
  onPress,
  colors,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasItems = dispatch.items && dispatch.items.length > 0;
  const itemCount = dispatch.item_count || dispatch.items?.length || 0;

  const handleToggleExpand = useCallback(() => {
    Vibration.vibrate(5);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

  // Build accessibility label
  const accessibilityDescription = [
    `Dispatch ${dispatch.disp_no}`,
    `for ${dispatch.customer_name}`,
    `from order ${dispatch.order_no}`,
    `${itemCount} items`,
    `${dispatch.total_qty} quantity`,
    dispatch.registration ? `Truck: ${dispatch.registration}` : null,
    `Created by ${dispatch.created_by_name}`,
    `Date: ${formatDate(dispatch.disp_date, 'short')}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.cellBackground, borderWidth: 1, borderColor: colors.cellDivider },
      ]}
    >
      <Pressable
        onPress={() => onPress(dispatch)}
        style={({ pressed }) => [
          styles.cardContent,
          pressed && { backgroundColor: colors.cellBackgroundPressed },
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityDescription}
        accessibilityHint="Double tap to view dispatch details"
      >
        {/* Main Row */}
        <View style={styles.objectCellRow}>
          {/* Status Icon (Left) - Checkmark for completed dispatches */}
          <View style={[styles.statusIconContainer, { backgroundColor: colors.statusPositiveLight }]}>
            <Icon name="check-circle" size={20} color={colors.statusPositive} />
          </View>

          {/* Main Content (Center) */}
          <View style={styles.mainContent}>
            {/* Title Row - Dispatch Number */}
            <Text style={[styles.titleText, { color: colors.textPrimary }]}>
              DISP-{dispatch.disp_no}
            </Text>

            {/* Subtitle Row - Customer Name */}
            <Text style={[styles.subtitleText, { color: colors.textSecondary }]} numberOfLines={1}>
              {dispatch.customer_name}
            </Text>

            {/* Order Reference */}
            <View style={styles.orderRefRow}>
              <Icon name="clipboard-list-outline" size={12} color={colors.primary} />
              <Text style={[styles.orderRefText, { color: colors.primary }]} numberOfLines={1}>
                {dispatch.order_no}
              </Text>
            </View>

            {/* Footer Row - Date, Truck, Created By */}
            <View style={styles.footerRow}>
              <View style={styles.footerItem}>
                <Icon name="calendar" size={14} color={colors.textTertiary} />
                <Text style={[styles.footerText, { color: colors.textTertiary }]}>
                  {formatDate(dispatch.disp_date, 'short')}
                </Text>
              </View>
              {dispatch.registration && (
                <>
                  <View style={[styles.footerDot, { backgroundColor: colors.textTertiary }]} />
                  <View style={styles.footerItem}>
                    <Icon name="truck" size={14} color={colors.textTertiary} />
                    <Text style={[styles.footerText, { color: colors.textTertiary }]}>
                      {dispatch.registration}
                    </Text>
                  </View>
                </>
              )}
              <View style={[styles.footerDot, { backgroundColor: colors.textTertiary }]} />
              <View style={styles.footerItem}>
                <Icon name="account" size={14} color={colors.textTertiary} />
                <Text style={[styles.footerText, { color: colors.textTertiary }]} numberOfLines={1}>
                  {dispatch.created_by_name}
                </Text>
              </View>
            </View>
          </View>

          {/* Attribute Stack (Right) */}
          <View style={styles.attributeStack}>
            {/* Item Count Badge */}
            <View style={[styles.itemCountBadge, { backgroundColor: colors.gray100 }]}>
              <Text style={[styles.itemCountText, { color: colors.textSecondary }]}>
                {itemCount} items
              </Text>
            </View>

            {/* Quantity Value */}
            <View style={styles.quantityContainer}>
              <Text style={[styles.quantityValue, { color: colors.statusPositive }]}>
                {formatNumber(dispatch.total_qty)}
              </Text>
              <Text style={[styles.quantityLabel, { color: colors.textTertiary }]}>QTY</Text>
            </View>
          </View>
        </View>
      </Pressable>

      {/* Expanded Items Table */}
      {isExpanded && hasItems && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.expandedSection, { borderTopColor: colors.cellDivider }]}
        >
          {/* Table Header */}
          <View
            style={[
              styles.tableHeader,
              { backgroundColor: colors.gray50, borderBottomColor: colors.cellDivider },
            ]}
          >
            <Text style={[styles.tableHeaderCell, styles.colItem, { color: colors.textPrimary }]}>
              Item
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colWeight, { color: colors.textPrimary }]}>
              Kg
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colGrn, { color: colors.textPrimary }]}>
              GRN
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colQty, { color: colors.textPrimary }]}>
              Qty
            </Text>
          </View>

          {/* Table Rows */}
          {dispatch.items.map((item, idx) => (
            <View
              key={`${dispatch.dispatch_id}-item-${idx}`}
              style={[
                styles.tableRow,
                { backgroundColor: colors.cellBackground },
                idx % 2 === 1 && { backgroundColor: colors.gray50 },
              ]}
            >
              <View style={[styles.tableCell, styles.colItem]}>
                <View style={styles.itemNameRow}>
                  <Text
                    style={[styles.tableCellItemName, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.item_name}
                  </Text>
                  {item.rack && (
                    <Text style={[styles.tableCellRack, { color: colors.textTertiary }]}>
                      ({item.rack})
                    </Text>
                  )}
                </View>
                {item.package_mark && (
                  <Text
                    style={[styles.tableCellItemMark, { color: colors.textTertiary }]}
                    numberOfLines={1}
                  >
                    {item.package_mark}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.tableCell,
                  styles.colWeight,
                  styles.tableCellValue,
                  { color: colors.textSecondary },
                ]}
              >
                {Math.round(item.weight || 0)}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.colGrn,
                  styles.tableCellValue,
                  { color: colors.textSecondary },
                ]}
              >
                {item.gr_no}
              </Text>
              <View style={[styles.tableCell, styles.colQty]}>
                <View style={[styles.tableQtyBadge, { backgroundColor: colors.statusPositive }]}>
                  <Text style={[styles.tableQtyBadgeText, { color: colors.white }]}>
                    {item.disp_qty}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Animated.View>
      )}

      {/* Expand/Collapse Button */}
      {hasItems && (
        <Pressable
          onPress={handleToggleExpand}
          style={({ pressed }) => [
            styles.expandButton,
            { borderTopColor: colors.cellDivider, backgroundColor: colors.cellBackground },
            pressed && { backgroundColor: colors.cellBackgroundPressed },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Hide items' : `Show ${itemCount} items`}
        >
          <Text style={[styles.expandButtonText, { color: colors.primary }]}>
            {isExpanded ? 'Hide items' : `Show ${itemCount} items`}
          </Text>
          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
};

// Custom comparison function for React.memo
const areEqual = (
  prevProps: RecentDispatchedOrderCardProps,
  nextProps: RecentDispatchedOrderCardProps
): boolean => {
  const prevDispatch = prevProps.dispatch;
  const nextDispatch = nextProps.dispatch;

  return (
    prevDispatch.dispatch_id === nextDispatch.dispatch_id &&
    prevDispatch.disp_no === nextDispatch.disp_no &&
    prevDispatch.customer_name === nextDispatch.customer_name &&
    prevDispatch.order_no === nextDispatch.order_no &&
    prevDispatch.total_qty === nextDispatch.total_qty &&
    prevDispatch.item_count === nextDispatch.item_count &&
    prevDispatch.registration === nextDispatch.registration &&
    prevDispatch.disp_date === nextDispatch.disp_date &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.colors === nextProps.colors
  );
};

/**
 * Memoized Recent Dispatched Order Card
 */
export const RecentDispatchedOrderCard = React.memo(RecentDispatchedOrderCardContent, areEqual);

RecentDispatchedOrderCard.displayName = 'RecentDispatchedOrderCard';

// ============================================================================
// STYLES - SAP Fiori Object Cell Compliant
// ============================================================================

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  objectCellRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mainContent: {
    flex: 1,
    marginRight: 12,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
    marginBottom: 2,
  },
  subtitleText: {
    fontSize: 13,
    marginBottom: 4,
  },
  orderRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  orderRefText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  footerText: {
    fontSize: 12,
  },
  attributeStack: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  itemCountBadge: {
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
    justifyContent: 'center',
  },
  itemCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  quantityContainer: {
    alignItems: 'flex-end',
  },
  quantityValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  quantityLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expandedSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    alignItems: 'center',
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  tableCell: {
    justifyContent: 'center',
  },
  colItem: {
    flex: 1,
    paddingRight: 8,
  },
  colWeight: {
    width: 40,
    textAlign: 'right',
    paddingRight: 12,
  },
  colGrn: {
    width: 60,
    textAlign: 'center',
    paddingRight: 8,
  },
  colQty: {
    width: 48,
    alignItems: 'flex-end',
  },
  tableCellValue: {
    fontSize: 15,
    fontWeight: '400',
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tableCellItemName: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  tableCellRack: {
    fontSize: 12,
    fontWeight: '400',
    flexShrink: 0,
  },
  tableCellItemMark: {
    fontSize: 12,
    marginTop: 2,
  },
  tableQtyBadge: {
    height: 24,
    minWidth: 36,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableQtyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    minHeight: 44,
  },
  expandButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default RecentDispatchedOrderCard;
