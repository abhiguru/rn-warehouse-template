/**
 * GRNItemCard: one received item on the GRN object page (style guide §13.6).
 *
 * Title and received quantity on top, a stock status tag (icon plus word),
 * then stock, dispatched and weight as key facts, and the lot mark, packaging
 * and rack as neutral tags.
 */

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

// ============================================================================
// TYPES - Using snake_case to match backend RPC types
// ============================================================================

interface GRNItemCardProps {
  item_name: string;
  qty: number;
  stock: number;
  total_dispatched: number;
  weight?: number | null;
  packaging?: string | null;
  rack?: string | null;
  package_mark?: string | null;
  processed_images?: Array<{ id: string; image_url: string }>;
  onViewImages?: () => void;
  onViewDispatches?: () => void;
}

type StockStatus = 'negative' | 'critical' | 'positive';

const STATUS_ICON: Record<StockStatus, string> = {
  negative: 'alert-circle',
  critical: 'alert',
  positive: 'check-circle',
};

const STATUS_LABEL: Record<StockStatus, string> = {
  negative: 'Out of stock',
  critical: 'Partly dispatched',
  positive: 'In stock',
};

const numberFormat = new Intl.NumberFormat('en-IN');
const weightFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    minHeight: layout.objectCellMinHeight,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  titleBlock: { flex: 1 },
  itemName: { ...typography.headline, color: t.text.primary },
  tag: {
    flexDirection: 'row' as const,
    alignSelf: 'flex-start' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    marginTop: space.xs,
  },
  tagText: { ...typography.caption1, fontWeight: fontWeight.semibold },
  qtyBlock: { alignItems: 'flex-end' as const },
  qtyValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  qtyLabel: { ...typography.footnote, color: t.text.secondary },
  metricsSection: {
    flexDirection: 'row' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
    gap: space.sm,
  },
  metricItem: { flex: 1 },
  metricLabel: { ...typography.footnote, color: t.text.secondary },
  metricValue: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  detailsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
  },
  detailChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.pill,
    gap: space.xs,
    backgroundColor: t.status.neutral.background,
  },
  detailChipText: { ...typography.caption1, color: t.status.neutral.text },
});

// ============================================================================
// COMPONENT
// ============================================================================

const GRNItemCardComponent: React.FC<GRNItemCardProps> = ({
  item_name,
  qty,
  stock,
  total_dispatched,
  weight,
  packaging,
  rack,
  package_mark,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const stockStatus = useMemo<StockStatus>(() => {
    if (stock === 0) return 'negative';
    if (stock === qty) return 'positive';
    return 'critical';
  }, [stock, qty]);

  const statusColor = t.status[stockStatus].text;
  const hasDetails = package_mark || packaging || rack;
  const showWeight = weight !== undefined && weight !== null;

  const details = [
    package_mark ? { icon: 'label-outline', text: `Mark ${package_mark}` } : null,
    packaging ? { icon: 'package-variant-closed', text: packaging } : null,
    rack ? { icon: 'view-grid-outline', text: `Rack ${rack}` } : null,
  ].filter((d): d is { icon: string; text: string } => d !== null);

  const a11yLabel = [
    item_name,
    `${numberFormat.format(qty)} received`,
    STATUS_LABEL[stockStatus],
    `${numberFormat.format(stock)} in stock`,
    `${numberFormat.format(total_dispatched)} dispatched`,
    showWeight ? `${weightFormat.format(Number(weight))} kg` : null,
    ...details.map(d => d.text),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card} accessible accessibilityLabel={a11yLabel}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item_name}
          </Text>
          <View style={[styles.tag, { backgroundColor: t.status[stockStatus].background }]}>
            <Icon name={STATUS_ICON[stockStatus]} size={iconSize.sm} color={statusColor} />
            <Text style={[styles.tagText, { color: statusColor }]} maxFontSizeMultiplier={1.6}>
              {STATUS_LABEL[stockStatus]}
            </Text>
          </View>
        </View>
        <View style={styles.qtyBlock}>
          <Text style={styles.qtyValue}>{numberFormat.format(qty)}</Text>
          <Text style={styles.qtyLabel}>Received</Text>
        </View>
      </View>

      <View style={styles.metricsSection}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>In stock</Text>
          <Text style={styles.metricValue}>{numberFormat.format(stock)}</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Dispatched</Text>
          <Text style={styles.metricValue}>{numberFormat.format(total_dispatched)}</Text>
        </View>
        {showWeight && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Weight</Text>
            <Text style={styles.metricValue}>{`${weightFormat.format(Number(weight))} kg`}</Text>
          </View>
        )}
      </View>

      {hasDetails && (
        <View style={styles.detailsRow}>
          {details.map(detail => (
            <View key={detail.icon} style={styles.detailChip}>
              <Icon name={detail.icon} size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.detailChipText} maxFontSizeMultiplier={1.6}>
                {detail.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// Export memoized component for performance
export const GRNItemCard = React.memo(GRNItemCardComponent);
