/**
 * GRNItemDispatchTable Component
 *
 * Collapsible accordion section for one GRN item's dispatches
 * with a SAP Fiori data table inside (docs/STYLE_GUIDE.md §13.7).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { DispatchRecord } from '@/services/grn-detail-service';
import { GRNItem } from './GRNItemsTab';
import { formatCount, formatDate, formatNumber, formatWeight } from '@/utils/formatters';
import { t as tr } from '@/i18n';

interface GRNItemDispatchTableProps {
  item: GRNItem;
  dispatches: DispatchRecord[];
  defaultExpanded?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginBottom: space.sm,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    backgroundColor: t.surface.card,
    minHeight: 56,
  },
  headerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  itemInfo: {
    flex: 1,
    marginLeft: space.sm,
  },
  itemName: {
    ...typography.headline,
    color: t.text.primary,
  },
  itemMeta: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  metaText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  headerRight: {
    alignItems: 'flex-end' as const,
    marginLeft: space.md,
    gap: space.xxs,
  },
  totalText: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  dispatchCount: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  content: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  emptyState: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.xxl,
    gap: space.sm,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  tableHeader: {
    flexDirection: 'row' as const,
    backgroundColor: t.background.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
    minHeight: layout.rowMinHeight,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
  },
  headerCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  tableRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    minHeight: layout.rowMinHeight,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
    backgroundColor: t.surface.card,
  },
  tableRowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  dataCell: {
    ...typography.subhead,
    color: t.text.primary,
  },
  dispNoCell: {
    flex: 1,
    color: t.brand.tint,
  },
  dateCell: {
    width: 100,
    textAlign: 'left' as const,
  },
  qtyCell: {
    width: 56,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
});

export const GRNItemDispatchTable: React.FC<GRNItemDispatchTableProps> = ({
  item,
  dispatches,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const handleDispatchPress = (dispatch: DispatchRecord) => {
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  };

  // Calculate totals
  const totalDispatched = dispatches.reduce((sum, d) => sum + d.disp_quantity, 0);
  const totalQty = item.qty || 0;
  const countLabel = formatCount(dispatches.length, 'dispatch', 'dispatches');

  return (
    <View style={styles.container}>
      {/* Accordion Header */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={tr('grn.dispatches.itemSummaryLabel', { item: item.item_name, dispatched: totalDispatched, total: totalQty, dispatches: countLabel })}
        accessibilityState={{ expanded }}
      >
        <View style={styles.headerLeft}>
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={iconSize.lg}
            color={t.icon.secondary}
          />
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.item_name}
            </Text>
            <View style={styles.itemMeta}>
              {item.package_mark && (
                <Text style={styles.metaText}>{item.package_mark}</Text>
              )}
              {item.weight && (
                <Text style={styles.metaText}>{formatWeight(item.weight)}</Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.totalText}>
            {tr('grn.dispatches.dispatchedOfTotal', { dispatched: totalDispatched, total: totalQty })}
          </Text>
          <Text style={styles.dispatchCount}>{countLabel}</Text>
        </View>
      </Pressable>

      {/* Expandable Content */}
      {expanded && (
        <View style={styles.content}>
          {dispatches.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon
                name="truck-delivery-outline"
                size={iconSize.xl}
                color={t.icon.secondary}
              />
              <Text style={styles.emptyText}>{tr('grn.dispatches.itemNotDispatched')}</Text>
            </View>
          ) : (
            <View>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, styles.dispNoCell, { color: t.text.secondary }]}>
                  {tr('common.dispatch')}
                </Text>
                <Text style={[styles.headerCell, styles.dateCell]}>{tr('common.date')}</Text>
                <Text style={[styles.headerCell, styles.qtyCell]}>{tr('common.bags')}</Text>
              </View>

              {/* Table Rows */}
              {dispatches.map((dispatch) => (
                <Pressable
                  key={dispatch.id}
                  style={({ pressed }) => [styles.tableRow, pressed && styles.tableRowPressed]}
                  onPress={() => handleDispatchPress(dispatch)}
                  accessibilityRole="button"
                  accessibilityLabel={tr('grn.dispatches.rowLabelDateFirst', { number: String(dispatch.disp_no), date: formatDate(dispatch.disp_date, 'short'), bags: formatCount(dispatch.disp_quantity, 'bag') })}
                  accessibilityHint={tr('grn.dispatches.openHint')}
                >
                  <Text style={[styles.dataCell, styles.dispNoCell]}>
                    {dispatch.disp_no}
                  </Text>
                  <Text style={[styles.dataCell, styles.dateCell]}>
                    {formatDate(dispatch.disp_date, 'short')}
                  </Text>
                  <Text style={[styles.dataCell, styles.qtyCell]}>
                    {formatNumber(dispatch.disp_quantity)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default GRNItemDispatchTable;
