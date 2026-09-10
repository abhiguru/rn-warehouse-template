/**
 * MemoizedDispatchItem - Optimized Dispatch Card Component
 *
 * 2025 Best Practices Implementation:
 * - React.memo with custom areEqual comparison
 * - Stable callbacks via props (no inline functions)
 * - Minimal re-renders through prop comparison
 * - SAP Fiori design compliance
 *
 * @module list-items/MemoizedDispatchItem
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager, Vibration } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatNumber, formatDate } from '@/utils/formatters';
import type { Dispatch } from '@/services/dispatch-service';
import type { ListColors } from '@/hooks/useListColors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// TYPES
// ============================================================================

export interface MemoizedDispatchItemProps {
  /** Dispatch data to render */
  dispatch: Dispatch;
  /** Callback when item is pressed */
  onPress: (dispatch: Dispatch) => void;
  /** Callback for view details action */
  onViewDetails?: (dispatch: Dispatch) => void;
  /** Callback for edit action */
  onEdit?: (dispatch: Dispatch) => void;
  /** Callback for print action */
  onPrint?: (dispatch: Dispatch) => void;
  /** Whether print action is available */
  canPrint?: boolean;
  /** Theme-aware list colors for dark mode support */
  colors: ListColors;
  /** Global expand state from parent */
  globalExpanded?: boolean;
  /** Key to trigger sync with global state (increments on toggle) */
  globalExpandedKey?: number;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

type DispatchStatus = 'delivered' | 'pending' | 'partial';

interface StatusConfig {
  status: DispatchStatus;
  label: string;
  icon: string;
  color: string;
  backgroundColor: string;
}

const getDispatchStatus = (dispatch: Dispatch, colors: ListColors): StatusConfig => {
  // Determine status based on total_qty
  if (dispatch.total_qty && dispatch.total_qty > 0) {
    return {
      status: 'delivered',
      label: 'Complete',
      icon: 'check-circle',
      color: colors.statusPositive,
      backgroundColor: colors.statusPositiveLight,
    };
  }
  return {
    status: 'pending',
    label: 'Pending',
    icon: 'clock-outline',
    color: colors.statusCritical,
    backgroundColor: colors.statusCriticalLight,
  };
};

// ============================================================================
// COMPONENT
// ============================================================================

