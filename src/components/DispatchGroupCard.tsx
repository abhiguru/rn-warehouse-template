import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  Vibration,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { listColors as colors } from '@/theme/listColors';
import { CustomerDispatchItem } from '@/types/order.types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DispatchGroup {
  dispatchId: string;
  dispNo: string;
  dispDate: string;
  registration?: string;
  note?: string;
  customerName: string;
}

interface DispatchGroupCardProps {
  dispatch: DispatchGroup;
  items: CustomerDispatchItem[];
  onViewDetails?: () => void;
}

const DispatchGroupCardComponent: React.FC<DispatchGroupCardProps> = ({
  dispatch,
  items,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate totals - memoized
  const { totalQuantity, hasItems } = useMemo(() => ({
    totalQuantity: items.reduce((sum, item) => sum + item.disp_quantity, 0),
    hasItems: items.length > 0,
  }), [items]);

  return (
    <View style={styles.container}>
      {/* Orange Header Section */}
      <View style={styles.orangeHeader}>
        <View style={styles.headerContent}>
          {/* Left: Dispatch Number */}
          <View style={styles.dispatchNumberContainer}>
            <Icon name="package-variant" size={24} color={theme.colors.white} />
            <Text style={styles.dispatchNumber}>{dispatch.dispNo}</Text>
          </View>

          {/* Right: Registration and Date */}
          <View style={styles.headerRight}>
            {dispatch.registration && (
              <View style={styles.infoItem}>
                <Icon name="truck" size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.infoText}>{dispatch.registration}</Text>
              </View>
            )}
            <View style={styles.infoItem}>
              <Icon name="calendar" size={16} color="rgba(255,255,255,0.9)" />
              <Text style={styles.infoText}>
                {new Date(dispatch.dispDate).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Empty dispatch message */}
      {!hasItems && (
        <View style={styles.emptyDispatchContainer}>
          <Icon name="package-variant-closed" size={20} color={theme.colors.gray[400]} />
          <Text style={styles.emptyDispatchText}>No items in this dispatch</Text>
        </View>
      )}

      {/* Expanded Items Table - SAP Fiori Data Table */}
      {isExpanded && hasItems && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.expandedSection}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colItem]}>Item</Text>
            <Text style={[styles.tableHeaderCell, styles.colWeight]}>Kg</Text>
            <Text style={[styles.tableHeaderCell, styles.colGrn]}>GRN</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
          </View>

          {/* Table Rows */}
          {items.map((item, idx) => (
            <View
              key={`${dispatch.dispatchId}-item-${item.id}-${idx}`}
              style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
            >
              <View style={[styles.tableCell, styles.colItem]}>
                <View style={styles.itemNameRow}>
                  <Text style={styles.tableCellItemName} numberOfLines={1}>
                    {item.grnItems_item_name}
                  </Text>
                  {item.grnItems_rack && (
                    <Text style={styles.tableCellRack}>({item.grnItems_rack})</Text>
                  )}
                </View>
                {item.grnItems_package_mark && (
                  <Text style={styles.tableCellItemMark} numberOfLines={1}>
                    {item.grnItems_package_mark}
                  </Text>
                )}
              </View>
              <Text style={[styles.tableCell, styles.colWeight, styles.tableCellValue]}>
                {Math.round(item.grnItems_weight || 0)}
              </Text>
              <Text style={[styles.tableCell, styles.colGrn, styles.tableCellValue]}>
                {item.grns_gr_no}/{item.grnItems_quantity}
              </Text>
              <View style={[styles.tableCell, styles.colQty]}>
                <View style={styles.tableQtyBadge}>
                  <Text style={styles.tableQtyBadgeText}>{item.disp_quantity}</Text>
                </View>
              </View>
            </View>
          ))}
        </Animated.View>
      )}

      {/* Expand/Collapse Button */}
      {hasItems && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            Vibration.vibrate(5);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIsExpanded(prev => !prev);
          }}
          style={({ pressed }) => [styles.expandButton, pressed && styles.expandButtonPressed]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Hide items' : `Show ${items.length} items`}
        >
          <Text style={styles.expandButtonText}>
            {isExpanded ? 'Hide items' : `Show ${items.length} items`}
          </Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.primary}
          />
        </Pressable>
      )}

      {/* Dispatch Note (if exists) */}
      {dispatch.note && (
        <>
          <View style={styles.divider} />
          <View style={styles.noteContainer}>
            <Icon name="note-text" size={18} color={theme.colors.purple[800]} />
            <Text
              style={styles.noteText}
              numberOfLines={isExpanded ? undefined : 2}
              accessibilityLabel={`Note: ${dispatch.note}`}
            >
              {dispatch.note}
            </Text>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // Material Design 3 Card container
  container: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.lg,
    marginHorizontal: theme.spacing.lg,
    ...theme.shadows.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.gray[200],
  },
  // Orange Header Section
  orangeHeader: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dispatchNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dispatchNumber: {
    fontSize: 24,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  // Card Body Section
  cardBody: {
    padding: theme.spacing.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.gray[50],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.gray[600],
    fontWeight: theme.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricDivider: {
    height: 40,
    width: 1,
    backgroundColor: theme.colors.gray[300],
  },
  expandHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.lg,
    paddingVertical: theme.spacing.md + 2,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[200],
  },
  expandHintText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[700],
    fontWeight: theme.fontWeight.semibold,
  },
  emptyDispatchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.gray[50],
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[200],
  },
  emptyDispatchText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[500],
    fontWeight: theme.fontWeight.medium,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.gray[200],
  },
  // Material Design 3 Items Container
  itemsContainer: {
    backgroundColor: theme.colors.orange[200],
    paddingBottom: theme.spacing.md,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.lg,
    paddingVertical: theme.spacing.md + 2,
    backgroundColor: theme.colors.orange[200],
    borderTopWidth: 1,
    borderTopColor: theme.colors.orange[200],
  },
  itemsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  itemsHeaderText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[700],
  },
  totalQuantityBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  totalQuantityValue: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
    lineHeight: 30,
  },
  itemsHeaderDivider: {
    height: 2,
    backgroundColor: theme.colors.orange[300],
    marginHorizontal: theme.spacing.lg,
  },
  chevronIcon: {
    marginLeft: 'auto',
  },
  itemCard: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    gap: theme.spacing.sm,
  },
  itemCardLast: {
    marginBottom: theme.spacing.sm,
  },
  // Primary row: Item name + Quantity
  itemPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  itemNameContainer: {
    flex: 1,
  },
  itemName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
    lineHeight: 24,
  },
  quantityBadge: {
    backgroundColor: theme.colors.purple[800],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  itemQuantityBadge: {
    marginRight: -13,
  },
  quantityLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    opacity: 0.85,
  },
  quantityValue: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  // Secondary row: Weight, Rack, GRN
  itemSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  secondaryText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.gray[600],
    fontWeight: theme.fontWeight.medium,
  },
  secondaryDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.gray[400],
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.purple[800],
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  viewDetailsButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.white,
  },
  // Material Design 3 Note Container
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: 10,
    backgroundColor: theme.colors.orange[200],
  },
  noteText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[700],
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // =========================================================================
  // SAP Fiori Data Table Styles
  // Spec: design/sap-fiori-specs/20-data-table.md
  // =========================================================================
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.fiori.objectCell.divider,
  },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.gray[50],
    paddingVertical: 8, // 8pt vertical
    paddingHorizontal: 12, // 12pt horizontal
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.fiori.objectCell.divider,
    minHeight: 44, // Fiori spec: 44pt min touch target
    alignItems: 'center',
  },

  tableHeaderCell: {
    fontSize: 13, // Fiori spec: 13pt Semibold
    fontWeight: '600',
    color: theme.colors.fiori.text.primary,
    letterSpacing: 0.3,
  },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8, // 8pt vertical
    paddingHorizontal: 12, // 12pt horizontal
    minHeight: 44, // Fiori spec: 44pt min, 48-56pt comfortable
    backgroundColor: theme.colors.white,
  },

  tableRowAlt: {
    backgroundColor: theme.colors.gray[50],
  },

  tableCell: {
    justifyContent: 'center',
  },

  colItem: {
    flex: 1,
    paddingRight: 8,
  },

  colWeight: {
    width: 36,
    textAlign: 'right',
    paddingRight: 12,
  },

  colGrn: {
    width: 96,
    textAlign: 'center',
    paddingRight: 8,
  },

  colQty: {
    width: 44,
    alignItems: 'flex-end',
  },

  tableCellValue: {
    fontSize: 15, // Fiori spec: 15pt Regular for data
    fontWeight: '400',
    color: theme.colors.fiori.text.secondary,
  },

  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  tableCellItemName: {
    fontSize: 15, // Fiori spec: 15pt Regular for data
    color: theme.colors.fiori.text.primary,
    fontWeight: '500',
    flex: 1,
  },

  tableCellRack: {
    fontSize: 11,
    color: theme.colors.gray[400],
    fontWeight: '400',
    flexShrink: 0,
  },

  tableCellItemMark: {
    fontSize: 11,
    color: theme.colors.gray[400],
    marginTop: 2,
  },

  tableQtyBadge: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: colors.statusPositive, // Green to match header qty
  },

  tableQtyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.white,
  },

  // Expand/Collapse Button (SAP Fiori style)
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.fiori.objectCell.divider,
    gap: 4,
    minHeight: 48,
    backgroundColor: theme.colors.white,
  },

  expandButtonPressed: {
    backgroundColor: theme.colors.gray[50],
  },

  expandButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.primary,
  },
});

// Export memoized component for performance
const DispatchGroupCard = React.memo(DispatchGroupCardComponent);
export default DispatchGroupCard;
