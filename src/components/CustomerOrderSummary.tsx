import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Order } from '@/types/order.types';
import { formatCount, formatRelativeTime } from '@/utils/formatters';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { t as tr } from '@/i18n';

interface CustomerOrderSummaryProps {
  order: Order;
}

/**
 * CustomerOrderSummary - Compact Fiori Toolbar Style
 *
 * Per SAP Fiori Toolbar spec (17-toolbar.md):
 * - Toolbar height: 56pt compact
 * - Helper text on left for status info
 * - Content aligned and scannable
 * - Fixed at bottom, doesn't scroll
 */
const CustomerOrderSummary: React.FC<CustomerOrderSummaryProps> = ({ order }) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  // Filter out fulfilled items for accurate counts
  const activeItems = (order.items || []).filter(
    item => (item.item_status || '').toLowerCase() !== 'fulfilled'
  );
  const activeItemCount = activeItems.length;
  const activeQuantity = activeItems.reduce(
    (sum, item) => sum + (item.requested_quantity || 0),
    0
  );

  // Debug logging for timestamp issue
  if (__DEV__) {
    console.log('[CustomerOrderSummary] Order timestamp debug:', {
      order_id: order.id,
      updated_at: order.updated_at,
      created_at: order.created_at,
      updated_by: order.updated_by_display_name || order.updated_by_name,
      total_items: order.total_items,
      active_items: activeItemCount,
      active_quantity: activeQuantity,
    });
  }

  // Relative time under 24 hours, then the date (style guide §12.3)
  const relative = formatRelativeTime(order.updated_at || order.created_at);
  const timeAgo = relative === 'Just now' ? 'just now' : relative;
  const updatedBy = order.updated_by_display_name || order.updated_by_name;
  const savedText = updatedBy
    ? tr('components.orderSummary.savedBy', { time: timeAgo, name: updatedBy })
    : tr('components.orderSummary.saved', { time: timeAgo });
  const itemsText = formatCount(activeItemCount, 'item');
  // Units differ per item, so the total stays in plain "units"
  const quantityText = formatCount(activeQuantity, 'unit');

  return (
    <View
      style={[styles.toolbar, { paddingBottom: Math.min(insets.bottom, space.sm) || space.xs }]}
      accessible
      accessibilityLabel={`${savedText}. ${itemsText}, ${quantityText}`}
    >
      {/* Left: Auto-save status */}
      <View style={styles.helperSection}>
        <Icon name="check-circle" size={iconSize.sm} color={t.status.positive.text} />
        <Text style={styles.helperText} numberOfLines={1}>
          {savedText}
        </Text>
      </View>

      {/* Right: Compact metrics - using active (non-fulfilled) counts */}
      <View style={styles.metricsSection}>
        <Icon name="package-variant" size={iconSize.sm} color={t.icon.secondary} />
        <Text style={styles.metricValue}>{itemsText}</Text>
        <View style={styles.divider} />
        <Icon name="counter" size={iconSize.sm} color={t.icon.secondary} />
        <Text style={styles.metricValue}>{quantityText}</Text>
      </View>
    </View>
  );
};

// ============================================================================
// STYLES - SAP Fiori Toolbar
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  // Toolbar container, fixed at the bottom
  toolbar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
    backgroundColor: t.surface.card,
    zIndex: 100,
  },
  // Helper text section: left-aligned status info
  helperSection: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
    flex: 1,
    marginRight: space.sm,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    flexShrink: 1,
  },
  // Metrics section
  metricsSection: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  metricValue: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: space.lg,
    marginHorizontal: space.xs,
    backgroundColor: t.border.separator,
  },
});

export default CustomerOrderSummary;