import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Vibration,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  motion,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { CustomerDispatchItem } from '@/types/order.types';
import { formatCount, formatDate, formatWeight } from '@/utils/formatters';

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

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginBottom: space.sm,
    marginHorizontal: space.lg,
    ...t.shadow[2],
    overflow: 'hidden' as const,
  },
  // Header on surface.card (guide 13.6 / 13.8: cards never get a brand-filled header)
  header: {
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerContent: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  dispatchNumberContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 1,
  },
  dispatchNumber: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  headerRight: {
    alignItems: 'flex-end' as const,
    gap: space.xs,
  },
  infoItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  infoText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  emptyDispatchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingVertical: space.lg,
    backgroundColor: t.background.base,
  },
  emptyDispatchText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
  },
  noteContainer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  noteText: {
    ...typography.subhead,
    flex: 1,
    color: t.text.primary,
  },
  // Data table (guide 13.7)
  tableHeader: {
    flexDirection: 'row' as const,
    backgroundColor: t.background.base,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
    minHeight: layout.rowMinHeight,
    alignItems: 'center' as const,
  },
  tableHeaderCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  tableRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minHeight: layout.rowMinHeight,
    backgroundColor: t.surface.card,
  },
  tableRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  tableCell: {
    justifyContent: 'center' as const,
  },
  colItem: {
    flex: 1,
    paddingRight: space.sm,
  },
  colWeight: {
    width: 48,
    textAlign: 'right' as const,
    paddingRight: space.md,
  },
  colGrn: {
    width: 96,
    textAlign: 'center' as const,
    paddingRight: space.sm,
  },
  colQty: {
    width: 44,
    textAlign: 'right' as const,
  },
  tableCellValue: {
    ...typography.subhead,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  tableCellQty: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  itemNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  tableCellItemName: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    flex: 1,
  },
  tableCellRack: {
    ...typography.caption1,
    color: t.text.secondary,
    flexShrink: 0,
  },
  tableCellItemMark: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  // Expand/collapse (tertiary action row)
  expandButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.xs,
    minHeight: touchTarget,
    backgroundColor: t.surface.card,
  },
  expandButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  expandButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
});

const DispatchGroupCardComponent: React.FC<DispatchGroupCardProps> = ({
  dispatch,
  items,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const hasItems = useMemo(() => items.length > 0, [items]);

  const formattedDate = formatDate(dispatch.dispDate, 'short');
  const itemCountLabel = formatCount(items.length, 'item');

  return (
    <View style={styles.container}>
      {/* Header on surface.card */}
      <View
        style={styles.header}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`Dispatch ${dispatch.dispNo}${dispatch.registration ? `, vehicle ${dispatch.registration}` : ''}, ${formattedDate}`}
      >
        <View style={styles.headerContent}>
          {/* Left: Dispatch Number */}
          <View style={styles.dispatchNumberContainer}>
            <Icon name="truck-delivery-outline" size={iconSize.lg} color={t.brand.tint} />
            <Text style={styles.dispatchNumber}>{dispatch.dispNo}</Text>
          </View>

          {/* Right: Registration and Date */}
          <View style={styles.headerRight}>
            {dispatch.registration && (
              <View style={styles.infoItem}>
                <Icon name="truck-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.infoText}>{dispatch.registration}</Text>
              </View>
            )}
            <View style={styles.infoItem}>
              <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.infoText}>{formattedDate}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Empty dispatch message */}
      {!hasItems && (
        <View style={styles.emptyDispatchContainer}>
          <Icon name="package-variant-closed" size={iconSize.md} color={t.icon.secondary} />
          <Text style={styles.emptyDispatchText}>No items in this dispatch</Text>
        </View>
      )}

      {/* Expanded Items Table - SAP Fiori Data Table */}
      {isExpanded && hasItems && (
        <Animated.View entering={FadeIn.duration(motion.standard)}>
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
              style={[styles.tableRow, idx > 0 && styles.tableRowDivider]}
              accessible
              accessibilityLabel={`${item.grnItems_item_name}${item.grnItems_rack ? `, rack ${item.grnItems_rack}` : ''}, ${formatWeight(item.grnItems_weight, 0)}, GRN ${item.grns_gr_no}, ${item.disp_quantity} dispatched`}
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
              <Text style={[styles.tableCell, styles.colQty, styles.tableCellQty]}>
                {item.disp_quantity}
              </Text>
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
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Hide items' : `Show ${itemCountLabel}`}
          accessibilityState={{ expanded: isExpanded }}
        >
          <Text style={styles.expandButtonText}>
            {isExpanded ? 'Hide items' : `Show ${itemCountLabel}`}
          </Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={t.brand.tint}
          />
        </Pressable>
      )}

      {/* Dispatch Note (if exists) */}
      {dispatch.note && (
        <>
          <View style={styles.divider} />
          <View style={styles.noteContainer}>
            <Icon name="note-text-outline" size={iconSize.md} color={t.icon.secondary} />
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

// Export memoized component for performance
const DispatchGroupCard = React.memo(DispatchGroupCardComponent);
export default DispatchGroupCard;
