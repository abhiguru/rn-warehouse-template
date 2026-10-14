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
 * SAP Fiori object cell (docs/STYLE_GUIDE.md §13.6).
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
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatDate, formatCount, formatNumber, formatWeightEach } from '@/utils/formatters';
import { t as translate, formatIdentifier } from '@/i18n';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';
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
import { StatusTag } from '@/components/ui/StatusTag';

// ============================================================================
// TYPES
// ============================================================================

export interface RecentDispatchedOrderCardProps {
  /** Dispatch data to render */
  dispatch: RecentDispatchedOrder;
  /** Callback when card is pressed (navigates to dispatch details) */
  onPress: (dispatch: RecentDispatchedOrder) => void;
}

// ============================================================================
// STYLES - SAP Fiori Object Cell
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.xs,
    ...t.shadow[2],
    overflow: 'hidden' as const,
  },
  cardContent: {
    padding: space.lg,
    minHeight: layout.objectCellMinHeight,
    backgroundColor: t.surface.card,
  },
  cardContentPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  objectCellRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
  },
  iconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
    backgroundColor: t.brand.subtle,
  },
  mainContent: {
    flex: 1,
    marginRight: space.md,
  },
  titleText: {
    ...typography.headline,
    color: t.text.primary,
  },
  subtitleText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  orderRefRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    marginBottom: space.xs,
  },
  orderRefText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    columnGap: space.sm,
    rowGap: space.xxs,
  },
  footerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  attributeStack: {
    alignItems: 'flex-end' as const,
    minWidth: 60,
    gap: space.xxs,
  },
  quantityValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  itemCountText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  statusTag: {
    marginTop: space.xs,
  },
  // Data table (guide §13.7)
  expandedSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  tableHeader: {
    flexDirection: 'row' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
    minHeight: layout.rowMinHeight,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  tableHeaderCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  // A row grows with its item cell (a two-line name, the rack, the mark); the
  // cells beside it are centred on it, as on the GRN list.
  tableRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
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
  // Wide enough for its heading on one line at font scales 1.0 and 1.3, "Kg each" and
  // the Gujarati "દરેકના kg" (72 dp to write in, as on the GRN list: padding inside the
  // column left 64 dp, and the Gujarati heading wrapped); the number under it is the
  // weight of one bag. The GRN cell beside it is centred, so the two stay apart.
  colWeight: {
    width: 72,
    textAlign: 'right' as const,
  },
  // As wide as on the dispatch card. At 60 dp (52 to write in) "RV15001" needs
  // about 77 dp at font scale 1.3, more than shrinking to 0.7 could make room
  // for; here it has 92 dp, and at larger text it wraps rather than being cut.
  // GRN numbers keep the digits 0-9 in Gujarati too.
  colGrn: {
    width: 96,
    textAlign: 'center' as const,
    paddingRight: space.xs,
  },
  colQty: {
    width: 48,
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
  // The item cell is a column: the name (up to two lines), then the rack on its
  // own line, then the mark. The rack never shares the name's line: beside it,
  // the name was drawn as one letter at large text sizes. A long rack wraps.
  tableCellItemName: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
  },
  tableCellRack: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  tableCellItemMark: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
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

// ============================================================================
// COMPONENT
// ============================================================================

const RecentDispatchedOrderCardContent: React.FC<RecentDispatchedOrderCardProps> = ({
  dispatch,
  onPress,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [isExpanded, setIsExpanded] = useState(false);

  const hasItems = dispatch.items && dispatch.items.length > 0;
  const itemCount = dispatch.item_count || dispatch.items?.length || 0;
  const itemsLabel = formatCount(itemCount, 'item');
  const bagsLabel = formatCount(dispatch.total_qty, 'bag');
  const dateLabel = formatDate(dispatch.disp_date, 'short');

  const handleToggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

  // One combined label for the row (guide §11.3)
  const accessibilityDescription = [
    translate('lists.dispatch.cardTitle', { number: formatIdentifier(dispatch.disp_no) }),
    dispatch.customer_name,
    translate('lists.recent.fromOrder', { number: formatIdentifier(dispatch.order_no) }),
    itemsLabel,
    bagsLabel,
    dispatch.registration ? translate('lists.card.vehicle', { number: formatIdentifier(dispatch.registration) }) : null,
    translate('lists.recent.createdBy', { name: dispatch.created_by_name }),
    dateLabel,
    translate('lists.order.statusDispatched'),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onPress(dispatch)}
        style={({ pressed }) => [styles.cardContent, pressed && styles.cardContentPressed]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityDescription}
        accessibilityHint={translate('lists.dispatch.openHint')}
      >
        <View style={styles.objectCellRow}>
          {/* Object icon (left) */}
          <View style={styles.iconContainer}>
            <Icon name="truck-delivery-outline" size={iconSize.md} color={t.brand.tint} />
          </View>

          {/* Main content */}
          <View style={styles.mainContent}>
            <Text style={styles.titleText} numberOfLines={2}>
              {translate('lists.dispatch.cardTitle', { number: formatIdentifier(dispatch.disp_no) })}
            </Text>
            <Text style={styles.subtitleText} numberOfLines={1}>
              {dispatch.customer_name}
            </Text>

            {/* Order reference */}
            <View style={styles.orderRefRow}>
              <Icon name="clipboard-list-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.orderRefText} numberOfLines={1}>
                {translate('lists.recent.orderRef', { number: formatIdentifier(dispatch.order_no) })}
              </Text>
            </View>

            {/* Footnote: date, vehicle, created by */}
            <View style={styles.footerRow}>
              <View style={styles.footerItem}>
                <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.footerText}>{dateLabel}</Text>
              </View>
              {dispatch.registration && (
                <View style={styles.footerItem}>
                  <Icon name="truck-outline" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.footerText}>{dispatch.registration}</Text>
                </View>
              )}
              <View style={styles.footerItem}>
                <Icon name="account-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.footerText} numberOfLines={1}>
                  {dispatch.created_by_name}
                </Text>
              </View>
            </View>
          </View>

          {/* Attribute stack (right): main value, item count, status tag */}
          <View style={styles.attributeStack}>
            <Text style={styles.quantityValue}>{bagsLabel}</Text>
            <Text style={styles.itemCountText}>{itemsLabel}</Text>
            <StatusTag status="positive" label={translate('lists.order.statusDispatched')} style={styles.statusTag} />
          </View>
        </View>
      </Pressable>

      {/* Expanded Items Table */}
      {isExpanded && hasItems && (
        <Animated.View entering={FadeIn.duration(motion.standard)} style={styles.expandedSection}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colItem]}>{translate('common.item')}</Text>
            <Text style={[styles.tableHeaderCell, styles.colWeight]}>{translate('lists.card.colKgEach')}</Text>
            <Text style={[styles.tableHeaderCell, styles.colGrn]}>{translate('lists.card.colGrn')}</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>{translate('lists.card.colQty')}</Text>
          </View>

          {dispatch.items.map((item, idx) => {
            // Whole kilograms of one bag, as the column shows them. A lot without a
            // weight shows a dash and is read without one.
            const kg = Math.round(Number(item.weight) || 0);
            const weightEach = formatWeightEach(kg);
            return (
              <View
                key={`${dispatch.dispatch_id}-item-${idx}`}
                style={[styles.tableRow, idx > 0 && styles.tableRowDivider]}
                accessible
                accessibilityLabel={
                  weightEach === null
                    ? translate(item.rack ? 'dispatch.listRow.noWeightRack' : 'dispatch.listRow.noWeight', {
                      item: item.item_name,
                      rack: item.rack,
                      grn: formatIdentifier(item.gr_no),
                      quantity: item.disp_qty,
                    })
                    : translate(item.rack ? 'lists.dispatch.itemRowRack' : 'lists.dispatch.itemRow', {
                      item: item.item_name,
                      rack: item.rack,
                      weight: weightEach,
                      grn: formatIdentifier(item.gr_no),
                      quantity: item.disp_qty,
                    })
                }
              >
                <View style={[styles.tableCell, styles.colItem]}>
                  <Text style={styles.tableCellItemName} numberOfLines={2} ellipsizeMode="tail">
                    {item.item_name}
                  </Text>
                  {item.rack ? <Text style={styles.tableCellRack}>({item.rack})</Text> : null}
                  {item.package_mark ? (
                    <Text style={styles.tableCellItemMark} numberOfLines={1}>
                      {item.package_mark}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.tableCell, styles.colWeight, styles.tableCellValue]}>
                  {weightEach === null ? '—' : formatNumber(kg)}
                </Text>
                <Text style={[styles.tableCell, styles.colGrn, styles.tableCellValue]}>
                  {item.gr_no}
                </Text>
                <Text style={[styles.tableCell, styles.colQty, styles.tableCellQty]}>
                  {formatNumber(item.disp_qty)}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      )}

      {/* Expand/Collapse Button */}
      {hasItems && (
        <Pressable
          onPress={handleToggleExpand}
          style={({ pressed }) => [styles.expandButton, pressed && styles.expandButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? translate('lists.recent.hideItems') : translate('lists.recent.showItems', { items: itemsLabel })}
          accessibilityState={{ expanded: isExpanded }}
        >
          <Text style={styles.expandButtonText}>
            {isExpanded ? translate('lists.recent.hideItems') : translate('lists.recent.showItems', { items: itemsLabel })}
          </Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={t.brand.tint}
          />
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
    // Drawn on the card but not part of any total above.
    prevDispatch.created_by_name === nextDispatch.created_by_name &&
    prevDispatch.items === nextDispatch.items &&
    prevProps.onPress === nextProps.onPress
  );
};

/**
 * Memoized Recent Dispatched Order Card
 */
export const RecentDispatchedOrderCard = React.memo(RecentDispatchedOrderCardContent, areEqual);

RecentDispatchedOrderCard.displayName = 'RecentDispatchedOrderCard';

export default RecentDispatchedOrderCard;
