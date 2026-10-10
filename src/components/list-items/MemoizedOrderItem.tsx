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
import { formatCount, formatRelativeTime } from '@/utils/formatters';
import { t as translate, formatIdentifier } from '@/i18n';
import { StatusTag, type StatusKind, Avatar } from '@/components/ui';
import type { Order } from '@/types/order.types';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

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
  /** Lower-cased search words to show in bold (see `searchWords`). */
  words?: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

/** Where a search matched inside the order: city, or the item, package or GRN number of a line. */
function hiddenMatches(order: Order, words: string[] | undefined): string[] {
  if (!words || words.length === 0) return [];
  const found = new Set<string>();
  const lines = (order.items ?? []) as unknown as Record<string, string | null | undefined>[];
  for (const text of [order.customer?.city]) {
    if (text && matchesAnyWord(text, words)) found.add(text);
  }
  for (const line of lines) {
    for (const text of [line.grn_items_item_name, line.grn_items_package_mark, line.grns_gr_no ? translate('lists.card.grnRef', { number: formatIdentifier(line.grns_gr_no) }) : null]) {
      if (text && matchesAnyWord(text, words)) found.add(text);
    }
  }
  return [...found].slice(0, 3);
}

const OrderItemContent: React.FC<MemoizedOrderItemProps> = ({
  order,
  onPress,
  words,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // Calculate totals - handle both legacy and new field names
  const itemCount = order.item_count ?? order.total_items ?? order.items?.length ?? 0;
  const totalQty = order.quantity_sum ?? order.total_quantity ?? 0;
  const hasItems = itemCount > 0;

  const customerName = order.customer?.name || translate('common.unknown');
  const matched = hiddenMatches(order, words);

  // Check if order is dispatched
  const isDispatched = (order.status || '').toUpperCase() === 'DISPATCHED';

  // Status per style guide §3.5: dispatched orders are positive, open ones neutral.
  const statusConfig: { kind: StatusKind; label: string } = isDispatched
    ? { kind: 'positive', label: translate('lists.order.statusDispatched') }
    : hasItems
      ? { kind: 'neutral', label: translate('lists.order.statusOpen') }
      : { kind: 'neutral', label: translate('lists.order.statusEmpty') };

  // Build subtitle: "3 items · 45 units" (the unit differs per item, so "units") or "No items yet"
  const subtitle = hasItems
    ? translate('lists.order.summary', { items: formatCount(itemCount, 'item'), units: formatCount(totalQty, 'unit') })
    : translate('lists.order.noItemsYet');

  // Build footnote: "Mumbai · 2h ago" or just "2h ago"
  const timeText = order.updated_at ? formatRelativeTime(order.updated_at) : translate('lists.order.recently');
  const footnote = order.customer?.city
    ? `${order.customer.city} · ${timeText}`
    : timeText;

  // Accessibility
  const accessibilityDescription = [
    translate('lists.order.orderFor', { customer: customerName }),
    statusConfig.label,
    subtitle,
    order.customer?.city ? translate('lists.order.location', { city: order.customer.city }) : null,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={() => onPress(order)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityDescription}
      accessibilityHint={translate('lists.order.openHint')}
    >
      {/* SAP Fiori Object Cell Layout */}
      <View style={styles.objectCellRow}>
        {/* Detail Image: Customer Avatar (44pt) */}
        <Avatar name={customerName} id={order.customer_id || null} style={styles.avatar} />

        {/* Main Content: Title + Subtitle + Footnote */}
        <View style={styles.mainContent}>
          {/* Title - headline, two lines max */}
          <HighlightedText style={styles.title} numberOfLines={2} text={customerName} words={words} />

          {/* Subtitle - subhead */}
          <Text style={styles.subtitle}>
            {subtitle}
          </Text>

          {/* Footnote */}
          <Text style={styles.footnote} numberOfLines={1}>
            {footnote}
          </Text>

          {/* Why this order matched, when the match is not in the customer's name */}
          {matched.length > 0 ? (
            <HighlightedText style={styles.footnote} numberOfLines={2} text={matched.join(' · ')} words={words} />
          ) : null}
        </View>

        {/* Attribute: Status Badge + Chevron */}
        <View style={styles.attributeArea}>
          <StatusTag status={statusConfig.kind} label={statusConfig.label} />
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        </View>
      </View>

      {/* Description: Note (if exists) */}
      {order.note && (
        <View style={styles.noteContainer}>
          <Icon name="note-text-outline" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.noteText} numberOfLines={1}>
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
    prevProps.words === nextProps.words
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

const makeStyles = (t: ThemeTokens) => ({
  // Object Cell Container - Fiori card style
  card: {
    marginHorizontal: layout.marginCompact,
    marginVertical: space.xs,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  // Object Cell Row - Fiori spec: horizontal layout
  objectCellRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: layout.objectCellMinHeight,
  },

  // Detail Image: Avatar - 44pt circular
  avatar: {
    marginRight: space.md,
  },

  // Main Content - Fiori spec: Title + Subtitle + Footnote
  mainContent: {
    flex: 1,
    marginRight: space.sm,
  },

  title: {
    ...typography.headline,
    color: t.text.primary,
    marginBottom: space.xxs,
  },

  subtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    marginBottom: space.xxs,
    fontVariant: ['tabular-nums' as const],
  },

  footnote: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Attribute Area (Right) - status + navigation
  attributeArea: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },

  // Description/Note - bottom section inside the card
  noteContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    backgroundColor: t.background.base,
    gap: space.sm,
  },
  noteText: {
    ...typography.footnote,
    color: t.text.secondary,
    flex: 1,
  },
});

export default MemoizedOrderItem;
