import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { Order } from '@/types/order.types';

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
  // Theme colors for dark mode support
  const colors = useListColors();
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

  const lastUpdated = order.updated_at || order.created_at;
  const now = new Date();
  const lastUpdatedDate = new Date(lastUpdated);
  const diffMs = now.getTime() - lastUpdatedDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  // Format relative time
  let timeAgo = '';
  if (diffMins < 1) {
    timeAgo = 'just now';
  } else if (diffMins < 60) {
    timeAgo = `${diffMins}m ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    timeAgo = `${diffHours}h ago`;
  }

  return (
    <View
      style={[
        styles.toolbar,
        {
          paddingBottom: Math.min(insets.bottom, 8) || 4,
          backgroundColor: colors.cellBackground,
          borderTopColor: colors.cellDivider,
        },
      ]}
    >
      {/* Left: Auto-save status */}
      <View style={styles.helperSection}>
        <Icon name="check-circle" size={12} color={colors.success} />
        <Text style={[styles.helperText, { color: colors.textSecondary }]} numberOfLines={1}>
          {timeAgo}{(order.updated_by_display_name || order.updated_by_name) ? ` · ${order.updated_by_display_name || order.updated_by_name}` : ''}
        </Text>
      </View>

      {/* Right: Compact metrics - using active (non-fulfilled) counts */}
      <View style={styles.metricsSection}>
        <Icon name="package-variant" size={14} color={colors.primary} />
        <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{activeItemCount}</Text>
        <View style={[styles.divider, { backgroundColor: colors.gray300 }]} />
        <Icon name="counter" size={14} color={colors.success} />
        <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{activeQuantity}</Text>
      </View>
    </View>
  );
};

// ============================================================================
// STYLES - SAP Fiori Toolbar Compliant
// ============================================================================

const styles = StyleSheet.create({
  // Toolbar Container - Fiori spec: 56pt height (compact), fixed at bottom
  toolbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44, // Fiori minimum touch target
    paddingHorizontal: 16, // Fiori horizontal padding
    paddingTop: 8, // Fiori vertical padding
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
  },
  // Helper Text Section - Fiori spec: left-aligned status info
  helperSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  // Helper Text - Fiori spec: 13pt
  helperText: {
    fontSize: 13, // Fiori helper text font size
    fontWeight: '400',
  },
  // Metrics Section - Fiori attribute display
  metricsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Metric Value - Fiori spec: 15pt semibold
  metricValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 16,
  },
});

export default CustomerOrderSummary;