const DispatchItemContent: React.FC<MemoizedDispatchItemProps> = ({
  dispatch,
  onPress,
  colors,
  globalExpanded,
  globalExpandedKey,
}) => {
  // Debug logging for missing dispatch date
  if (__DEV__) {
    console.log('[MemoizedDispatchItem] Dispatch date debug:', {
      disp_no: dispatch.disp_no,
      disp_date: dispatch.disp_date,
      dispatch_date: (dispatch as any).dispatch_date,
      formatted: formatDate(dispatch.disp_date, 'short'),
    });
  }

  const [isExpanded, setIsExpanded] = useState(false);

  // Sync with global expand/collapse state
  useEffect(() => {
    if (globalExpandedKey !== undefined && globalExpandedKey > 0) {
      setIsExpanded(globalExpanded ?? false);
    }
  }, [globalExpandedKey, globalExpanded]);
  const statusConfig = getDispatchStatus(dispatch, colors);

  // Calculate totals (using snake_case properties)
  const totalQty = dispatch.total_qty || 0;
  const totalWeight = dispatch.total_weight || 0;
  const totalItems = dispatch.total_items || (dispatch.items?.length ?? 0);
  const hasItems = dispatch.items && dispatch.items.length > 0;

  const handleToggleExpand = useCallback(() => {
    Vibration.vibrate(5);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

  // Build comprehensive accessibility label
  const accessibilityDescription = [
    `Dispatch ${dispatch.disp_no}`,
    `for ${dispatch.customer_name}`,
    statusConfig.label,
    `${totalItems} items`,
    `${totalQty} quantity`,
    `${Math.round(totalWeight)} kg`,
    dispatch.registration ? `Truck: ${dispatch.registration}` : null,
    `Date: ${formatDate(dispatch.disp_date, 'short')}`,
  ].filter(Boolean).join(', ');

  return (
    <View style={[styles.card, { backgroundColor: colors.cellBackground, borderWidth: 1, borderColor: colors.cellDivider }]}>
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
        {/* SAP Fiori Object Cell Row */}
        <View style={styles.objectCellRow}>
          {/* Status Icon (Left) */}
          <View style={[styles.statusIconContainer, { backgroundColor: statusConfig.backgroundColor }]}>
            <Icon
              name={statusConfig.icon}
              size={20}
              color={statusConfig.color}
            />
          </View>

          {/* Main Content (Center) */}
          <View style={styles.mainContent}>
            {/* Title Row - Dispatch Number */}
            <Text style={[styles.titleText, { color: colors.textPrimary }]}>DISP-{dispatch.disp_no}</Text>

            {/* Subtitle Row - Customer Name */}
            <Text style={[styles.subtitleText, { color: colors.textSecondary }]} numberOfLines={1}>
              {dispatch.customer_name}
            </Text>

            {/* Footer Row - Date, Truck, Item Count */}
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
                    <Text style={[styles.footerText, { color: colors.textTertiary }]}>{dispatch.registration}</Text>
                  </View>
                </>
              )}
              <View style={[styles.itemCountBadge, { backgroundColor: colors.gray100 }]}>
                <Text style={[styles.itemCountText, { color: colors.textSecondary }]}>{totalItems} items</Text>
              </View>
            </View>
          </View>

          {/* Attribute Stack (Right) */}
          <View style={styles.attributeStack}>
            {/* Status Badge */}
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.backgroundColor }]}>
              <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>

            {/* Quantity Value */}
            <View style={styles.quantityContainer}>
              <Text style={[styles.quantityValue, { color: statusConfig.color }]}>
                {formatNumber(totalQty)}
              </Text>
              <Text style={[styles.quantityLabel, { color: colors.textTertiary }]}>QTY</Text>
            </View>

            {/* Weight Display */}
            <Text style={[styles.weightText, { color: colors.textSecondary }]}>
              {formatNumber(Math.round(totalWeight))} kg
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Expanded Items Table - SAP Fiori Data Table */}
      {isExpanded && hasItems && (
        <Animated.View entering={FadeIn.duration(200)} style={[styles.expandedSection, { borderTopColor: colors.cellDivider }]}>
          {/* Table Header */}
          <View style={[styles.tableHeader, { backgroundColor: colors.gray50, borderBottomColor: colors.cellDivider }]}>
            <Text style={[styles.tableHeaderCell, styles.colItem, { color: colors.textPrimary }]}>Item</Text>
            <Text style={[styles.tableHeaderCell, styles.colWeight, { color: colors.textPrimary }]}>Kg</Text>
            <Text style={[styles.tableHeaderCell, styles.colGrn, { color: colors.textPrimary }]}>GRN</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty, { color: colors.textPrimary }]}>Qty</Text>
          </View>

          {/* Table Rows */}
          {dispatch.items!.map((item, idx) => (
            <View
              key={`${dispatch.dispatch_id}-item-${item.grn_item_id}-${idx}`}
              style={[
                styles.tableRow,
                { backgroundColor: colors.cellBackground },
                idx % 2 === 1 && { backgroundColor: colors.gray50 },
              ]}
            >
              <View style={[styles.tableCell, styles.colItem]}>
                <View style={styles.itemNameRow}>
                  <Text style={[styles.tableCellItemName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.item_name}
                  </Text>
                  {item.rack && (
                    <Text style={[styles.tableCellRack, { color: colors.textTertiary }]}>({item.rack})</Text>
                  )}
                </View>
                {item.package_mark && (
                  <Text style={[styles.tableCellItemMark, { color: colors.textTertiary }]} numberOfLines={1}>
                    {item.package_mark}
                  </Text>
                )}
              </View>
              <Text style={[styles.tableCell, styles.colWeight, styles.tableCellValue, { color: colors.textSecondary }]}>
                {Math.round(item.weight || 0)}
              </Text>
              <Text style={[styles.tableCell, styles.colGrn, styles.tableCellValue, { color: colors.textSecondary }]}>
                {item.gr_no}/{item.grn_qty}
              </Text>
              <View style={[styles.tableCell, styles.colQty]}>
                <View style={[styles.tableQtyBadge, { backgroundColor: colors.statusPositive }]}>
                  <Text style={[styles.tableQtyBadgeText, { color: colors.white }]}>{item.disp_qty}</Text>
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
          accessibilityLabel={isExpanded ? 'Hide items' : `Show ${totalItems} items`}
        >
          <Text style={[styles.expandButtonText, { color: colors.primary }]}>
            {isExpanded ? 'Hide items' : `Show ${totalItems} items`}
          </Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.primary}
          />
        </Pressable>
      )}
    </View>
  );
};

// Custom comparison function for React.memo
const areEqual = (
  prevProps: MemoizedDispatchItemProps,
  nextProps: MemoizedDispatchItemProps
): boolean => {
  // Compare dispatch by ID and key fields that affect rendering
  const prevDispatch = prevProps.dispatch;
  const nextDispatch = nextProps.dispatch;

  return (
    prevDispatch.dispatch_id === nextDispatch.dispatch_id &&
    prevDispatch.disp_no === nextDispatch.disp_no &&
    prevDispatch.customer_name === nextDispatch.customer_name &&
    prevDispatch.total_qty === nextDispatch.total_qty &&
    prevDispatch.total_weight === nextDispatch.total_weight &&
    prevDispatch.total_items === nextDispatch.total_items &&
    prevDispatch.registration === nextDispatch.registration &&
    prevDispatch.disp_date === nextDispatch.disp_date &&
    // Compare callback references
    prevProps.onPress === nextProps.onPress &&
    prevProps.canPrint === nextProps.canPrint &&
    // Compare colors (same reference means same theme)
    prevProps.colors === nextProps.colors &&
    // Compare global expand state
    prevProps.globalExpanded === nextProps.globalExpanded &&
    prevProps.globalExpandedKey === nextProps.globalExpandedKey
  );
};

