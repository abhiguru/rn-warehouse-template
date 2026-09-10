/**
 * MemoizedOrderItem - Optimized Order Card Component
 *
 * 2025 Best Practices Implementation:
 * - React.memo with custom areEqual comparison
 * - Stable callbacks via props (no inline functions)
 * - Minimal re-renders through prop comparison
 * - SAP Fiori design compliance
 *
 * @module list-items/MemoizedOrderItem
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatNumber, formatRelativeTime } from '@/utils/formatters';
import type { Order } from '@/types/order.types';
import type { ListColors } from '@/hooks/useListColors';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoizedOrderItemProps {
  /** Order data to render */
  order: Order;
  /** Callback when item is pressed */
  onPress: (order: Order) => void;
  /** Callback for view details action */
  onViewDetails?: (order: Order) => void;
  /** Callback for convert to dispatch action */
  onConvertToDispatch?: (order: Order) => void;
  /** Theme-aware list colors for dark mode support */
  colors: ListColors;
}

// ============================================================================
// COMPONENT
// ============================================================================

const OrderItemContent: React.FC<MemoizedOrderItemProps> = ({
  order,
  onPress,
  colors,
}) => {
  // Calculate totals - handle both legacy and new field names
  const itemCount = order.item_count ?? order.total_items ?? order.items?.length ?? 0;
  const totalQty = order.quantity_sum ?? order.total_quantity ?? 0;
  const hasItems = itemCount > 0;

  // Customer initials for avatar
  const customerName = order.customer?.name || 'Unknown';
  const initials = customerName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Check if order is dispatched
  const isDispatched = (order.status || '').toUpperCase() === 'DISPATCHED';

  // Status config - includes dispatched state
  const statusConfig = isDispatched
    ? { color: colors.statusNeutral, bgColor: colors.statusNeutralLight, label: 'Dispatched' }
    : hasItems
      ? { color: colors.statusPositive, bgColor: colors.statusPositiveLight, label: 'Active' }
      : { color: colors.statusNone, bgColor: colors.statusNoneLight, label: 'Empty' };

  // Build subtitle: "3 items • 45 units" or "No items"
  const subtitle = hasItems
    ? `${formatNumber(itemCount)} item${itemCount !== 1 ? 's' : ''} · ${formatNumber(totalQty)} unit${totalQty !== 1 ? 's' : ''}`
    : 'No items yet';

  // Build footnote: "Mumbai · 2h ago" or just "2h ago"
  const timeText = order.updated_at ? formatRelativeTime(order.updated_at) : 'Recently';
  const footnote = order.customer?.city
    ? `${order.customer.city} · ${timeText}`
    : timeText;

  // Accessibility
  const accessibilityDescription = [
    `Order for ${customerName}`,
    statusConfig.label,
    subtitle,
    order.customer?.city ? `Location: ${order.customer.city}` : null,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={() => onPress(order)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.cellBackground },
        pressed && { backgroundColor: colors.cellBackgroundPressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityDescription}
      accessibilityHint="Double tap to view order details"
    >
      {/* SAP Fiori Object Cell Layout */}
      <View style={styles.objectCellRow}>
        {/* Detail Image: Customer Avatar (44pt) */}
        <View style={[styles.avatar, { backgroundColor: hasItems ? colors.primaryLight : colors.gray100 }]}>
          <Text style={[styles.avatarText, { color: hasItems ? colors.primary : colors.textTertiary }]}>
            {initials}
          </Text>
        </View>

        {/* Main Content: Title + Subtitle + Footnote */}
        <View style={styles.mainContent}>
          {/* Title - 17pt semibold */}
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {customerName}
          </Text>

          {/* Subtitle - 15pt regular */}
          <Text style={[styles.subtitle, { color: hasItems ? colors.textSecondary : colors.textTertiary }]}>
            {subtitle}
          </Text>

          {/* Footnote - 13pt */}
          <Text style={[styles.footnote, { color: colors.textTertiary }]} numberOfLines={1}>
            {footnote}
          </Text>
        </View>

        {/* Attribute: Status Badge + Chevron */}
        <View style={styles.attributeArea}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={colors.gray400} />
        </View>
      </View>

      {/* Description: Note (if exists) */}
      {order.note && (
        <View style={[styles.noteContainer, { backgroundColor: colors.gray50, borderTopColor: colors.cellDivider }]}>
          <Icon name="note-text-outline" size={14} color={colors.textTertiary} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]} numberOfLines={1}>
            {order.note}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

// Custom comparison function for React.memo
// areEqual already covers all fields that affect rendering — no refreshKey needed.
const areEqual = (
  prevProps: MemoizedOrderItemProps,
  nextProps: MemoizedOrderItemProps
): boolean => {
  const prevOrder = prevProps.order;
  const nextOrder = nextProps.order;

  const result = (
    prevOrder.id === nextOrder.id &&
    prevOrder.customer_id === nextOrder.customer_id &&
    prevOrder.customer?.name === nextOrder.customer?.name &&
    prevOrder.customer?.city === nextOrder.customer?.city &&
    (prevOrder.item_count ?? prevOrder.total_items) === (nextOrder.item_count ?? nextOrder.total_items) &&
    (prevOrder.quantity_sum ?? prevOrder.total_quantity) === (nextOrder.quantity_sum ?? nextOrder.total_quantity) &&
    prevOrder.status === nextOrder.status &&
    prevOrder.updated_at === nextOrder.updated_at &&
    prevOrder.updated_by_display_name === nextOrder.updated_by_display_name &&
    prevOrder.note === nextOrder.note &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.colors === nextProps.colors
  );

  if (__DEV__ && !result) {
    console.log('[MemoizedOrderItem] re-rendering:', nextOrder.customer?.name);
  }

  return result;
};

/**
 * Memoized Order Item Component
 *
 * Uses React.memo with custom comparison to prevent unnecessary re-renders.
 * Only re-renders when order data or callbacks actually change.
 */
export const MemoizedOrderItem = React.memo(OrderItemContent, areEqual);

MemoizedOrderItem.displayName = 'MemoizedOrderItem';

// ============================================================================
// STYLES - SAP Fiori Object Cell (01-object-cell.md)
// ============================================================================

const styles = StyleSheet.create({
  // Object Cell Container - Fiori card style
  card: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12, // Fiori card corner radius
    overflow: 'hidden',
  },

  // Object Cell Row - Fiori spec: horizontal layout
  objectCellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 72, // Fiori object cell min height
  },

  // Detail Image: Avatar - Fiori spec: 44pt circular
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '600',
  },

  // Main Content - Fiori spec: Title + Subtitle + Footnote
  mainContent: {
    flex: 1,
    marginRight: 8,
  },

  // Title - Fiori spec: 17pt semibold
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
    marginBottom: 2,
  },

  // Subtitle - Fiori spec: 15pt regular
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    marginBottom: 2,
  },

  // Footnote - Fiori spec: 13pt
  footnote: {
    fontSize: 13,
    fontWeight: '400',
  },

  // Attribute Area (Right) - Fiori spec: status + navigation
  attributeArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Status Badge - Fiori spec: 20pt compact tag
  statusBadge: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Description/Note - Fiori spec: bottom section
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
  },
});

export default MemoizedOrderItem;