/**
 * Memoized Dispatch Item Component
 *
 * Uses React.memo with custom comparison to prevent unnecessary re-renders.
 * Only re-renders when dispatch data or callbacks actually change.
 */
export const MemoizedDispatchItem = React.memo(DispatchItemContent, areEqual);

MemoizedDispatchItem.displayName = 'MemoizedDispatchItem';

// ============================================================================
// STYLES - SAP Fiori Object Cell Compliant
// ============================================================================

const styles = StyleSheet.create({
  // Object Cell Card Container - Fiori spec: 12pt corner radius
  card: {
    borderRadius: 12, // Fiori card corner radius
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
    padding: 16, // Fiori card padding
  },
  // Object Cell Row - Fiori layout structure
  objectCellRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // Detail Image - Fiori spec: 44pt frame
  statusIconContainer: {
    width: 44, // Fiori detail image size
    height: 44,
    borderRadius: 22, // Circular for status icons
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  // Main Content - Fiori object cell main content area
  mainContent: {
    flex: 1,
    marginRight: 12,
  },
  // Title - Fiori spec: 17pt semibold
  titleText: {
    fontSize: 17, // Fiori object cell title
    fontWeight: '600',
    letterSpacing: -0.41,
    marginBottom: 2,
  },
  // Subtitle - Fiori spec: 13pt
  subtitleText: {
    fontSize: 13, // Fiori subtitle font size
    marginBottom: 8,
  },
  // Footnote Row - Fiori spec: 12pt
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
    marginHorizontal: 6,
  },
  footerText: {
    fontSize: 12, // Fiori caption font size
  },
  // Item Count Badge - Fiori tag style
  itemCountBadge: {
    height: 20, // Fiori compact tag height
    borderRadius: 10, // Fiori pill shape
    paddingHorizontal: 8,
    marginLeft: 8,
    justifyContent: 'center',
  },
  itemCountText: {
    fontSize: 11, // Fiori compact tag font size
    fontWeight: '600',
  },
  // Attribute Stack (Right) - Fiori spec
  attributeStack: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  // Status Badge/Tag - Fiori spec: 20pt height, pill shape
  statusBadge: {
    height: 20, // Fiori compact tag height
    borderRadius: 10, // Fiori pill shape
    paddingHorizontal: 8,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 11, // Fiori compact tag font size
    fontWeight: '600',
  },
  // Quantity Display - Fiori large attribute
  quantityContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  quantityValue: {
    fontSize: 20, // Fiori large attribute value
    fontWeight: '700',
  },
  quantityLabel: {
    fontSize: 11, // Fiori attribute label
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  weightText: {
    fontSize: 12, // Fiori caption font size
  },

  // =========================================================================
  // SAP Fiori Data Table Styles
  // Spec: design/sap-fiori-specs/20-data-table.md
  // =========================================================================
  expandedSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Table Header - Fiori spec: 44pt row height
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44, // Fiori table header height
    alignItems: 'center',
  },

  // Header Cell - Fiori spec: 13pt semibold
  tableHeaderCell: {
    fontSize: 13, // Fiori table header font size
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Table Row - Fiori spec: 44pt touch target
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44, // Fiori touch target
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
    width: 96,
    textAlign: 'center',
    paddingRight: 8,
  },

  colQty: {
    width: 48,
    alignItems: 'flex-end',
  },

  // Table Cell Value - Fiori spec: 15pt
  tableCellValue: {
    fontSize: 15, // Fiori table cell font size
    fontWeight: '400',
  },

  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  // Primary Cell Text - Fiori spec: 15pt medium
  tableCellItemName: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },

  // Secondary Cell Text - Fiori spec: 12pt
  tableCellRack: {
    fontSize: 12,
    fontWeight: '400',
    flexShrink: 0,
  },

  tableCellItemMark: {
    fontSize: 12,
    marginTop: 2,
  },

  // Quantity Badge - Fiori tag style
  tableQtyBadge: {
    height: 24, // Fiori default tag height
    minWidth: 36,
    paddingHorizontal: 8,
    borderRadius: 12, // Fiori pill shape
    alignItems: 'center',
    justifyContent: 'center',
  },

  tableQtyBadgeText: {
    fontSize: 12, // Fiori tag font size
    fontWeight: '600',
  },

  // Expand/Collapse Button - Fiori tertiary button style
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    minHeight: 44, // Fiori touch target
  },

  // Button Text - Fiori spec: 15pt
  expandButtonText: {
    fontSize: 15, // Fiori button font size
    fontWeight: '600',
  },
});

export default MemoizedDispatchItem;
